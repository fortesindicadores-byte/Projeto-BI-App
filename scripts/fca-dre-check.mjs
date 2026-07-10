// Valida o approach final: FCA lê custos da aba "Frota" (índices remapeados) e casa a unidade SEM acento.
// Frota: [0]VIG [3]Unidade [4]NÍVEL3 [5]CONTA GERENCIAL [8]ORÇADO [9]REMUNERADO [10]REALIZADO
const VF='1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8';
async function gvizRaw(sid,tab){
  const url=`https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?sheet=${encodeURIComponent(tab)}&tqx=out:json`;
  const raw=await (await fetch(url)).text();
  const json=JSON.parse(raw.replace(/^[\s\S]*?setResponse\(/,'').replace(/\);?\s*$/,''));
  if(!json.table)throw new Error('sem table: '+raw.slice(0,200));
  return (json.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
}
const parseD=v=>{const m=String(v==null?'':v).match(/Date\((\d+),(\d+),(\d+)/);return m?new Date(+m[1],+m[2],+m[3]):null;};
const vigKeyN=d=>d?d.getFullYear()*100+d.getMonth():0;
const _nc=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const EXCL=new Set(['RECEITA LIQUIDA','ICMS CREDITO PRESUMIDO','IPVA E LICENCIAMENTO DE VEICULOS','ESTORNO ICMS NAO APROVEITADO']);

async function main(){
  const dre=await gvizRaw(VF,'Frota');
  console.log('Frota linhas:',dre.length);
  for(const UNIDADE_DRE of ['CUIABA','CAMPO GRANDE','PIRAI','RONDONOPOLIS','BALNEARIO CAMBORIU']){
    // pushDRE remapeado: vig=0, uni=3(sem acento), niv=4, conta=5, rem=9, real=10
    const drRows=dre.filter(r=>parseD(r[0])&&_nc(r[3])===_nc(UNIDADE_DRE)&&!EXCL.has(_nc(r[5])));
    if(!drRows.length){console.log(`\n${UNIDADE_DRE}: 0 linhas ❌`);continue;}
    // sum rem/real por vigência (p/ diagnosticar meses futuros vazios)
    const byVig={};drRows.forEach(r=>{const k=vigKeyN(parseD(r[0]));(byVig[k]=byVig[k]||{rem:0,real:0});byVig[k].rem+=r[9]!=null?+r[9]:0;byVig[k].real+=r[10]!=null?+r[10]:0;});
    const últimos=Object.keys(byVig).map(Number).sort((a,b)=>b-a).slice(0,4);
    console.log(`\n${UNIDADE_DRE}: últimas vigs (rem|real): `+últimos.map(k=>`${(k%100)+1}/${Math.floor(k/100)}=${Math.round(byVig[k].rem)}|${Math.round(byVig[k].real)}`).join('  '));
    // maxK = última vigência COM realizado != 0
    let maxK=0;drRows.forEach(r=>{const real=r[10]!=null?+r[10]:0;if(real!==0){const k=vigKeyN(parseD(r[0]));if(k>maxK)maxK=k;}});
    const acc={};
    drRows.filter(r=>vigKeyN(parseD(r[0]))===maxK).forEach(r=>{const conta=String(r[5]||'—').trim();const niv=String(r[4]||'').trim();const rem=r[9]!=null?+r[9]:0,real=r[10]!=null?+r[10]:0;const key=niv+'||'+conta;if(!acc[key])acc[key]={conta,niv,rem:0,real:0};acc[key].rem+=rem;acc[key].real+=real;});
    const fatos=Object.values(acc).map(o=>({...o,over:o.rem-o.real})).filter(o=>o.over>0&&o.rem!==0).sort((a,b)=>b.over-a.over);
    const my=Math.floor(maxK/100), mm=(maxK%100)+1;
    console.log(`\n${UNIDADE_DRE}: ${drRows.length} linhas · última vig ${String(mm).padStart(2,'0')}/${my} · ${fatos.length} fatos de custo (over>0):`);
    fatos.slice(0,6).forEach(o=>console.log(`   ▲ ${Math.round(o.over).toLocaleString('pt-BR')}  ${o.conta}  [${o.niv}]`));
  }
}
main().catch(e=>{console.error('Falha:',e);process.exit(1);});
