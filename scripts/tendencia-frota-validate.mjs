// Valida o painel /tendencia-frota/: lê a aba Base, reproduz as séries e a
// tendência linear (TENDÊNCIA / regressão de mín. quadrados) 2020-2025 → 2026-2030.
const SHEET_ID='1EFmp2qlevQG5OEgGJePrI_O8wKuQo3IDmbJIReN2Fl0';
const TAB='Base';
const PROJ_FROM=2026, END_YEAR=2030;

const num=v=>{ if(v==null||v==='')return null; if(typeof v==='number')return v;
  let s=String(v).replace(/\s|R\$/g,''); if(s.indexOf(',')>=0)s=s.replace(/\./g,'').replace(',','.');
  const f=parseFloat(s); return isNaN(f)?null:f; };

async function fetchBase(){
  const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(TAB)}`;
  const raw=await (await fetch(url)).text();
  const json=JSON.parse(raw.replace(/^[\s\S]*?\(/, '').replace(/\);?\s*$/, ''));
  const cols=(json.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
  const rows=json.table.rows.map(r=>(r.c||[]).map(c=>c&&c.v!=null?c.v:null));
  return {cols,rows};
}
function linReg(pairs){
  const n=pairs.length; let sx=0,sy=0,sxy=0,sxx=0;
  pairs.forEach(([x,y])=>{sx+=x;sy+=y;sxy+=x*y;sxx+=x*x;});
  const den=n*sxx-sx*sx; if(!den){const m=sy/n;return ()=>m;}
  const b=(n*sxy-sx*sy)/den, a=(sy-b*sx)/n; return x=>a+b*x;
}

async function main(){
  const {cols,rows}=await fetchBase();
  console.log('Cabeçalho (A..O):');
  cols.forEach((c,i)=>{ if(i<=14) console.log(`  [${i}] ${String.fromCharCode(65+i)}  ${c}`); });

  const D=[];
  rows.forEach(r=>{ const ano=num(r[0]); if(ano==null||ano<2000||ano>2100)return;
    D.push({ano:Math.round(ano), rkmReal:num(r[7]),rkmRem:num(r[8]),dRkm:num(r[9]),impRkm:num(r[10]),
             eqRem:num(r[11]),eqReal:num(r[12]),dEq:num(r[13]),impEq:num(r[14]), km:num(r[5]),eq:num(r[6])}); });
  D.sort((a,b)=>a.ano-b.ano);

  console.log(`\nLinhas de ano lidas: ${D.length}  (${D.map(d=>d.ano).join(', ')})`);
  console.log('\n== VALORES LIDOS ==');
  console.log('Ano   Km        #Eq   R$/kmReal R$/kmRem  ΔRkm   ImpRkm      EqRem EqReal ΔEq    ImpEq');
  D.forEach(d=>console.log(
    `${d.ano}  ${String(d.km??'').padStart(9)}  ${String(d.eq??'').padStart(4)}   `+
    `${(d.rkmReal??0).toFixed(3).padStart(7)}  ${(d.rkmRem??0).toFixed(3).padStart(7)}  `+
    `${(d.dRkm??0).toFixed(3).padStart(6)}  ${String(Math.round(d.impRkm??0)).padStart(9)}   `+
    `${String(Math.round(d.eqRem??0)).padStart(5)} ${String(Math.round(d.eqReal??0)).padStart(6)} `+
    `${String(Math.round(d.dEq??0)).padStart(6)} ${String(Math.round(d.impEq??0)).padStart(9)}`));

  const hist=D.filter(d=>d.ano<PROJ_FROM);
  const preds={
    rkmReal:linReg(hist.map(d=>[d.ano,d.rkmReal]).filter(p=>p[1]!=null)),
    rkmRem :linReg(hist.map(d=>[d.ano,d.rkmRem ]).filter(p=>p[1]!=null)),
    eqReal :linReg(hist.map(d=>[d.ano,d.eqReal ]).filter(p=>p[1]!=null)),
    eqRem  :linReg(hist.map(d=>[d.ano,d.eqRem  ]).filter(p=>p[1]!=null)),
  };
  console.log(`\n== TENDÊNCIA LINEAR (base ${hist[0].ano}-${hist[hist.length-1].ano}) → ${PROJ_FROM}-${END_YEAR} ==`);
  console.log('Ano   R$/kmReal R$/kmRem   EqReal EqRem');
  for(let y=PROJ_FROM;y<=END_YEAR;y++){
    console.log(`${y}  ${preds.rkmReal(y).toFixed(3).padStart(7)}  ${preds.rkmRem(y).toFixed(3).padStart(7)}   `+
      `${String(Math.round(preds.eqReal(y))).padStart(5)} ${String(Math.round(preds.eqRem(y))).padStart(5)}`);
  }
  const r26=D.find(d=>d.ano===2026);
  if(r26) console.log(`\n2026 REALIZADO PARCIAL na planilha: R$/kmReal=${r26.rkmReal}  R$/kmRem=${r26.rkmRem}  EqReal=${r26.eqReal}  EqRem=${r26.eqRem}  (km=${r26.km}, #eq=${r26.eq})`);
  console.log('\nOBS: no painel 2026 é exibido como TENDÊNCIA (tracejado); acima o comparativo com o parcial real.');
}
main().catch(e=>{console.error('ERRO',e);process.exit(1);});
