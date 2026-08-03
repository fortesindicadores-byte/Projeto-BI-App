// Diagnóstico: por que "Custos de veículos e equipamentos" e "Ranking performance
// Frota - Unidades" aparecem sem Meta/Real/Ating. em JUN/26 no Painel de Metas,
// mesmo com Ating./Pontos YTD preenchidos?
// Roda via GitHub Actions (o sandbox não alcança docs.google).
const METAS_URL = 'https://docs.google.com/spreadsheets/d/1oW3mss0pXVI6gaDU2z5cDAKvW40LWHCQXpanqSvb12o/gviz/tq?gid=199351909&tqx=out:json';

function parse(txt) {
  const s = txt.indexOf('{');
  const e = txt.lastIndexOf('}');
  return JSON.parse(txt.slice(s, e + 1));
}
function cellVal(c) { if (!c) return null; return c.v; }
function parseD(v) {
  if (!v) return null;
  const m = String(v).match(/^Date\((\d+),(\d+),(\d+)/);
  if (m) return new Date(+m[1], +m[2], +m[3]);
  return null;
}

async function main() {
  const r = await fetch(METAS_URL);
  const txt = await r.text();
  const j = parse(txt);
  if (j.status !== 'ok') { console.log('status:', j.status, JSON.stringify(j.errors || {})); return; }
  const cols = (j.table.cols || []).map((c, i) => `[${i}] ${c.label || c.id || ''}`);
  console.log('COLUNAS:', cols.join(' | '));
  const rows = (j.table.rows || []).map(row => (row.c || []).map(cellVal));
  console.log('TOTAL LINHAS:', rows.length);

  console.log('\n============================================================');
  console.log('Todas as linhas com indicador contendo "Custo" ou "Ranking":');
  console.log('============================================================');
  rows.forEach((r, i) => {
    const ind = String(r[1] || '');
    if (/custo|ranking/i.test(ind)) {
      const d = parseD(r[0]);
      console.log(`  r${i}: data=${r[0]} (${d ? d.toISOString().slice(0,10) : 'INVALIDA'})  indicador="${ind}"  peso=${r[2]}  meta=${r[6]}  real=${r[7]}  atg=${r[8]}  pontos=${r[9]}`);
    }
  });

  console.log('\n============================================================');
  console.log('Todas as linhas de JUN/2026 (qualquer indicador):');
  console.log('============================================================');
  rows.forEach((r, i) => {
    const d = parseD(r[0]);
    if (d && d.getFullYear() === 2026 && d.getMonth() === 5) {
      console.log(`  r${i}: indicador="${r[1]}"  peso=${r[2]}  meta=${r[6]}  real=${r[7]}  atg=${r[8]}  pontos=${r[9]}`);
    }
  });

  console.log('\nFIM.');
}
main().catch(e => { console.error('ERRO:', e); process.exit(1); });
