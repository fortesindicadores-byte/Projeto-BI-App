// Inspeciona a fonte do Eficiência Km/L p/ derivar o indicador "Combustível"
// por filial+vigência. Objetivo: descobrir o identificador de unidade do Km/L
// e como ele mapeia p/ as filiais do Gerot, e calcular a eficiência agregada.
const KML_ID = '1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';
const KML_TAB = 'Km/L';
const VIG_ALVO = process.env.VIG || '2026-06';

function parse(txt){ const s=txt.indexOf('{'), e=txt.lastIndexOf('}'); return JSON.parse(txt.slice(s,e+1)); }
function cellV(c){ return c? (c.v!=null?c.v:(c.f!=null?c.f:null)) : null; }
function num(c){ if(!c)return null; let v=c.v; if(v==null||v===''){ if(c.f!=null){ v=parseFloat(String(c.f).replace(/\./g,'').replace(',','.')); return isFinite(v)?v:null;} return null;} v=Number(v); return isFinite(v)?v:null; }
function gvig(c){ if(!c)return null; const v=c.v; let m=String(v).match(/Date\((\d+),(\d+)/); if(m)return m[1]+'-'+String(+m[2]+1).padStart(2,'0');
  const f=String(c.f!=null?c.f:(v!=null?v:'')); m=f.match(/([a-zç]{3,})\.?[\/\-](\d{4})/i); const MM={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
  if(m&&MM[m[1].toLowerCase().slice(0,3)])return m[2]+'-'+String(MM[m[1].toLowerCase().slice(0,3)]).padStart(2,'0');
  m=f.match(/(\d{1,2})\/(\d{4})/); if(m)return m[2]+'-'+m[1].padStart(2,'0'); return null; }

async function fetchTab(name){
  const url=`https://docs.google.com/spreadsheets/d/${KML_ID}/gviz/tq?sheet=${encodeURIComponent(name)}&tqx=out:json`;
  const j=parse(await (await fetch(url)).text());
  if(j.status!=='ok')throw new Error('status '+j.status);
  return j.table;
}

function detectCols(cols){
  const lc=cols.map(c=>String(c).toLowerCase());
  const fi=tests=>{ for(let i=0;i<lc.length;i++) if(tests.some(t=>lc[i].includes(t))) return i; return -1; };
  const fiNot=(tests,not)=>{ for(let i=0;i<lc.length;i++) if(tests.some(t=>lc[i].includes(t))&&not.every(t=>!lc[i].includes(t))) return i; return -1; };
  const fb=(i,d)=>i>=0?i:d;
  return {
    vig:fb(fi(['vigência','vigencia']),0),
    rem:fb(fi(['rem médio','rem medio']),4),
    remM:fb(fi(['rem modelo']),5),
    real:fb(fi(['km/l real']),6),
    proj:fb(fi(['projeto']),14),
    uni:fi(['unidade']),
    nv3:fi(['nv3','nível 3','nivel 3']),
    placa:fb(fi(['placa']),15),
    kmRod:fb(fi(['km rodado','km_rodado','kmrodado']),22),
  };
}
const splitPU=v=>{ const s=v?String(v):''; const i=s.indexOf('-'); return i>=0?[s.slice(0,i).trim(),s.slice(i+1).trim()]:[s.trim(),'']; };

async function main(){
  const t=await fetchTab(KML_TAB);
  const cols=(t.cols||[]).map(c=>c.label||c.id||'');
  const rows=t.rows||[];
  const CL=detectCols(cols);
  console.log('COLUNAS:'); cols.forEach((c,i)=>console.log(`   [${i}] ${c}`));
  console.log('\nCL detectado:', JSON.stringify(CL));
  console.log('LINHAS:', rows.length);

  const vigsSet=new Set(); rows.forEach(r=>{ const v=gvig(r.c?.[CL.vig]); if(v)vigsSet.add(v); });
  console.log('VIGÊNCIAS:', [...vigsSet].sort().join(', '));

  const projSet=new Map(); const puSet=new Map();
  rows.forEach(r=>{ const pv=cellV(r.c?.[CL.proj]); const [p,u]=splitPU(pv); if(pv){ projSet.set(String(pv),(projSet.get(String(pv))||0)+1); puSet.set(p+' || '+u,(puSet.get(p+' || '+u)||0)+1);} });
  console.log('\nPROJETO (bruto) distintos:', projSet.size);
  [...projSet.entries()].sort((a,b)=>b[1]-a[1]).forEach(([k,n])=>console.log(`   ${k}  (${n})`));
  console.log('\n(PROJ || UNI) distintos:', puSet.size);
  [...puSet.entries()].sort((a,b)=>b[1]-a[1]).forEach(([k,n])=>console.log(`   ${k}  (${n})`));

  [['uni',CL.uni],['nv3',CL.nv3]].forEach(([nm,ci])=>{ if(ci>=0){ const s=new Set(); rows.forEach(r=>{const v=cellV(r.c?.[ci]); if(v)s.add(String(v));}); console.log(`\nColuna ${nm} [${ci}] distintos (${s.size}):`, [...s].sort().slice(0,40).join(' | ')); } });

  console.log(`\n===== EFICIÊNCIA por UNIDADE — ${VIG_ALVO} =====`);
  const agg=new Map();
  rows.forEach(r=>{ const c=r.c||[]; if(gvig(c[CL.vig])!==VIG_ALVO)return; const [,u]=splitPU(cellV(c[CL.proj]));
    const km=num(c[CL.kmRod]), real=num(c[CL.real]), remMed=num(c[CL.rem]), remMod=num(c[CL.remM]);
    if(!(km>0))return;
    if(!agg.has(u))agg.set(u,{km:0,lReal:0,lMed:0,lMod:0,nReal:0,nMed:0,nMod:0});
    const o=agg.get(u); o.km+=km;
    if(real>0){o.lReal+=km/real;o.nReal++;}
    if(remMed>0){o.lMed+=km/remMed;o.nMed++;}
    if(remMod>0){o.lMod+=km/remMod;o.nMod++;}
  });
  [...agg.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([u,o])=>{
    const realKmpl=o.lReal>0?o.km/o.lReal:null;
    const medKmpl=o.lMed>0?o.km/o.lMed:null;
    const modKmpl=o.lMod>0?o.km/o.lMod:null;
    const atgMed=(o.lReal>0&&o.lMed>0)?(o.lMed/o.lReal*100):null;
    const atgMod=(o.lReal>0&&o.lMod>0)?(o.lMod/o.lReal*100):null;
    console.log(`   ${String(u||'(vazio)').padEnd(14)} km=${Math.round(o.km).toString().padStart(9)}  real=${realKmpl?realKmpl.toFixed(2):'—'}  remMed=${medKmpl?medKmpl.toFixed(2):'—'}  remMod=${modKmpl?modKmpl.toFixed(2):'—'}  atgMed=${atgMed?atgMed.toFixed(1):'—'}%  atgMod=${atgMod?atgMod.toFixed(1):'—'}%`);
  });
  console.log('\nFIM.');
}
main().catch(e=>{ console.error('ERRO:', e); process.exit(1); });
