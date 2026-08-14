// Por que "Gerar Desvios da RPM" não gerou nada? Reproduz o filtro do
// sincronizarRPM() (fca-preenchimento) contra a aba "Base RPM" real:
//   1. unidade precisa estar no RPM_UNIT_MAP
//   2. KPI precisa começar com IC/IV  (/^\s*I[CV]/i)
//   3. atingimento < 100%
//   4. mês ≤ mai/2026 só entra se causa/ação já preenchidas na aba
// Mostra, vigência a vigência, quantas linhas passam em cada degrau.
// Roda via Actions (o sandbox não alcança docs.google).
const SRC = 'https://docs.google.com/spreadsheets/d/1xGl1Xrk2sPS9zWghEuecFMNBHwmeLiZ02U-QpO8cDPY/gviz/tq?sheet=' + encodeURIComponent('Base RPM') + '&headers=1';

const UNITS = ['CUIABA','CUIABA EMPURRADA','CDD CUIABA','MACACU EMPURRADA','CDI MACACU','CDD RIO DE JANEIRO','CDD RONDONOPOLIS','CDD GUARULHOS','CDD FLORIANOPOLIS','CDD NOVA FRIBURGO','CDD PELOTAS','PIRAI EMPURRADA','CDD CAMBORIU'];
const N = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const UN = new Set(UNITS.map(N));

const txt = await (await fetch(SRC)).text();
const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
if (j.status !== 'ok') { console.log('gviz status:', j.status, JSON.stringify(j.errors || {})); process.exit(1); }
const cols = (j.table.cols || []).map(c => c.label || c.id || '');
const rows = (j.table.rows || []).map(r => (r.c || []).map(c => c ? (c.v != null ? c.v : c.f) : null));
console.log('COLUNAS:', cols.join(' | '));
console.log('LINHAS:', rows.length);

const idx = names => { const NN = cols.map(N); for (const nm of names) { const i = NN.indexOf(N(nm)); if (i >= 0) return i; } for (const nm of names) { const t = N(nm); const i = NN.findIndex(k => k.includes(t)); if (i >= 0) return i; } return -1; };
const ci = {
  uni: idx(['Unidade', 'Unidades', 'Operação', 'CDD', 'Loja', 'Filial']),
  vig: idx(['Vigência', 'Mês', 'Competência', 'Período', 'Data']),
  kpi: idx(['KPI', 'Indicador', 'Indicadores', 'Métrica', 'Nome do Indicador']),
  atg: idx(['% de Ating.', '% Ating', 'Atingimento', 'Aderência', 'Ating']),
  causa: idx(['Causa']), acao: idx(['Ação', 'Acao', 'Plano de Ação']),
};
console.log('ÍNDICES achados:', JSON.stringify(ci));

const vigOf = v => { const m = String(v || '').match(/Date\((\d+),(\d+)/); if (m) return m[1] + '-' + String(+m[2] + 1).padStart(2, '0');
  const d = new Date(v); return isNaN(d) ? String(v || '').trim() : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const porVig = {};
rows.forEach(r => {
  const vig = vigOf(r[ci.vig]); if (!vig) return;
  const o = porVig[vig] = porVig[vig] || { linhas: 0, uniOk: 0, icv: 0, desvio: 0, kpis: new Set(), kpisFora: new Set() };
  o.linhas++;
  if (!UN.has(N(r[ci.uni]))) return; o.uniOk++;
  const kpi = String(r[ci.kpi] || '').trim();
  if (!/^\s*I[CV]/i.test(kpi)) { o.kpisFora.add(kpi.slice(0, 40) || '(vazio)'); return; } o.icv++;
  let atg = r[ci.atg];
  if (atg != null && typeof atg !== 'number') atg = parseFloat(String(atg).replace('%', '').replace(/\./g, String(atg).includes(',') ? '' : '.').replace(',', '.'));
  if (atg != null && atg > 1.5) atg = atg / 100;
  if (atg == null || !isFinite(atg) || atg >= 1) return;
  o.desvio++; o.kpis.add(kpi.slice(0, 40));
});
Object.keys(porVig).sort().forEach(v => {
  const o = porVig[v];
  console.log(`\n${v}: ${o.linhas} linhas · unidade no mapa ${o.uniOk} · KPI começa com IC/IV ${o.icv} · DESVIO (atg<100%) ${o.desvio}`);
  if (o.desvio) console.log('   desvios:', [...o.kpis].slice(0, 10).join(' · '));
  if (o.kpisFora.size) console.log('   KPIs BARRADOS pelo prefixo IC/IV:', [...o.kpisFora].slice(0, 12).join(' · '));
});
