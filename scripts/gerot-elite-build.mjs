// Reproduz o cálculo da nova base Gerot/Frota de Elite (1 aba = 1 indicador),
// exatamente como o painel fará no navegador, e imprime:
//   - por indicador × filial: meta / real / atingimento (vig escolhida)
//   - ranking Frota de Elite (score ponderado por unidade)
// Serve de "ground truth" p/ conferir a lógica antes de portar p/ o navegador.
const ID = '1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M';
const VIG_ALVO = process.env.VIG || '2026-06';

// def de cada indicador (colunas 0-based, confirmadas na inspeção)
const INDS = [
  {field:'disp',   tab:'Disponibilidade',     label:'Disponibilidade',   metaCol:1, vigCol:0, filCol:2, valCol:10, mode:'direct'},
  {field:'prev',   tab:'Preventivas',         label:'Preventivas',       metaCol:1, vigCol:0, filCol:2, valCol:6,  mode:'direct'},
  {field:'pneus',  tab:'Pneus',               label:'Pneus',             metaCol:1, vigCol:0, filCol:2, valCol:3,  mode:'direct'},
  {field:'checkT', tab:'Checklist T1/T2',     label:'Checklist T1/T2',   metaCol:1, vigCol:0, filCol:2, valCol:3,  mode:'direct'},
  {field:'checkWH',tab:'Checklist WH',        label:'Checklist WH',      metaCol:1, vigCol:0, filCol:2, valCol:3,  mode:'direct'},
  {field:'conf',   tab:'Conformidade',        label:'Conformidade',      metaCol:1, vigCol:0, filCol:2, valCol:3,  mode:'direct', valColByUnit:{'CDD RIO DE JANEIRO':5}},
  {field:'sla',    tab:'SLA Man.',            label:'SLA Man.',          metaCol:0, vigCol:1, filCol:2, valCol:8,  mode:'direct'},
  {field:'stVeic', tab:'Stress Test - Veíc.', label:'Stress Test Veíc.', metaCol:0, vigCol:1, filCol:3, descCol:16, mode:'desconto'},
  {field:'stEmp',  tab:'Stress Test - Emp',   label:'Stress Test Emp.',  metaCol:0, vigCol:1, filCol:4, descCol:19, mode:'desconto'},
  {field:'civf',   tab:'CIVF',                label:'CIVF',              metaCol:0, vigCol:1, filCol:3, descCol:12, mode:'desconto'},
];

// pesos por indicador (soma 100)
const FIELD_WEIGHTS = { disp:20, prev:15, comb:10, pneus:10, checkT:10, checkWH:10, conf:5, stVeic:5, stEmp:5, sla:5, civf:5 };

// ── Combustível: vem da fonte do Eficiência Km/L (mesmo de-para do scorecard) ──
const KML_ID = '1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';
const KML_TAB = 'Km/L';
const UNI2COD = {'CDD CAMBORIU':'BLC','CDD CUIABA':'CBA','CUIABA':'CBA','CUIABA EMPURRADA':'CBA','CDD FLORIANOPOLIS':'FLP','CDD GUARULHOS':'GRL','CDD NOVA FRIBURGO':'NFR','CDD PELOTAS':'PLT','CDD RIO DE JANEIRO':'CGR','CDD RONDONOPOLIS':'RON','CDI MACACU':'MCC','MACACU EMPURRADA':'MCC','PIRAI EMPURRADA':'PIR'};
const UNI_SEM_KM = new Set(['CUIABA']);                                   // armazém: sem km/combustível
const UNI_LIST_COMB = Object.keys(UNI2COD);
function NK(s){ return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim(); }
// mapeia um projeto do Km/L ("ROTA - BLC", "EMPURRADA - PIR"…) para uma filial
function projMatchUni(uniNome, projStr){
  const p=NK(projStr), cod=UNI2COD[uniNome]; if(!cod) return false;
  if(!p.includes(cod)) return false;
  const isEmp=/EMPURRAD/.test(p);
  if(uniNome==='CUIABA EMPURRADA'||uniNome==='MACACU EMPURRADA') return isEmp;
  if(uniNome==='CDD CUIABA'||uniNome==='CDI MACACU') return !isEmp;         // rota/AS/van, não empurrada
  return true;                                                             // demais: código único basta
}

function parse(txt){ const s=txt.indexOf('{'), e=txt.lastIndexOf('}'); return JSON.parse(txt.slice(s,e+1)); }
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

async function fetchTab(name){
  const url = `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?sheet=${encodeURIComponent(name)}&tqx=out:json`;
  const txt = await (await fetch(url)).text();
  const j = parse(txt);
  if (j.status!=='ok') throw new Error('status '+j.status+' aba '+name);
  return j.table.rows||[];
}

async function load(){
  const records=[];
  for (const ind of INDS){
    let rows; try{ rows=await fetchTab(ind.tab); }catch(e){ console.error('FALHA', ind.tab, e.message); continue; }
    if (ind.mode==='direct'){
      rows.forEach(r=>{ const c=r.c||[]; const unit=gstr(c[ind.filCol]).toUpperCase(); const vig=gvig(c[ind.vigCol]); if(!unit||!vig)return;
        const vc=(ind.valColByUnit&&ind.valColByUnit[unit]!=null)?ind.valColByUnit[unit]:ind.valCol;
        const meta=pct(c[ind.metaCol]); const real=pct(c[vc]); if(real==null)return;
        const atg=(meta&&meta>0)?(real/meta*100):null;
        records.push({field:ind.field,label:ind.label,unit,vig,meta,real,atg}); });
    } else {
      const g=new Map();
      rows.forEach(r=>{ const c=r.c||[]; const unit=gstr(c[ind.filCol]).toUpperCase(); const vig=gvig(c[ind.vigCol]); if(!unit||!vig)return;
        const meta=pct(c[ind.metaCol]); const d=money(c[ind.descCol]); const aderente=(d==null||d===0)?1:0;
        const k=unit+'||'+vig; if(!g.has(k))g.set(k,{unit,vig,meta:null,n:0,ok:0}); const o=g.get(k); o.n++; o.ok+=aderente; if(meta!=null)o.meta=meta; });
      g.forEach(o=>{ const real=o.n?o.ok/o.n*100:null; const meta=o.meta!=null?o.meta:100; const atg=(meta>0)?(real/meta*100):null;
        records.push({field:ind.field,label:ind.label,unit:o.unit,vig:o.vig,meta,real,atg}); });
    }
  }
  return records;
}

function calcScore(fields){ let num=0,den=0;
  for(const f in FIELD_WEIGHTS){ const w=FIELD_WEIGHTS[f]/100; const v=fields[f];
    if(v==null) continue; den+=w; let v01=v/100; if(v01>1)v01=1; num+=w*v01; }
  return den>0?(num/den)*100:null; }

// Combustível por filial+vigência: real = Σkm/Σlitros; rem = média simples do
// "Rem Médio" (col4); atg = real/rem*100 (NÃO limitado — pode passar de 100%).
async function loadComb(){
  const url = `https://docs.google.com/spreadsheets/d/${KML_ID}/gviz/tq?sheet=${encodeURIComponent(KML_TAB)}&tqx=out:json`;
  let rows; try{ const j=parse(await (await fetch(url)).text()); if(j.status!=='ok')throw new Error('status '+j.status); rows=j.table.rows||[]; }
  catch(e){ console.error('FALHA Km/L', e.message); return []; }
  const numRaw = c => { if(!c||c.v==null)return 0; const n=Number(c.v); return isFinite(n)?n:0; };
  const parsed = rows.map(r=>{ const c=r.c||[]; const vig=gvig(c[0]); if(!vig)return null;
    return {vig, proj:String(c[14]?.v??''), km:numRaw(c[22]), lit:numRaw(c[23]), rem:numRaw(c[4])}; }).filter(Boolean);
  const vigs=[...new Set(parsed.map(p=>p.vig))];
  const recs=[];
  for(const uni of UNI_LIST_COMB){
    if(UNI_SEM_KM.has(uni)) continue;
    for(const vig of vigs){
      let km=0,lit=0,rs=0,cnt=0;
      parsed.forEach(p=>{ if(p.vig!==vig)return; if(!projMatchUni(uni,p.proj))return; km+=p.km; lit+=p.lit; if(p.rem>0){rs+=p.rem;cnt++;} });
      if(!lit||!cnt) continue;
      const rem=rs/cnt, real=km/lit, atg=rem?(real/rem*100):null;
      if(atg==null) continue;
      recs.push({field:'comb',label:'Combustível',unit:uni,vig,meta:rem,real,atg});
    }
  }
  return recs;
}

async function main(){
  console.log('VIG alvo:', VIG_ALVO);
  const rec = await load();
  const combRec = await loadComb();
  rec.push(...combRec);
  console.log('Total records:', rec.length, '| comb:', combRec.length);
  const vigs=[...new Set(rec.map(r=>r.vig))].sort();
  console.log('Vigências:', vigs.join(', '));

  for (const ind of [...INDS, {field:'comb',label:'Combustível'}]){
    const rs = rec.filter(r=>r.field===ind.field && r.vig===VIG_ALVO).sort((a,b)=>a.unit.localeCompare(b.unit));
    console.log(`\n### ${ind.label} (${ind.field}) — ${VIG_ALVO} — ${rs.length} filiais`);
    rs.forEach(r=>console.log(`   ${r.unit.padEnd(22)} meta=${r.meta==null?'—':r.meta.toFixed(2)}  real=${r.real==null?'—':r.real.toFixed(2)}  atg=${r.atg==null?'—':r.atg.toFixed(1)}%`));
  }

  // check: Conformidade do Rio (col F bimestral) por vigência
  console.log('\n### Conformidade CDD RIO DE JANEIRO (col F bimestral) por vigência');
  rec.filter(r=>r.field==='conf'&&r.unit==='CDD RIO DE JANEIRO').sort((a,b)=>a.vig.localeCompare(b.vig))
    .forEach(r=>console.log(`   ${r.vig}  real=${r.real==null?'—':r.real.toFixed(1)}  atg=${r.atg==null?'—':r.atg.toFixed(1)}%`));

  const byUnit=new Map();
  rec.filter(r=>r.vig===VIG_ALVO).forEach(r=>{ if(!byUnit.has(r.unit))byUnit.set(r.unit,{}); byUnit.get(r.unit)[r.field]=r.atg; });
  const rank=[...byUnit.entries()].map(([unit,f])=>({unit,score:calcScore(f),f})).filter(x=>x.score!=null).sort((a,b)=>b.score-a.score);
  console.log(`\n\n===== RANKING FROTA DE ELITE — ${VIG_ALVO} =====`);
  rank.forEach((x,i)=>console.log(`  ${String(i+1).padStart(2)}. ${x.unit.padEnd(22)} ${x.score.toFixed(1)} pts   [${Object.keys(FIELD_WEIGHTS).map(k=>x.f[k]==null?'·':Math.round(Math.min(100,x.f[k]))).join(' ')}]`));
  console.log('  ordem cols:', Object.keys(FIELD_WEIGHTS).join(' '));
  console.log('\nFIM.');
}
main().catch(e=>{ console.error('ERRO:', e); process.exit(1); });
