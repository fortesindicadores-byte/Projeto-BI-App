// Valida os números da Árvore de Combustível Seara (ANHANGUERA) antes de construir o painel.
// Reproduz cada card com a MESMA lógica que o painel usará.
const VF_ID='1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8';   // Frota (custo)
const SEARA_ID='1Rlwc0MZiupQI38gSN8VyBq_zMADgX9R_ZbfygNP-OXE';
const GID_REM=0, GID_CTES=1672208132, GID_COMB=1982300845;

async function gviz(id, {tab, gid, tq}={}){
  const parts=[];
  if(tab) parts.push(`sheet=${encodeURIComponent(tab)}`);
  if(gid!=null) parts.push(`gid=${gid}`);
  if(tq) parts.push(`tq=${encodeURIComponent(tq)}`);
  parts.push('headers=1','tqx=out:json');
  const url=`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${parts.join('&')}`;
  const raw=await (await fetch(url)).text();
  const j=JSON.parse(raw.replace(/^[\s\S]*?setResponse\(/,'').replace(/\);?\s*$/,''));
  if(j.status!=='ok') throw new Error((j.errors&&j.errors[0]&&j.errors[0].message)||'gviz err');
  let cols=(j.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
  let rows=(j.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
  if(cols.every(c=>!c||/^[A-Z]{1,3}$/.test(c))&&rows.length){cols=rows[0].map(v=>String(v==null?'':v));rows=rows.slice(1);}
  return {cols,rows};
}
const nk=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const placaKey=s=>String(s==null?'':s).toUpperCase().replace(/[^A-Z0-9]/g,'').trim();
const suf=v=>{const s=String(v||'');const i=s.indexOf('-');return i>=0?s.slice(i+1).trim():'';};
const M3=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const COMB=new Set(['COMBUSTIVEIS VEICULOS E EQUIPAMENTOS','COMBUSTIVEIS','ESTORNO DE ICMS NAO APROVEITADO','FLUIDOS (ARLA)','ARLA','ICMS CREDITO PRESUMIDO']);
function parseVig(v){
  if(v==null)return null;
  if(typeof v==='string'){const g=v.match(/^Date\((\d+),(\d+)/);if(g)return {y:+g[1],m:+g[2]+1};
    const m=v.match(/^(\d{1,2})\/(\d{4})$/);if(m)return {y:+m[2],m:+m[1]};}
  return null;
}
const fmt=v=>{const n=Math.abs(v);const s=v<0?'-':'';
  if(n>=1e6)return s+(n/1e6).toFixed(2)+' mi';
  if(n>=1e3)return s+(n/1e3).toFixed(1)+'k';
  return s+n.toFixed(2);};

async function main(){
  // ── CUSTO (Frota-ANG) ──
  const fr=await gviz(VF_ID,{tab:'Frota'});
  const ci={cta:5,n3:4,rem:9,real:10,vig:0};
  let custoRem=0, custoReal=0;
  for(const r of fr.rows){
    if(!COMB.has(nk(r[ci.cta])))continue;
    if(suf(r[ci.n3])!=='ANG')continue;
    custoRem+=+r[ci.rem]||0; custoReal+=+r[ci.real]||0;
  }
  console.log('CUSTO COMBUSTÍVEL (Frota unidade ANG):');
  console.log(`  rem=${fmt(custoRem)}  real=${fmt(custoReal)}  Δ=${fmt(custoReal-custoRem)}`);

  // ── Combustível (real: km, litros, total R$) por placa|vig ──
  const comb=(await gviz(SEARA_ID,{gid:GID_COMB})).rows;
  const real={};  // placa|vig -> {km, lit, tot, modelo}
  for(const r of comb){
    const placa=placaKey(r[4]); const mi=M3.indexOf(String(r[5]||'').toLowerCase().slice(0,3)); const yr=+r[6];
    if(!placa||mi<0||!yr)continue;
    const km=+r[10]||0; if(km<=0)continue;
    const vig=String(mi+1).padStart(2,'0')+'/'+yr; const k=placa+'|'+vig;
    if(!real[k])real[k]={km:0,lit:0,tot:0};
    real[k].km+=km; real[k].lit+=(+r[11]||0); real[k].tot+=(+r[13]||0);
  }

  // ── CTEs: km rem (sum Z) por placa|vig ──
  const aggKm=(await gviz(SEARA_ID,{gid:GID_CTES,tq:'select C, year(D), month(D), sum(Z) group by C, year(D), month(D)'})).rows;
  const remKm={};
  aggKm.forEach(r=>{const p=placaKey(r[0]),yr=+r[1],mo=(+r[2])+1;if(!p||!yr)return;remKm[p+'|'+String(mo).padStart(2,'0')+'/'+yr]=+r[3]||0;});

  // ── CTEs: viagens distintas (col B = CD_VIAGEM_TRANSPORTE) por placa|vig ──
  // gviz não faz count-distinct; puxa B,C,D cru e dedupa no cliente.
  const rawVg=(await gviz(SEARA_ID,{gid:GID_CTES,tq:'select B, C, D'})).rows;
  console.log(`\n(CTEs cru B,C,D: ${rawVg.length} linhas)`);
  const seenVg=new Set(); const viag={};
  for(const r of rawVg){
    const b=r[0]; const p=placaKey(r[1]); const pv=parseVig(r[2]); if(b==null||!p||!pv)continue;
    if(seenVg.has(b))continue; seenVg.add(b);
    const k=p+'|'+String(pv.m).padStart(2,'0')+'/'+pv.y; viag[k]=(viag[k]||0)+1;
  }
  console.log(`(viagens distintas totais: ${seenVg.size})`);

  // ── Base Remunerado: KmPorLitro(P=15) e PrecoDiesel(R=17) por placa|vig ──
  const bremRows=(await gviz(SEARA_ID,{gid:GID_REM})).rows;
  const bench={};  // placa|vig -> {kmL, preco}
  bremForEach: for(const r of bremRows){
    const placa=placaKey(r[3]); const pv=parseVig(r[0]); if(!placa||!pv)continue;
    const vig=String(pv.m).padStart(2,'0')+'/'+pv.y; const k=placa+'|'+vig;
    bench[k]={kmL:+r[15]||0, preco:+r[17]||0};
  }

  // ── Agrega KM / R$L / KmL sobre placa|vig da aba Combustível (raiz) ──
  let kmReal=0,kmRem=0,sumLit=0,sumTot=0,sumPxL=0,sumLitP=0,sumKmlxV=0,sumV=0;
  let matchRem=0,matchBench=0,total=0;
  for(const k in real){
    total++;
    const R=real[k];
    kmReal+=R.km; sumLit+=R.lit; sumTot+=R.tot;
    if(remKm[k]!=null){kmRem+=remKm[k];matchRem++;}
    const b=bench[k];
    if(b){
      matchBench++;
      if(b.preco>0&&R.lit>0){sumPxL+=b.preco*R.lit;sumLitP+=R.lit;}
      const v=viag[k]||0;
      if(b.kmL>0&&v>0){sumKmlxV+=b.kmL*v;sumV+=v;}
    }
  }
  const rslReal=sumLit>0?sumTot/sumLit:0;
  const rslRem =sumLitP>0?sumPxL/sumLitP:0;
  const kmlReal=sumLit>0?kmReal/sumLit:0;   // atenção: real Km/L usa kmReal
  const kmlRem =sumV>0?sumKmlxV/sumV:0;
  const rsKmRem =kmRem?custoRem/kmRem:0;
  const rsKmReal=kmReal?custoReal/kmReal:0;
  const dKmRod=kmRem-kmReal;
  const impPreco=Math.abs(Math.abs(rsKmReal)-Math.abs(rsKmRem))*Math.abs(kmReal);
  const impVolume=Math.abs(dKmRod)*Math.abs(rsKmRem);

  console.log(`\nPares placa|vig: total(Combustível)=${total} · c/ kmRem(CTEs)=${matchRem} · c/ bench(Remunerado)=${matchBench}`);
  console.log('\nKM RODADO:');
  console.log(`  rem=${fmt(kmRem)}  real=${fmt(kmReal)}  Δ(rem-real)=${fmt(dKmRod)}`);
  console.log('\nR$/km:');
  console.log(`  rem=${rsKmRem.toFixed(3)}  real=${rsKmReal.toFixed(3)}`);
  console.log('\nR$/LITRO:');
  console.log(`  rem=${rslRem.toFixed(3)}  real=${rslReal.toFixed(3)}  (litros=${fmt(sumLit)} totalR$=${fmt(sumTot)})`);
  console.log('\nKM/L:');
  console.log(`  rem=${kmlRem.toFixed(3)}  real=${kmlReal.toFixed(3)}  (Σviagens=${sumV})`);
  console.log('\nIMPACTOS:');
  console.log(`  preço=${fmt(impPreco)}  volume=${fmt(impVolume)}`);
}
main().catch(e=>{console.error('FALHA:',e);process.exit(1);});
