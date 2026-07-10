// Diagnóstico descartável: mede a junção Fornecedor → Família (aba Fornecedores)
// contra a base de NFs (aba DRE, gid=0). Roda no GitHub Actions.
const SID='1S7L6G3L8bboirAExGPRCITYkWsGoVpjUoXc-aVXdW6k';
const _n=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const _cnpj=s=>String(s==null?'':s).replace(/\D/g,'');

async function gviz(qs){
  const url=`https://docs.google.com/spreadsheets/d/${SID}/gviz/tq?${qs}&headers=1&tqx=out:json`;
  const raw=await (await fetch(url)).text();
  const json=JSON.parse(raw.replace(/^[\s\S]*?setResponse\(/, '').replace(/\);?\s*$/, ''));
  const cols=(json.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
  let rows=(json.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
  if(cols.every(c=>!c)&&rows.length){ const h=rows[0].map(v=>String(v==null?'':v)); rows=rows.slice(1); return {cols:h,rows}; }
  return {cols,rows};
}
const col=(cols,...names)=>{ const N=cols.map(_n); for(const nm of names){ const i=N.indexOf(_n(nm)); if(i>=0)return i; } for(const nm of names){ const t=_n(nm); const i=N.findIndex(c=>c.includes(t)); if(i>=0)return i; } return -1; };

async function main(){
  // ── base DRE ──
  const dre=await gviz('gid=0');
  const dForn=col(dre.cols,'Fornecedor'), dReal=col(dre.cols,'Realizado','Valor Realizado','Valor');
  const dFam=col(dre.cols,'Família','Familia'), dCnpj=col(dre.cols,'CPF/CNPJ','CNPJ','CPF');
  console.log('DRE cols:', dre.cols.join(' | '));
  console.log(`DRE linhas=${dre.rows.length} · idx Fornecedor=${dForn} Realizado=${dReal} Família=${dFam} CNPJ=${dCnpj}`);

  // ── aba Fornecedores ──
  const fo=await gviz('sheet='+encodeURIComponent('Fornecedores'));
  const fForn=col(fo.cols,'Fornecedor'), fFam=col(fo.cols,'Família','Familia'), fCnpj=col(fo.cols,'CPF/CNPJ','CNPJ','CPF');
  console.log('\nFornecedores cols:', fo.cols.join(' | '));
  console.log(`Fornecedores linhas=${fo.rows.length} · idx Fornecedor=${fForn} Família=${fFam} CNPJ=${fCnpj}`);

  // fornecedor(normalizado) -> set de famílias ; cnpj -> set de famílias
  const byName=new Map(), byCnpj=new Map();
  fo.rows.forEach(r=>{
    const nome=_n(r[fForn]); const fam=String(r[fFam]==null?'':r[fFam]).trim(); const cj=_cnpj(fCnpj>=0?r[fCnpj]:'');
    if(nome){ (byName.get(nome)||byName.set(nome,new Set()).get(nome)).add(fam); }
    if(cj){ (byCnpj.get(cj)||byCnpj.set(cj,new Set()).get(cj)).add(fam); }
  });
  const dist=m=>{ let u1=0,u2=0,u3=0; for(const s of m.values()){ const n=[...s].filter(Boolean).length; if(n<=1)u1++; else if(n===2)u2++; else u3++; } return {u1,u2,u3,tot:m.size}; };
  const dn=dist(byName), dc=dist(byCnpj);
  console.log(`\n[por NOME]  fornecedores distintos=${dn.tot} · com 1 família=${dn.u1} · com 2=${dn.u2} · com 3+=${dn.u3}`);
  console.log(`[por CNPJ]  cnpj distintos=${dc.tot} · com 1 família=${dc.u1} · com 2=${dc.u2} · com 3+=${dc.u3}`);

  // famílias distintas
  const fams=new Set(); fo.rows.forEach(r=>{ const f=String(r[fFam]==null?'':r[fFam]).trim(); if(f)fams.add(f); });
  console.log(`\nFamílias distintas (${fams.size}):`); [...fams].sort().forEach(f=>console.log('  · '+f));

  // cobertura da base DRE
  const dNames=new Map(); // nome -> realizado somado
  dre.rows.forEach(r=>{ const nome=_n(r[dForn]); const v=Number(r[dReal])||0; if(!nome){ return; } dNames.set(nome,(dNames.get(nome)||0)+v); });
  let achou=0, naoAchou=0, ambigCusto=0, semNomeCusto=0, totCusto=0;
  const amostraAmbig=[];
  // custo do fornecedor "-" (vazio)
  dre.rows.forEach(r=>{ const nome=_n(r[dForn]); const v=Number(r[dReal])||0; totCusto+=v; if(!nome)semNomeCusto+=v; });
  for(const [nome,v] of dNames){
    const s=byName.get(nome);
    if(!s){ naoAchou++; }
    else { achou++; if([...s].filter(Boolean).length>1){ ambigCusto+=v; if(amostraAmbig.length<12)amostraAmbig.push(`${nome} → ${[...s].join(' | ')}`); } }
  }
  console.log(`\nCobertura: fornecedores da DRE (com nome)=${dNames.size} · achados na aba=${achou} · NÃO achados=${naoAchou}`);
  console.log(`Custo total=${Math.round(totCusto)} · custo sem fornecedor("-" )=${Math.round(semNomeCusto)} · custo em fornecedores AMBÍGUOS (nome→>1 família)=${Math.round(ambigCusto)}`);
  if(amostraAmbig.length){ console.log('\nAmostra de ambíguos (nome → famílias):'); amostraAmbig.forEach(s=>console.log('  '+s)); }

  // ── TESTE DECISIVO: as duas abas são paralelas? conta → família é 1:1? ──
  const dConta=col(dre.cols,'Conta Gerencial');
  console.log(`\n[ZIP por índice] DRE=${dre.rows.length} linhas · Fornecedores=${fo.rows.length} linhas · idx Conta(DRE)=${dConta}`);
  const N=Math.min(dre.rows.length, fo.rows.length);
  // valida alinhamento: o fornecedor bate linha a linha nas duas abas?
  let fornBate=0, fornForaFornBase=0;
  const contaFam=new Map(); // conta(norm) -> set famílias
  for(let i=0;i<N;i++){
    const dF=_n(dre.rows[i][dForn]), fF=_n(fo.rows[i][fForn]);
    if(dF===fF) fornBate++; else fornForaFornBase++;
    const conta=_n(dre.rows[i][dConta]); const fam=String(fo.rows[i][fFam]==null?'':fo.rows[i][fFam]).trim();
    if(conta){ (contaFam.get(conta)||contaFam.set(conta,new Set()).get(conta)).add(fam); }
  }
  console.log(`Alinhamento (fornecedor DRE[i]==Fornecedores[i]): batem=${fornBate} · divergem=${fornForaFornBase}`);
  let c1=0,c2=0,c3=0; const contaAmb=[];
  for(const [c,s] of contaFam){ const n=[...s].filter(Boolean).length; if(n<=1)c1++; else if(n===2){c2++; if(contaAmb.length<10)contaAmb.push(`${c} → ${[...s].join(' | ')}`);} else {c3++; if(contaAmb.length<10)contaAmb.push(`${c} → ${[...s].join(' | ')}`);} }
  console.log(`\n[conta → família] contas distintas=${contaFam.size} · 1 família (1:1)=${c1} · 2=${c2} · 3+=${c3}`);
  if(contaAmb.length){ console.log('Amostra de contas ambíguas:'); contaAmb.forEach(s=>console.log('  '+s)); }

  // Família corresponde a QUAL coluna da DRE? (overlap de conjuntos de valores)
  const famsNorm=new Set([...fams].map(_n));
  console.log(`\nFamília: ${famsNorm.size} valores distintos. Overlap com colunas da DRE:`);
  dre.cols.forEach((cname,ci)=>{
    const vals=new Set(); dre.rows.forEach(r=>{ const v=_n(r[ci]); if(v)vals.add(v); });
    let inter=0; for(const f of famsNorm) if(vals.has(f)) inter++;
    if(vals.size<=200) console.log(`  col[${ci}] ${cname}: ${vals.size} valores · ${inter}/${famsNorm.size} famílias batem`);
  });
  console.log('\n=== FIM ===');
}
main().catch(e=>{ console.error('Falha:',e); process.exit(1); });
