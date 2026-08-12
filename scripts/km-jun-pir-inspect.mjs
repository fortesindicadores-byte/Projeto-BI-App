// Duas perguntas do Renan sobre o /painel-km/ (frota, não Seara):
//  1. junho some do gráfico "Dispersão de KM %" quando a empurrada sai do filtro;
//  2. PIR aparece com Δ km NEGATIVO e Impacto POSITIVO na tabela por unidade.
//
// O painel não calcula o impacto: ele soma a coluna 36 da aba, linha a linha.
// Aqui reproduzimos a leitura do painel (parseRow) e olhamos os números crus.
const SHEET_ID  = '1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM';
const SHEET_TAB = 'Dispersão de km';
const VIG = process.env.VIG || '';        // 'MM/AAAA'; vazio = última com dado

const A1 = i => { let s='', n=i; do { s = String.fromCharCode(65 + n%26) + s; n = Math.floor(n/26)-1; } while(n>=0); return s; };
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const br  = v => Math.round(v).toLocaleString('pt-BR');

const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_TAB)}`;
const txt = await (await fetch(url)).text();
const json = JSON.parse(txt.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
const cols = (json.table.cols||[]).map(c => String((c && (c.label||c.id))||'').trim());
console.log('=== colunas que o painel usa ===');
[[5,'kmFrota'],[13,'und'],[14,'proj-und'],[22,'viagens'],[31,'rem'],[32,'real'],[36,'imp']]
  .forEach(([i,nome]) => console.log(`  ${A1(i).padEnd(3)} [${String(i).padStart(2)}] ${nome.padEnd(9)} → "${cols[i]||''}"`));

// mesma leitura do painel
function parseVigCell(cell){
  if(!cell || cell.v == null) return '';
  const s = String(cell.v);
  const m = s.match(/Date\((\d+),(\d+)/);
  if(m) return String(+m[2]+1).padStart(2,'0') + '/' + m[1];
  if(cell.f) return String(cell.f).trim();
  return s.trim();
}
const linhas = (json.table.rows||[]).map(row => {
  const v = i => (row.c && row.c[i] && row.c[i].v != null) ? row.c[i].v : 0;
  const s = i => (row.c && row.c[i] && row.c[i].v) ? String(row.c[i].v).trim() : '';
  const vig = row.c ? parseVigCell(row.c[0]) : '';
  return { vig,
    und:  (s(14)||'').includes('-') ? s(14).split('-').slice(1).join('-').trim() : s(13),
    proj: (s(14)||'').split('-')[0].trim(),
    rem: num(v(31)), real: num(v(32)), imp: num(v(36)) };
}).filter(r => r.vig && (r.rem > 0 || r.real > 0));

console.log(`\nlinhas úteis: ${linhas.length}`);
const projs = [...new Set(linhas.map(r => r.proj))].sort();
console.log('projetos:', projs.join(' · '));

// ── 1. junho, com e sem empurrada ──
const ehEmpurrada = p => /empurrad/i.test(p);
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
for(const [rotulo, filtro] of [['TODOS os projetos', () => true], ['SEM empurrada', r => !ehEmpurrada(r.proj)]]){
  console.log(`\n=== mês a mês · ${rotulo} ===`);
  console.log('mês |   linhas |         rem |        real |      Δ km |     Δ %  |     Σ impacto');
  for(let m = 1; m <= 12; m++){
    const rs = linhas.filter(r => +r.vig.split('/')[0] === m && filtro(r));
    if(!rs.length) continue;
    const rem = rs.reduce((a,r)=>a+r.rem,0), real = rs.reduce((a,r)=>a+r.real,0), imp = rs.reduce((a,r)=>a+r.imp,0);
    const dpct = rem ? ((real-rem)/Math.abs(rem)*100).toFixed(1)+'%' : 'REM=0 → o painel devolve null';
    console.log(`${MESES[m-1]} |${String(rs.length).padStart(9)} |${br(rem).padStart(12)} |${br(real).padStart(12)} |` +
      `${br(real-rem).padStart(10)} |${String(dpct).padStart(9)} |${br(imp).padStart(14)}`);
  }
}

// ── 2. PIR: Δ negativo com impacto positivo ──
const vigs = [...new Set(linhas.map(r => r.vig))]
  .sort((a,b) => (a.slice(-4)+a.slice(0,2)).localeCompare(b.slice(-4)+b.slice(0,2)));
const vig = VIG || vigs[vigs.length-1];
console.log(`\n=== PIR em ${vig} — por que Δ<0 e impacto>0 ===`);
const pir = linhas.filter(r => r.vig === vig && /^PIR/i.test(r.und));
const somaD = pir.reduce((a,r)=>a+(r.real-r.rem),0), somaI = pir.reduce((a,r)=>a+r.imp,0);
console.log(`linhas: ${pir.length} · Σ(real−rem) = ${br(somaD)} km · Σ impacto = ${br(somaI)}`);
const discord = pir.filter(r => (r.real-r.rem) < 0 && r.imp > 0);
console.log(`linhas com Δ NEGATIVO e impacto POSITIVO: ${discord.length}`);
console.log('\nprojeto              |       rem |      real |     Δ km |     impacto |  R$/km implícito');
pir.slice().sort((a,b)=>(a.real-a.rem)-(b.real-b.rem)).slice(0,15).forEach(r => {
  const d = r.real - r.rem;
  console.log(`${(r.proj||'—').slice(0,20).padEnd(20)} |${br(r.rem).padStart(10)} |${br(r.real).padStart(10)} |` +
    `${br(d).padStart(9)} |${br(r.imp).padStart(12)} |${(d ? (r.imp/d).toFixed(3) : '—').padStart(17)}`);
});
// o impacto da planilha acompanha o sinal do desvio?
const comD = linhas.filter(r => r.vig === vig && (r.real-r.rem) !== 0 && r.imp !== 0);
const mesmoSinal = comD.filter(r => Math.sign(r.real-r.rem) === Math.sign(r.imp)).length;
console.log(`\nno mês inteiro: ${mesmoSinal}/${comD.length} linhas têm impacto com o MESMO sinal do desvio ` +
  `(${Math.round(mesmoSinal/comD.length*100)}%)`);
