// Valida a montagem da Árvore de Combustível a partir das abas-fonte (sem "Árvore Comb.").
// Cross-check: cards de SOMA (Custo, KM Rodado, Decomposição) devem bater com a Árvore Comb.
// KM/L e R$/L usam a lógica dos painéis (Eficiência / R$/L) — podem diferir da Árvore Comb. (esperado).
const GV='1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM';   // Base Dispersão de km (Dispersão de km, R$/L, Árvore Comb.)
const KML='1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';  // Km/L (fonte Eficiência e R$/L)
const VF='1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8';   // Visão Financeira (aba Frota)

async function gviz(sid,tab,range){
  const rq=range?`&range=${encodeURIComponent(range)}`:'';
  const url=`https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?sheet=${encodeURIComponent(tab)}${rq}&headers=1&tqx=out:json`;
  const raw=await (await fetch(url)).text();
  const json=JSON.parse(raw.replace(/^[\s\S]*?setResponse\(/, '').replace(/\);?\s*$/, ''));
  const cols=(json.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
  let rows=(json.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
  if(cols.every(c=>!c)&&rows.length){ const h=rows[0].map(v=>String(v==null?'':v)); rows=rows.slice(1); return {cols:h,rows}; }
  return {cols,rows};
}
const fi=(cols,...tests)=>{for(let i=0;i<cols.length;i++){const lc=String(cols[i]).toLowerCase();if(tests.some(t=>lc.includes(t)))return i;}return -1;};
const fiNot=(cols,tests,notTests)=>{for(let i=0;i<cols.length;i++){const lc=String(cols[i]).toLowerCase();if(tests.some(t=>lc.includes(t))&&notTests.every(t=>!lc.includes(t)))return i;}return -1;};
const _normKey=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const _normFuel=s=>{let x=String(s||'');const i=x.indexOf(':');if(i>=0)x=x.slice(i+1);return _normKey(x);};
const MMAP={jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};
function parseVig(v){
  if(!v)return null;
  if(v instanceof Date)return new Date(v.getFullYear(),v.getMonth(),1);
  if(typeof v==='string'){
    const g=v.match(/^Date\((\d+),(\d+)/);if(g)return new Date(+g[1],+g[2],1);
    const m1=v.match(/^([a-záéíóúâêôãõç]+)\.?\/(\d{4})$/i);if(m1){const mo=MMAP[m1[1].toLowerCase().slice(0,3)];if(mo!==undefined)return new Date(+m1[2],mo,1);}
    const m2=v.match(/^(\d{1,2})\/(\d{4})$/);if(m2)return new Date(+m2[2],+m2[1]-1,1);
  }
  if(typeof v==='number'){const d=new Date(1899,11,30);d.setDate(d.getDate()+Math.round(v));return new Date(d.getFullYear(),d.getMonth(),1);}
  return null;
}
const vigKey=d=>d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:'';
const splitPU=s=>{const v=s?String(s):'';const i=v.indexOf('-');return i>=0?[v.slice(0,i).trim(),v.slice(i+1).trim()]:[v.trim(),''];};

// pacote Combustíveis (Visão Financeira PACOTES_MAP → só as contas de combustível)
const COMB=new Set(['COMBUSTIVEIS VEICULOS E EQUIPAMENTOS','COMBUSTIVEIS','ESTORNO DE ICMS NAO APROVEITADO','FLUIDOS (ARLA)','ARLA','ICMS CREDITO PRESUMIDO']);

function match(f,{ano,ym,uni,proj}){
  if(f.ano&&!f.ano.includes(String(ano)))return false;
  if(f.ym&&!f.ym.includes(ym))return false;
  if(f.uni&&!f.uni.includes(uni))return false;
  if(f.proj&&!f.proj.includes(proj))return false;
  return true;
}

async function main(){
  const [frota,disp,kml,rsl,arv]=await Promise.all([
    gviz(VF,'Frota'), gviz(GV,'Dispersão de km'), gviz(KML,'Km/L'), gviz(KML,'R$/L'), gviz(GV,'Árvore Comb.'),
  ]);
  console.log(`linhas: Frota=${frota.rows.length} Dispersão=${disp.rows.length} Km/L=${kml.rows.length} R$/L=${rsl.rows.length} ÁrvoreComb=${arv.rows.length}`);
  // ── Diagnóstico de cobertura por ano (via vigência col 0) ──
  const anoDist=(rows,vc)=>{const m={};rows.forEach(r=>{const d=parseVig(r[vc]);const y=d?d.getFullYear():'?';m[y]=(m[y]||0)+1;});return JSON.stringify(m);};
  console.log('Anos Frota      :',anoDist(frota.rows,0));
  console.log('Anos Dispersão  :',anoDist(disp.rows,0));
  console.log('Anos Km/L       :',anoDist(kml.rows,0));
  console.log('Anos ÁrvoreComb :',anoDist(arv.rows,fi(arv.cols,'vigência','vigencia')));

  // ── Colunas ──
  const F={vig:0,rem:fi(frota.cols,'remunerado'),real:fi(frota.cols,'realizado'),cta:fi(frota.cols,'conta gerencial'),n3:fi(frota.cols,'nível 3','nivel 3'),ano:fi(frota.cols,'ano')};
  const D={vig:0,ano:fi(disp.cols,'ano'),proj:fi(disp.cols,'proj.'),kmRem:fi(disp.cols,'km rem. tt'),kmReal:fi(disp.cols,'km rodado tt'),
           vgTot:fi(disp.cols,'viagens - real'),vgRec:fi(disp.cols,'viagens rec'),vgNot:fi(disp.cols,'viagens noturnas'),vgMap:fi(disp.cols,'viagens mapa aberto')};
  const K={vig:0,proj:fi(kml.cols,'projeto'),remMed:fi(kml.cols,'rem médio','rem medio'),kmlReal:fi(kml.cols,'km/l real'),
           kmRod:fi(kml.cols,'km rodado'),litros:fi(kml.cols,'qtd total de litro','qtd litro','qtd total','litro'),
           totalRS:fi(kml.cols,'totas r$','total r$','total geral'),fuel:fi(kml.cols,'tipo combust','combustivel','combustível')};
  console.log('Frota cols',F,'\nDispersão cols',D,'\nKm/L cols',K);

  // ── REM_LOOKUP (preço remunerado da aba R$/L) ──
  const cProjR=fi(rsl.cols,'unidade benner');
  let cVigR=-1;for(let i=0;i<rsl.cols.length;i++){const lc=(rsl.cols[i]||'').toLowerCase();if(lc.includes('vigência')||lc.includes('vigencia')){const sv=rsl.rows.find(r=>r[i]!=null)?.[i];if(parseVig(sv)){cVigR=i;break;}}}if(cVigR<0)cVigR=3;
  const cPreco=fi(rsl.cols,'precooperadora','preco operadora'),cFuelR=fi(rsl.cols,'tipocombustivel','combustivel','combustível');
  const L1=new Map(),L2=new Map();
  rsl.rows.forEach(r=>{const p=_normKey(r[cProjR]),d=parseVig(r[cVigR]);if(!p||!d)return;const ym=vigKey(d),f=_normFuel(r[cFuelR]),v=+(r[cPreco]||0);if(!(v>0))return;
    const k1=`${p}|${ym}|${f}`,k2=`${p}|${ym}`;if(!L1.has(k1))L1.set(k1,{s:0,n:0});L1.get(k1).s+=v;L1.get(k1).n++;if(!L2.has(k2))L2.set(k2,{s:0,n:0});L2.get(k2).s+=v;L2.get(k2).n++;});
  const remPriceFor=r=>{const p=_normKey(r[K.proj]),d=parseVig(r[K.vig]);if(!p||!d)return null;const ym=vigKey(d),f=_normFuel(r[K.fuel]);let e=L1.get(`${p}|${ym}|${f}`);if(!e)e=L2.get(`${p}|${ym}`);return e&&e.n>0?e.s/e.n:null;};

  // ── Agregações por card (aplicando filtro f) ──
  function custo(f){let rem=0,real=0;frota.rows.forEach(r=>{if(!COMB.has(_normKey(r[F.cta])))return;const[proj,uni]=splitPU(r[F.n3]);const d=parseVig(r[F.vig]);if(!match(f,{ano:d?.getFullYear(),ym:vigKey(d),uni,proj}))return;rem+=+(r[F.rem])||0;real+=+(r[F.real])||0;});return{rem,real};}
  function kmrod(f){let rem=0,real=0,vT=0,vR=0,vN=0,vM=0;disp.rows.forEach(r=>{const[proj,uni]=splitPU(r[D.proj]);const d=parseVig(r[D.vig]);if(!match(f,{ano:d?.getFullYear(),ym:vigKey(d),uni,proj}))return;rem+=+(r[D.kmRem])||0;real+=+(r[D.kmReal])||0;vT+=+(r[D.vgTot])||0;vR+=+(r[D.vgRec])||0;vN+=+(r[D.vgNot])||0;vM+=+(r[D.vgMap])||0;});return{rem,real,viagem1:vT-vR-vN-vM,recs:vR,noturnas:vN,virados:vM};}
  function kmlAgg(f){ // Eficiência: rem médio = média burra por projeto, ponderada por km do projeto; real = Σkm/Σlitros
    let sumKm=0,sumLit=0;const proj={};
    kml.rows.forEach(r=>{const[p,uni]=splitPU(r[K.proj]);const d=parseVig(r[K.vig]);if(!match(f,{ano:d?.getFullYear(),ym:vigKey(d),uni,proj:p}))return;
      const km=+(r[K.kmRod])||0,lit=+(r[K.litros])||0,rem=+(r[K.remMed])||0;sumKm+=km;sumLit+=lit;
      if(!proj[p])proj[p]={s:0,n:0,km:0};if(rem>0){proj[p].s+=rem;proj[p].n++;}proj[p].km+=km;});
    let sMp=0,kMp=0;Object.values(proj).forEach(v=>{const rp=v.n>0?v.s/v.n:null;if(rp!=null&&v.km>0){sMp+=rp*v.km;kMp+=v.km;}});
    return{rem:kMp>0?sMp/kMp:null,real:sumLit>0?sumKm/sumLit:null};
  }
  function rslAgg(f){ // R$/L: real = ΣTotalR$/ΣLitros; rem = Σ(preço×litros)/Σlitros
    let sumLit=0,sumTot=0,sumRemxL=0,sumLitRem=0;
    kml.rows.forEach(r=>{const[p,uni]=splitPU(r[K.proj]);const d=parseVig(r[K.vig]);if(!match(f,{ano:d?.getFullYear(),ym:vigKey(d),uni,proj:p}))return;
      const lit=+(r[K.litros])||0,tot=+(r[K.totalRS])||0,rem=remPriceFor(r);sumLit+=lit;if(tot>0)sumTot+=tot;if(rem!=null&&rem>0){sumRemxL+=rem*lit;sumLitRem+=lit;}});
    return{rem:sumLitRem>0?sumRemxL/sumLitRem:null,real:sumLit>0?sumTot/sumLit:null};
  }
  // Cross-check: Árvore Comb. (SUM) — mesma granularidade project-unit-month
  const A={kmRem:fi(arv.cols,'km rem'),kmReal:fiNot(arv.cols,['km real'],[]),rem:fi(arv.cols,'remunerado'),real:fi(arv.cols,'realizado'),
           v1:fi(arv.cols,'1ª viagem','1a viagem'),recs:fi(arv.cols,'recs'),not:fi(arv.cols,'noturnas'),map:fi(arv.cols,'mapas virados'),
           vig:fi(arv.cols,'vigência','vigencia'),ano:fi(arv.cols,'ano'),n3:fi(arv.cols,'nível 3','nivel 3')};
  function arvSum(f){let o={kmRem:0,kmReal:0,rem:0,real:0,v1:0,recs:0,not:0,map:0};arv.rows.forEach(r=>{const[proj,uni]=splitPU(r[A.n3]);const d=parseVig(r[A.vig]);if(!match(f,{ano:d?.getFullYear(),ym:vigKey(d),uni,proj}))return;
    o.kmRem+=+(r[A.kmRem])||0;o.kmReal+=+(r[A.kmReal])||0;o.rem+=+(r[A.rem])||0;o.real+=+(r[A.real])||0;o.v1+=+(r[A.v1])||0;o.recs+=+(r[A.recs])||0;o.not+=+(r[A.not])||0;o.map+=+(r[A.map])||0;});return o;}

  const fmt=v=>v==null?'—':(Math.abs(v)>=1e6?(v/1e6).toFixed(2)+'mi':Math.abs(v)>=1e3?(v/1e3).toFixed(1)+'k':(+v).toFixed(2));
  // Vigência default = a mais recente em qualquer fonte (é o que o painel mostra ao abrir)
  const allYm=[...disp.rows,...kml.rows].map(r=>{const d=parseVig(r[0]);return d?vigKey(d):null;}).filter(Boolean);
  const lastYm=allYm.sort().pop();
  console.log('Vigência default (mais recente):',lastYm);
  for(const [tag,f] of [['DEFAULT ym='+lastYm,{ym:[lastYm]}],['TODOS',{}],['ANO=2026',{ano:['2026']}],['ANO=2025',{ano:['2025']}]]){
    console.log(`\n══════════ ${tag} ══════════`);
    const c=custo(f),k=kmrod(f),ka=kmlAgg(f),ra=rslAgg(f),as=arvSum(f);
    console.log(`Custo Comb.  NOVO rem=${fmt(c.rem)} real=${fmt(c.real)}   | ÁrvoreComb rem=${fmt(as.rem)} real=${fmt(as.real)}  ${Math.round(c.rem)===Math.round(as.rem)&&Math.round(c.real)===Math.round(as.real)?'✅':'❌ DIVERGE'}`);
    console.log(`KM Rodado    NOVO rem=${fmt(k.rem)} real=${fmt(k.real)}   | ÁrvoreComb rem=${fmt(as.kmRem)} real=${fmt(as.kmReal)}  ${Math.round(k.rem)===Math.round(as.kmRem)&&Math.round(k.real)===Math.round(as.kmReal)?'✅':'❌ DIVERGE'}`);
    console.log(`Decomposição NOVO 1ªV=${fmt(k.viagem1)} recs=${fmt(k.recs)} not=${fmt(k.noturnas)} vir=${fmt(k.virados)} | ÁrvoreComb 1ªV=${fmt(as.v1)} recs=${fmt(as.recs)} not=${fmt(as.not)} vir=${fmt(as.map)}  ${Math.round(k.viagem1)===Math.round(as.v1)&&Math.round(k.recs)===Math.round(as.recs)&&Math.round(k.noturnas)===Math.round(as.not)&&Math.round(k.virados)===Math.round(as.map)?'✅':'❌ DIVERGE'}`);
    console.log(`R$/km (calc) NOVO rem=${fmt(Math.abs(c.rem/k.rem))} real=${fmt(Math.abs(c.real/k.real))}`);
    console.log(`R$/Litro     NOVO rem=${fmt(ra.rem)} real=${fmt(ra.real)}   (lógica painel R$/L)`);
    console.log(`Km/L         NOVO rem=${fmt(ka.rem)} real=${fmt(ka.real)}   (lógica painel Eficiência)`);
  }

  // ── Diagnóstico "R$/Litro Rem sumiu": cobertura mês a mês (últimos 8 meses com litros) ──
  console.log('\n══════════ COBERTURA R$/L (rem) — mês a mês ══════════');
  console.log(`R$/L: ${rsl.rows.length} linha(s) | coluna Unidade Benner=${cProjR} | coluna Vigência=${cVigR} | coluna PrecoOperadora=${cPreco} | coluna TipoCombustivel=${cFuelR}`);
  const kmYms=[...new Set(kml.rows.map(r=>{const d=parseVig(r[K.vig]);return d?vigKey(d):null;}).filter(Boolean))].sort();
  const last8=kmYms.slice(-8);
  for(const ym of last8){
    const rowsYm=kml.rows.filter(r=>{const d=parseVig(r[K.vig]);return d&&vigKey(d)===ym;});
    const comLitros=rowsYm.filter(r=>(+(r[K.litros])||0)>0);
    const comRem=comLitros.filter(r=>remPriceFor(r)!=null);
    const ra=rslAgg({ym:[ym]});
    console.log(`${ym}: linhas Km/L=${rowsYm.length} com litros=${comLitros.length} com preço rem achado=${comRem.length}/${comLitros.length}  → R$/L rem=${fmt(ra.rem)} real=${fmt(ra.real)}`);
    if(comLitros.length && comRem.length===0){
      const amostra=comLitros.slice(0,3).map(r=>`proj="${r[K.proj]}" fuel="${r[K.fuel]}"`);
      console.log(`   ⚠ nenhuma linha achou preço — amostra Km/L: ${amostra.join(' | ')}`);
      const amostraR=rsl.rows.filter(r=>{const d=parseVig(r[cVigR]);return d&&vigKey(d)===ym;}).slice(0,3).map(r=>`proj="${r[cProjR]}" fuel="${r[cFuelR]}" preco=${r[cPreco]}`);
      console.log(`   ⚠ amostra R$/L no mesmo mês: ${amostraR.length?amostraR.join(' | '):'(NENHUMA LINHA DE R$/L NESSE MÊS)'}`);
    } else if(comLitros.length && comRem.length<comLitros.length){
      // cobertura parcial: quais projetos do Km/L não acharam preço vs quais "Unidade Benner" existem no R$/L nesse mês
      const semPreco=new Set(comLitros.filter(r=>remPriceFor(r)==null).map(r=>String(r[K.proj]||'')));
      const projsRsl=new Set(rsl.rows.filter(r=>{const d=parseVig(r[cVigR]);return d&&vigKey(d)===ym;}).map(r=>String(r[cProjR]||'')));
      console.log(`   projetos Km/L SEM preço achado: ${[...semPreco].join(' | ')}`);
      console.log(`   "Unidade Benner" presentes no R$/L nesse mês: ${[...projsRsl].join(' | ')}`);
    }
  }

  // ── Foco GRL: valores CRUS (sem normalizar) de "Unidade Benner" no R$/L vs "Projeto" no Km/L ──
  console.log('\n══════════ FOCO: como o GRL aparece em cada aba (valores crus) ══════════');
  const rslAllBenner=[...new Set(rsl.rows.map(r=>String(r[cProjR]||'')))];
  const kmlAllProj=[...new Set(kml.rows.map(r=>String(r[K.proj]||'')))];
  console.log('Unidade Benner distintos (R$/L, TODOS os meses):', JSON.stringify(rslAllBenner));
  console.log('Projeto distintos (Km/L, contém "GRL" ou "GUARU"):', JSON.stringify(kmlAllProj.filter(p=>/GRL|GUARU/i.test(p))));
  console.log('Unidade Benner que contém "GRL" ou "GUARU":', JSON.stringify(rslAllBenner.filter(p=>/GRL|GUARU/i.test(p))));
  // amostra crua de linhas R$/L (todas as colunas) — pra ver se a coluna certa é mesmo "unidade benner"
  console.log('\nColunas da aba R$/L:', JSON.stringify(rsl.cols));
  console.log('Amostra de 3 linhas cruas da R$/L:', JSON.stringify(rsl.rows.slice(0,3)));
}
main().catch(e=>{console.error('Falha:',e);process.exit(1);});
