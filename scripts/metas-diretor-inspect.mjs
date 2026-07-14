// Dump das abas do workbook "Metas Diretor" para planejar o painel.
// Roda via GitHub Actions (o sandbox não alcança docs.google).
const ID = '1lZixK13JKO4zKUJZ5CwdqcPyPLKQDVGxa1o2v1t_tN8';

const TABS = [
  { name: 'Regras',       q: 'gid=0' },
  { name: 'Indicador 1',  q: 'gid=410676465' },
  { name: 'Indicador 2',  q: 'gid=1177655149' },
  { name: 'Indicador 3',  q: 'gid=1358349252' },
  { name: 'Indicador 4',  q: 'gid=1055877945' },
  { name: 'Indicador 5',  q: 'gid=523073816' },
  { name: 'Ebitda',       q: 'sheet=' + encodeURIComponent('Ebitda') },
  { name: 'Perdas',       q: 'sheet=' + encodeURIComponent('Perdas') },
];

function parse(txt) {
  const s = txt.indexOf('{');
  const e = txt.lastIndexOf('}');
  return JSON.parse(txt.slice(s, e + 1));
}

function cellVal(c) {
  if (!c) return '';
  if (c.v == null) return '';
  return String(c.v);
}

async function dump(tab) {
  const url = `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?${tab.q}&tqx=out:json`;
  console.log('\n\n============================================================');
  console.log(`ABA: ${tab.name}   (${tab.q})`);
  console.log('============================================================');
  let r;
  try {
    r = await fetch(url);
  } catch (e) {
    console.log('  ERRO fetch:', e.message);
    return;
  }
  if (!r.ok) { console.log('  HTTP', r.status); return; }
  const txt = await r.text();
  let j;
  try { j = parse(txt); } catch (e) { console.log('  ERRO parse:', e.message, '\n  raw:', txt.slice(0, 300)); return; }
  if (j.status !== 'ok') { console.log('  status:', j.status, JSON.stringify(j.errors || {})); return; }
  const cols = (j.table.cols || []).map((c, i) => `[${i}] ${c.label || c.id || ''}${c.type ? ' <' + c.type + '>' : ''}`);
  console.log('COLUNAS (', cols.length, '):');
  cols.forEach(c => console.log('   ', c));
  const rows = j.table.rows || [];
  console.log('LINHAS:', rows.length);
  const n = Math.min(rows.length, 25);
  console.log(`\nPRIMEIRAS ${n} LINHAS:`);
  for (let i = 0; i < n; i++) {
    const cells = (rows[i].c || []).map(cellVal);
    console.log(`  r${i}: ` + cells.map((v, idx) => v !== '' ? `${idx}=${v}` : null).filter(Boolean).join(' | '));
  }
}

for (const t of TABS) {
  await dump(t);
}
console.log('\n\nFIM.');
