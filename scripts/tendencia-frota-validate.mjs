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
  const remReg=rk=>{const pts=D.filter(d=>d.ano<=REAL_TO).map(d=>[d.ano,d[rk]]).filter(p=>p[1]!=null);const d=D.find(x=>x.ano===ANO_PARC);if(d&&d[rk]!=null)pts.push([ANO_PARC,d[rk]]);return linReg(pts);};
  const remRate=(rk,y)=>{const d=D.find(x=>x.ano===y);if(d&&d[rk]!=null&&y<=ANO_PARC)return d[rk];return remReg(rk)(y);};
  const rrkm=y=>driverVal('custoTot',y)/driverVal('km',y),  mrkm=y=>remRate('rkmRem',y);
  const req =y=>driverVal('custoTot',y)/driverVal('nEq',y), meq =y=>remRate('eqRem',y);
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

  // ===== COMPARATIVO OPTAS — /comparativo-optas/ (simulação 10 anos, NOSSA km por carreta) =====
  // Contrato 2020–2024 (igual nos 3): 0,11×km + 0,81%×203.086 · Pós 2025–2029: manut×km + REM K%×221.605
  const VALOR_ATUAL_NF=221605, VALOR_INICIO_NF=203086, REMK_CON=0.0081, MANUT_CON=0.11;
  const CMP_DE=2025, CMP_ATE=END_YEAR, CONTRATO_ATE=2024;
  const CEN=[{nome:'Ambev',key:'ambev',remK:0.0100,manut:0.19},
             {nome:'Meio-termo',key:'meio',remK:0.0115,manut:0.22},
             {nome:'Optas',key:'optas',remK:0.0133,manut:0.25}];
  const kmCar=y=>{const k=driverVal('km',y),n=driverVal('nEq',y);return n?k/n:null;};
  const scenTot=(c,y)=>{const km=kmCar(y);if(km==null)return null;
    return y<=CONTRATO_ATE ? MANUT_CON*km+REMK_CON*VALOR_INICIO_NF : c.manut*km+c.remK*VALOR_ATUAL_NF;};
  console.log(`\n== COMPARATIVO OPTAS (simulação 10 anos · NOSSA km) — 2020–${CMP_ATE} ==`);
  console.log('Ano   km/car·mês  Conlog R$/km  Conlog R$/car·mês   Ambev    Meio   Optas  (R$/car·mês; 2020–24 = contrato, iguais)');
  for(let y=2020;y<=END_YEAR;y++){
    const custo=driverVal('custoTot',y),km=driverVal('km',y),nEq=driverVal('nEq',y);
    const rkm=km?custo/km:null, eqMes=nEq?custo/nEq:null, kc=kmCar(y);
    const tots=CEN.map(c=>scenTot(c,y));
    console.log(`${y}  ${String(Math.round(kc)).padStart(9)}  ${rkm.toFixed(3).padStart(9)}  ${String(Math.round(eqMes).toLocaleString('pt-BR')).padStart(15)}   `+
      tots.map(v=>v==null?'—':Math.round(v).toLocaleString('pt-BR')).map(s=>s.padStart(7)).join(' '));
  }
  // contrato ponderado (2020–2024) — igual nos 3
  let cC=0,cK=0,cN=0,cT=0,cAc=0;
  for(let y=2020;y<=CONTRATO_ATE;y++){const n=driverVal('nEq',y),t=scenTot(CEN[0],y);
    cC+=driverVal('custoTot',y);cK+=driverVal('km',y);cN+=n;cT+=t*n;cAc+=(t-driverVal('custoTot',y)/n)*n;}
  console.log(`\nContrato 2020–24: Conlog R$/km=${(cC/cK).toFixed(3)} · sim R$/km=${(cT/cK).toFixed(3)} · sim R$/car·mês=${Math.round(cT/cN).toLocaleString('pt-BR')} · Impacto acum=${(cAc>=0?'+':'')+Math.round(cAc).toLocaleString('pt-BR')}`);
  // pós ponderado + acumulado impacto por cenário
  let sC=0,sK=0,sN=0; for(let y=CMP_DE;y<=CMP_ATE;y++){sC+=driverVal('custoTot',y);sK+=driverVal('km',y);sN+=driverVal('nEq',y);}
  const cpRkm=sC/sK, cpEq=sC/sN, cpKm=sK/sN;
  console.log(`Pós-contrato Conlog: R$/km=${cpRkm.toFixed(3)} · R$/car·mês=${Math.round(cpEq).toLocaleString('pt-BR')} · km/car·mês=${Math.round(cpKm)}`);
  CEN.forEach(c=>{
    let stn=0,sn=0,sk=0,ac=0;
    for(let y=CMP_DE;y<=CMP_ATE;y++){const n=driverVal('nEq',y),t=scenTot(c,y),e=driverVal('custoTot',y)/n; stn+=t*n;sn+=n;sk+=(kmCar(y))*n;ac+=(t-e)*n;}
    const be=((cpRkm-c.manut)*cpKm/VALOR_ATUAL_NF)*100;
    console.log(`  ${c.nome.padEnd(11)} R$/km=${(stn/sk).toFixed(3)} · R$/car·mês=${Math.round(stn/sn).toLocaleString('pt-BR')} · ▲=${((stn/sk-cpRkm)>=0?'+':'')+(stn/sk-cpRkm).toFixed(3)}/km · Impacto acum=${(ac>=0?'+':'')+Math.round(ac).toLocaleString('pt-BR')} · break-even=${be.toFixed(2)}%`);
  });

  // ===== CLONES LIFECYCLE (/comparativo-km/ e /comparativo-equipamento/) — Q1 e Q2 =====
  // Q1: pós 2026–2030 — cenários pagam nossa conta? · Q2: ciclo finame (2021–25) + 5 anos (2026–30)
  {
    const FINAME_PMT=4330.80, MANUT_FIN=0.11, FIN_DE=2021, FIN_ATE=2025, EXT_DE=2026, EXT_ATE=2030;
    const remEq=(c,y)=>{const km=kmCar(y);if(km==null)return null;
      return (y<=FIN_ATE)? FINAME_PMT+MANUT_FIN*km : c.manut*km+c.remK*VALOR_ATUAL_NF;};
    console.log(`\n== LIFECYCLE CLONES — Q1 (pós ${EXT_DE}–${EXT_ATE}) e Q2 (ciclo ${FIN_DE}–${EXT_ATE}) ==`);
    console.log('Ano   km/car  Conlog/car·mês  RemFin/cen(Amb,Meio,Opt)/car·mês');
    for(let y=FIN_DE;y<=EXT_ATE;y++){
      const n=driverVal('nEq',y), eq=driverVal('custoTot',y)/n;
      const rems=CEN.map(c=>remEq(c,y));
      console.log(`${y}  ${String(Math.round(kmCar(y))).padStart(5)}  ${String(Math.round(eq).toLocaleString('pt-BR')).padStart(12)}   `+rems.map(v=>String(Math.round(v).toLocaleString('pt-BR')).padStart(7)).join(' '));
    }
    CEN.forEach(c=>{ let q1=0,q2=0;
      for(let y=FIN_DE;y<=EXT_ATE;y++){const n=driverVal('nEq',y),eq=driverVal('custoTot',y)/n;
        const rem=remEq(c,y), conta=eq+((y<=FIN_ATE)?FINAME_PMT:0);
        if(y>=EXT_DE) q1+=(rem-eq)*n;
        q2+=(rem-conta)*n; }
      console.log(`  ${c.nome.padEnd(11)} Q1 pós ${EXT_DE}–${EXT_ATE}: ${(q1>=0?'+':'')+Math.round(q1).toLocaleString('pt-BR')} (${q1>=0?'PAGA':'NÃO PAGA'}) · Q2 ciclo: ${(q2>=0?'+':'')+Math.round(q2).toLocaleString('pt-BR')} (${q2>=0?'PAGA':'NÃO PAGA'})`);
    });
  }

  // Verifica os valores de carreta (aba 'Valor de Compra NF')
  try{
    const nfUrl=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent('Valor de Compra NF')}`;
    const nfJson=JSON.parse((await (await fetch(nfUrl)).text()).replace(/^[\s\S]*?\(/,'').replace(/\);?\s*$/,''));
    const nfCols=(nfJson.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim().toLowerCase());
    const iAno=nfCols.findIndex(c=>c==='ano'), iVal=nfCols.findIndex(c=>c.includes('valornfcompra'));
    const nfRows=nfJson.table.rows.map(r=>(r.c||[]).map(c=>c&&c.v!=null?c.v:null));
    const all=[],noNew=[]; nfRows.forEach(r=>{const v=num(r[iVal]),a=num(r[iAno]); if(v!=null){all.push(v); if(Math.round(a)!==2025)noNew.push(v);}});
    const avg=arr=>arr.length?arr.reduce((s,x)=>s+x,0)/arr.length:null;
    console.log(`\n== VALOR DE COMPRA NF (verificação) == [ano]=col${iAno} [valorNfCompra]=col${iVal}`);
    console.log(`  Linhas: ${all.length} (sem 2025: ${noNew.length})`);
    console.log(`  Valor médio ATUAL (média de tudo) = ${avg(all)==null?'—':Math.round(avg(all)).toLocaleString('pt-BR')}  (esperado ~221.605)`);
    console.log(`  Valor INICIAL (sem 2025)          = ${avg(noNew)==null?'—':Math.round(avg(noNew)).toLocaleString('pt-BR')}  (esperado ~203.086)`);
  }catch(e){ console.log('NF tab erro:', e.message); }

  const r26=D.find(d=>d.ano===2026);
  if(r26) console.log(`\n2026 REALIZADO PARCIAL na planilha: R$/kmReal=${r26.rkmReal}  R$/kmRem=${r26.rkmRem}  EqReal=${r26.eqReal}  EqRem=${r26.eqRem}  (km=${r26.km}, #eq=${r26.eq})`);
  console.log('\nOBS: no painel 2026 é exibido como TENDÊNCIA (tracejado); acima o comparativo com o parcial real.');
}
main().catch(e=>{console.error('ERRO',e);process.exit(1);});
