// Probe descartável: quais anos/meses existem nas abas do Visão Financeira?
// Serve para saber se o YoY (ano anterior) tem base de comparação.
const SID='1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8';
const TABS=['Frota','Receita Líquida','EBITDA'];
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const _norm=s=>String(s==null?'':s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const idx=(h,...names)=>{ for(const n of names){ const k=_norm(n); const i=h.findIndex(x=>_norm(x)===k||_norm(x).includes(k)); if(i>=0)return i; } return -1; };
const mesNum=m=>{ if(m==null)return null; if(typeof m==='number'&&m>=1&&m<=12)return m; const s=_norm(m); const i=MESES.indexOf(s.slice(0,3)); if(i>=0)return i+1; const n=parseInt(s); return (n>=1&&n<=12)?n:null; };
function parseVig(v){ if(v==null)return null; const s=String(v);
  let m=s.match(/^Date\((\d+),(\d+),\d+\)$/); if(m)return {y:+m[1],mo:+m[2]+1};
  if(s.includes('/')){ const p=s.split('/'); if(p.length>=3)return {y:+p[2],mo:+p[1]}; } return null; }

async function fetchTab(tab){
  const url=`https://docs.google.com/spreadsheets/d/${SID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tab)}`;
  const raw=await (await fetch(url)).text();
  const json=JSON.parse(raw.replace(/^[\s\S]*?\(/,'').replace(/\);?\s*$/,''));
  let header=(json.table.cols||[]).map(c=>c&&c.label?c.label:'');
  let rows=json.table.rows.map(r=>r.c.map(c=>c&&c.v!=null?c.v:null));
  if(!header.some(x=>_norm(x).includes('realizado'))&&rows.length){ header=rows[0].map(x=>x==null?'':String(x)); rows=rows.slice(1); }
  return {header,rows};
}

async function main(){
  for(const tab of TABS){
    const {header,rows}=await fetchTab(tab);
    const iMes=idx(header,'mês','mes'), iAno=idx(header,'ano'), iVig=idx(header,'vigência','vigencia'), iReal=idx(header,'realizado');
    const byYear={};
    rows.forEach(r=>{
      let y=null,mo=null;
      const mn=iMes>=0?mesNum(r[iMes]):null, an=iAno>=0?parseInt(r[iAno]):null;
      if(mn&&an){ y=an; mo=mn; }
      else if(iVig>=0){ const d=parseVig(r[iVig]); if(d){ y=d.y; mo=d.mo; } }
      if(y==null)return;
      byYear[y]=byYear[y]||new Set(); byYear[y].add(mo);
    });
    console.log(`\n=== ${tab} === (${rows.length} linhas · cols: ${header.join(' | ')})`);
    Object.keys(byYear).sort().forEach(y=>{
      const meses=[...byYear[y]].sort((a,b)=>a-b).map(m=>MESES[m-1]);
      console.log(`  ${y}: ${meses.join(', ')}`);
    });
  }
  console.log('\n=== FIM ===');
}
main().catch(e=>{ console.error('Falha:',e); process.exit(1); });
