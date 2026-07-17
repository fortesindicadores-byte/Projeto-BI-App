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
  {field:'conf',   tab:'Conformidade',        label:'Conformidade',      metaCol:1, vigCol:0, filCol:2, valCol:3,  mode:'direct'},
  {field:'sla',    tab:'SLA Man.',            label:'SLA Man.',          metaCol:0, vigCol:1, filCol:2, valCol:8,  mode:'direct'},
  {field:'stVeic', tab:'Stress Test - Veíc.', label:'Stress Test Veíc.', metaCol:0, vigCol:1, filCol:3, descCol:16, mode:'desconto'},
  {field:'stEmp',  tab:'Stress Test - Emp',   label:'Stress Test Emp.',  metaCol:0, vigCol:1, filCol:4, descCol:19, mode:'desconto'},
  {field:'civf',   tab:'CIVF',                label:'CIVF',              metaCol:0, vigCol:1, filCol:3, descCol:12, mode:'desconto'},
];

// pesos nominais (Combustível 10% saiu; normalização redistribui proporcional)
const FIELD_WEIGHTS = { disp:20, prev:15, pneus:10, checkT:10, checkWH:10, conf:5, stVeic:5, stEmp:5, sla:5, civf:5 };

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
        const meta=pct(c[ind.metaCol]); const real=pct(c[ind.valCol]); if(real==null)return;
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

async function main(){
  console.log('VIG alvo:', VIG_ALVO);
  const rec = await load();
  console.log('Total records:', rec.length);
  const vigs=[...new Set(rec.map(r=>r.vig))].sort();
  console.log('Vigências:', vigs.join(', '));

  for (const ind of INDS){
    const rs = rec.filter(r=>r.field===ind.field && r.vig===VIG_ALVO).sort((a,b)=>a.unit.localeCompare(b.unit));
    console.log(`\n### ${ind.label} (${ind.field}) — ${VIG_ALVO} — ${rs.length} filiais`);
    rs.forEach(r=>console.log(`   ${r.unit.padEnd(22)} meta=${r.meta==null?'—':r.meta.toFixed(1)}  real=${r.real==null?'—':r.real.toFixed(1)}  atg=${r.atg==null?'—':r.atg.toFixed(1)}%`));
  }

  const byUnit=new Map();
  rec.filter(r=>r.vig===VIG_ALVO).forEach(r=>{ if(!byUnit.has(r.unit))byUnit.set(r.unit,{}); byUnit.get(r.unit)[r.field]=r.atg; });
  const rank=[...byUnit.entries()].map(([unit,f])=>({unit,score:calcScore(f),f})).filter(x=>x.score!=null).sort((a,b)=>b.score-a.score);
  console.log(`\n\n===== RANKING FROTA DE ELITE — ${VIG_ALVO} =====`);
  rank.forEach((x,i)=>console.log(`  ${String(i+1).padStart(2)}. ${x.unit.padEnd(22)} ${x.score.toFixed(1)} pts   [${Object.keys(FIELD_WEIGHTS).map(k=>x.f[k]==null?'·':Math.round(Math.min(100,x.f[k]))).join(' ')}]`));
  console.log('  ordem cols:', Object.keys(FIELD_WEIGHTS).join(' '));
  console.log('\nFIM.');
}
main().catch(e=>{ console.error('ERRO:', e); process.exit(1); });
