// ============================================================
// Aba Km/L (workbook Consumo) — o que está chegando pelo gviz.
//
// A auditoria da Árvore de Combustível (24/08/2026) devolveu só 32 linhas da
// aba Km/L, todas com Projeto "ROTA - MCC" — enquanto Custo e KM Rodado têm
// milhares. Antes de mexer em qualquer painel é preciso saber se a aba está
// assim mesmo ou se o gviz está entregando um pedaço.
//
// Testa três formas de pedir a mesma aba e mostra o que cada uma devolve.
// Uso: node scripts/kml-aba-inspect.mjs   (abas públicas, sem segredo)
// ============================================================
const KML_ID = '1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';

const parse = t => { const s = t.indexOf('{'), e = t.lastIndexOf('}'); return JSON.parse(t.slice(s, e + 1)); };
const cell = c => !c ? '' : (c.f != null ? String(c.f) : (c.v == null ? '' : String(c.v)));

async function pede(rot, url) {
  const txt = await (await fetch(url)).text();
  const j = parse(txt);
  if (j.status !== 'ok') { console.log(`${rot}: status=${j.status} ${JSON.stringify(j.errors || {})}`); return null; }
  const cols = (j.table.cols || []).map(c => c.label || c.id || '');
  const rows = j.table.rows || [];
  console.log(`${rot}: ${rows.length} linha(s) · ${cols.length} coluna(s) · ${(txt.length / 1024).toFixed(0)} kB`);
  return { cols, rows };
}

const base = `https://docs.google.com/spreadsheets/d/${KML_ID}/gviz/tq`;
console.log('── a mesma aba, pedida de três jeitos ──');
const a = await pede('sheet=Km/L (o que o painel faz)', `${base}?sheet=${encodeURIComponent('Km/L')}&tqx=out:json`);
await pede('sheet=Km/L + headers=1          ', `${base}?sheet=${encodeURIComponent('Km/L')}&tqx=out:json&headers=1`);
await pede('sheet=Km/L + tq=select *        ', `${base}?sheet=${encodeURIComponent('Km/L')}&tqx=out:json&tq=${encodeURIComponent('select *')}`);

if (!a) process.exit(0);
const { cols, rows } = a;
console.log('\nCOLUNAS:', JSON.stringify(cols));

const idx = n => cols.findIndex(c => String(c).toLowerCase().includes(n));
const iVig = idx('vig'), iProj = idx('projeto'), iUni = idx('unidade'), iAtivo = idx('ativo'),
      iKm = idx('km rodado'), iLit = idx('litro');

const conta = (rot, i) => {
  if (i < 0) { console.log(`\n${rot}: coluna não encontrada`); return; }
  const m = new Map();
  rows.forEach(r => { const v = cell(r.c?.[i]).trim() || '(vazio)'; m.set(v, (m.get(v) || 0) + 1); });
  console.log(`\n${rot} (${m.size} valor(es)):`);
  [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 25)
    .forEach(([v, n]) => console.log(`  ${v.padEnd(28)} ${String(n).padStart(6)}`));
};
conta('Vigência', iVig);
conta('Projeto', iProj);
conta('Unidade', iUni);
conta('Ativo', iAtivo);

console.log('\nPRIMEIRAS 3 LINHAS:');
rows.slice(0, 3).forEach(r => console.log('  ' + cols.map((c, i) => `${c}=${cell(r.c?.[i])}`).join(' | ')));
console.log('\nÚLTIMAS 3 LINHAS:');
rows.slice(-3).forEach(r => console.log('  ' + cols.map((c, i) => `${c}=${cell(r.c?.[i])}`).join(' | ')));

if (iKm >= 0 && iLit >= 0) {
  const num = v => parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0;
  const km = rows.reduce((s, r) => s + num(cell(r.c?.[iKm])), 0);
  const lit = rows.reduce((s, r) => s + num(cell(r.c?.[iLit])), 0);
  console.log(`\nSoma km=${km.toLocaleString('pt-BR')} · litros=${lit.toLocaleString('pt-BR')} · km/L=${lit ? (km / lit).toFixed(2) : '—'}`);
}
