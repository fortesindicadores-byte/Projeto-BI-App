// ============================================================
// Base Gerot / Frota de Elite — 1 aba = 1 indicador.
// Carrega as 10 abas do workbook e normaliza tudo em `records`:
//   {field, label, unit, vig, meta, real, atg}
//     · meta / real em pontos percentuais (0-100)
//     · atg = atingimento = real/meta*100 (não limitado aqui)
//     · vig = 'YYYY-MM'
//
// Dois tipos de aba:
//   direct   → a aderência já vem pronta numa coluna (valCol)
//   desconto → uma linha por placa; aderente = sem desconto (desconto vazio/0).
//              aderência da filial = média dos 0/1 das placas (por filial+vig).
//
// Usado por gerot/ e programa-reconhecimento/ (Frota de Elite).
// ============================================================
(function(global){
  const ID = '1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M';

  // colunas 0-based (confirmadas por inspeção da base)
  const INDS = [
    {field:'disp',    tab:'Disponibilidade',     label:'Disponibilidade',   metaCol:1, vigCol:0, filCol:2, valCol:10, mode:'direct'},
    {field:'prev',    tab:'Preventivas',         label:'Preventivas',       metaCol:1, vigCol:0, filCol:2, valCol:6,  mode:'direct'},
    {field:'pneus',   tab:'Pneus',               label:'Pneus',             metaCol:1, vigCol:0, filCol:2, valCol:3,  mode:'direct'},
    {field:'checkT',  tab:'Checklist T1/T2',     label:'Checklist T1/T2',   metaCol:1, vigCol:0, filCol:2, valCol:3,  mode:'direct'},
    {field:'checkWH', tab:'Checklist WH',        label:'Checklist WH',      metaCol:1, vigCol:0, filCol:2, valCol:3,  mode:'direct'},
    {field:'conf',    tab:'Conformidade',        label:'Conformidade',      metaCol:1, vigCol:0, filCol:2, valCol:3,  mode:'direct'},
    {field:'sla',     tab:'SLA Man.',            label:'SLA Man.',          metaCol:0, vigCol:1, filCol:2, valCol:8,  mode:'direct'},
    {field:'stVeic',  tab:'Stress Test - Veíc.', label:'Stress Test Veíc.', metaCol:0, vigCol:1, filCol:3, descCol:16, mode:'desconto'},
    {field:'stEmp',   tab:'Stress Test - Emp',   label:'Stress Test Emp.',  metaCol:0, vigCol:1, filCol:4, descCol:19, mode:'desconto'},
    {field:'civf',    tab:'CIVF',                label:'CIVF',              metaCol:0, vigCol:1, filCol:3, descCol:12, mode:'desconto'},
  ];

  // ── parsers de célula gviz ──
  function pct(c){ if(!c) return null; let v=c.v;
    if(v==null||v===''){ if(c.f!=null&&c.f!==''){ v=parseFloat(String(c.f).replace('%','').replace(/\./g,'').replace(',','.')); return isFinite(v)?v:null; } return null; }
    v=Number(v); if(!isFinite(v))return null; return Math.abs(v)<=1.5? v*100 : v; }
  function money(c){ if(!c) return null; let v=c.v;
    if(v==null||v===''){ if(c.f!=null&&c.f!==''){ v=parseFloat(String(c.f).replace(/\./g,'').replace(',','.')); return isFinite(v)?v:null; } return null; }
    v=Number(v); return isFinite(v)?v:null; }
  function gvig(c){ if(!c) return null; const v=c.v;
    let m=String(v).match(/Date\((\d+),(\d+)/); if(m) return m[1]+'-'+String(+m[2]+1).padStart(2,'0');
    const f=String(c.f!=null?c.f:(v!=null?v:'')); m=f.match(/(\d{1,2})[\/\-](\d{4})/); if(m) return m[2]+'-'+m[1].padStart(2,'0');
    m=f.match(/(\d{4})[\/\-](\d{1,2})/); if(m) return m[1]+'-'+m[2].padStart(2,'0'); return null; }
  function gstr(c){ if(!c) return ''; return String(c.f!=null?c.f:(c.v!=null?c.v:'')).trim(); }

  // ── fetch de 1 aba via gviz JSONP (por nome), de um workbook qualquer ──
  function fetchTabFrom(wbId,name){ return new Promise((res,rej)=>{
    const fn='_gb'+Math.floor(Math.random()*1e9)+Date.now();
    const s=document.createElement('script');
    const clr=()=>{try{delete global[fn];s.remove();}catch(e){}};
    global[fn]=r=>{ clr(); try{ if(r.status!=='ok'){ rej(new Error(name+' status '+r.status)); return; } res(r.table.rows||[]); }catch(e){ rej(e); } };
    s.onerror=()=>{ clr(); rej(new Error('erro rede '+name)); };
    s.src=`https://docs.google.com/spreadsheets/d/${wbId}/gviz/tq?sheet=${encodeURIComponent(name)}&tqx=out:json;responseHandler:${fn}`;
    document.head.appendChild(s);
  }); }
  const fetchTab = name => fetchTabFrom(ID,name);

  // ── Combustível: vem da fonte do Eficiência Km/L (mesmo de-para do scorecard) ──
  const KML_ID = '1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';
  const KML_TAB = 'Km/L';
  // filial → código de cidade no Km/L. Armazém (CUIABA) não tem km/combustível.
  const UNI2COD = {'CDD CAMBORIU':'BLC','CDD CUIABA':'CBA','CUIABA':'CBA','CUIABA EMPURRADA':'CBA','CDD FLORIANOPOLIS':'FLP','CDD GUARULHOS':'GRL','CDD NOVA FRIBURGO':'NFR','CDD PELOTAS':'PLT','CDD RIO DE JANEIRO':'CGR','CDD RONDONOPOLIS':'RON','CDI MACACU':'MCC','MACACU EMPURRADA':'MCC','PIRAI EMPURRADA':'PIR'};
  const UNI_SEM_KM = new Set(['CUIABA']);
  const UNI_LIST_COMB = Object.keys(UNI2COD);
  function NK(s){ return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim(); }
  // mapeia um projeto do Km/L ("ROTA - BLC", "EMPURRADA - PIR", "INSUMOS - PIR"…) → filial
  function projMatchUni(uniNome,projStr){
    const p=NK(projStr), cod=UNI2COD[uniNome]; if(!cod) return false;
    if(!p.includes(cod)) return false;
    const isEmp=/EMPURRAD/.test(p);
    if(uniNome==='CUIABA EMPURRADA'||uniNome==='MACACU EMPURRADA') return isEmp;
    if(uniNome==='CDD CUIABA'||uniNome==='CDI MACACU') return !isEmp;   // rota/AS/van, não empurrada
    return true;                                                       // demais: código único basta
  }
  // Km/L: col0=vigência, col4=Rem Médio, col14=Projeto, col22=km, col23=litros.
  // real = Σkm/Σlitros; rem = média simples do Rem Médio; atg = real/rem*100 (SEM teto).
  async function loadComb(){
    let rows; try{ rows=await fetchTabFrom(KML_ID,KML_TAB); }catch(e){ console.error('Gerot base — falha Km/L (comb)', e); return []; }
    const nRaw = c => { if(!c||c.v==null) return 0; const n=Number(c.v); return isFinite(n)?n:0; };
    const parsed = rows.map(r=>{ const c=r.c||[]; const vig=gvig(c[0]); if(!vig)return null;
      return {vig, proj:String(c[14]&&c[14].v!=null?c[14].v:''), km:nRaw(c[22]), lit:nRaw(c[23]), rem:nRaw(c[4])}; }).filter(Boolean);
    const vigs=[...new Set(parsed.map(p=>p.vig))];
    const recs=[];
    for(const uni of UNI_LIST_COMB){
      if(UNI_SEM_KM.has(uni)) continue;
      for(const vig of vigs){
        let km=0,lit=0,rs=0,cnt=0;
        parsed.forEach(p=>{ if(p.vig!==vig||!projMatchUni(uni,p.proj))return; km+=p.km; lit+=p.lit; if(p.rem>0){rs+=p.rem;cnt++;} });
        if(!lit||!cnt) continue;
        const rem=rs/cnt, real=km/lit, atg=rem?(real/rem*100):null;   // NÃO limitado a 100%
        if(atg==null) continue;
        recs.push({field:'comb',label:'Combustível',unit:uni,vig,meta:rem,real,atg});
      }
    }
    return recs;
  }

  async function load(){
    const records=[];
    const combP = loadComb();   // Km/L em paralelo com as abas da base
    await Promise.all(INDS.map(async ind=>{
      let rows; try{ rows=await fetchTab(ind.tab); }catch(e){ console.error('Gerot base — falha aba', ind.tab, e); return; }
      // atingimento é limitado a 100% (só o Combustível pode passar de 100%)
      const capAtg = a => (a!=null && ind.cap!==false) ? Math.min(100,a) : a;
      if (ind.mode==='direct'){
        rows.forEach(r=>{ const c=r.c||[]; const unit=gstr(c[ind.filCol]).toUpperCase(); const vig=gvig(c[ind.vigCol]); if(!unit||!vig)return;
          const meta=pct(c[ind.metaCol]); const real=pct(c[ind.valCol]); if(real==null)return;
          const atg=capAtg((meta&&meta>0)?(real/meta*100):null);
          records.push({field:ind.field,label:ind.label,unit,vig,meta,real,atg}); });
      } else {
        const g=new Map();
        rows.forEach(r=>{ const c=r.c||[]; const unit=gstr(c[ind.filCol]).toUpperCase(); const vig=gvig(c[ind.vigCol]); if(!unit||!vig)return;
          const meta=pct(c[ind.metaCol]); const d=money(c[ind.descCol]); const aderente=(d==null||d===0)?1:0;
          const k=unit+'||'+vig; if(!g.has(k))g.set(k,{unit,vig,meta:null,n:0,ok:0}); const o=g.get(k); o.n++; o.ok+=aderente; if(meta!=null)o.meta=meta; });
        g.forEach(o=>{ const real=o.n?o.ok/o.n*100:null; const meta=o.meta!=null?o.meta:100; const atg=capAtg((meta>0)?(real/meta*100):null);
          records.push({field:ind.field,label:ind.label,unit:o.unit,vig:o.vig,meta,real,atg}); });
      }
    }));
    records.push(...await combP);
    return records;
  }

  // ordem de exibição (Gerot / rótulos), com o Combustível após Preventivas.
  // fmt:'kml' → meta/real são km/L (não %). cap:false → atingimento sem teto.
  const DISPLAY = [
    {field:'disp',    label:'Disponibilidade'},
    {field:'prev',    label:'Preventivas'},
    {field:'comb',    label:'Combustível',       fmt:'kml', cap:false},
    {field:'pneus',   label:'Pneus'},
    {field:'checkT',  label:'Checklist T1/T2'},
    {field:'checkWH', label:'Checklist WH'},
    {field:'conf',    label:'Conformidade'},
    {field:'stVeic',  label:'Stress Test Veíc.'},
    {field:'stEmp',   label:'Stress Test Emp.'},
    {field:'civf',    label:'CIVF'},
    {field:'sla',     label:'SLA Man.'},
  ];

  global.GerotBase = { ID, INDS, DISPLAY, load,
    fieldLabels: DISPLAY.reduce((m,i)=>{ m[i.field]=i.label; return m; }, {}),
    fieldOrder: DISPLAY.map(i=>i.field) };
})(window);
