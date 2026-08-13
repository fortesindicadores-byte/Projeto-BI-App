// Decompõe a mudança do IMPACTO do painel Eficiência Km/L.
//
// Antes o impacto era a SOMA placa a placa; agora sai do ▲ da própria linha
// (KM ÷ REM − KM ÷ REAL, em litros, × R$/L remunerado). O total YTD saiu de
// ~-2,06 mi para ~-3,49 mi e a soma das unidades deixou de fechar com o total.
// Este script mostra, com o dado real, de onde vem cada centavo dessa diferença.
//
// A conta é quebrada em três degraus, na ordem em que o código mudou:
//   OLD        Σ (km/rem − km/real) · preço DA LINHA
//   (1) preço  a mesma soma, com um preço único ponderado pelo km
//   (2) régua  troca Σ(km_i/rem_i) por ΣKM ÷ REM do agregado (a média da tela)
//   (3) cobertura  entram as linhas que a soma antiga ignorava (sem rem/real)
//   NEW        = o que o painel mostra hoje
//
// Roda via GitHub Actions — o sandbox não alcança docs.google.
const KML_ID    = '1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';   // workbook "Consumo"
const KML_TAB   = 'Km/L';
const GV_RSL_ID = '1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM';   // o que o painel usa hoje
const RSL_TAB   = 'R$/L';
const VIG_ATE   = process.env.VIG_ATE || '2026-07';                 // janela = jan → esta

const gv = async (id, tab) => {
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?sheet=${encodeURIComponent(tab)}&tqx=out:json`;
  const t = await (await fetch(url)).text();
  const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  if (j.status !== 'ok') throw new Error(`${tab}: ${JSON.stringify(j.errors || j.status)}`);
  const cols = (j.table.cols || []).map(c => (c && c.label) || '');
  const rows = (j.table.rows || []).map(r => (r.c || []).map(c => (c && c.v != null ? c.v : null)));
  return { cols, rows };
};

// ---------- mesmas regras do painel ----------
const MMAP = {jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};
function parseVig(v){
  if(!v) return null;
  if(typeof v==='string'){
    const g=v.match(/^Date\((\d+),(\d+)/); if(g) return new Date(+g[1],+g[2],1);
    const m1=v.match(/^([a-zá-ú]+)\.?\/(\d{4})$/i); if(m1){const mo=MMAP[m1[1].toLowerCase().slice(0,3)]; if(mo!==undefined) return new Date(+m1[2],mo,1);}
    const m2=v.match(/^(\d{1,2})\/(\d{4})$/); if(m2) return new Date(+m2[2],+m2[1]-1,1);
  }
  if(typeof v==='number'){const d=new Date(1899,11,30);d.setDate(d.getDate()+Math.round(v));return new Date(d.getFullYear(),d.getMonth(),1);}
  return null;
}
const ym = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const nk = s => String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const nf = s => { let x=String(s||''); const i=x.indexOf(':'); if(i>=0) x=x.slice(i+1); return nk(x); };

function detectCols(cols){
  const fi=t=>{for(let i=0;i<cols.length;i++){const lc=String(cols[i]||'').toLowerCase();if(t.some(x=>lc.includes(x)))return i;}return -1;};
  const fiNot=(t,n)=>{for(let i=0;i<cols.length;i++){const lc=String(cols[i]||'').toLowerCase();if(t.some(x=>lc.includes(x))&&n.every(x=>!lc.includes(x)))return i;}return -1;};
  const fb=(i,d)=>i>=0?i:d;
  return { vig:fb(fi(['vigência','vigencia']),0), rem:fb(fi(['rem médio','rem medio']),4),
    remM:fb(fi(['rem modelo']),5), real:fb(fi(['km/l real']),6), rsLReal:fb(fi(['r$/l real','rs/l real']),9),
    ativo:fb(fi(['ativo']),11), proj:fb(fi(['projeto']),14), placa:fb(fi(['placa']),15),
    modelo:fb(fiNot(['modelo'],['rem','km/l','km /l']),19), tipoVei:fb(fi(['tipo vei','tipo_vei']),17),
    kmRod:fb(fi(['km rodado','km_rodado','kmrodado']),22), litros:fb(fi(['litro','qtd total','qtd_total','qtd litro']),23),
    fuel:fi(['tipo combust','combustivel','combustível']) };
}
const splitPU = (r,CL) => { const v=r[CL.proj]?String(r[CL.proj]):''; const i=v.indexOf('-'); return i>=0?[v.slice(0,i).trim(),v.slice(i+1).trim()]:[v.trim(),'']; };

// preço R$/L remunerado, do jeito que o painel monta hoje
function buildRemLookup(cols,rows){
  const fi=(...t)=>{for(let i=0;i<cols.length;i++){const lc=String(cols[i]||'').toLowerCase();if(t.some(x=>lc.includes(x)))return i;}return -1;};
  const cProj=fi('unidade benner');
  let cVig=-1; for(let i=0;i<cols.length;i++){const lc=String(cols[i]||'').toLowerCase();
    if(lc.includes('vigência')||lc.includes('vigencia')){const sv=rows.find(r=>r[i]!=null)?.[i]; if(parseVig(sv)){cVig=i;break;}}}
  if(cVig<0)cVig=3;
  const cPreco=fi('precooperadora','preco operadora'), cFuel=fi('tipocombustivel','combustivel','combustível');
  const L1=new Map(), L2=new Map();
  rows.forEach(r=>{ const p=nk(r[cProj]), d=parseVig(r[cVig]); if(!p||!d)return;
    const k=ym(d), fu=nf(r[cFuel]), v=+(r[cPreco]||0); if(!(v>0))return;
    const k1=`${p}|${k}|${fu}`, k2=`${p}|${k}`;
    if(!L1.has(k1))L1.set(k1,{s:0,n:0}); L1.get(k1).s+=v; L1.get(k1).n++;
    if(!L2.has(k2))L2.set(k2,{s:0,n:0}); L2.get(k2).s+=v; L2.get(k2).n++; });
  return {L1,L2,cProj,cPreco,cVig,cFuel};
}
function remPriceFor(r,CL,LK){
  const p=nk(r[CL.proj]); if(!p)return null; const d=parseVig(r[CL.vig]); if(!d)return null;
  const k=ym(d), fu=CL.fuel>=0?nf(r[CL.fuel]):'';
  let e=LK.L1.get(`${p}|${k}|${fu}`); if(!e)e=LK.L2.get(`${p}|${k}`);
  return e && e.n>0 ? e.s/e.n : null;
}

// REM do agregado, exatamente como o painel: média SIMPLES das placas dentro do
// projeto; os projetos entram ponderados pelo km rodado do projeto.
function remAgregado(rows,CL){
  const proj={};
  rows.forEach(r=>{ const rem=+(r[CL.rem]||0), km=+(r[CL.kmRod]||0), p=splitPU(r,CL)[0]||'—';
    if(!proj[p])proj[p]={s:0,n:0,km:0};
    if(rem>0){proj[p].s+=rem;proj[p].n++;}
    proj[p].km+=km; });
  let sp=0,kp=0;
  Object.values(proj).forEach(v=>{ const rp=v.n>0?v.s/v.n:null; if(rp!=null&&v.km>0){sp+=rp*v.km;kp+=v.km;} });
  return kp>0?sp/kp:null;
}

function analisa(rows,CL,LK){
  let kmAll=0, litAll=0, litRemCov=0, litRealCov=0, oldRs=0, pKm=0, kmP=0;
  let nCov=0, nOut=0, kmOut=0, litOut=0, nPrecoRem=0, nFallback=0;
  rows.forEach(r=>{
    const km=+(r[CL.kmRod]||0), lit=+(r[CL.litros]||0), rem=+(r[CL.rem]||0), real=+(r[CL.real]||0), rsL=+(r[CL.rsLReal]||0);
    kmAll+=km; litAll+=lit;
    const pRem=remPriceFor(r,CL,LK), p=(pRem!=null&&pRem>0)?pRem:rsL;
    if(pRem!=null&&pRem>0)nPrecoRem++; else if(km>0)nFallback++;
    if(km>0&&p>0){pKm+=p*km;kmP+=km;}
    if(km>0&&rem>0&&real>0){ nCov++; litRemCov+=km/rem; litRealCov+=km/real; oldRs+=(km/rem-km/real)*p; }
    else { nOut++; kmOut+=km; litOut+=lit; }
  });
  const pAvg=kmP>0?pKm/kmP:0;
  const remAvg=remAgregado(rows,CL);
  const realWt=litAll>0?kmAll/litAll:null;
  const litRemNovo=remAvg>0?kmAll/remAvg:0;
  const passo1=(litRemCov-litRealCov)*pAvg;                      // só troca o preço
  const kmCov=kmAll-kmOut;
  const passo2=(remAvg>0?kmCov/remAvg:0 - litRealCov)*pAvg;      // troca a régua do rem
  const novo=(litRemNovo-litAll)*pAvg;                           // entra a cobertura
  return { kmAll, litAll, remAvg, realWt, pAvg, oldRs, passo1, passo2, novo,
    litRemCov, litRealCov, litRemNovo, nCov, nOut, kmOut, litOut, nPrecoRem, nFallback,
    remImplicito: litRemCov>0?kmCov/litRemCov:null };
}

const br = n => (n==null||!isFinite(n))?'—':n.toLocaleString('pt-BR',{maximumFractionDigits:0});
const br2= n => (n==null||!isFinite(n))?'—':n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const mi = n => (n==null||!isFinite(n))?'—':(n/1e6).toFixed(3)+' mi';

// ---------- roda ----------
const kml = await gv(KML_ID, KML_TAB);
const CL  = detectCols(kml.cols);
const rsl = await gv(GV_RSL_ID, RSL_TAB);
const LK  = buildRemLookup(rsl.cols, rsl.rows);

console.log(`Aba Km/L: ${kml.rows.length} linhas · colunas-chave rem=${CL.rem} real=${CL.real} km=${CL.kmRod} litros=${CL.litros} preçoReal=${CL.rsLReal}`);
console.log(`Aba R$/L (${GV_RSL_ID.slice(0,8)}…): ${rsl.rows.length} linhas · ${LK.L2.size} chaves projeto|mês\n`);

const [Y,M] = VIG_ATE.split('-').map(Number);
const janela = new Set(); for(let mo=1;mo<=M;mo++) janela.add(`${Y}-${String(mo).padStart(2,'0')}`);
const ativas = kml.rows.filter(r=>{ const d=parseVig(r[CL.vig]); return d && janela.has(ym(d)); });
console.log(`Janela jan→${String(M).padStart(2,'0')}/${Y}: ${ativas.length} linhas\n`);

// por unidade
const porUni = {};
ativas.forEach(r=>{ const u=splitPU(r,CL)[1]||'—'; (porUni[u]=porUni[u]||[]).push(r); });

console.log('IMPACTO POR UNIDADE (R$)');
console.log('unid.   REM   REAL      ▲       ANTIGO       (1) preço     (2) régua      NOVO');
let somaNovo=0, somaAntigo=0;
const linhas=[];
Object.entries(porUni).sort().forEach(([u,rs])=>{
  const a=analisa(rs,CL,LK); somaNovo+=a.novo; somaAntigo+=a.oldRs; linhas.push([u,a]);
  const d=(a.realWt!=null&&a.remAvg!=null)?a.realWt-a.remAvg:null;
  console.log(`${u.padEnd(6)} ${br2(a.remAvg).padStart(5)} ${br2(a.realWt).padStart(5)} ${br2(d).padStart(6)} `
    + `${br(a.oldRs).padStart(12)} ${br(a.passo1).padStart(12)} ${br(a.passo2).padStart(12)} ${br(a.novo).padStart(12)}`);
});

const T = analisa(ativas,CL,LK);
console.log('\nTOTAL (linha "Total" do painel — agregado de tudo de uma vez)');
console.log(`  KM rodado ................... ${br(T.kmAll)}`);
console.log(`  Km/L REM (média da tela) .... ${br2(T.remAvg)}`);
console.log(`  Km/L REM implícito na soma .. ${br2(T.remImplicito)}   ← ponderado pelo km das placas`);
console.log(`  Km/L REAL (Σkm ÷ Σlitros) ... ${br2(T.realWt)}`);
console.log(`  ▲ (real − rem) .............. ${br2(T.realWt-T.remAvg)}`);
console.log(`  litros do remunerado ........ ${br(T.litRemNovo)}`);
console.log(`  litros abastecidos .......... ${br(T.litAll)}`);
console.log(`  ▲ em litros ................. ${br(T.litRemNovo-T.litAll)}`);
console.log(`  R$/L remunerado (pond. km) .. ${br2(T.pAvg)}`);

console.log('\nDE ONDE VEM A DIFERENÇA (total)');
console.log(`  ANTIGO (soma placa a placa) ......... ${mi(T.oldRs)}`);
console.log(`  (1) preço único ponderado pelo km ... ${mi(T.passo1)}   Δ ${mi(T.passo1-T.oldRs)}`);
console.log(`  (2) régua: REM da tela no lugar do`);
console.log(`      REM implícito das placas ........ ${mi(T.passo2)}   Δ ${mi(T.passo2-T.passo1)}`);
console.log(`  (3) cobertura: entram as linhas sem`);
console.log(`      rem/real (${T.nOut} linhas, ${br(T.kmOut)} km) ... ${mi(T.novo)}   Δ ${mi(T.novo-T.passo2)}`);
console.log(`  NOVO (o painel hoje) ................ ${mi(T.novo)}`);

console.log('\nSOMA DAS UNIDADES vs TOTAL');
console.log(`  Σ unidades (regra nova) ..... ${mi(somaNovo)}`);
console.log(`  linha Total (regra nova) .... ${mi(T.novo)}`);
console.log(`  diferença ................... ${mi(somaNovo-T.novo)}`);
console.log(`  Σ unidades (regra antiga) ... ${mi(somaAntigo)}`);
console.log(`  linha Total (regra antiga) .. ${mi(T.oldRs)}   ← a antiga fechava por ser soma`);

console.log('\nCOBERTURA DO PREÇO REMUNERADO');
console.log(`  linhas com preço remunerado . ${T.nPrecoRem}`);
console.log(`  linhas no fallback (R$/L real) ${T.nFallback}`);
const semPreco={};
ativas.forEach(r=>{ const p=remPriceFor(r,CL,LK); if(p==null||!(p>0)){ const u=splitPU(r,CL)[1]||'—'; semPreco[u]=(semPreco[u]||0)+1; } });
console.log(`  unidades sem preço remunerado: ${Object.entries(semPreco).sort((a,b)=>b[1]-a[1]).map(([u,n])=>`${u}(${n})`).join(' ')||'nenhuma'}`);
