// ============================================================
// Árvore de Combustível — por que um projeto não puxa (só leitura).
//
// Renan (24/08/2026): filtrando EMPURRADA, os cards R$/Litro e KM/L vêm
// 0,00, enquanto Custo e KM Rodado trazem valor. Os quatro cards vêm de
// fontes diferentes:
//   Custo      → aba Frota    (Visão Financeira)   · coluna Nível 3
//   KM Rodado  → Dispersão de km                   · coluna Projeto
//   KM/L e R$/L→ aba Km/L (workbook Consumo)       · coluna Projeto
// O filtro de projeto compara o PREFIXO do rótulo ("EMPURRADA - CBA" →
// "EMPURRADA"). Se a aba Km/L escreve o projeto de outro jeito, o filtro não
// casa e os dois cards zeram. Este script imprime os rótulos de cada fonte
// para mostrar onde está a diferença.
//
// Uso: node scripts/arvore-comb-inspect.mjs   (sem segredo — abas públicas)
// ============================================================
const VF_ID  = '1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8'; // Frota (custo)
const GV_ID  = '1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM'; // Dispersão de km
const KML_ID = '1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A'; // Km/L e R$/L

const parse = t => { const s = t.indexOf('{'), e = t.lastIndexOf('}'); return JSON.parse(t.slice(s, e + 1)); };
const cell = c => !c ? '' : (c.f != null ? String(c.f) : (c.v == null ? '' : String(c.v)));
const prefixo = v => v ? String(v).split('-')[0].trim() : '';
const sufixo  = v => { const s = v && v.includes('-') ? v.split('-').slice(1).join('-').trim() : ''; return s.replace(/\s*\(INATIVO\)\s*/i, '').trim(); };

async function aba(id, nome) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?sheet=${encodeURIComponent(nome)}&tqx=out:json`;
  const j = parse(await (await fetch(url)).text());
  if (j.status !== 'ok') throw new Error(`${nome}: ${JSON.stringify(j.errors || {})}`);
  return { cols: (j.table.cols || []).map(c => c.label || c.id || ''), rows: j.table.rows || [] };
}
const acha = (cols, ...nomes) => cols.findIndex(c => nomes.some(n => String(c).toLowerCase().includes(n)));

function relatorio(rot, cols, rows, iProj, iNum) {
  const cont = new Map();
  rows.forEach(r => {
    const v = cell(r.c?.[iProj]).trim(); if (!v) return;
    const n = iNum >= 0 ? (parseFloat(String(cell(r.c?.[iNum])).replace(/\./g, '').replace(',', '.')) || 0) : 0;
    const o = cont.get(prefixo(v)) || { linhas: 0, valor: 0, exemplos: new Set() };
    o.linhas++; o.valor += n; if (o.exemplos.size < 3) o.exemplos.add(v);
    cont.set(prefixo(v), o);
  });
  console.log(`\n── ${rot} (coluna "${cols[iProj]}") ──`);
  [...cont.entries()].sort((a, b) => b[1].linhas - a[1].linhas).forEach(([p, o]) =>
    console.log(`  ${p.padEnd(22)} ${String(o.linhas).padStart(6)} linha(s)  ex.: ${[...o.exemplos].join(' · ')}`));
  return new Set(cont.keys());
}

const fr = await aba(VF_ID, 'Frota');
const dp = await aba(GV_ID, 'Dispersão de km');
const km = await aba(KML_ID, 'Km/L');

const pFr = relatorio('Custo — aba Frota', fr.cols, fr.rows, acha(fr.cols, 'nível 3', 'nivel 3', 'nivel3'), -1);
const pDp = relatorio('KM Rodado — Dispersão de km', dp.cols, dp.rows, acha(dp.cols, 'projeto'), -1);
const iKmProj = acha(km.cols, 'projeto');
const pKm = relatorio('KM/L e R$/L — aba Km/L', km.cols, km.rows, iKmProj, acha(km.cols, 'km rodado'));

console.log('\nCOLUNAS da aba Km/L:', JSON.stringify(km.cols));

const falta = [...pFr, ...pDp].filter(p => p && !pKm.has(p));
console.log('\n── projetos que existem em Custo/KM Rodado e NÃO na aba Km/L ──');
console.log(falta.length ? [...new Set(falta)].join(' · ') : '(nenhum — os rótulos batem)');

// olhar de perto o que a aba Km/L tem quando o assunto é empurrada
console.log('\n── linhas da aba Km/L cujo projeto menciona "EMPURRAD" ──');
const alvo = km.rows.filter(r => /EMPURRAD/i.test(cell(r.c?.[iKmProj])));
console.log(`${alvo.length} linha(s)`);
alvo.slice(0, 5).forEach(r => console.log('  ' + km.cols.map((c, i) => `${c}=${cell(r.c?.[i])}`).slice(0, 12).join(' | ')));
