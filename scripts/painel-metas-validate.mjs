// Diagnóstico: valida o novo cálculo de "Custos de veículos e equipamentos" (AVO/AVR do DRE
// Frota, igual à Visão Financeira) e "Ranking performance Frota - Unidades" (Pontuação do
// Programa de Reconhecimento / Frota de Elite) para JUN/26 — os dois indicadores que
// apareciam sem dado no Painel de Metas porque dependiam de preenchimento manual.
// Roda via GitHub Actions (o sandbox não alcança docs.google).
const DRE_ID = '1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8';
const GEROT_ID = '1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M';

const INDS = [
  {field:'disp',    tab:'Disponibilidade',     metaCol:1, vigCol:0, filCol:2, valCol:10},
  {field:'prev',    tab:'Preventivas',         metaCol:1, vigCol:0, filCol:2, valCol:6},
  {field:'pneus',   tab:'Pneus',               metaCol:1, vigCol:0, filCol:2, valCol:3},
  {field:'checkT',  tab:'Checklist T1/T2',     metaCol:1, vigCol:0, filCol:2, valCol:3},
  {field:'checkWH', tab:'Checklist WH',        metaCol:1, vigCol:0, filCol:2, valCol:3},
  {field:'conf',    tab:'Conformidade',        metaCol:1, vigCol:0, filCol:2, valCol:3},
  {field:'sla',     tab:'SLA Man.',            metaCol:0, vigCol:1, filCol:2, valCol:8},
];
const ELITE_NOMES=['CDI MACACU','CDD PELOTAS','CDD RONDONOPOLIS','CDD NOVA FRIBURGO','CDD RIO DE JANEIRO','CDD FLORIANOPOLIS','CDD CUIABA','CDD GUARULHOS','CDD CAMBORIU','PIRAI EMPURRADA','MACACU EMPURRADA','CUIABA EMPURRADA','CUIABA'];
const ELITE_WEIGHTS={disp:20,prev:15,comb:10,pneus:10,checkT:10,checkWH:10,conf:5,stVeic:5,stEmp:5,sla:5,civf:5};

function parseJson(txt){const s=txt.indexOf('{'),e=txt.lastIndexOf('}');return JSON.parse(txt.slice(s,e+1));}
function cellVal(c){if(!c)return null;return c.v;}
async function fetchTab(id,name,gid){
  const q = gid!=null ? `gid=${gid}` : `sheet=${encodeURIComponent(name)}`;
  const url=`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${q}&tqx=out:json`;
  const r=await fetch(url); const txt=await r.text(); const j=parseJson(txt);
  if(j.status!=='ok'){ console.log(`  ERRO aba ${name}:`, j.status); return {header:[],rows:[]}; }
  const header=(j.table.cols||[]).map(c=>c&&c.label?c.label:'');
  const rows=(j.table.rows||[]).map(row=>(row.c||[]).map(cellVal));
  return {header,rows};
}
const _normEb=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
function ebIdx(h,...names){const nc=h.map(_normEb);for(const n of names){const i=nc.indexOf(_normEb(n));if(i>=0)return i;}for(const n of names){const nn=_normEb(n);const i=nc.findIndex(c=>c.includes(nn));if(i>=0)return i;}return -1;}
const _numBR=v=>{if(v==null||v==='')return null;if(typeof v==='number')return v;let s=String(v).replace(/\s|R\$/g,'');if(s.indexOf(',')>=0)s=s.replace(/\./g,'').replace(',','.');const f=parseFloat(s);return isNaN(f)?null:f;};
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function _mesNum(m){if(m==null)return null;if(typeof m==='number'&&m>=1&&m<=12)return m;const s=String(m).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').slice(0,3);const i=MESES.indexOf(s);if(i>=0)return i+1;const n=parseInt(m);return n>=1&&n<=12?n:null;}
function parseD(v){if(!v)return null;const m=String(v).match(/^Date\((\d+),(\d+),(\d+)/);if(m)return new Date(+m[1],+m[2],+m[3]);return null;}
function mapDre(h){return{orc:ebIdx(h,'orçado','orcado'),real:ebIdx(h,'realizado'),vig:ebIdx(h,'vigência','vigencia'),cta:ebIdx(h,'conta gerencial','conta'),mes:ebIdx(h,'mês','mes'),ano:ebIdx(h,'ano')};}
function dreVigDate(r,m){const mn=m.mes>=0?_mesNum(r[m.mes]):null,an=m.ano>=0?parseInt(r[m.ano]):null;if(mn&&an)return new Date(an,mn-1,1);if(m.vig>=0){const d=parseD(r[m.vig]);if(d)return d;}return null;}
function vigKeyN(d){return d?d.getFullYear()*100+d.getMonth():0;}

function pct(c){if(!c)return null;let v=c.v;if(v==null||v===''){if(c.f!=null&&c.f!==''){v=parseFloat(String(c.f).replace('%','').replace(/\./g,'').replace(',','.'));return isFinite(v)?v:null;}return null;}v=Number(v);if(!isFinite(v))return null;return Math.abs(v)<=1.5?v*100:v;}
function gstr(c){if(!c)return '';return String(c.f!=null?c.f:(c.v!=null?c.v:'')).trim();}
function gvig(c){if(!c)return null;const v=c.v;let m=String(v).match(/Date\((\d+),(\d+)/);if(m)return m[1]+'-'+String(+m[2]+1).padStart(2,'0');const f=String(c.f!=null?c.f:(v!=null?v:''));m=f.match(/(\d{1,2})[\/\-](\d{4})/);if(m)return m[2]+'-'+m[1].padStart(2,'0');return null;}

async function fetchGvizRaw(id,name){
  const url=`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?sheet=${encodeURIComponent(name)}&tqx=out:json`;
  const r=await fetch(url); const txt=await r.text(); const j=parseJson(txt);
  if(j.status!=='ok'){ console.log(`  ERRO aba ${name}:`, j.status); return []; }
  return j.table.rows||[];
}

async function main(){
  console.log('============================================================');
  console.log('CUSTOS DE VEÍCULOS E EQUIPAMENTOS (AVO/AVR do DRE Frota)');
  console.log('============================================================');
  const frota = await fetchTab(DRE_ID,'Frota');
  const receita = await fetchTab(DRE_ID,'Receita Líquida');
  const mF=mapDre(frota.header), mR=mapDre(receita.header);
  console.log('Colunas Frota:', JSON.stringify(mF));
  console.log('Colunas Receita:', JSON.stringify(mR));
  const cus={}, rec={};
  frota.rows.forEach(r=>{
    const cta=mF.cta>=0?String(r[mF.cta]||''):'';
    if(_normEb(cta).includes('receita liquida'))return;
    const d=dreVigDate(r,mF); if(!d)return; const k=vigKeyN(d);
    const o=cus[k]=cus[k]||{orc:0,real:0}; o.orc+=_numBR(r[mF.orc])||0; o.real+=_numBR(r[mF.real])||0;
  });
  receita.rows.forEach(r=>{
    const d=dreVigDate(r,mR); if(!d)return; const k=vigKeyN(d);
    const o=rec[k]=rec[k]||{orc:0,real:0}; o.orc+=_numBR(r[mR.orc])||0; o.real+=_numBR(r[mR.real])||0;
  });
  Object.keys(cus).sort((a,b)=>a-b).forEach(k=>{
    const c=cus[k], rc=rec[k];
    const avOrc = rc&&rc.orc ? c.orc/Math.abs(rc.orc)*100 : null;
    const avReal = rc&&rc.real ? c.real/Math.abs(rc.real)*100 : null;
    const y=Math.floor(k/100), m=k%100;
    console.log(`  ${MESES[m]}/${y}: avOrc=${avOrc} avReal=${avReal}`);
  });

  console.log('\n============================================================');
  console.log('RANKING PERFORMANCE FROTA - UNIDADES (Pontuação Frota de Elite)');
  console.log('============================================================');
  const byUnitVig={};
  for(const ind of INDS){
    const rows = await fetchGvizRaw(GEROT_ID, ind.tab);
    rows.forEach(row=>{
      const c=row.c||[];
      const unit=gstr(c[ind.filCol]).toUpperCase(); const vig=gvig(c[ind.vigCol]);
      if(!unit||!vig||!ELITE_NOMES.includes(unit))return;
      const meta=pct(c[ind.metaCol]); const real=pct(c[ind.valCol]); if(real==null)return;
      const atg=(meta&&meta>0)?Math.min(100,real/meta*100):null;
      const key=vig+'||'+unit;
      (byUnitVig[key]=byUnitVig[key]||{}).f = byUnitVig[key]?.f||{};
      byUnitVig[key].f[ind.field]=atg;
    });
  }
  function eliteScore(fields){let num=0,den=0;for(const f in ELITE_WEIGHTS){const w=ELITE_WEIGHTS[f]/100;const v=fields[f];if(v==null)continue;den+=w;let v01=v/100;if(v01>1)v01=1;num+=w*v01;}return den>0?(num/den)*100:null;}
  const byVig={};
  Object.keys(byUnitVig).forEach(key=>{
    const sc=eliteScore(byUnitVig[key].f); if(sc==null)return;
    const vig=key.split('||')[0]; const [y,mo]=vig.split('-').map(Number);
    const k=y*100+(mo-1); (byVig[k]=byVig[k]||[]).push(sc);
  });
  Object.keys(byVig).sort((a,b)=>a-b).forEach(k=>{
    const a=byVig[k]; const avg=a.reduce((s,v)=>s+v,0)/a.length;
    const y=Math.floor(k/100), m=k%100;
    console.log(`  ${MESES[m]}/${y}: média=${avg.toFixed(2)} (${a.length} unidades, SEM comb/stVeic/stEmp/civf p/ simplificar o diagnóstico)`);
  });
  console.log('\nOBS: este diagnóstico usa só os indicadores "direct" (sem Combustível/Stress Test/CIVF,');
  console.log('que dependem de fontes extras) — serve só p/ confirmar que JUN/26 tem dado, não p/ bater 1:1 com o painel.');
  console.log('\nFIM.');
}
main().catch(e=>{ console.error('ERRO:', e); process.exit(1); });
