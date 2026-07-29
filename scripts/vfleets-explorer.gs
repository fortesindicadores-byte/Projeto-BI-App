/**
 * vFleets DaaS — Explorador (protótipo · Condução Econômica)
 * ------------------------------------------------------------
 * Lê a "Condução Detalhada" DIA A DIA e joga numa aba do Google Sheets,
 * pra a gente VER OS CAMPOS REAIS antes de definir indicadores/pesos.
 *
 * Rate limit da vFleets: 1 requisição / 5 min por token.
 * Limite do Apps Script: ~6 min por execução.
 * → Por isso é RETOMÁVEL: um gatilho de 5 min lê 1 dia por vez e vai
 *   preenchendo a aba até cobrir todo o período (1 mês ≈ 30 execuções).
 *
 * COMO USAR:
 *  1. Crie uma planilha no Google Sheets → Extensões → Apps Script.
 *  2. Cole este arquivo.
 *  3. Preencha CONFIG.token e as datas (inicio/fim).
 *  4. Rode `setup()` UMA vez (cria a aba, agenda o gatilho e já lê o 1º dia).
 *  5. Deixe rodar — a aba "vfleets_raw" vai enchendo sozinha.
 *  6. Rode `stop()` para parar antes do fim, se quiser.
 */

const CONFIG = {
  token:      'COLE_O_TOKEN_AQUI',
  baseUrl:    'https://api.vfleets.com.br/integrationcore-conducao/conducoes/detalhada',
  inicio:     '2026-01-01',   // primeiro dia a ler (YYYY-MM-DD)
  fim:        '2026-01-31',   // último dia (inclusive)
  aba:        'vfleets_raw',
  veiculoIds: '',             // opcional: '10,20,30' — vazio = todos os veículos
};

/** Configura tudo e já lê o 1º dia. Rode UMA vez. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(CONFIG.aba)) ss.insertSheet(CONFIG.aba);
  PropertiesService.getScriptProperties().setProperty('proxDia', CONFIG.inicio);
  stop();                                             // remove gatilhos antigos
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  tick();                                             // lê o 1º dia agora
}

/** Remove o gatilho (para a coleta). */
function stop() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  });
}

/** Lê o próximo dia pendente. Chamado pelo gatilho de 5 min. */
function tick() {
  const props = PropertiesService.getScriptProperties();
  const dia = props.getProperty('proxDia');
  if (!dia || dia > CONFIG.fim) { stop(); return; }   // acabou o período

  const url = CONFIG.baseUrl + '?dia=' + dia +
              (CONFIG.veiculoIds ? '&veiculoIds=' + CONFIG.veiculoIds : '');
  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: CONFIG.token },
    muteHttpExceptions: true,
  });

  const code = resp.getResponseCode();
  if (code === 429) return;                            // rate limit → tenta de novo no próximo tick (NÃO avança o dia)
  if (code !== 200) {
    Logger.log('Erro ' + code + ' no dia ' + dia + ': ' + resp.getContentText().slice(0, 300));
    avancaDia_(dia); return;
  }

  let dados;
  try { dados = JSON.parse(resp.getContentText()); }
  catch (e) { Logger.log('JSON inválido em ' + dia); avancaDia_(dia); return; }

  gravar_(dados || [], dia);
  avancaDia_(dia);
}

/** Avança o cursor para o dia seguinte. */
function avancaDia_(dia) {
  const d = new Date(dia + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const prox = Utilities.formatDate(d, 'GMT', 'yyyy-MM-dd');
  PropertiesService.getScriptProperties().setProperty('proxDia', prox);
  if (prox > CONFIG.fim) stop();
}

/** Achata cada registro (motorista.nome, veiculo.placa, motorista.uo.nome…) e grava as linhas. */
function gravar_(linhas, dia) {
  if (!linhas.length) { Logger.log(dia + ': 0 registros'); return; }
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.aba);
  const flat = linhas.map(function (o) { return flatten_(o, ''); });

  // cabeçalho = união das colunas já vistas + novas (a ordem se mantém)
  let header = sh.getLastRow() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : ['_diaConsulta'];
  const set = {}; header.forEach(function (h) { set[h] = true; });
  flat.forEach(function (o) {
    Object.keys(o).forEach(function (k) { if (!set[k]) { set[k] = true; header.push(k); } });
  });
  sh.getRange(1, 1, 1, header.length).setValues([header]);

  const rows = flat.map(function (o) {
    o._diaConsulta = dia;
    return header.map(function (k) { return o[k] !== undefined ? o[k] : ''; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);
  Logger.log(dia + ': ' + rows.length + ' registros gravados');
}

/** Achata objeto aninhado em chaves "a.b.c"; arrays viram JSON. */
function flatten_(obj, prefix) {
  const out = {};
  Object.keys(obj || {}).forEach(function (k) {
    const v = obj[k], key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten_(v, key));
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
  });
  return out;
}
