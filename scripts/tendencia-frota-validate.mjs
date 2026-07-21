// Valida o painel /tendencia-frota/: lê a aba Base, reproduz as séries e a
// tendência linear (TENDÊNCIA / regressão de mín. quadrados) 2020-2025 → 2026-2030.
const SHEET_ID='1EFmp2qlevQG5OEgGJePrI_O8wKuQo3IDmbJIReN2Fl0';
const TAB='Base';
const PROJ_FROM=2027, FULL_TO=2025, END_YEAR=2029;

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
             eqRem:num(r[11]),eqReal:num(r[12]),dEq:num(r[13]),impEq:num(r[14]),
             km:num(r[5]),eq:num(r[6]),nEq:num(r[6]),custoTot:num(r[4]),remuner:num(r[1])}); });
  D.sort((a,b)=>a.ano-b.ano);
  // anualiza 2026 (jan–jun → ano cheio)
  const ANO_PARC=2026, MESES_PARC=6;   // 2026 fica cru (jan–jun); mensalização feita na projeção

  console.log(`\nLinhas de ano lidas: ${D.length}  (${D.map(d=>d.ano).join(', ')})`);
  console.log('\n== VALORES LIDOS ==');
  console.log('Ano   Km        #Eq   R$/kmReal R$/kmRem  ΔRkm   ImpRkm      EqRem EqReal ΔEq    ImpEq');
  D.forEach(d=>console.log(
    `${d.ano}  ${String(d.km??'').padStart(9)}  ${String(d.eq??'').padStart(4)}   `+
    `${(d.rkmReal??0).toFixed(3).padStart(7)}  ${(d.rkmRem??0).toFixed(3).padStart(7)}  `+
    `${(d.dRkm??0).toFixed(3).padStart(6)}  ${String(Math.round(d.impRkm??0)).padStart(9)}   `+
    `${String(Math.round(d.eqRem??0)).padStart(5)} ${String(Math.round(d.eqReal??0)).padStart(6)} `+
    `${String(Math.round(d.dEq??0)).padStart(6)} ${String(Math.round(d.impEq??0)).padStart(9)}`));

  // Projeção DRIVER-BASED: projeta Custo/Km/#Eq; taxas derivadas. 2026 mensalizado (×12/6).
  const REAL_TO=2025, FAC=12/MESES_PARC;
  const d26=key=>{const d=D.find(x=>x.ano===ANO_PARC);return d?(d[key]||0)*FAC:0;};
  const driverReg=key=>{const pts=D.filter(d=>d.ano<=REAL_TO).map(d=>[d.ano,d[key]]).filter(p=>p[1]!=null);pts.push([ANO_PARC,d26(key)]);return linReg(pts);};
  const driverVal=(key,y)=>{ if(y<=REAL_TO){const d=D.find(x=>x.ano===y);return d?(d[key]||0):0;} if(y===ANO_PARC)return d26(key); return driverReg(key)(y); };
  const rrkm=y=>driverVal('custoTot',y)/driverVal('km',y),  mrkm=y=>driverVal('remuner',y)/driverVal('km',y);
  const req =y=>driverVal('custoTot',y)/driverVal('nEq',y), meq =y=>driverVal('remuner',y)/driverVal('nEq',y);
  console.log(`\n2026 mensalizado (×${FAC}): custo=${Math.round(d26('custoTot')).toLocaleString('pt-BR')} km=${Math.round(d26('km')).toLocaleString('pt-BR')} nEq=${Math.round(d26('nEq'))}`);
  console.log(`\n== TENDÊNCIA DRIVER-BASED (R$/km=Custo÷Km, R$/Eq=Custo÷#Eq) → ${ANO_PARC}-${END_YEAR} ==`);
  console.log('Ano   R$/kmReal R$/kmRem   EqReal EqRem');
  for(let y=ANO_PARC;y<=END_YEAR;y++){
    console.log(`${y}  ${rrkm(y).toFixed(3).padStart(7)}  ${mrkm(y).toFixed(3).padStart(7)}   `+
      `${String(Math.round(req(y))).padStart(5)} ${String(Math.round(meq(y))).padStart(5)}`);
  }
  // Totais 10 anos (real ≤2025 + tendência driver-based 2026–2029)
  function tableTotals(impKey,denomKey){
    let tImp=0,sCusto=0,sRemun=0,sDenom=0; const proj=[];
    for(let y=2020;y<=2029;y++){ const c=driverVal('custoTot',y),rm=driverVal('remuner',y),dn=driverVal(denomKey,y);
      let imp; if(y<=REAL_TO){const d=D.find(x=>x.ano===y);imp=d?d[impKey]:0;} else {imp=driverVal(impKey,y);proj.push([y,Math.round(imp)]);}
      tImp+=imp||0;sCusto+=c;sRemun+=rm;sDenom+=dn; }
    return {proj,tImp,totRem:sRemun/sDenom,totReal:sCusto/sDenom,sCusto,sDenom};
  }
  const tk=tableTotals('impRkm','km',x=>x.toFixed(3));
  const te=tableTotals('impEq','nEq',x=>Math.round(x));
  console.log('\n== TABELA — Impacto projetado 2027–2029 + Total ponderado 10 anos ==');
  console.log('  R$/km   Imp proj:',tk.proj.map(([y,v])=>`${y}=${v.toLocaleString('pt-BR')}`).join('  '));
  console.log('          Total: Rem(Σcusto? não)=Σrem/Σkm=',tk.totRem.toFixed(3),' Real=Σcusto/Σkm=',tk.totReal.toFixed(3),' | Total Impacto:',Math.round(tk.tImp).toLocaleString('pt-BR'));
  console.log('          Σcusto=',Math.round(tk.sCusto).toLocaleString('pt-BR'),' Σkm=',Math.round(tk.sDenom).toLocaleString('pt-BR'));
  console.log('  R$/Eq   Imp proj:',te.proj.map(([y,v])=>`${y}=${v.toLocaleString('pt-BR')}`).join('  '));
  console.log('          Total: Rem=Σrem/ΣnEq=',Math.round(te.totRem),' Real=Σcusto/ΣnEq=',Math.round(te.totReal),' | Total Impacto:',Math.round(te.tImp).toLocaleString('pt-BR'));
  console.log('          Σcusto=',Math.round(te.sCusto).toLocaleString('pt-BR'),' ΣnEq=',Math.round(te.sDenom).toLocaleString('pt-BR'));

  const r26=D.find(d=>d.ano===2026);
  if(r26) console.log(`\n2026 REALIZADO PARCIAL na planilha: R$/kmReal=${r26.rkmReal}  R$/kmRem=${r26.rkmRem}  EqReal=${r26.eqReal}  EqRem=${r26.eqRem}  (km=${r26.km}, #eq=${r26.eq})`);
  console.log('\nOBS: no painel 2026 é exibido como TENDÊNCIA (tracejado); acima o comparativo com o parcial real.');
}
main().catch(e=>{console.error('ERRO',e);process.exit(1);});
