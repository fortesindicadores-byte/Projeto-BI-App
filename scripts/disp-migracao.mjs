// ============================================================================
//  Migração do histórico de Disponibilidade/Indisponibilidade
//  Sheets "Consolidado Geral" (link-readable, via gviz)  →  Supabase
//    aba Disponibilidade    → disp_snapshot    (fonte='sheet')
//    aba Indisponibilidade  → indisp_snapshot  (fonte='sheet')
//  Reimportável: apaga só fonte='sheet' antes de inserir (o que o app/cron
//  grava com fonte='app' nunca é tocado).
//
//  Rodar via GitHub Actions (workflow "Disp Migracao"):
//    env GEM_SUPABASE_SERVICE_KEY = service_role do projeto do portal
// ============================================================================

const SHEET_ID = '1oW3mss0pXVI6gaDU2z5cDAKvW40LWHCQXpanqSvb12o';
const SB_URL   = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY   = (process.env.GEM_SUPABASE_SERVICE_KEY || '').trim();

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── de-para nome → código (mesmo do scripts/disponibilidade-supabase.sql) ──
const NAME2COD = {
  'CDD CAMBORIU':'BLC','BALNEARIO CAMBORIU':'BLC','CAMBORIU':'BLC',
  'CDD CUIABA':'CBA T2','CUIABA':'CBA T1 WH','CUIABA EMPURRADA':'CBA T1',
  'CDD RIO DE JANEIRO':'CGR','CAMPO GRANDE':'CGR','RIO DE JANEIRO':'CGR',
  'CDD FLORIANOPOLIS':'FLP','FLORIANOPOLIS':'FLP',
  'CDD GUARULHOS':'GRL','GUARULHOS':'GRL',
  'ANHANGUERA':'ANG',
  'CDI MACACU':'MCC T2','MACACU EMPURRADA':'MCC T1','CACHOEIRAS DE MACACU':'MCC T2','MACACU':'MCC T2',
  'CDD NOVA FRIBURGO':'NFR','NOVA FRIBURGO':'NFR',
  'PIRAI EMPURRADA':'PIR','PIRAI':'PIR',
  'CDD PELOTAS':'PLT','PELOTAS':'PLT',
  'CDD RONDONOPOLIS':'RON','RONDONOPOLIS':'RON'
};
const UNMAPPED = new Set();
const normU = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
function unitCod(nome, projeto) {
  const n = normU(nome); if (!n) return null;
  let cod = NAME2COD[n];
  if (!cod) { UNMAPPED.add(n); return n; }
  const p = normU(projeto);
  if (cod.startsWith('CBA')) {
    if (/EMPURRAD/.test(p)) cod = 'CBA T1';
    else if (/APOIO|EMPILHADEIRA|ARMAZEM|\bWH\b/.test(p)) cod = 'CBA T1 WH';
    else if (/ROTA|CDD|AUTO SERVICO|VAN/.test(p)) cod = 'CBA T2';
  } else if (cod.startsWith('MCC')) {
    if (/EMPURRAD/.test(p)) cod = 'MCC T1';
    else if (/ROTA|CDI|CDD|AUTO SERVICO|VAN/.test(p)) cod = 'MCC T2';
  }
  return cod;
}

// ── gviz ──
async function gviz(sheet) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheet)}&tqx=out:json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gviz ${sheet}: HTTP ${res.status}`);
  const txt = await res.text();
  const i = txt.indexOf('('), j = txt.lastIndexOf(')');
  if (i < 0 || j < 0) throw new Error(`gviz ${sheet}: resposta inesperada (planilha não é link-readable?)`);
  const obj = JSON.parse(txt.slice(i + 1, j));
  if (obj.status !== 'ok') throw new Error(`gviz ${sheet}: ` + JSON.stringify(obj.errors || obj.status));
  return obj.table;
}
const cellText = c => {
  if (!c) return '';
  if (c.f != null && c.f !== '') return String(c.f).trim();
  if (c.v != null) return String(c.v).trim();
  return '';
};
function toDate(c) {
  if (!c) return null;
  const v = c.v != null ? String(c.v) : '';
  let m = v.match(/^Date\((\d+),(\d+),(\d+)/);
  if (m) return `${m[1]}-${String(+m[2] + 1).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  const t = cellText(c);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`; }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
}
function toInt(c) {
  if (!c) return null;
  if (typeof c.v === 'number' && isFinite(c.v)) return Math.round(c.v);
  const n = parseFloat(cellText(c).replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? Math.round(n) : null;
}
// cabeçalho: em cols[].label ou numa das 4 primeiras linhas
function findHeader(table, mustHave) {
  const rows = (table.rows || []).map(r => r.c || []);
  const fromCols = {};
  (table.cols || []).forEach((c, i) => { const t = normU(c && c.label || ''); if (t && !(t in fromCols)) fromCols[t] = i; });
  if (mustHave.every(h => h in fromCols)) return { idx: fromCols, start: 0, rows };
  for (let r = 0; r < Math.min(rows.length, 4); r++) {
    const idx = {};
    (rows[r] || []).forEach((c, i) => { const t = normU(cellText(c)); if (t && !(t in idx)) idx[t] = i; });
    if (mustHave.every(h => h in idx)) return { idx, start: r + 1, rows };
  }
  throw new Error('Cabeçalho não encontrado: ' + mustHave.join('/'));
}
const pick = (cells, idx, names) => { for (const n of names) { const k = normU(n); if (k in idx) return cells[idx[k]]; } return null; };

// ── Supabase REST (service role) ──
async function sbDelete(tbl, filtro) {
  const res = await fetch(`${SB_URL}/rest/v1/${tbl}?${filtro}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
  });
  if (!res.ok) throw new Error(`DELETE ${tbl}: ${res.status} ${await res.text()}`);
}
async function sbGet(tbl, filtro) {
  const res = await fetch(`${SB_URL}/rest/v1/${tbl}?${filtro}`, {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
  });
  if (!res.ok) throw new Error(`GET ${tbl}: ${res.status} ${await res.text()}`);
  return res.json();
}
async function sbInsert(tbl, rows) {
  const B = 1000;
  for (let i = 0; i < rows.length; i += B) {
    const res = await fetch(`${SB_URL}/rest/v1/${tbl}`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows.slice(i, i + B))
    });
    if (!res.ok) throw new Error(`INSERT ${tbl} @${i}: ${res.status} ${await res.text()}`);
    if ((i / B) % 20 === 0 || i + B >= rows.length) log(`  ${tbl}: ${Math.min(i + B, rows.length)}/${rows.length}`);
  }
}
const range = a => a.length ? `${a.reduce((m, r) => r.data < m ? r.data : m, a[0].data)} → ${a.reduce((m, r) => r.data > m ? r.data : m, a[0].data)}` : '—';

async function main() {
  if (!SB_KEY) throw new Error('GEM_SUPABASE_SERVICE_KEY ausente.');

  // ── aba Disponibilidade ──
  log('Lendo aba Disponibilidade…');
  const tD = await gviz('Disponibilidade');
  const hD = findHeader(tD, ['DATA', 'UNIDADE']);
  const DISP = [];
  for (let r = hD.start; r < hD.rows.length; r++) {
    const c = hD.rows[r];
    const data = toDate(pick(c, hD.idx, ['Data']));
    const nome = cellText(pick(c, hD.idx, ['Unidade']));
    if (!data || !nome) continue;
    const projeto = cellText(pick(c, hD.idx, ['Projeto'])) || null;
    DISP.push({
      data, unidade: unitCod(nome, projeto), unidade_nome: normU(nome), projeto,
      tipo_veiculo: cellText(pick(c, hD.idx, ['Tipo de Veiculo', 'Tipo de Veículo', 'Tipo Veiculo'])) || null,
      ativos: toInt(pick(c, hD.idx, ['Ativos'])) ?? 0,
      indisponiveis: toInt(pick(c, hD.idx, ['Indisponíveis', 'Indisponiveis'])) ?? 0,
      fonte: 'sheet'
    });
  }
  log(`Disponibilidade: ${DISP.length} linhas (${range(DISP)})`);

  // ── aba Indisponibilidade (bloco consolidado começa na coluna D) ──
  log('Lendo aba Indisponibilidade…');
  const tI = await gviz('Indisponibilidade');
  const hI = findHeader(tI, ['DATA', 'UNIDADE', 'PLACA']);
  const INDISP = [];
  for (let r = hI.start; r < hI.rows.length; r++) {
    const c = hI.rows[r];
    const data = toDate(pick(c, hI.idx, ['Data']));
    const nome = cellText(pick(c, hI.idx, ['Unidade']));
    const placa = cellText(pick(c, hI.idx, ['Placa']));
    if (!data || !nome || !placa) continue;
    const projeto = cellText(pick(c, hI.idx, ['Projeto'])) || null;
    INDISP.push({
      data, unidade: unitCod(nome, projeto), unidade_nome: normU(nome), projeto,
      data_parada_real: toDate(pick(c, hI.idx, ['Data Parada'])),   // não vai p/ o snapshot; só p/ o seed
      placa: placa.toUpperCase().replace(/\s+/g, ''),
      modelo: cellText(pick(c, hI.idx, ['Modelo de Veiculo', 'Modelo de Veículo', 'Modelo'])) || null,
      grupo: cellText(pick(c, hI.idx, ['Grupo'])) || null,
      descricao_problema: cellText(pick(c, hI.idx, ['Descrição do Problema', 'Descricao do Problema'])) || null,
      local_manutencao: cellText(pick(c, hI.idx, ['Local Manutenção', 'Local Manutencao'])) || null,
      rc_oc: cellText(pick(c, hI.idx, ['RC/OC'])) || null,
      dias_parado: toInt(pick(c, hI.idx, ['Dias Parado'])),
      status: cellText(pick(c, hI.idx, ['Status'])) || null,
      previsao_retorno: toDate(pick(c, hI.idx, ['Previsão Retorno', 'Previsao Retorno'])),
      observacao: cellText(pick(c, hI.idx, ['Observação', 'Observacao'])) || null,
      fonte: 'sheet'
    });
  }
  log(`Indisponibilidade: ${INDISP.length} linhas (${range(INDISP)})`);
  if (UNMAPPED.size) log('⚠ unidades sem código no de-para (foram com o nome):', [...UNMAPPED].join(', '));

  // ── grava as fotos (histórico) ──
  log('Apagando importação anterior (fonte=sheet)…');
  await sbDelete('disp_snapshot', 'fonte=eq.sheet');
  await sbDelete('indisp_snapshot', 'fonte=eq.sheet');
  log('Inserindo…');
  await sbInsert('disp_snapshot', DISP);
  await sbInsert('indisp_snapshot', INDISP.map(({ data_parada_real, ...r }) => r));

  // ── semeia os EVENTOS ABERTOS: o último dia da aba vira a carga inicial
  //    da tabela viva (quem está parado hoje não precisa ser relançado).
  //    Não apaga nada: pula placa que já tenha evento aberto (app ou seed). ──
  const maxData = INDISP.reduce((m, r) => r.data > m ? r.data : m, '');
  const ultimo = INDISP.filter(r => r.data === maxData);
  const vistos = new Set();
  const infereStatus = t => {
    const s = normU(t);
    if (/OR[CÇ]AMENTO/.test(s)) return 'Em orçamento';
    if (/AGUARDANDO PE[CÇ]A|PECAS|AGUARD/.test(s)) return 'Aguardando peça';
    if (/PRONTO/.test(s)) return 'Pronto para retirada';
    return 'Em execução';
  };
  const abertosDB = await sbGet('indisponibilidade', 'select=unidade,placa&data_retorno=is.null&limit=10000');
  const jaAberto = new Set(abertosDB.map(r => `${r.unidade}||${String(r.placa).toUpperCase()}`));
  const eventos = [];
  for (const r of ultimo) {
    if (/FRETEIRO/i.test(r.projeto || '')) continue;   // FRETEIRO fora (Renan, 14/08/2026)
    const key = `${r.unidade}||${r.placa}`;
    if (vistos.has(key)) continue;
    vistos.add(key);
    if (jaAberto.has(key)) continue;
    eventos.push({
      unidade: r.unidade, unidade_nome: r.unidade_nome, projeto: r.projeto,
      placa: r.placa, modelo: r.modelo, grupo: r.grupo,
      descricao_problema: r.descricao_problema, local_manutencao: r.local_manutencao,
      rc_oc: r.rc_oc,
      // Data Parada real da planilha; sem ela, estima pela foto − dias parado
      data_parada: r.data_parada_real ||
        (r.dias_parado != null
          ? new Date(new Date(r.data + 'T12:00') - r.dias_parado * 864e5).toISOString().slice(0, 10)
          : r.data),
      previsao_retorno: r.previsao_retorno, data_retorno: null,
      status: infereStatus(r.status === null || /PRAZO/.test(normU(r.status)) ? r.descricao_problema : r.status),
      observacao: [r.observacao, `[migrado da planilha · foto de ${r.data}]`].filter(Boolean).join(' ')
    });
  }
  log(`Eventos abertos (foto de ${maxData}): ${ultimo.length} linhas → ${eventos.length} novas (${jaAberto.size} já existiam abertas).`);
  await sbInsert('indisponibilidade', eventos);

  log(`✅ Concluído: ${DISP.length + INDISP.length} linhas de histórico + ${eventos.length} eventos abertos.`);
}

main().catch(e => { console.error('ERRO:', e.message || e); process.exit(1); });
