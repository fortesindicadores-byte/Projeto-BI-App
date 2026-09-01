// ============================================================
// Contratos Man. (locação de veículos por contrato) — o que a aba entrega.
//
// Planilha que o Renan indicou em 01/09/2026 como fonte provisória do custo
// de CONTRATO por mês (o definitivo virá do ERP). Layout em BLOCOS: as três
// primeiras colunas identificam a linha (nº Contrato · Unidade · Placa) e
// depois vem um bloco de colunas POR MÊS — a linha 1 traz o mês mesclado
// ("mar.-26", "jun.-26"…) e a linha 2 os rótulos do bloco (Km Informado ·
// desloc. · lanç km/vlr · NF · STATUS).
//
// Esta auditoria mostra: os rótulos das duas primeiras linhas, quais blocos
// de mês existem, e o total de "lanç km/vlr" por mês e por unidade — que é
// o número que vai compor o custo de contrato na Carta de Custos.
//
// Uso: node scripts/contratos-man-inspect.mjs   (planilha pública, sem segredo)
// ============================================================
const SHEET = process.env.CONTRATOS_ID || '1FOIUgEKtOdTrNUyOYd8wk5Cyur6cFIf7-COr_l4hEsI';
const GID   = process.env.CONTRATOS_GID || '0';

const parse = t => { const s = t.indexOf('{'), e = t.lastIndexOf('}'); return JSON.parse(t.slice(s, e + 1)); };
const cell  = c => !c ? '' : (c.f != null ? String(c.f) : (c.v == null ? '' : String(c.v)));
const num   = v => {
  const s = String(v == null ? '' : v).replace(/R\$|\s| /g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};

const url = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq`
  + `?gid=${GID}&tqx=out:json&headers=0&tq=${encodeURIComponent('select *')}`;
const txt = await (await fetch(url)).text();
const j = parse(txt);
if (j.status !== 'ok') { console.log('gviz:', j.status, JSON.stringify(j.errors || {})); process.exit(1); }

const rows = (j.table.rows || []).map(r => (r.c || []).map(cell));
const nCols = (j.table.cols || []).length;
console.log(`${rows.length} linha(s) · ${nCols} coluna(s) · ${(txt.length / 1024).toFixed(0)} kB`);

// ── as duas primeiras linhas: mês mesclado (L1) + rótulos do bloco (L2) ──
const L1 = rows[0] || [], L2 = rows[1] || [];
console.log('\nLINHA 1 (mês do bloco — só as células preenchidas):');
L1.forEach((v, i) => { if (String(v).trim()) console.log(`   col ${i}: ${v}`); });
console.log('\nLINHA 2 (rótulos):');
console.log('   ' + L2.map((v, i) => `${i}:${v}`).join(' | '));

// ── monta os blocos: o rótulo do mês vale até o próximo rótulo preenchido ──
const blocos = [];
let mesAtual = null;
for (let i = 0; i < nCols; i++) {
  const m = String(L1[i] || '').trim();
  if (m) { mesAtual = m; blocos.push({ mes: m, ini: i, cols: {} }); }
  const rot = String(L2[i] || '').trim().toLowerCase();
  if (blocos.length && mesAtual) {
    const b = blocos[blocos.length - 1];
    if (/^km informado/.test(rot))       b.cols.km = i;
    else if (/^desloc/.test(rot))        b.cols.desloc = i;
    else if (/lan(ç|c).*km|km\/vlr/.test(rot)) b.cols.valor = i;
    else if (/^nf$/.test(rot))           b.cols.nf = i;
    else if (/^status/.test(rot))        b.cols.status = i;
  }
}
console.log(`\nBLOCOS DE MÊS: ${blocos.length}`);
blocos.forEach(b => console.log(`   ${String(b.mes).padEnd(10)} col ini=${b.ini} · ${JSON.stringify(b.cols)}`));

// ── dados: da linha 3 em diante ──
const dados = rows.slice(2).filter(r => String(r[2] || '').trim());   // tem placa
console.log(`\nlinhas de veículo: ${dados.length}`);

const unis = new Map();
dados.forEach(r => { const u = String(r[1] || '(vazio)').trim(); unis.set(u, (unis.get(u) || 0) + 1); });
console.log(`\nUNIDADES na coluna B (${unis.size}):`);
[...unis.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([u, n]) => console.log(`   ${u.padEnd(28)} ${String(n).padStart(5)} placa(s)`));

// ── total lançado por mês (e quantas linhas têm valor) ──
console.log('\nTOTAL "lanç km/vlr" POR MÊS:');
for (const b of blocos) {
  if (b.cols.valor == null) { console.log(`   ${String(b.mes).padEnd(10)} (sem coluna de valor)`); continue; }
  let soma = 0, com = 0, semKm = 0;
  dados.forEach(r => {
    const v = num(r[b.cols.valor]);
    if (v) { soma += v; com++; }
    if (b.cols.km != null && !String(r[b.cols.km] || '').trim()) semKm++;
  });
  console.log(`   ${String(b.mes).padEnd(10)} R$ ${soma.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(14)}`
    + ` · ${String(com).padStart(4)}/${dados.length} linha(s) com valor · ${semKm} sem km informado`);
}

// ── por unidade × mês: é assim que a Carta de Custos vai consumir ──
const meses = blocos.filter(b => b.cols.valor != null);
console.log('\nPOR UNIDADE × MÊS (R$ lançado):');
console.log('   ' + 'unidade'.padEnd(28) + meses.map(b => String(b.mes).padStart(14)).join(''));
[...unis.keys()].sort().forEach(u => {
  const linhas = dados.filter(r => String(r[1] || '(vazio)').trim() === u);
  const cels = meses.map(b => {
    const s = linhas.reduce((a, r) => a + num(r[b.cols.valor]), 0);
    return (s ? s.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—').padStart(14);
  });
  console.log('   ' + u.padEnd(28) + cels.join(''));
});

// ── amostra das 3 primeiras linhas, bloco a bloco ──
console.log('\nAMOSTRA (3 primeiras linhas):');
dados.slice(0, 3).forEach(r => {
  console.log(`   contrato=${r[0]} · unidade=${r[1]} · placa=${r[2]}`);
  blocos.forEach(b => {
    const g = k => b.cols[k] != null ? r[b.cols[k]] : '';
    console.log(`      ${String(b.mes).padEnd(10)} km=${String(g('km')).padEnd(9)} desloc=${String(g('desloc')).padEnd(8)}`
      + ` valor=${String(g('valor')).padEnd(13)} nf=${String(g('nf')).padEnd(7)} status=${g('status')}`);
  });
});
