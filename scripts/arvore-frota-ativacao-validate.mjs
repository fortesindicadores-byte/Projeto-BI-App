// Inspeciona/valida os denominadores de FROTA para a Árvore de Custo da Frota:
//  · Frota Ativa (Rem)  = frota remunerada  → Dispersão col "Frota Ativa" (21) [+ Seara fixo 50]
//  · Frota Realizada (Real) = viagens(W) ÷ dias úteis(C) [Empurrada /2]  → Dispersão
//                             + Seara: countdistinct(CD_VIAGEM_TRANSPORTE col B) por vigência
//  · Km da Seara (que hoje não entra) = Base CTEs QT_QUILOMETROS
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
  if(!json.table){ throw new Error('sem table: '+JSON.stringify(json.errors||json.status||json).slice(0,200)); }
  const cols=(json.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
  let rows=(json.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
  if(cols.every(c=>!c||/^[A-Z]{1,3}$/.test(c))&&rows.length){ const h=rows[0].map(v=>String(v==null?'':v)); rows=rows.slice(1); return {cols:h,rows}; }
  return {cols,rows};
}
const pre=v=>v?String(v).split('-')[0].trim():v;
const nk=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
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
  const fi=(...t)=>{for(let i=0;i<dp.cols.length;i++){const lc=String(dp.cols[i]||'').toLowerCase();if(t.some(x=>lc.includes(x)))return i;}return -1;};
  const cViag=22, cDU=2, cAtiva=21, cProj=14;
  console.log(`Dispersão: [2]=${JSON.stringify(dp.cols[2])} [21]=${JSON.stringify(dp.cols[21])} [22]=${JSON.stringify(dp.cols[22])}`);

  const vigs=[...new Set(dp.rows.map(r=>{const d=parseVig(r[0]);return d?vigBR(d):null;}).filter(Boolean))].sort((a,b)=>{const[ma,ya]=a.split('/'),[mb,yb]=b.split('/');return(ya-yb)||(ma-mb);});
  const V=vigs[vigs.length-1]; const [mm,yy]=V.split('/'); const du=diasUteis(+yy,+mm);
  console.log(`\n== vigência ${V} | dias úteis calc=${du} ==`);

  let ativaRem=0, realCalc=0, realColC=0, viagTot=0;
  for(const r of dp.rows){ const d=parseVig(r[0]); if(!d||vigBR(d)!==V)continue; const p=nk(pre(r[cProj])); const emp=p==='EMPURRADA';
    const viag=+r[cViag]||0, colC=+r[cDU]||0, at=+r[cAtiva]||0;
    ativaRem+=at; viagTot+=viag;
    realCalc += emp ? viag/du/2 : viag/du;
    if(colC>0) realColC += emp ? viag/colC/2 : viag/colC;
  }
  console.log(`Frota Ativa (Rem, Σcol21) = ${ativaRem.toFixed(1)}`);
  console.log(`Viagens totais (ΣW) = ${viagTot}`);
  console.log(`Frota Realizada (ΣViagens÷diasUteis calc, Emp/2) = ${realCalc.toFixed(1)}`);
  console.log(`Frota Realizada (col C "Dias Úteis")             = ${realColC.toFixed(1)}`);

  console.log('\n== SEARA Base CTEs ==');
  const se=await gviz(SEARA,{gid:GID_CTES});
  const letter=i=>{ let s='',n=i+1; while(n>0){ s=String.fromCharCode(65+(n-1)%26)+s; n=Math.floor((n-1)/26);} return s; };
  console.log(`total colunas=${se.cols.length} linhas=${se.rows.length}`);
  se.cols.forEach((c,i)=>{ if(i<13 || /quilomet|\bkm\b|frete/i.test(String(c))) console.log(`  [${i}=${letter(i)}] ${JSON.stringify(c)}`); });
  const setV={}, kmQt={};
  se.rows.forEach(r=>{ const b=r[1]; let mo=+r[10], yr=+r[11]; if(!yr){ const d=parseVig(r[3]); if(d){mo=d.getMonth()+1;yr=d.getFullYear();} }
    if(b==null||!yr)return; const v=`${String(mo).padStart(2,'0')}/${yr}`; (setV[v]=setV[v]||new Set()).add(String(b)); kmQt[v]=(kmQt[v]||0)+(+r[9]||0); });
  const svigs=Object.keys(setV).sort((a,b)=>{const[ma,ya]=a.split('/'),[mb,yb]=b.split('/');return(ya-yb)||(ma-mb);});
  console.log('Seara — frota realizada (distinct B) e km (Σ QT_QUILOMETROS) por vigência:');
  svigs.slice(-8).forEach(v=>console.log(`  ${v}: frotaReal=${setV[v].size}  km=${Math.round(kmQt[v])}`));
  console.log('Frota Ativa Seara = 50 (fixo)');
}
main().catch(e=>{console.error('ERRO',e);process.exit(1);});
