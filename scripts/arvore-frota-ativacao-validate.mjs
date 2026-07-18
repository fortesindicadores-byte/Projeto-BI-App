// Inspeciona/valida os denominadores de FROTA para a Árvore de Custo da Frota:
//  · Frota Ativa (Rem)  = frota remunerada  → Dispersão col "Frota Ativa" (21) [+ Seara fixo 50]
//  · Frota Realizada (Real) = viagens(W) ÷ dias úteis(C) [Empurrada /2]  → Dispersão
//                             + Seara: countdistinct(CD_VIAGEM_TRANSPORTE col B) por vigência
//  · Km da Seara (que hoje não entra) = Base CTEs sum(Z)
const GV='1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM';   // Dispersão de km
const SEARA='1Rlwc0MZiupQI38gSN8VyBq_zMADgX9R_ZbfygNP-OXE'; // workbook Seara
const GID_CTES=1672208132;                                  // Base CTEs

async function gviz(sid,{tab,gid,tq}={}){
  const parts=[];
  if(tab)parts.push(`sheet=${encodeURIComponent(tab)}`);
  if(gid!=null)parts.push(`gid=${gid}`);
  if(tq)parts.push(`tq=${encodeURIComponent(tq)}`);
  parts.push('headers=1','tqx=out:json');
  const url=`https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?${parts.join('&')}`;
  const raw=await (await fetch(url)).text();
  const json=JSON.parse(raw.replace(/^[\s\S]*?setResponse\(/, '').replace(/\);?\s*$/, ''));
  const cols=(json.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
  let rows=(json.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
  if(cols.every(c=>!c||/^[A-Z]{1,3}$/.test(c))&&rows.length){ const h=rows[0].map(v=>String(v==null?'':v)); rows=rows.slice(1); return {cols:h,rows}; }
  return {cols,rows};
}
const pre=v=>v?String(v).split('-')[0].trim():v;
const nk=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const MMAP={jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};
function parseVig(v){
  if(!v)return null;
  if(v instanceof Date)return new Date(v.getFullYear(),v.getMonth(),1);
  if(typeof v==='string'){ const g=v.match(/^Date\((\d+),(\d+)/);if(g)return new Date(+g[1],+g[2],1);
    const m2=v.match(/^(\d{1,2})\/(\d{4})$/);if(m2)return new Date(+m2[2],+m2[1]-1,1); }
  if(typeof v==='number'){const d=new Date(1899,11,30);d.setDate(d.getDate()+Math.round(v));return new Date(d.getFullYear(),d.getMonth(),1);}
  return null;
}
const vigBR=d=>`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
function diasUteis(y,m){ let n=0; const d=new Date(y,m-1,1); while(d.getMonth()===m-1){ if(d.getDay()!==0)n++; d.setDate(d.getDate()+1);} return n; }

async function main(){
  const dp=await gviz(GV,{tab:'Dispersão de km'});
  console.log('== DISPERSÃO: colunas 0..33 ==');
  dp.cols.slice(0,34).forEach((c,i)=>console.log(`  [${i}] ${JSON.stringify(c)}`));
  const fi=(...t)=>{for(let i=0;i<dp.cols.length;i++){const lc=String(dp.cols[i]||'').toLowerCase();if(t.some(x=>lc.includes(x)))return i;}return -1;};
  const cViag=fi('viagens - real','viagens- real','viagens real'), cDU=fi('dias úteis','dias uteis','dia util'), cAtiva=21, cProj=14;
  console.log(`\nviagens(W?)= idx ${cViag} -> ${JSON.stringify(dp.cols[cViag])} | col W(22)=${JSON.stringify(dp.cols[22])}`);
  console.log(`dias úteis(C?)= idx ${cDU} -> ${JSON.stringify(dp.cols[cDU])} | col C(2)=${JSON.stringify(dp.cols[2])}`);
  console.log(`Frota Ativa(21)= ${JSON.stringify(dp.cols[cAtiva])}`);

  const vigs=[...new Set(dp.rows.map(r=>{const d=parseVig(r[0]);return d?vigBR(d):null;}).filter(Boolean))].sort((a,b)=>{const[ma,ya]=a.split('/'),[mb,yb]=b.split('/');return(ya-yb)||(ma-mb);});
  const V=vigs[vigs.length-1]; const [mm,yy]=V.split('/'); const du=diasUteis(+yy,+mm);
  console.log(`\n== vigência ${V} | dias úteis (calculado, s/ domingo) = ${du} ==`);

  const WV=cViag>=0?cViag:22, CV=cDU>=0?cDU:2;
  let ativaRem=0, realCalc=0, realColC=0, viagTot=0;
  for(const r of dp.rows){ const d=parseVig(r[0]); if(!d||vigBR(d)!==V)continue; const p=nk(pre(r[cProj])); const emp=p==='EMPURRADA';
    const viag=+r[WV]||0, colC=+r[CV]||0, at=+r[cAtiva]||0;
    ativaRem+=at; viagTot+=viag;
    realCalc += emp ? viag/du/2 : viag/du;
    if(colC>0) realColC += emp ? viag/colC/2 : viag/colC;
  }
  console.log(`Frota Ativa (Rem, Σcol21) = ${ativaRem.toFixed(1)}`);
  console.log(`Viagens totais (ΣW) = ${viagTot}`);
  console.log(`Frota Realizada (ΣViagens÷diasUteis calc, Emp/2) = ${realCalc.toFixed(1)}`);
  console.log(`Frota Realizada (usando col C como dias úteis)   = ${realColC.toFixed(1)}`);

  console.log('\n== SEARA Base CTEs ==');
  const seCols=await gviz(SEARA,{gid:GID_CTES});
  console.log('colunas 0..12:'); seCols.cols.slice(0,13).forEach((c,i)=>console.log(`  [${i}] ${JSON.stringify(c)}`));
  const distinct=await gviz(SEARA,{gid:GID_CTES,tq:'select B, year(D), month(D) group by B, year(D), month(D)'});
  const perVig={};
  distinct.rows.forEach(r=>{ const b=r[0], yr=+r[1], mo=(+r[2])+1; if(b==null||!yr)return; const v=`${String(mo).padStart(2,'0')}/${yr}`; perVig[v]=(perVig[v]||0)+1; });
  const kmSeara=await gviz(SEARA,{gid:GID_CTES,tq:'select year(D), month(D), sum(Z) group by year(D), month(D)'});
  const kmPerVig={};
  kmSeara.rows.forEach(r=>{ const yr=+r[0], mo=(+r[1])+1; if(!yr)return; kmPerVig[`${String(mo).padStart(2,'0')}/${yr}`]=+r[2]||0; });
  const svigs=Object.keys(perVig).sort((a,b)=>{const[ma,ya]=a.split('/'),[mb,yb]=b.split('/');return(ya-yb)||(ma-mb);});
  console.log('Seara — frota realizada (countdistinct B) e km rem (ΣZ) por vigência:');
  svigs.forEach(v=>console.log(`  ${v}: frotaReal=${perVig[v]}  kmRem=${Math.round(kmPerVig[v]||0)}`));
  console.log('Frota Ativa Seara = 50 (fixo)');
}
main().catch(e=>{console.error('ERRO',e);process.exit(1);});
