// ============================================================
// Base Gerot / Frota de Elite — fonte: elite_snapshot (Supabase),
// gravado pelo robô (scripts/elite-robot.mjs). A planilha Frota de
// Elite (GerotBase antigo via gviz) está aposentada como fonte.
//
// Contrato mantido para os painéis:
//   load() → records {field, label, unit, vig, meta, real, atg}
//     · real em pontos percentuais (0-100) · vig = 'YYYY-MM'
//     · atg = atingimento = a PRÓPRIA aderência (Renan, 05/08/2026 —
//       o robô não carimba meta; meta fica null, só o Combustível tem)
//
// Novo:
//   acumFor(vigsArr) → records do ACUMULADO da janela selecionada
//     (síncrono, usa o cache do load()). Regra por tipo de indicador:
//     · % por filial (disp, prev, checkT, checkWH, conf, sla): janela
//       jan→M usa o escopo 'ano' coletado do Ginfo (acumulado ponderado
//       da própria tela — média de médias NÃO é acumulado). Janela que
//       não começa em janeiro não tem acumulado exato → média mensal.
//     · 1/0 por equipamento (stVeic, stEmp, civf): junta as linhas dos
//       meses da janela e recalcula — isso É a ponderação exata.
//     · pneus: 1/0 por placa da aba 'Pneus' do Sheets (Frota de Elite,
//       colada do Ginfo pelo Renan) — pool exato em qualquer janela;
//       fallback: contagens da API no elite_snapshot.
//     · comb: Σ km / Σ litros da janela vs média do Rem.
//
// Unidades: nomes do Ginfo ('CDD CUIABA', 'CUIABA EMPURRADA', …), os
// mesmos que os painéis usam (NOMES do programa-reconhecimento).
// ============================================================
(function(global){
  const GEM_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
  const GEM_KEY = 'sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';

  const NK = s => String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();

  // ── filial dos exports → unidade canônica (mesmo de-para do farol-core) ──
  const FIL2COD = {
    'CDD CAMBORIU':'BLC','BALNEARIO CAMBORIU':'BLC',
    'CDD CUIABA':'CBA T2','CUIABA':'CBA T1 WH','CUIABA EMPURRADA':'CBA T1',
    'CDD RIO DE JANEIRO':'CGR','CAMPO GRANDE':'CGR',
    'CDD FLORIANOPOLIS':'FLP','FLORIANOPOLIS':'FLP',
    'CDD GUARULHOS':'GRL','GUARULHOS':'GRL',
    'CDI MACACU':'MCC T2','MACACU EMPURRADA':'MCC T1','CACHOEIRAS DE MACACU':'MCC T2','MACACU':'MCC T2',
    'CDD NOVA FRIBURGO':'NFR','NOVA FRIBURGO':'NFR',
    'PIRAI EMPURRADA':'PIR','PIRAI':'PIR',
    'CDD PELOTAS':'PLT','PELOTAS':'PLT',
    'CDD RONDONOPOLIS':'RON','RONDONOPOLIS':'RON'
  };
  const COD2UNIT = {
    'BLC':'CDD CAMBORIU','CBA T2':'CDD CUIABA','CBA T1 WH':'CUIABA','CBA T1':'CUIABA EMPURRADA',
    'CGR':'CDD RIO DE JANEIRO','FLP':'CDD FLORIANOPOLIS','GRL':'CDD GUARULHOS',
    'MCC T2':'CDI MACACU','MCC T1':'MACACU EMPURRADA','NFR':'CDD NOVA FRIBURGO',
    'PIR':'PIRAI EMPURRADA','PLT':'CDD PELOTAS','RON':'CDD RONDONOPOLIS'
  };
  // refina o tier de CBA/MCC pelo projeto da linha (igual ao refineCod do farol)
  function refineCodG(cod, proj){
    if(!cod) return cod;
    const p = NK(proj);
    if(cod.startsWith('CBA')){
      if(/EMPURRAD/.test(p)) return 'CBA T1';
      if(/APOIO|EMPILHADEIRA|\bWH\b/.test(p)) return 'CBA T1 WH';
      if(/ROTA|CDD|AUTO SERVICO/.test(p)) return 'CBA T2';
      return cod;
    }
    if(cod.startsWith('MCC')){
      if(/EMPURRAD/.test(p)) return 'MCC T1';
      if(/ROTA|CDI|CDD|AUTO SERVICO/.test(p)) return 'MCC T2';
      return cod;
    }
    return cod;
  }
  function canonUnit(filial, proj){
    const cod = refineCodG(FIL2COD[NK(filial)]||null, proj);
    return cod ? COD2UNIT[cod] : NK(filial);
  }

  // ── parsers de valor do export (xlsx → JSON: número, "96,9%", "0,969"…) ──
  function numVal(v){
    if(v==null||v==='') return null;
    if(typeof v==='number') return isFinite(v)?v:null;
    let s=String(v).replace(/[%\s]/g,'');
    if(s.indexOf(',')>=0) s=s.replace(/\./g,'').replace(',','.');
    const n=parseFloat(s); return isFinite(n)?n:null;
  }
  function pctVal(v){
    const n=numVal(v); if(n==null) return null;
    return Math.abs(n)<=1.5 ? n*100 : n;    // 0.969 → 96,9 · 96,9 → 96,9
  }
  // durações (MTTR/MTBF/Tempo Médio): "hh:mm:ss" → segundos; número ≤2 é
  // fração de dia do Excel (→ ×86400); número maior fica como veio.
  function timeVal(v){
    if(v==null||v==='') return null;
    const s=String(v); const m=s.match(/(\d+):(\d+)(?::(\d+))?/);
    if(m) return (+m[1])*3600+(+m[2])*60+(+(m[3]||0));
    const n=numVal(v); if(n==null) return null;
    return Math.abs(n)<=2 ? n*86400 : n;
  }
  // acha a chave do objeto pelo nome normalizado (exato → depois "contém")
  function kOf(sample, ...names){
    if(!sample) return null;
    const ks=Object.keys(sample), N=ks.map(NK);
    for(const nm of names){ const i=N.indexOf(NK(nm)); if(i>=0) return ks[i]; }
    for(const nm of names){ const t=NK(nm); const i=N.findIndex(k=>k.includes(t)); if(i>=0) return ks[i]; }
    return null;
  }

  // ── elite_snapshot em cache: E[escopo][indicador][vig 'YYYY-MM'] = rows ──
  let E=null;
  const PCT_INDS=['disponibilidade','preventivas','checklist-t2','checklist-t1','checklist-wh','conformidade','sla-manutencao'];
  async function fetchElite(){
    if(E) return E;
    const sb = global.supabase.createClient(GEM_URL, GEM_KEY);
    const [mes, ano] = await Promise.all([
      sb.from('elite_snapshot').select('indicador,vigencia,data').eq('escopo','mes'),
      sb.from('elite_snapshot').select('indicador,vigencia,data').eq('escopo','ano').in('indicador', PCT_INDS.concat('conformidade-mar')),
    ]);
    if(mes.error) throw mes.error;
    if(ano.error) throw ano.error;
    E={mes:{},ano:{}};
    const put=(esc,r)=>{ const m=String(r.vigencia).match(/(\d{2})\/(\d{4})/); if(!m) return;
      const vig=m[2]+'-'+m[1];
      ((E[esc][r.indicador]=E[esc][r.indicador]||{})[vig]=Array.isArray(r.data)?r.data:[]); };
    (mes.data||[]).forEach(r=>put('mes',r));
    (ano.data||[]).forEach(r=>put('ano',r));
    return E;
  }
  const vigsDe = ind => E&&E.mes[ind] ? Object.keys(E.mes[ind]) : [];

  // ── adaptadores: linhas de um export → [{unit, real}] por vigência ────────
  // Conformidade: Piraí/Macacu/Cuiabá Empurrada + CDD Rio usam a Bimestral de
  // jan a jun; as demais a Mensal. De julho/2026 em diante, TODAS a Bimestral.
  const CONF_BIM = new Set(['PIRAI EMPURRADA','MACACU EMPURRADA','CUIABA EMPURRADA','CDD RIO DE JANEIRO']);
  const confBimestral = (unit, vigFim) => vigFim >= '2026-07' || CONF_BIM.has(unit);
  // Empurradas só contam Conformidade de mar/2026 em diante (Renan, 07/08/2026):
  // jan e fev ficam sem valor (mensal e IVs); o acumulado jan→M (escopo 'ano'
  // do Ginfo) segue valendo a partir das janelas que terminam em março.
  const CONF_EMP = new Set(['PIRAI EMPURRADA','MACACU EMPURRADA','CUIABA EMPURRADA']);
  const confVale = (unit, vigFim) => vigFim >= '2026-03' || !CONF_EMP.has(unit);

  function direto(rows, vigFim, opts){
    // opts: {col:[nomes], proj?:string (tier default), conf?:true}
    const out=[];
    const s=rows[0]; if(!s) return out;
    const kFil=kOf(s,'Filial'), kMen=opts.conf?kOf(s,'Aderência Mensal'):null, kBim=opts.conf?kOf(s,'Aderência Bimestral'):null;
    const kVal=opts.conf?null:kOf(s,...opts.col);
    if(!kFil||(!kVal&&!opts.conf)) return out;
    rows.forEach(r=>{
      const unit=canonUnit(r[kFil], opts.proj||'');
      if(opts.conf && unit && !confVale(unit,vigFim)) return;
      const v=opts.conf ? pctVal(r[confBimestral(unit,vigFim)?kBim:kMen]) : pctVal(r[kVal]);
      if(unit&&v!=null) out.push({unit, real:v});
    });
    return out;
  }
  // 1/0 por equipamento → agrega por unidade {unit:{ok,n}} (para pool multi-vig)
  function contagem10(rows, opts){
    const g={};
    const s=rows[0]; if(!s) return g;
    const kFil=kOf(s,...opts.fil), kProj=opts.projCol?kOf(s,...opts.projCol):null, kDesc=kOf(s,...opts.desc);
    if(!kFil||!kDesc) return g;
    rows.forEach(r=>{
      const unit=canonUnit(r[kFil], kProj?r[kProj]:'');
      if(!unit) return;
      const d=numVal(r[kDesc]);
      const o=g[unit]=g[unit]||{ok:0,n:0};
      o.n++; if(d==null||d===0) o.ok++;
    });
    return g;
  }
  function contagemPneus(rows){
    const g={};
    const s=rows[0]; if(!s) return g;
    const kFil=kOf(s,'Filial'), kOk=kOf(s,'Aferidos em 30 dias'), kFr=kOf(s,'Frota');
    if(!kFil) return g;
    rows.forEach(r=>{
      const unit=canonUnit(r[kFil],'');
      if(!unit) return;
      const o=g[unit]=g[unit]||{ok:0,n:0};
      o.ok+=numVal(r[kOk])||0; o.n+=numVal(r[kFr])||0;
    });
    return g;
  }
  const pctDe = g => Object.entries(g).map(([unit,o])=>({unit, real:o.n?o.ok/o.n*100:null})).filter(x=>x.real!=null);

  // um indicador (field) numa vigência, a partir do escopo pedido
  function valores(field, esc, vig){
    const src=E[esc];
    switch(field){
      case 'disp':    return direto(src['disponibilidade']?.[vig]||[], vig, {col:['Disponibilidade Veículos']});
      case 'prev':    return direto(src['preventivas']?.[vig]||[],     vig, {col:['Aderência']});
      case 'sla':     return direto(src['sla-manutencao']?.[vig]||[],  vig, {col:['SLA Atendimento']});
      case 'conf':    return direto(src['conformidade']?.[vig]||[],    vig, {conf:true});
      case 'checkWH': return direto(src['checklist-wh']?.[vig]||[],    vig, {col:['Aderência'], proj:'APOIO'});
      case 'checkT': {
        // T2 (031120) + T1 (Empurrada · indicador = Aderência Saída) na mesma linha do painel
        const t2=direto(src['checklist-t2']?.[vig]||[], vig, {col:['Aderência']});
        const t1=direto(src['checklist-t1']?.[vig]||[], vig, {col:['Aderência Saída'], proj:'EMPURRADA'});
        const seen=new Set(t2.map(x=>x.unit));
        return t2.concat(t1.filter(x=>!seen.has(x.unit)));
      }
      case 'pneus':   return pneusSheetOk() ? pctDe(PNEUS[vig]||{}) : pctDe(contagemPneus(src['pneus']?.[vig]||[]));
      case 'stVeic':  return pctDe(contagem10(src['stress-test-frota']?.[vig]||[], {fil:['Filial Freightech','Filial'], projCol:['Projeto'], desc:['Desconto']}));
      case 'stEmp':   return pctDe(contagem10(src['stress-test-empilhadeira']?.[vig]||[], {fil:['Filial GINFO','Filial FT x GINFO','Filial FT'], desc:['Desc. Total']}));
      case 'civf':    return pctDe(contagem10(src['civf']?.[vig]||[], {fil:['Filial Freightech'], projCol:['Projeto'], desc:['Desconto Total']}));
    }
    return [];
  }

  const cap100 = v => v==null?null:Math.min(100,v);

  // ── ACUMULADO da janela (síncrono; requer load() antes) ──────────────────
  // 1/0 e pneus: pool exato das linhas mensais. % por filial: escopo 'ano' do
  // Ginfo quando a janela é jan→M do mesmo ano; senão média mensal (aproximação).
  const POOL_FIELDS = new Set(['stVeic','stEmp','civf','pneus']);
  function janPrefix(vigs){
    const ys=[...new Set(vigs.map(v=>v.slice(0,4)))];
    if(ys.length!==1) return null;
    const ms=vigs.map(v=>+v.slice(5)).sort((a,b)=>a-b);
    for(let i=0;i<ms.length;i++) if(ms[i]!==i+1) return null;
    return ys[0]+'-'+String(ms[ms.length-1]).padStart(2,'0');   // 'YYYY-MM' do fim
  }
  // janela contígua de 2026 que cobre março (início ≤ mar ≤ fim) → 'YYYY-MM' do fim.
  // É a janela do 'conformidade-mar' (acumulado mar→M das empurradas).
  function marPrefix(vigs){
    if(vigs.some(v=>v.slice(0,4)!=='2026')) return null;
    const ms=vigs.map(v=>+v.slice(5)).sort((a,b)=>a-b);
    for(let i=1;i<ms.length;i++) if(ms[i]!==ms[i-1]+1) return null;
    if(ms[0]>3 || ms[ms.length-1]<3) return null;
    return '2026-'+String(ms[ms.length-1]).padStart(2,'0');
  }
  function acumFor(vigsArr){
    if(!E) return [];
    const vigs=[...new Set(vigsArr)].sort();
    if(!vigs.length) return [];
    const fim=vigs[vigs.length-1];
    const out=[];
    DISPLAY.forEach(ind=>{
      const f=ind.field;
      if(f==='comb'){ out.push(...combAcum(vigs)); return; }
      if(vigs.length===1){
        valores(f,'mes',fim).forEach(v=>out.push({field:f,label:ind.label,unit:v.unit,vig:fim,meta:null,real:v.real,atg:cap100(v.real)}));
        return;
      }
      if(POOL_FIELDS.has(f)){
        const g={};
        vigs.forEach(vig=>{
          const cont = f==='pneus'
            ? (pneusSheetOk() ? (PNEUS[vig]||{}) : contagemPneus(E.mes['pneus']?.[vig]||[]))
            : contagem10(E.mes[{stVeic:'stress-test-frota',stEmp:'stress-test-empilhadeira',civf:'civf'}[f]]?.[vig]||[],
                f==='stVeic'?{fil:['Filial Freightech','Filial'],projCol:['Projeto'],desc:['Desconto']}:
                f==='stEmp' ?{fil:['Filial GINFO','Filial FT x GINFO','Filial FT'],desc:['Desc. Total']}:
                             {fil:['Filial Freightech'],projCol:['Projeto'],desc:['Desconto Total']});
          Object.entries(cont).forEach(([u,o])=>{ const t=g[u]=g[u]||{ok:0,n:0}; t.ok+=o.ok; t.n+=o.n; });
        });
        pctDe(g).forEach(v=>out.push({field:f,label:ind.label,unit:v.unit,vig:fim,meta:null,real:v.real,atg:cap100(v.real)}));
        return;
      }
      // % por filial
      const pref=janPrefix(vigs);
      const mediaDe = so => {   // aproximação: média das vigências mensais
        const g={};
        vigs.forEach(vig=>valores(f,'mes',vig).forEach(v=>{ if(!so||so(v.unit)) (g[v.unit]=g[v.unit]||[]).push(v.real); }));
        return Object.entries(g).map(([u,a])=>({unit:u, real:a.reduce((s,x)=>s+x,0)/a.length, approx:true}));
      };
      let list=null;
      if(pref){ const vs=valores(f,'ano',pref); if(vs.length) list=vs; }
      if(!list){
        list=mediaDe(null);
        if(!pref) console.warn('GerotBase.acumFor: janela não começa em janeiro — %', f, 'é média mensal (sem acumulado exato)');
      }
      if(f==='conf' && fim.slice(0,4)==='2026'){
        // Empurradas: o 'ano' do Ginfo é jan→M e inclui jan/fev, quando elas não
        // contavam — o acumulado certo é a janela mar→M ('conformidade-mar').
        const mp=marPrefix(vigs);
        let emp = mp ? direto(E.ano['conformidade-mar']?.[mp]||[], mp, {conf:true}).filter(v=>CONF_EMP.has(v.unit)) : [];
        if(!emp.length) emp=mediaDe(u=>CONF_EMP.has(u));
        list=list.filter(v=>!CONF_EMP.has(v.unit)).concat(emp);
      }
      list.forEach(v=>out.push({field:f,label:ind.label,unit:v.unit,vig:fim,meta:null,real:v.real,atg:cap100(v.real),approx:v.approx||undefined}));
    });
    return out;
  }

  // ══════════ Combustível — Km/L via gviz (fora do Ginfo, segue no Sheets) ══════════
  const KML_ID = '1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';
  const KML_TAB = 'Km/L';
  const UNI2COD = {'CDD CAMBORIU':'BLC','CDD CUIABA':'CBA','CUIABA':'CBA','CUIABA EMPURRADA':'CBA','CDD FLORIANOPOLIS':'FLP','CDD GUARULHOS':'GRL','CDD NOVA FRIBURGO':'NFR','CDD PELOTAS':'PLT','CDD RIO DE JANEIRO':'CGR','CDD RONDONOPOLIS':'RON','CDI MACACU':'MCC','MACACU EMPURRADA':'MCC','PIRAI EMPURRADA':'PIR'};
  const UNI_SEM_KM = new Set(['CUIABA']);
  const UNI_LIST_COMB = Object.keys(UNI2COD);
  function projMatchUni(uniNome,projStr){
    const p=NK(projStr), cod=UNI2COD[uniNome]; if(!cod) return false;
    if(!p.includes(cod)) return false;
    const isEmp=/EMPURRAD/.test(p);
    if(uniNome==='CUIABA EMPURRADA'||uniNome==='MACACU EMPURRADA') return isEmp;
    if(uniNome==='CDD CUIABA'||uniNome==='CDI MACACU') return !isEmp;
    return true;
  }
  function gvig(c){ if(!c) return null; const v=c.v;
    let m=String(v).match(/Date\((\d+),(\d+)/); if(m) return m[1]+'-'+String(+m[2]+1).padStart(2,'0');
    const f=String(c.f!=null?c.f:(v!=null?v:'')); m=f.match(/(\d{1,2})[\/\-](\d{4})/); if(m) return m[2]+'-'+m[1].padStart(2,'0');
    m=f.match(/(\d{4})[\/\-](\d{1,2})/); if(m) return m[1]+'-'+m[2].padStart(2,'0'); return null; }
  function fetchTabFrom(wbId,name){ return new Promise((res,rej)=>{
    const fn='_gb'+Math.floor(Math.random()*1e9)+Date.now();
    const s=document.createElement('script');
    const clr=()=>{try{delete global[fn];s.remove();}catch(e){}};
    global[fn]=r=>{ clr(); try{ if(r.status!=='ok'){ rej(new Error(name+' status '+r.status)); return; } res(r.table.rows||[]); }catch(e){ rej(e); } };
    s.onerror=()=>{ clr(); rej(new Error('erro rede '+name)); };
    s.src=`https://docs.google.com/spreadsheets/d/${wbId}/gviz/tq?sheet=${encodeURIComponent(name)}&tqx=out:json;responseHandler:${fn}`;
    document.head.appendChild(s);
  }); }

  // ══════════ Pneus — detalhamento por placa na aba 'Pneus' do Sheets ══════════
  // O Renan cola o export "detalhes" do Ginfo (CALIBRAGEM) na aba Pneus do
  // workbook Frota de Elite: Filial | Evento | Placa | Projeto | Período |
  // Última Leitura | Status. Cada linha é uma placa na vigência; Status
  // "Não Realizado" = 0, senão 1 — Σok/Σn dá o mês E qualquer janela
  // acumulada exata (mesma mecânica do Stress Test), batendo com o Ginfo.
  // Se a aba falhar/vier vazia, cai para as contagens da API (elite_snapshot).
  const ELITE_WB = '1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M';
  const PNEUS_TAB = 'Pneus';
  const MES_PT = {JANEIRO:1,FEVEREIRO:2,MARCO:3,ABRIL:4,MAIO:5,JUNHO:6,JULHO:7,AGOSTO:8,SETEMBRO:9,OUTUBRO:10,NOVEMBRO:11,DEZEMBRO:12};
  function pvig(cell){                     // Período: data OU "janeiro de 2026"
    const v=gvig(cell); if(v) return v;
    const s=NK(cell&&(cell.f!=null?cell.f:cell.v));
    const m=s.match(/([A-Z]+)\s+DE\s+(\d{4})/);
    return m&&MES_PT[m[1]] ? m[2]+'-'+String(MES_PT[m[1]]).padStart(2,'0') : null;
  }
  let PNEUS=null;                          // {vig:{unit:{ok,n}}}
  const pneusSheetOk = () => PNEUS && Object.keys(PNEUS).length>0;
  async function loadPneusSheet(){
    PNEUS={};
    let rows; try{ rows=await fetchTabFrom(ELITE_WB,PNEUS_TAB); }catch(e){ console.error('Gerot base — falha aba Pneus (usando fallback da API)', e); return; }
    rows.forEach(r=>{
      const c=r.c||[];
      const val=i=>c[i]&&c[i].v!=null?c[i].v:(c[i]&&c[i].f!=null?c[i].f:'');
      if(!FIL2COD[NK(val(0))]) return;     // ignora cabeçalho e linhas soltas
      const unit=canonUnit(val(0), val(3));
      const vig=pvig(c[4]);
      if(!unit||!vig) return;
      const o=((PNEUS[vig]=PNEUS[vig]||{})[unit]=PNEUS[vig][unit]||{ok:0,n:0});
      o.n++; if(NK(val(6))!=='NAO REALIZADO') o.ok++;
    });
  }

  let COMB=null;   // {unit:{vig:{km,lit,rem[]}}} — cache p/ o acumulado
  async function loadComb(){
    let rows; try{ rows=await fetchTabFrom(KML_ID,KML_TAB); }catch(e){ console.error('Gerot base — falha Km/L (comb)', e); return []; }
    const nRaw = c => { if(!c||c.v==null) return 0; const n=Number(c.v); return isFinite(n)?n:0; };
    const parsed = rows.map(r=>{ const c=r.c||[]; const vig=gvig(c[0]); if(!vig)return null;
      return {vig, proj:String(c[14]&&c[14].v!=null?c[14].v:''), km:nRaw(c[22]), lit:nRaw(c[23]), rem:nRaw(c[4])}; }).filter(Boolean);
    const vigsK=[...new Set(parsed.map(p=>p.vig))];
    COMB={};
    const recs=[];
    for(const uni of UNI_LIST_COMB){
      if(UNI_SEM_KM.has(uni)) continue;
      for(const vig of vigsK){
        let km=0,lit=0,rems=[];
        parsed.forEach(p=>{ if(p.vig!==vig||!projMatchUni(uni,p.proj))return; km+=p.km; lit+=p.lit; if(p.rem>0)rems.push(p.rem); });
        if(!lit||!rems.length) continue;
        ((COMB[uni]=COMB[uni]||{})[vig]={km,lit,rems});
        const rem=rems.reduce((s,x)=>s+x,0)/rems.length, real=km/lit, atg=rem?(real/rem*100):null;
        if(atg==null) continue;
        recs.push({field:'comb',label:'Combustível',unit:uni,vig,meta:rem,real,atg});
      }
    }
    return recs;
  }
  function combAcum(vigs){
    if(!COMB) return [];
    const fim=vigs[vigs.length-1], out=[];
    for(const uni in COMB){
      let km=0,lit=0,rems=[];
      vigs.forEach(v=>{ const o=COMB[uni][v]; if(!o)return; km+=o.km; lit+=o.lit; rems.push(...o.rems); });
      if(!lit||!rems.length) continue;
      const rem=rems.reduce((s,x)=>s+x,0)/rems.length, real=km/lit;
      out.push({field:'comb',label:'Combustível',unit:uni,vig:fim,meta:rem,real,atg:rem?(real/rem*100):null});
    }
    return out;
  }

  // ══════════ IVs (Indicadores de Verificação) — só no Gerot, não pontuam ══════════
  const IV_DEF = [
    {field:'iv_mttr',     label:'MTTR Veículos',                 src:'disponibilidade', col:['MTTR Veículos'],  val:timeVal, fmt:'time',  dir:'lower',  metaMode:'median'},
    {field:'iv_mtbf',     label:'MTBF Veículos',                 src:'disponibilidade', col:['MTBF Veículos'],  val:timeVal, fmt:'time',  dir:'higher', metaMode:'median'},
    {field:'iv_prevfora', label:'Preventivas · % Fora do Prazo', src:'preventivas',     calc:'foraPrazo',                    fmt:'pct',   dir:'lower',  meta:5},
    {field:'iv_prevanexo',label:'Preventivas · OS Sem Anexo %',  src:'preventivas',     col:['OS Sem Anexo %'], val:pctVal,  fmt:'pct',   dir:'lower',  meta:30},
    {field:'iv_chktempo', label:'Checklist T1/T2 · Tempo Médio', src:'checklist-t2',    col:['Tempo Médio'],    val:timeVal, fmt:'time',  dir:'higher', meta:240},
    {field:'iv_chkoscrit',label:'Checklist T1/T2 · Saídas c/ OS Crítica', src:'checklist-t2', col:['Saídas com OS Crítica'], val:numVal, fmt:'count', dir:'lower', meta:0},
    {field:'iv_whtempo',  label:'Checklist WH · Realizados < Tempo mín',  src:'checklist-wh', col:['Realizados < Tempo mín'], val:pctVal, fmt:'pct',  dir:'lower',  meta:15},
    {field:'iv_confseg',  label:'Conformidade · Seg.',           src:'conformidade',    col:['Seg. Conformidade'],  val:pctVal, fmt:'pct', dir:'higher', meta:98},
    {field:'iv_confqual', label:'Conformidade · Quali.',         src:'conformidade',    col:['Quali. Conformidade'],val:pctVal, fmt:'pct', dir:'higher', meta:98},
    {field:'iv_slaexec',  label:'SLA Man. · Total Executada %',  src:'sla-manutencao',  col:['Total Executada %'],  val:pctVal, fmt:'pct', dir:'higher', meta:98},
  ];
  function median(a){ const v=a.filter(x=>x!=null&&isFinite(x)).sort((x,y)=>x-y); if(!v.length) return null; const n=v.length; return n%2?v[(n-1)/2]:(v[n/2-1]+v[n/2])/2; }
  function loadIVs(){
    const recs=[];
    IV_DEF.forEach(iv=>{
      const vals=[];
      Object.entries(E.mes[iv.src]||{}).forEach(([vig,rows])=>{
        const s=rows[0]; if(!s) return;
        const kFil=kOf(s,'Filial'); if(!kFil) return;
        let get;
        if(iv.calc==='foraPrazo'){
          const kF=kOf(s,'Realizado Fora Prazo'), kT=kOf(s,'Preventivas Realizadas');
          get=r=>{ const f=numVal(r[kF]), t=numVal(r[kT]); return (t&&t>0)?f/t*100:null; };
        } else {
          const kV=kOf(s,...iv.col); if(!kV) return;
          get=r=>iv.val(r[kV]);
        }
        rows.forEach(r=>{ const unit=canonUnit(r[kFil], iv.src==='checklist-wh'?'APOIO':''); const value=get(r);
          if(iv.src==='conformidade' && unit && !confVale(unit,vig)) return;
          if(unit&&value!=null&&isFinite(value)) vals.push({unit,vig,value}); });
      });
      let metaByVig=null;
      if(iv.metaMode==='median'){ metaByVig={}; const g={}; vals.forEach(v=>{(g[v.vig]=g[v.vig]||[]).push(v.value);}); Object.keys(g).forEach(vg=>metaByVig[vg]=median(g[vg])); }
      vals.forEach(v=>recs.push({field:iv.field,label:iv.label,unit:v.unit,vig:v.vig,real:v.value,meta:metaByVig?metaByVig[v.vig]:iv.meta,dir:iv.dir,fmt:iv.fmt,iv:true}));
    });
    return recs;
  }
  const IV_PNEUS = [
    {field:'iv_pneu_amp', label:'Pneus · Amplitude',  fmt:'mm',  dir:'lower',  meta:5},
    {field:'iv_pneu_pres',label:'Pneus · % Pressão',  fmt:'pct', dir:'higher', meta:90},
    {field:'iv_pneu_mm',  label:'Pneus · MM Média',   fmt:'mm',  dir:'higher', meta:8},
  ];
  const IV_DISPLAY = [
    IV_DEF[0], IV_DEF[1], IV_DEF[2], IV_DEF[3],
    IV_PNEUS[0], IV_PNEUS[1], IV_PNEUS[2],
    IV_DEF[4], IV_DEF[5], IV_DEF[6], IV_DEF[7], IV_DEF[8], IV_DEF[9],
  ];

  // Pneus (IVs de amplitude/pressão/mm): snapshot do painel Pneus (Prolog)
  const PN_URL = 'https://ewbzeqsneeylwkxtcpme.supabase.co';
  const PN_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3YnplcXNuZWV5bHdreHRjcG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzY2MTcsImV4cCI6MjA5NzQ1MjYxN30.W8W6Yunt6Z8NB73qpOD8eqYlrsgMRgEG-siYsJFwDwE';
  const FILIAL2BRANCH = {'CDD CAMBORIU':24,'CDD CUIABA':1878,'CUIABA':1906,'CUIABA EMPURRADA':1907,'CDD FLORIANOPOLIS':20,'CDD GUARULHOS':30,'CDD NOVA FRIBURGO':2517,'CDD PELOTAS':26,'CDD RIO DE JANEIRO':37,'CDD RONDONOPOLIS':2277,'CDI MACACU':1677,'MACACU EMPURRADA':1676,'PIRAI EMPURRADA':38};
  async function loadPneusIVs(latestVig){
    if(!latestVig) return [];
    let rows;
    try{ const res=await fetch(`${PN_URL}/rest/v1/snapshot?endpoint=eq.tires&select=branch_id,data`, {headers:{apikey:PN_KEY, Authorization:'Bearer '+PN_KEY}}); if(!res.ok) throw new Error('http '+res.status); rows=await res.json(); }
    catch(e){ console.error('IV Pneus (Supabase) falhou', e); return []; }
    const byBranch={}; rows.forEach(r=>{ byBranch[r.branch_id]=r.data||[]; });
    const mean=a=>{ const v=a.filter(x=>x!=null&&isFinite(x)); return v.length?v.reduce((s,x)=>s+x,0)/v.length:null; };
    const recs=[];
    for(const uni in FILIAL2BRANCH){
      const tires=(byBranch[FILIAL2BRANCH[uni]]||[]).filter(t=>t && t.placa && (+t.menorMM)>0);
      if(!tires.length) continue;
      const amp=mean(tires.map(t=>+t.amplitude));
      const mm =mean(tires.map(t=>+t.menorMM).filter(x=>x>0));
      const comP=tires.filter(t=>+t.pressaoIdeal>0);
      const pres=comP.length?comP.filter(t=>Math.abs(+t.desvioPressao)<=10).length/comP.length*100:null;
      IV_PNEUS.forEach(iv=>{ const real=iv.field==='iv_pneu_amp'?amp:(iv.field==='iv_pneu_mm'?mm:pres); if(real==null)return;
        recs.push({field:iv.field,label:iv.label,unit:uni,vig:latestVig,real,meta:iv.meta,dir:iv.dir,fmt:iv.fmt,iv:true,snapshot:true}); });
    }
    return recs;
  }

  // ── carga completa: registros mensais (contrato antigo) ──────────────────
  async function load(){
    const combP=loadComb();
    const pneusP=loadPneusSheet();
    await fetchElite();
    await pneusP;
    const records=[];
    DISPLAY.forEach(ind=>{
      if(ind.field==='comb') return;
      const src={disp:'disponibilidade',prev:'preventivas',pneus:'pneus',checkT:'checklist-t2',checkWH:'checklist-wh',conf:'conformidade',stVeic:'stress-test-frota',stEmp:'stress-test-empilhadeira',civf:'civf',sla:'sla-manutencao'}[ind.field];
      const vigsSrc = ind.field==='pneus' && pneusSheetOk() ? Object.keys(PNEUS).sort() : vigsDe(src);
      vigsSrc.forEach(vig=>{
        valores(ind.field,'mes',vig).forEach(v=>{
          records.push({field:ind.field,label:ind.label,unit:v.unit,vig,meta:null,real:v.real,atg:cap100(v.real)});
        });
      });
    });
    records.push(...loadIVs());
    records.push(...await combP);
    const vigsAll=[...new Set(records.map(r=>r.vig))].sort();
    try{ records.push(...await loadPneusIVs(vigsAll[vigsAll.length-1])); }catch(e){ console.error('IV Pneus', e); }
    return records;
  }

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

  global.GerotBase = { DISPLAY, IV_DISPLAY, load, acumFor,
    fieldLabels: DISPLAY.reduce((m,i)=>{ m[i.field]=i.label; return m; }, {}),
    fieldOrder: DISPLAY.map(i=>i.field) };
})(window);
