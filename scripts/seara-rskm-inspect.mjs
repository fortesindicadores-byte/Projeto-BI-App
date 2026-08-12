// Confere a origem do R$/km que o Painel KM da Seara usa no Impacto.
//
// O painel (seara-km/index.html) NÃO lê a aba Base Remunerado: ele calcula
// R$/km por placa|vigência como ΣS ÷ ΣZ da aba Base CTEs (S = R$ combustível
// do CTE, Z = KM Rodado remunerado). Este script lista os cabeçalhos das duas
// abas, procura na Base Remunerado alguma coluna que seja R$/km e compara os
// dois números por placa na vigência escolhida — para decidir com dado, não
// com memória.
const SEARA_ID = '1Rlwc0MZiupQI38gSN8VyBq_zMADgX9R_ZbfygNP-OXE';
const GID_REM  = 0, GID_CTES = 1672208132;
const VIG = process.env.VIG || '';   // 'MM/YYYY'; vazio = última vigência com dado

const A1 = i => { let s='', n=i; do { s = String.fromCharCode(65 + n%26) + s; n = Math.floor(n/26)-1; } while(n>=0); return s; };
const placaKey = s => String(s==null?'':s).toUpperCase().replace(/[^A-Z0-9]/g,'').trim();
const parse = t => { const s=t.indexOf('{'), e=t.lastIndexOf('}'); return JSON.parse(t.slice(s,e+1)); };

async function gvz({gid, tq}={}){
  const p = ['gid='+gid, 'headers=1', 'tqx=out:json'];
  if(tq) p.push('tq='+encodeURIComponent(tq));
  const url = `https://docs.google.com/spreadsheets/d/${SEARA_ID}/gviz/tq?${p.join('&')}`;
  const j = parse(await (await fetch(url)).text());
  if(j.status !== 'ok') throw new Error('gviz '+j.status+' '+JSON.stringify(j.errors||''));
  const cols = (j.table.cols||[]).map(c => String((c && (c.label || c.id)) || '').trim());
  const rows = (j.table.rows||[]).map(x => (x.c||[]).map(c => c ? (c.v!=null ? c.v : c.f) : null));
  return {cols, rows};
}
function vigDe(v){
  const s = String(v==null?'':v);
  let m = s.match(/Date\((\d+),(\d+)/);
  if(m) return String(+m[2]+1).padStart(2,'0') + '/' + m[1];
  m = s.match(/(\d{1,2})\/(\d{4})/);
  if(m) return m[1].padStart(2,'0') + '/' + m[2];
  const d = new Date(s);
  return isNaN(d) ? '' : String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}

const brem = await gvz({gid: GID_REM});
const ctes = await gvz({gid: GID_CTES});

console.log('\n=== Base Remunerado (gid 0) — ' + brem.rows.length + ' linhas ===');
brem.cols.forEach((c,i) => console.log('  ' + A1(i).padEnd(3) + ' [' + String(i).padStart(2) + '] ' + c));
console.log('\n=== Base CTEs (gid ' + GID_CTES + ') — cabeçalhos ===');
ctes.cols.forEach((c,i) => console.log('  ' + A1(i).padEnd(3) + ' [' + String(i).padStart(2) + '] ' + c));

// candidatas a R$/km na Base Remunerado
const cand = brem.cols.map((c,i)=>({c,i}))
  .filter(o => /r\$?\s*\/?\s*km|rs.?km|custo.*km|km.*custo|valor.*km/i.test(o.c));
console.log('\ncandidatas a R$/km na Base Remunerado:',
  cand.length ? cand.map(o=>`${A1(o.i)}="${o.c}"`).join(' · ') : '(nenhuma pelo nome)');

// vigência de trabalho
const vigsRem = [...new Set(brem.rows.map(r => vigDe(r[0])).filter(Boolean))].sort();
const vig = VIG || vigsRem[vigsRem.length-1] || '';
console.log('\nvigências na Base Remunerado:', vigsRem.join(' '), '→ usando', vig);

// R$/km do painel: ΣS ÷ ΣZ da Base CTEs, por placa (C=2, D=3, S=18, Z=25)
const agg = {};
ctes.rows.forEach(r => {
  const p = placaKey(r[2]); if(!p) return;
  if(vigDe(r[3]) !== vig) return;
  const o = agg[p] || (agg[p] = {rs:0, km:0});
  o.rs += +r[18] || 0; o.km += +r[25] || 0;
});

// comparação placa a placa contra cada candidata da Base Remunerado
for(const o of cand){
  console.log(`\n--- Base Remunerado ${A1(o.i)} "${o.c}"  ×  CTEs ΣS÷ΣZ  (${vig}) ---`);
  let n=0, iguais=0, difs=[];
  brem.rows.forEach(r => {
    if(vigDe(r[0]) !== vig) return;
    const p = placaKey(r[3]); const a = agg[p]; if(!p || !a || !a.km) return;
    const ctesRk = a.rs / a.km, bremRk = +r[o.i] || 0;
    if(!bremRk) return;
    n++;
    const dif = Math.abs(ctesRk - bremRk) / bremRk;
    if(dif < 0.01) iguais++; else if(difs.length < 12) difs.push(`${p}: CTEs ${ctesRk.toFixed(3)} × Rem ${bremRk.toFixed(3)}`);
  });
  console.log(`  placas comparadas: ${n} · batendo (±1%): ${iguais} (${n?Math.round(iguais/n*100):0}%)`);
  difs.forEach(d => console.log('   ' + d));
}

// totais do mês pelos dois caminhos
const totRs = Object.values(agg).reduce((s,o)=>s+o.rs,0);
const totKm = Object.values(agg).reduce((s,o)=>s+o.km,0);
console.log(`\ntotal ${vig} pela Base CTEs: ΣS ${totRs.toFixed(2)} ÷ ΣZ ${totKm.toFixed(0)} = ${totKm?(totRs/totKm).toFixed(4):'—'}`);

// ── S é taxa ou valor? linhas cruas + as três contas possíveis ──
console.log('\n\n=== S "R$/KM Combustível" é taxa ou valor? ===');
const porPlaca = {};
ctes.rows.forEach(r => {
  const p = placaKey(r[2]); if(!p || vigDe(r[3]) !== vig) return;
  (porPlaca[p] || (porPlaca[p] = [])).push(r);
});
const remO = {}, remT = {};
brem.rows.forEach(r => {
  if(vigDe(r[0]) !== vig) return;
  const p = placaKey(r[3]); if(!p) return;
  remO[p] = +r[14] || 0; remT[p] = +r[19] || 0;
});
Object.keys(porPlaca).slice(0,3).forEach(p => {
  const rs = porPlaca[p];
  const uniqS = [...new Set(rs.map(r => +r[18] || 0))];
  const sumS = rs.reduce((a,r)=>a+(+r[18]||0),0);
  const sumZ = rs.reduce((a,r)=>a+(+r[25]||0),0);
  const sumSZ = rs.reduce((a,r)=>a+(+r[18]||0)*(+r[25]||0),0);
  console.log(`\n${p} — ${rs.length} CTEs`);
  console.log(`  valores distintos de S: ${uniqS.slice(0,6).map(v=>v.toFixed(4)).join(' ')}${uniqS.length>6?' …('+uniqS.length+')':''}`);
  console.log(`  ΣS=${sumS.toFixed(2)}  ΣZ=${sumZ.toFixed(1)} km  Σ(S×Z)=${sumSZ.toFixed(2)}`);
  console.log(`  · ΣS÷ΣZ (o que o painel faz) = ${sumZ?(sumS/sumZ).toFixed(4):'—'}`);
  console.log(`  · Σ(S×Z)÷ΣZ (taxa ponderada) = ${sumZ?(sumSZ/sumZ).toFixed(4):'—'}`);
  console.log(`  · Base Remunerado: ReaisPorKm(O)=${(remO[p]||0).toFixed(4)}  ReaisPorKmDiesel(T)=${(remT[p]||0).toFixed(4)}`);
  console.log('  primeiras linhas  [H frete/km · I frete · J km viagem · S R$/km comb · Z km rodado]:');
  rs.slice(0,4).forEach(r => console.log(`    H=${r[7]} I=${r[8]} J=${r[9]} S=${r[18]} Z=${r[25]}`));
});

// A soma dos sete R$/KM da CTE bate com o ReaisPorKm (O) da Base Remunerado?
console.log('\n=== ΣR$/KM dos 7 componentes da CTE × ReaisPorKm (O) ===');
Object.keys(porPlaca).slice(0,6).forEach(p => {
  const r = porPlaca[p][0];
  const comp = [18,19,20,21,22,23,24].reduce((a,i)=>a+(+r[i]||0),0);
  console.log(`  ${p}: CTE Σcomponentes=${comp.toFixed(4)} × Rem O=${(remO[p]||0).toFixed(4)}` +
    (Math.abs(comp-(remO[p]||0))<0.005 ? '  ✔ bate' : '  ✘'));
});
