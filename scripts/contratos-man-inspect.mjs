// ============================================================
// Contratos Man. (locação/contrato de manutenção por km) — o que a aba entrega.
//
// Planilha que o Renan indicou em 01/09/2026 como fonte provisória do custo
// de CONTRATO por mês (o definitivo virá do ERP). Layout em BLOCOS: as três
// primeiras colunas identificam a linha (nº Contrato · Unidade · Placa) e
// depois vem um bloco de colunas POR MÊS — a linha 1 traz o mês mesclado
// ("mar.-26", "jun.-26", "Aug-26"…) e a linha 2 os rótulos do bloco
// (Km Informado · desloc. · lanç km/vlr · NF · STATUS).
//
// DUAS ARMADILHAS REAIS (01/09/2026, achadas na 1ª rodada):
//  1. A planilha está em locale INGLÊS: o texto formatado vem "R$ 2,563.21"
//     (vírgula = milhar). Ler o `.f` e converter como pt-BR virava R$ 2,56 —
//     o total do mês saía ~1000× menor. O `.v` do gviz já é o número cru.
//  2. O gviz tipa a coluna inteira: numa coluna numérica, o RÓTULO de texto
//     da linha 2 volta nulo. Por isso "Km Informado"/"desloc." só aparecem
//     nos blocos ainda vazios. O bloco é lido por POSIÇÃO (km · desloc ·
//     valor a partir da coluna do mês), com o rótulo só como conferência.
//
// Uso: node scripts/contratos-man-inspect.mjs   (planilha pública, sem segredo)
// ============================================================
const SHEET = process.env.CONTRATOS_ID || '1FOIUgEKtOdTrNUyOYd8wk5Cyur6cFIf7-COr_l4hEsI';
const GID   = process.env.CONTRATOS_GID || '0';

const parse = t => { const s = t.indexOf('{'), e = t.lastIndexOf('}'); return JSON.parse(t.slice(s, e + 1)); };
const txtOf = c => !c ? '' : (c.f != null ? String(c.f) : (c.v == null ? '' : String(c.v)));
const numOf = c => (c && typeof c.v === 'number' && isFinite(c.v)) ? c.v : 0;
const brl   = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "mar.-26" · "jun.-26" · "Aug-26" → {ano, mes}
const MES3 = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12,
               feb:2, apr:4, may:5, aug:8, sep:9, oct:10, dec:12 };
function mesDoRotulo(s) {
  const m = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .match(/([a-z]{3})[a-z.]*[\s\-\/]+(\d{2,4})/);
  if (!m || !MES3[m[1]]) return null;
  const ano = +m[2] < 100 ? 2000 + +m[2] : +m[2];
  return { ano, mes: MES3[m[1]] };
}
const vigDe = ({ ano, mes }) => `${ano}-${String(mes).padStart(2, '0')}-01`;
// REGRA DO RENAN (01/09/2026): o valor lançado num mês compõe o custo do
// MÊS SEGUINTE — o que a unidade informa agora, em agosto, é o realizado
// de setembro.
const proxVig = ({ ano, mes }) => mes === 12 ? vigDe({ ano: ano + 1, mes: 1 }) : vigDe({ ano, mes: mes + 1 });

const url = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq`
  + `?gid=${GID}&tqx=out:json&headers=0&tq=${encodeURIComponent('select *')}`;
const j = parse(await (await fetch(url)).text());
if (j.status !== 'ok') { console.log('gviz:', j.status, JSON.stringify(j.errors || {})); process.exit(1); }

const rows  = (j.table.rows || []).map(r => r.c || []);
const nCols = (j.table.cols || []).length;
console.log(`${rows.length} linha(s) · ${nCols} coluna(s)`);

const L1 = rows[0] || [], L2 = rows[1] || [];
console.log('\nLINHA 1 (mês do bloco):');
L1.forEach((c, i) => { const v = txtOf(c).trim(); if (v) console.log(`   col ${i}: ${v}  → vigência do custo: ${(mesDoRotulo(v) ? proxVig(mesDoRotulo(v)) : '??')}`); });
console.log('\nLINHA 2 (rótulos que o gviz devolve — nulos em coluna numérica):');
console.log('   ' + L2.map((c, i) => `${i}:${txtOf(c)}`).join(' | '));

// blocos por POSIÇÃO: km = coluna do mês, desloc = +1, valor = +2
const blocos = [];
for (let i = 0; i < nCols; i++) {
  const rot = txtOf(L1[i]).trim();
  if (!rot) continue;
  const mv = mesDoRotulo(rot);
  blocos.push({ rot, mv, ini: i, km: i, desloc: i + 1, valor: i + 2,
                confere: /lan(ç|c)/i.test(txtOf(L2[i + 2])) });
}
console.log(`\nBLOCOS: ${blocos.length}`);
blocos.forEach(b => console.log(`   ${b.rot.padEnd(10)} km=col${b.km} desloc=col${b.desloc} valor=col${b.valor}`
  + ` ${b.confere ? '(rótulo "lanç km/vlr" confere)' : '(rótulo não visível — coluna numérica)'}`
  + ` · vigência do custo: ${b.mv ? proxVig(b.mv) : '??'}`));

const dados = rows.slice(2).filter(r => txtOf(r[2]).trim());   // tem placa
console.log(`\nlinhas de veículo: ${dados.length}`);

const unis = new Map();
dados.forEach(r => { const u = txtOf(r[1]).trim() || '(vazio)'; unis.set(u, (unis.get(u) || 0) + 1); });
console.log(`\nUNIDADES na coluna B (${unis.size}):`);
[...unis.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([u, n]) => console.log(`   ${u.padEnd(24)} ${String(n).padStart(4)} placa(s)`));

console.log('\nTOTAL LANÇADO POR MÊS (e a vigência que ele compõe):');
for (const b of blocos) {
  let soma = 0, com = 0, comKm = 0;
  dados.forEach(r => {
    const v = numOf(r[b.valor]); if (v) { soma += v; com++; }
    if (numOf(r[b.km])) comKm++;
  });
  console.log(`   ${b.rot.padEnd(10)} ${brl(soma).padStart(18)} · ${String(com).padStart(3)}/${dados.length} com valor`
    + ` · ${String(comKm).padStart(3)} com km informado → custo de ${b.mv ? proxVig(b.mv).slice(0, 7) : '??'}`);
}

const meses = blocos.filter(b => b.mv);
console.log('\nPOR UNIDADE × MÊS (R$ lançado):');
console.log('   ' + 'unidade'.padEnd(24) + meses.map(b => String(b.rot).padStart(14)).join(''));
[...unis.keys()].sort().forEach(u => {
  const linhas = dados.filter(r => (txtOf(r[1]).trim() || '(vazio)') === u);
  const cels = meses.map(b => {
    const s = linhas.reduce((a, r) => a + numOf(r[b.valor]), 0);
    return (s ? s.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—').padStart(14);
  });
  console.log('   ' + u.padEnd(24) + cels.join(''));
});

console.log('\nAMOSTRA (3 primeiras linhas):');
dados.slice(0, 3).forEach(r => {
  console.log(`   contrato=${txtOf(r[0])} · unidade=${txtOf(r[1])} · placa=${txtOf(r[2])}`);
  blocos.forEach(b => console.log(`      ${b.rot.padEnd(10)} km=${String(numOf(r[b.km]) || '').padEnd(8)}`
    + ` desloc=${String(numOf(r[b.desloc]) || '').padEnd(7)} valor=${numOf(r[b.valor]).toFixed(2).padStart(10)}`));
});
