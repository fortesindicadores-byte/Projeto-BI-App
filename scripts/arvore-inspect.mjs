// Dump de cabeçalhos + amostra das abas que vão compor a Árvore de Combustível
// direto das fontes (sem a aba consolidada "Árvore Comb."). Roda no GitHub Actions.
const _n=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();

async function gviz(sid,qs){
  const url=`https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?${qs}&tqx=out:json`;
  const raw=await (await fetch(url)).text();
  const json=JSON.parse(raw.replace(/^[\s\S]*?setResponse\(/, '').replace(/\);?\s*$/, ''));
  const cols=(json.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
  let rows=(json.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
  if(cols.every(c=>!c)&&rows.length){ const h=rows[0].map(v=>String(v==null?'':v)); rows=rows.slice(1); return {cols:h,rows}; }
  return {cols,rows};
}
function letra(i){ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; }
function dumpCols(tag,cols){
  console.log(`\n===== ${tag} — ${cols.length} colunas =====`);
  cols.forEach((c,i)=>console.log(`  [${i}] ${letra(i)}\t"${c}"`));
}

const GV='1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM';   // Base Dispersão de km (tem Dispersão de km, R$/L, Árvore Comb.)
const VF='1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8';   // Visão Financeira (aba Frota)

async function main(){
  for(const [tag,sid,tab] of [
    ['Dispersão de km',GV,'Dispersão de km'],
    ['R$/L',GV,'R$/L'],
    ['Árvore Comb.',GV,'Árvore Comb.'],
    ['Frota (VF)',VF,'Frota'],
  ]){
    try{
      const {cols,rows}=await gviz(sid,'sheet='+encodeURIComponent(tab));
      dumpCols(`${tag} (${rows.length} linhas)`,cols);
      console.log(`  -- 2 primeiras linhas de dados --`);
      rows.slice(0,2).forEach((r,ri)=>console.log(`   L${ri+1}: ${JSON.stringify(r)}`));
    }catch(e){ console.log(`\n!!! ${tag}: FALHA ${e.message||e}`); }
  }
}
main().catch(e=>{console.error('Falha geral:',e);process.exit(1);});
