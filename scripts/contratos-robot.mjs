// ============================================================
// Robô Contratos → Carta de Custos (01/09/2026)
//
// Sobe o custo de CONTRATO (manutenção por km rodado) da planilha
// "Contratos Man." para a tabela `carta_custos`, uma linha por placa.
//
// REGRA DO RENAN (01/09/2026): "leia sempre o valor do mês para compor o
// custo com contrato do MÊS SEGUINTE" — o que a unidade informa agora, no
// começo de agosto, é o realizado de SETEMBRO. Por isso a vigência gravada
// é sempre o mês do bloco + 1.
//
// Fonte provisória: a planilha do time. O definitivo virá do ERP (o km dos
// abastecimentos), quando a conta passa a ser hodômetro atual − km informado.
//
// ARMADILHAS da planilha (achadas na auditoria, ver contratos-man-inspect):
//  · locale INGLÊS — "R$ 2,563.21" tem vírgula de milhar; usar o .v do gviz;
//  · o gviz tipa a coluna: rótulo de texto em coluna numérica volta nulo, então
//    o bloco do mês é lido por POSIÇÃO (km · desloc · valor · [NF] · status).
//
// IDEMPOTENTE: cada linha carrega `origem_chave` = contrato:<vig>:<placa>, e a
// gravação é upsert por essa chave — rodar de novo corrige valores em vez de
// duplicar, e não encosta em lançamento digitado à mão.
//
// Modos (env CT_MODE): previa (padrão, NÃO grava) · gravar
// Uso: node scripts/contratos-robot.mjs
// ============================================================
const SHEET = process.env.CONTRATOS_ID || '1FOIUgEKtOdTrNUyOYd8wk5Cyur6cFIf7-COr_l4hEsI';
const GID   = process.env.CONTRATOS_GID || '0';
const MODE  = (process.env.CT_MODE || 'previa').toLowerCase();
const SO_VIG = (process.env.CT_VIG || '').trim();          // ex.: 2026-08 (vazio = todas)
const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY = process.env.GEM_SUPABASE_SERVICE_KEY || '';

const PACOTE = 'Manutenção';
const CONTA  = 'Contratos de Manutenção Fabricante';   // conta do DRE p/ contrato
const GRUPO  = 'Contrato';

const parse = t => { const s = t.indexOf('{'), e = t.lastIndexOf('}'); return JSON.parse(t.slice(s, e + 1)); };
const txtOf = c => !c ? '' : (c.f != null ? String(c.f) : (c.v == null ? '' : String(c.v)));
const numOf = c => (c && typeof c.v === 'number' && isFinite(c.v)) ? c.v : 0;
const brl   = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NK = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const MES3 = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12,
               feb:2, apr:4, may:5, aug:8, sep:9, oct:10, dec:12 };
function mesDoRotulo(s) {
  const m = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .match(/([a-z]{3})[a-z.]*[\s\-\/]+(\d{2,4})/);
  if (!m || !MES3[m[1]]) return null;
  return { ano: +m[2] < 100 ? 2000 + +m[2] : +m[2], mes: MES3[m[1]] };
}
const vigDe   = ({ ano, mes }) => `${ano}-${String(mes).padStart(2, '0')}-01`;
const proxVig = ({ ano, mes }) => mes === 12 ? vigDe({ ano: ano + 1, mes: 1 }) : vigDe({ ano, mes: mes + 1 });
const MESLBL = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const refLbl = ({ ano, mes }) => `${MESLBL[mes - 1]}/${String(ano).slice(2)}`;

// ── de-para: "Campo Grande Rota" → unidade do portal + projeto ──────────────
// A base vira o código (o mesmo FIL2COD do portal) e o sufixo diz o projeto;
// em CBA e MCC o projeto também decide o tier, como no resto do sistema.
const BASE2COD = {
  'CAMPO GRANDE': 'CGR', 'RIO DE JANEIRO': 'CGR',
  'FLORIANOPOLIS': 'FLP', 'FLORIPA': 'FLP',
  'GUARULHOS': 'GRL',
  'BALNEARIO': 'BLC', 'BALNEARIO CAMBORIU': 'BLC', 'CAMBORIU': 'BLC',
  'PELOTAS': 'PLT',
  'PIRAI': 'PIR',
  'MACACU': 'MCC', 'CACHOEIRAS DE MACACU': 'MCC',
  'RONDONOPOLIS': 'RON',
  'CUIABA': 'CBA',
  'NOVA FRIBURGO': 'NFR', 'FRIBURGO': 'NFR',
};
function deParaUnidade(txt) {
  const s = NK(txt).replace(/\s*-\s*/g, ' ');
  if (!s) return null;
  let proj = 'ROTA';
  if (/\bEMPURRAD/.test(s)) proj = 'EMPURRADA';
  else if (/\bAS\b|AUTO SERVICO/.test(s)) proj = 'AUTO SERVIÇO';
  else if (/\bAPOIO\b|\bWH\b/.test(s)) proj = 'APOIO';
  const base = s.replace(/\b(ROTA|AS|AUTO SERVICO|EMPURRADA|APOIO|WH)\b/g, '').replace(/\s+/g, ' ').trim();
  const cod = BASE2COD[base];
  if (!cod) return null;
  let unidade = cod;
  if (cod === 'CBA') unidade = proj === 'EMPURRADA' ? 'CBA T1' : proj === 'APOIO' ? 'CBA T1 WH' : 'CBA T2';
  if (cod === 'MCC') unidade = proj === 'EMPURRADA' ? 'MCC T1' : 'MCC T2';
  return { unidade, projeto: proj };
}

// ── leitura da planilha ────────────────────────────────────────────────────
const url = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq`
  + `?gid=${GID}&tqx=out:json&headers=0&tq=${encodeURIComponent('select *')}`;
const j = parse(await (await fetch(url)).text());
if (j.status !== 'ok') { console.error('gviz:', j.status, JSON.stringify(j.errors || {})); process.exit(1); }

const rows  = (j.table.rows || []).map(r => r.c || []);
const nCols = (j.table.cols || []).length;
const L1 = rows[0] || [];

// blocos por posição; o tamanho do bloco vem do próximo rótulo de mês.
// bloco de 5 colunas tem NF (km · desloc · valor · nf · status), o de 4 não.
const marcos = [];
for (let i = 0; i < nCols; i++) { const r = txtOf(L1[i]).trim(); if (r) marcos.push({ rot: r, ini: i }); }
const blocos = marcos.map((m, k) => {
  const fim = k + 1 < marcos.length ? marcos[k + 1].ini : nCols;
  const largura = fim - m.ini;
  return { rot: m.rot, mv: mesDoRotulo(m.rot), km: m.ini, desloc: m.ini + 1, valor: m.ini + 2,
           nf: largura >= 5 ? m.ini + 3 : null, largura };
}).filter(b => b.mv);

const dados = rows.slice(2).filter(r => txtOf(r[2]).trim());
console.log(`planilha: ${dados.length} veículo(s) · ${blocos.length} bloco(s) de mês`);
blocos.forEach(b => console.log(`   ${b.rot.padEnd(10)} ${b.largura} coluna(s)`
  + `${b.nf == null ? ' (sem NF)' : ''} → vigência ${proxVig(b.mv)}`));

// ── monta os lançamentos ───────────────────────────────────────────────────
const semDePara = new Map();
const linhas = [];
for (const b of blocos) {
  const vig = proxVig(b.mv);
  if (SO_VIG && !vig.startsWith(SO_VIG)) continue;
  for (const r of dados) {
    const valor = numOf(r[b.valor]);
    if (!(valor > 0)) continue;                                  // mês sem lançamento p/ essa placa
    const uni = deParaUnidade(txtOf(r[1]));
    if (!uni) { const k = txtOf(r[1]).trim(); semDePara.set(k, (semDePara.get(k) || 0) + 1); continue; }
    const placa = txtOf(r[2]).toUpperCase().trim();
    const contrato = txtOf(r[0]).trim();
    const nf = b.nf != null ? txtOf(r[b.nf]).trim() : '';
    linhas.push({
      origem: 'contratos-planilha',
      origem_chave: `contrato:${vig}:${placa}`,
      unidade: uni.unidade, vigencia: vig, pacote: PACOTE, projeto: uni.projeto,
      data: vig, equipamento: placa, fornecedor: '',
      // contrato não passa por RC/OC: é faturamento fechado por km. Entra com
      // as duas aprovações dadas e a NF da planilha; sem NF na planilha, o
      // documento é o próprio nº do contrato (senão a linha não conta no
      // realizado — `counts` exige NF + valor).
      rc: 'N/A', oc: 'N/A', nf: nf || contrato || 'CONTRATO',
      conta: CONTA, grupo: GRUPO,
      descricao: `Contrato ${contrato} · ref ${refLbl(b.mv)}`,
      valor, aprovado: true, aprovado_oc: true,
    });
  }
}

// ── resumo do que seria gravado ────────────────────────────────────────────
const porVig = new Map();
linhas.forEach(l => {
  const t = porVig.get(l.vigencia) || { n: 0, v: 0, unis: new Map() };
  t.n++; t.v += l.valor;
  t.unis.set(l.unidade, (t.unis.get(l.unidade) || 0) + l.valor);
  porVig.set(l.vigencia, t);
});
console.log(`\nLANÇAMENTOS: ${linhas.length}`);
[...porVig.entries()].sort().forEach(([v, t]) => {
  console.log(`\n   vigência ${v} · ${t.n} lançamento(s) · ${brl(t.v)}`);
  [...t.unis.entries()].sort((a, b) => b[1] - a[1])
    .forEach(([u, s]) => console.log(`      ${u.padEnd(10)} ${brl(s).padStart(16)}`));
});
if (semDePara.size) {
  console.log('\nUNIDADES SEM DE-PARA (linhas ignoradas — ajustar BASE2COD):');
  [...semDePara.entries()].forEach(([u, n]) => console.log(`   ${u} → ${n} linha(s)`));
}

if (MODE !== 'gravar') {
  console.log('\nmodo prévia — nada foi gravado. Rode com modo=gravar para subir.');
  process.exit(0);
}
if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }

// ── grava (upsert por origem_chave) ────────────────────────────────────────
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
let gravadas = 0;
for (let i = 0; i < linhas.length; i += 500) {
  const lote = linhas.slice(i, i + 500);
  const res = await fetch(`${SB_URL}/rest/v1/carta_custos?on_conflict=origem_chave`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(lote),
  });
  if (!res.ok) {
    const t = await res.text();
    if (/origem_chave/.test(t)) {
      console.error('\nA tabela carta_custos ainda não tem a coluna origem_chave.'
        + ' Rode scripts/contratos-carta-custos.sql no SQL Editor e tente de novo.');
    }
    throw new Error(`carta_custos: ${res.status} ${t.slice(0, 300)}`);
  }
  gravadas += lote.length;
}
console.log(`\ngravado: ${gravadas} lançamento(s) em carta_custos.`);
