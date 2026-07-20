// Investiga o salto do Km/L REMUNERADO (linha tracejada) em abril nos modelos ACTROS.
// Remunerado do gráfico = Km/L Rem Médio ponderado (média burra por projeto, projetos ponderados por km).
const KML='1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';

async function gviz(sid,tab){
  const url=`https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?sheet=${encodeURIComponent(tab)}&headers=1&tqx=out:json`;
  const raw=await (await fetch(url)).text();
  const json=JSON.parse(raw.replace(/^[\s\S]*?setResponse\(/, '').replace(/\);?\s*$/, ''));
  const cols=(json.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
  let rows=(json.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
  if(cols.every(c=>!c||/^[A-Z]{1,3}$/.test(c))&&rows.length){ const h=rows[0].map(v=>String(v==null?'':v)); rows=rows.slice(1); return {cols:h,rows}; }
  return {cols,rows};
}
const fi=(cols,...t)=>{for(let i=0;i<cols.length;i++){const lc=String(cols[i]||'').toLowerCase();if(t.some(x=>lc.includes(x)))return i;}return -1;};
const fiNot=(cols,tests,not)=>{for(let i=0;i<cols.length;i++){const lc=String(cols[i]||'').toLowerCase();if(tests.some(t=>lc.includes(t))&&not.every(t=>!lc.includes(t)))return i;}return -1;};
const MMAP={jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};
function parseVig(v){ if(!v)return null; if(v instanceof Date)return new Date(v.getFullYear(),v.getMonth(),1);
  if(typeof v==='string'){ const g=v.match(/^Date\((\d+),(\d+)/);if(g)return new Date(+g[1],+g[2],1);
    const m1=v.match(/^([a-zá-ú]+)\.?\/(\d{4})$/i);if(m1){const mo=MMAP[m1[1].toLowerCase().slice(0,3)];if(mo!==undefined)return new Date(+m1[2],mo,1);}
    const m2=v.match(/^(\d{1,2})\/(\d{4})$/);if(m2)return new Date(+m2[2],+m2[1]-1,1); }
  if(typeof v==='number'){const d=new Date(1899,11,30);d.setDate(d.getDate()+Math.round(v));return new Date(d.getFullYear(),d.getMonth(),1);} return null; }
const vigBR=d=>`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
const projPre=v=>String(v||'').split('-')[0].trim();

function remMedio(rows,C){
  const proj={};
  rows.forEach(r=>{ const p=projPre(r[C.proj])||'—', rem=+r[C.rem]||0, km=+r[C.kmRod]||0;
    if(!proj[p])proj[p]={s:0,n:0,km:0}; if(rem>0){proj[p].s+=rem;proj[p].n++;} proj[p].km+=km; });
  let sMp=0,kMp=0; Object.values(proj).forEach(v=>{const rp=v.n>0?v.s/v.n:null; if(rp!=null&&v.km>0){sMp+=rp*v.km;kMp+=v.km;}});
  return kMp>0?sMp/kMp:null;
}

async function main(){
  const {cols,rows}=await gviz(KML,'Km/L');
  const C={vig:0, rem:fi(cols,'rem médio','rem medio'), remM:fi(cols,'rem modelo'), real:fi(cols,'km/l real'),
    ativo:fi(cols,'ativo'), proj:fi(cols,'projeto'), placa:fi(cols,'placa'),
    modelo:fiNot(cols,['modelo'],['rem','km/l','km /l']), kmRod:fi(cols,'km rodado'), litros:fi(cols,'litro','qtd total') };
  console.log('Colunas:',JSON.stringify(C),'->',{rem:cols[C.rem],remM:cols[C.remM],real:cols[C.real],modelo:cols[C.modelo],placa:cols[C.placa]});

  const is2026=r=>{const d=parseVig(r[C.vig]);return d&&d.getFullYear()===2026;};
  const isActros=r=>/actros/i.test(String(r[C.modelo]||''));
  const base=rows.filter(r=>is2026(r)&&isActros(r));
  console.log(`Linhas ACTROS 2026: ${base.length}`);
  console.log('Modelos ACTROS:',[...new Set(base.map(r=>String(r[C.modelo]||'').trim()))].sort().join(' | '));

  const meses=['01/2026','02/2026','03/2026','04/2026','05/2026','06/2026'];
  console.log('\n== Km/L Rem Médio (ponderado) por mês — ACTROS ==');
  meses.forEach(v=>{ const rw=base.filter(r=>{const d=parseVig(r[C.vig]);return d&&vigBR(d)===v;});
    const rem=remMedio(rw,C); const nPl=new Set(rw.map(r=>r[C.placa])).size;
    console.log(`  ${v}: RemMédio=${rem!=null?rem.toFixed(3):'—'}  placas=${nPl}  linhas=${rw.length}`); });

  console.log('\n== Rem Médio por PLACA (jan→jun) — ACTROS (ordenado por |abr − mar|) ==');
  const placas={};
  base.forEach(r=>{ const d=parseVig(r[C.vig]); if(!d)return; const v=vigBR(d), pl=String(r[C.placa]||'—'), mod=String(r[C.modelo]||'').trim();
    (placas[pl]=placas[pl]||{mod,rem:{}}).rem[v]=+r[C.rem]||0; });
  const arr=Object.entries(placas).map(([pl,o])=>{ const mar=o.rem['03/2026']||0, abr=o.rem['04/2026']||0; return {pl,mod:o.mod,rem:o.rem,jump:abr-mar}; });
  arr.sort((a,b)=>Math.abs(b.jump)-Math.abs(a.jump));
  arr.slice(0,25).forEach(x=>{ const cells=meses.map(v=>{const val=x.rem[v];return val?val.toFixed(2):'  · ';}).join('  '); console.log(`  ${x.pl.padEnd(9)} ${x.mod.slice(0,22).padEnd(22)} ${cells}   Δabr=${x.jump>=0?'+':''}${x.jump.toFixed(2)}`); });

  console.log('\n== Valores distintos de Rem Médio (ACTROS) por mês ==');
  meses.forEach(v=>{ const rw=base.filter(r=>{const d=parseVig(r[C.vig]);return d&&vigBR(d)===v;});
    const vals=[...new Set(rw.map(r=>+r[C.rem]||0).filter(x=>x>0).map(x=>x.toFixed(2)))].sort((a,b)=>a-b);
    console.log(`  ${v}: ${vals.join(', ')}`); });
}
main().catch(e=>{console.error('ERRO',e);process.exit(1);});
