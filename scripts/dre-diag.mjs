// Diagnóstico: compara Consolidado DRE  ×  (Frota + Receita Líquida) no mesmo escopo.
// Roda no GitHub Actions (o runner alcança docs.google). Descartável.
const SID='1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8';
const ANO=2026;

const norm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const mesNum=m=>{ if(m==null)return null; if(typeof m==='number'&&m>=1&&m<=12)return m; const s=norm(m); const i=MESES.indexOf(s.slice(0,3)); if(i>=0)return i+1; const n=parseInt(s); return (n>=1&&n<=12)?n:null; };
const numBR=v=>{ if(v==null||v==='')return null; if(typeof v==='number')return v; let s=String(v).replace(/\s|R\$/g,''); if(s.indexOf(',')>=0)s=s.replace(/\./g,'').replace(',','.'); const f=parseFloat(s); return isNaN(f)?null:f; };
function parseVig(v){ if(v==null)return null; if(v instanceof Date)return new Date(v.getFullYear(),v.getMonth(),1);
  const s=String(v); let m=s.match(/^Date\((\d+),(\d+),\d+\)$/); if(m)return new Date(+m[1],+m[2],1);
  if(s.includes('/')){ const [d,mo,y]=s.split('/'); return new Date(+y,+mo-1,1); } return null; }
function ebIdx(header,...names){ const nc=header.map(norm); for(const n of names){ const i=nc.indexOf(norm(n)); if(i>=0)return i; } for(const n of names){ const t=norm(n); const i=nc.findIndex(c=>c.includes(t)); if(i>=0)return i; } return -1; }

const CONTAS=['Combustíveis','Estorno ICMS','Manutenção de Carrocerias','Contratos de Manutenção Fabricante','Recapagens e Outros Serviços','IPVA e Licenciamento','Seguros','Materiais e Ferramentas de Oficina','Personalização/Padronização','Lavação de Veículos','Arla','Manutenção de Veículos e Equip.','Pneus Novos','ICMS Crédito Presumido','Outros'];
const CONTAS_ALIAS={'Combustíveis Veiculos e Equipamentos':'Combustíveis','Estorno de ICMS não Aproveitado':'Estorno ICMS','Fluídos (Arla)':'Arla','IPVA e Licenciamento de Veículos':'IPVA e Licenciamento','Seguro de Veículos e Equipamentos':'Seguros','Personalização/Padronização de Veículos':'Personalização/Padronização','Personalização e Padronização de Veículos':'Personalização/Padronização','Manutenção de Veículos e Equipamentos':'Manutenção de Veículos e Equip.','Consertos e Recapagens de Pneus':'Recapagens e Outros Serviços','Pneus e Camaras':'Pneus Novos'};
const canon=raw=>{ let c=CONTAS_ALIAS[raw]||raw; if(c!=='Receita Líquida' && !CONTAS.includes(c)) c='Outros'; return c; };

async function gviz(tab){
  const url=`https://docs.google.com/spreadsheets/d/${SID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tab)}`;
  const res=await fetch(url); const raw=await res.text();
  const json=JSON.parse(raw.replace(/^[\s\S]*?\(/,'').replace(/\);?\s*$/,''));
  let header=(json.table.cols||[]).map(c=>c&&c.label?c.label:'');
  let rows=json.table.rows.map(r=>r.c.map(c=>c&&c.v!=null?c.v:null));
  if(!header.some(x=>norm(x).includes('realizado')) && rows.length){ header=rows[0].map(x=>x==null?'':String(x)); rows=rows.slice(1); }
  return {header,rows};
}

// records => [{vig:Date, cta:'canon', orc,rem,real}]
function recsConsolidado(t){
  return t.rows.map(r=>({ vig:parseVig(r[9]), cta:canon(String(r[12]||'Outros')), orc:numBR(r[0]), rem:numBR(r[1]), real:numBR(r[2]) })).filter(x=>x.vig);
}
function recsTab(t, ctaFixo){
  const h=t.header, m={orc:ebIdx(h,'orçado','orcado'),rem:ebIdx(h,'remunerado'),real:ebIdx(h,'realizado'),vig:ebIdx(h,'vigência','vigencia'),cta:ebIdx(h,'conta gerencial','conta'),mes:ebIdx(h,'mês','mes'),ano:ebIdx(h,'ano')};
  const out=[];
  t.rows.forEach(r=>{
    let vig=null; const mn=m.mes>=0?mesNum(r[m.mes]):null, an=m.ano>=0?parseInt(r[m.ano]):null;
    if(mn&&an) vig=new Date(an,mn-1,1); else if(m.vig>=0) vig=parseVig(r[m.vig]);
    if(!vig) return;
    const rawCta=ctaFixo||String(r[m.cta]||'Outros');
    if(!ctaFixo && norm(rawCta).includes('receita liquida')) return;
    out.push({ vig, cta:ctaFixo?'Receita Líquida':canon(rawCta), orc:numBR(r[m.orc]), rem:numBR(r[m.rem]), real:numBR(r[m.real]) });
  });
  return out;
}

const temReal=x=> (x.real!=null) || (x.rem!=null);
function resumo(recs){
  const doAno=recs.filter(x=>x.vig.getFullYear()===ANO);
  const meses=doAno.filter(temReal).map(x=>x.vig.getMonth());
  const cut=meses.length?Math.max(...meses):-1;         // último mês (0-11) com realizado
  const acc=doAno.filter(x=>x.vig.getMonth()<=cut);
  const S=(arr,k)=>arr.reduce((a,x)=>a+(+x[k]||0),0);
  const receita=acc.filter(x=>x.cta==='Receita Líquida');
  const custos =acc.filter(x=>x.cta!=='Receita Líquida');
  const porConta={};
  custos.forEach(x=>{ (porConta[x.cta]=porConta[x.cta]||{orc:0,rem:0,real:0}); porConta[x.cta].orc+=+x.orc||0; porConta[x.cta].rem+=+x.rem||0; porConta[x.cta].real+=+x.real||0; });
  return { cut, nAno:doAno.length, nAcc:acc.length,
    recOrc:S(receita,'orc'), recRem:S(receita,'rem'), recReal:S(receita,'real'),
    cusOrc:S(custos,'orc'),  cusRem:S(custos,'rem'),  cusReal:S(custos,'real'), porConta };
}

const f=v=>Math.round(v).toLocaleString('pt-BR');
async function main(){
  const [cons, frota, receita] = await Promise.all([gviz('Consolidado DRE'), gviz('Frota'), gviz('Receita Líquida')]);
  console.log('Cabeçalho Frota  :', frota.header.join(' | '));
  console.log('Cabeçalho Receita:', receita.header.join(' | '));
  const A=resumo(recsConsolidado(cons));                                   // ANTIGO
  const B=resumo([...recsTab(frota,null), ...recsTab(receita,'Receita Líquida')]); // NOVO
  const linha=(lbl,a,b)=>{ const d=b-a; console.log(`${lbl.padEnd(22)} | antigo ${f(a).padStart(16)} | novo ${f(b).padStart(16)} | dif ${f(d).padStart(14)}${Math.abs(d)>1?'  <-- DIVERGE':''}`); };
  console.log(`\n=== ESCOPO: ano ${ANO}, acumulado até mês ${A.cut+1} (antigo) / ${B.cut+1} (novo) ===`);
  console.log(`linhas no ano: antigo ${A.nAno} / novo ${B.nAno} · no acumulado: antigo ${A.nAcc} / novo ${B.nAcc}\n`);
  linha('Receita Realizada', A.recReal, B.recReal);
  linha('Receita Remunerada', A.recRem, B.recRem);
  linha('Receita Orçada',   A.recOrc, B.recOrc);
  linha('Custo Realizado',  A.cusReal, B.cusReal);
  linha('Custo Remunerado', A.cusRem, B.cusRem);
  linha('Custo Orçado',     A.cusOrc, B.cusOrc);
  console.log('\n=== POR CONTA (Realizado) ===');
  const contas=[...new Set([...Object.keys(A.porConta),...Object.keys(B.porConta)])].sort();
  contas.forEach(c=>{ const a=(A.porConta[c]||{}).real||0, b=(B.porConta[c]||{}).real||0; linha(c, a, b); });
  console.log('\n=== FIM ===');
}
main().catch(e=>{ console.error('Falha:', e); process.exit(1); });
