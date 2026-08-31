/*******************************************************************************
 * Robô Pró-Frotas → Supabase (hodômetro por placa)
 *
 * Mesma leitura que o Apps Script do Renan faz hoje para o time conferir os
 * abastecimentos antes do ERP, com um objetivo só: guardar o HODÔMETRO de cada
 * abastecimento (o campo `hodometro`, coluna J da aba API_COMBUSTIVEL_
 * ABASTECIMENTOS). É dele que sai o "km atual" dos painéis de preventiva —
 * hoje digitado à mão na planilha da unidade.
 *
 * As chaves NÃO ficam aqui: são lidas da aba "Base CNPJ" da planilha do time
 * (coluna A = CNPJ, B = unidade, C = chave), como o Renan pediu. O repositório
 * é público, então nada de chave, CNPJ completo, CPF ou nome de motorista no
 * log — só nome da unidade e contagens.
 *
 * Modos (env PROFROTAS_MODE):
 *   auth  — só testa as chaves (GET /autorizacao) e diz quais responderam
 *   run   — coleta o período e grava em hodometro_leitura  (padrão)
 *
 * Env:
 *   PROFROTAS_DIAS      janela em dias (padrão 90; o 1º run pode pedir mais)
 *   PROFROTAS_UNIDADE   roda só a unidade cujo nome contenha este texto
 *   PROFROTAS_DRY       1 = não grava, só conta
 *   GEM_SUPABASE_SERVICE_KEY
 ******************************************************************************/

const MODE    = (process.env.PROFROTAS_MODE || 'run').trim();
const DIAS    = Number(process.env.PROFROTAS_DIAS || 90);
const PASSO   = Number(process.env.PROFROTAS_PASSO || 15);   // dias por fatia
const SO_UNI  = (process.env.PROFROTAS_UNIDADE || '').trim().toUpperCase();
const DRY     = process.env.PROFROTAS_DRY === '1';
// lista de placas a procurar (CSV). Serve para descobrir SOB QUAL CNPJ uma
// frota abastece: a Anhanguera não tem chave própria na aba Base CNPJ, e os
// veículos dela podem estar saindo pelo CNPJ de outra unidade.
const PLACAS_ALVO_CRU = (process.env.PROFROTAS_PLACAS || '').split(/[,;\s]+/).filter(Boolean);

const SHEET_ID = '1GKJM516l_Z-wM_KTgjAPzNVa4DEn8dmB66zW1UPuBL8';
const ABA_BASE = 'Base CNPJ';

// De-para do nome na aba Base CNPJ para o código da unidade no portal.
// "Seara - SP" É a Anhanguera (Renan, 31/08/2026) — ela não aparece na aba com
// esse nome, e é por isso que o hodômetro dela parecia não existir. Bate com o
// que já está no banco: os veículos da ANG em ativos_manual estão sob a filial
// SEARA·ROTA. Unidade sem entrada aqui fica com o nome da planilha mesmo.
const UNI_PORTAL = { 'SEARA - SP': 'ANG', 'SEARA': 'ANG' };
const codUnidade = nome => UNI_PORTAL[String(nome || '').trim().toUpperCase()] || nome;

const BASE_URL   = 'https://api-portal.profrotas.com.br';
const EP_AUTH    = '/api/frotista/autorizacao';
const EP_ABAST   = '/api/frotista/abastecimento/pesquisa';
const LIM_PAGINAS = 50;

const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY = (process.env.GEM_SUPABASE_SERVICE_KEY || '').trim();

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const esperar = ms => new Promise(r => setTimeout(r, ms));
const PAUSA = Number(process.env.PROFROTAS_PAUSA || 400);   // ms entre chamadas

/* ── aba Base CNPJ (gviz) ────────────────────────────────────────────────── */
async function lerBaseCnpj() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`
            + `?tqx=out:json&sheet=${encodeURIComponent(ABA_BASE)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Base CNPJ: HTTP ${r.status}. A planilha precisa estar acessível por link.`);
  const txt = await r.text();
  const m = txt.match(/setResponse\(([\s\S]*)\);?\s*$/);
  if (!m) throw new Error('Base CNPJ: resposta do gviz fora do formato (a planilha está compartilhada?)');
  const tabela = JSON.parse(m[1]).table;
  const val = c => (c && c.v != null ? String(c.v).trim() : '');
  const out = [];
  for (const linha of tabela.rows || []) {
    const c = linha.c || [];
    const cnpj = val(c[0]).replace(/\D/g, '');
    const unidade = val(c[1]);
    const chave = val(c[2]);
    if (!chave || !unidade) continue;               // linha vazia ou sem chave
    if (/^cnpj$/i.test(cnpj) || /^unidade$/i.test(unidade)) continue;   // cabeçalho
    out.push({ cnpj, unidade, chave });
  }
  return out;
}

/* ── API ─────────────────────────────────────────────────────────────────── */
const cab = chave => ({ Authorization: 'Bearer ' + chave, Accept: 'application/json' });

async function testarChave(u) {
  const r = await fetch(BASE_URL + EP_AUTH, { headers: cab(u.chave) });
  return r.status;
}

function periodo(dias) {
  const fim = new Date(), ini = new Date(Date.now() - dias * 864e5);
  const d = x => x.toISOString().slice(0, 10);
  return { dataInicial: d(ini) + 'T00:00:00.000-03:00', dataFinal: d(fim) + 'T23:59:59.999-03:00' };
}

// pega o valor de um caminho tipo 'veiculo.placa' num objeto
const val = (obj, cam) => cam.split('.').reduce((o, k) => (o == null ? null : o[k]), obj);
const primeiro = (obj, cams) => {
  for (const c of cams) { const v = val(obj, c); if (v != null && v !== '') return v; }
  return null;
};

// A API não aguenta pedido grande NEM rajada: 120 dias de uma vez devolveram
// HTTP 500 em todas as unidades, e as fatias que ainda caíam vinham com HTTP
// 429 — rate limit. Por isso a coleta é fatiada (padrão 15 dias), com uma
// pausa entre chamadas, e uma fatia que falha não derruba as outras.
async function porFatias(u, dias, passo) {
  const out = [];
  let falhas = 0, fatias = 0;
  for (let fim = 0; fim < dias; fim += passo) {
    const ate = new Date(Date.now() - fim * 864e5);
    const de  = new Date(Date.now() - Math.min(fim + passo, dias) * 864e5);
    const d = x => x.toISOString().slice(0, 10);
    const per = { dataInicial: d(de) + 'T00:00:00.000-03:00', dataFinal: d(ate) + 'T23:59:59.999-03:00' };
    fatias++;
    // o 500 é INTERMITENTE, não só por volume: com fatias de 7 dias, 3 de 5
    // ainda caíram. Três tentativas com espera crescente antes de desistir.
    let ok = false, ultimo = '';
    for (let t = 1; t <= 3 && !ok; t++) {
      try { out.push(...await abastecimentos(u, per)); ok = true; }
      catch (e) {
        ultimo = e.message;
        // 429 é rate limit: esperar bem mais do que num erro comum
        const espera = /429/.test(ultimo) ? t * 15000 : t * 3000;
        if (t < 3) await esperar(espera);
      }
    }
    if (!ok) { falhas++; if (falhas === 1) log(`   ${u.unidade}: fatia ${d(de)}→${d(ate)} falhou 3x (${ultimo})`); }
    await esperar(PAUSA);                    // não emendar uma fatia na outra
  }
  if (falhas) log(`   ${u.unidade}: ${falhas}/${fatias} fatia(s) falharam`);
  if (falhas === fatias) throw new Error(`todas as ${fatias} fatias falharam`);
  return out;
}

async function abastecimentos(u, per) {
  const linhas = [];
  for (let pagina = 1; pagina <= LIM_PAGINAS; pagina++) {
    const r = await fetch(BASE_URL + EP_ABAST, {
      method: 'POST',
      headers: { ...cab(u.chave), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagina, ...per }),
    });
    if (r.status === 204) break;                       // sem mais registros
    if (!r.ok) throw new Error(`HTTP ${r.status} na página ${pagina}`);
    const json = await r.json();
    const regs = json.registros || [];
    linhas.push(...regs);
    const tam = json.tamanhoPagina || regs.length || 0;
    if (!tam || !regs.length) break;
    if (pagina >= Math.ceil((json.totalItems || 0) / tam)) break;
    await esperar(PAUSA);                    // idem entre páginas
  }
  return linhas;
}

/* ── registro da API → leitura de hodômetro ──────────────────────────────── */
// Placa CANÔNICA (Renan, 31/08/2026): o formato antigo LLLNNNN vira Mercosul
// LLLNLNN trocando o 5º caractere pelo dígito → letra (0=A … 9=J). Quem já é
// Mercosul fica igual. É a mesma regra que a Seara usa para cruzar as abas —
// serve para o dia em que a API e o cadastro da unidade estiverem em formatos
// diferentes. Na TELA aparece a placa como está na origem.
const MERCOSUL = 'ABCDEFGHIJ';
const normPlaca = p => {
  const s = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}\d{4}$/.test(s) ? s.slice(0, 4) + MERCOSUL[+s[4]] + s.slice(5) : s;
};

function leiturasDe(regs, unidade) {
  const out = [];
  for (const r of regs) {
    const placa = normPlaca(primeiro(r, ['veiculo.placa', 'placa', 'placaVeiculo', 'veiculoPlaca']));
    const kmCru = primeiro(r, ['hodometro', 'odometro', 'quilometragem', 'km', 'veiculo.odometro']);
    const dtCru = primeiro(r, ['data', 'dataHora', 'dataAbastecimento', 'dataTransacao', 'dataCriacao']);
    if (!placa || kmCru == null || !dtCru) continue;
    const km = Number(String(kmCru).replace(/\D/g, ''));
    const data = new Date(dtCru);
    if (!km || isNaN(data.getTime())) continue;        // hodômetro 0 não é leitura
    out.push({ placa, km, data: data.toISOString(), unidade, fonte: 'profrotas' });
  }
  return out;
}

/* ── Supabase ────────────────────────────────────────────────────────────── */
async function gravar(linhas) {
  if (DRY)     { log(`[DRY] ${linhas.length} leitura(s) — NÃO gravadas`); return; }
  if (!SB_KEY) { log(`[dry-run] ${linhas.length} leitura(s) (sem GEM_SUPABASE_SERVICE_KEY)`); return; }
  const PASSO = 500;
  for (let i = 0; i < linhas.length; i += PASSO) {
    const lote = linhas.slice(i, i + PASSO);
    const r = await fetch(`${SB_URL}/rest/v1/hodometro_leitura?on_conflict=placa,data`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY,
                 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(lote),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  log(`gravadas ${linhas.length} leitura(s) em hodometro_leitura`);
}

/* ── main ────────────────────────────────────────────────────────────────── */
const PLACAS_ALVO = new Set(PLACAS_ALVO_CRU.map(normPlaca));

async function main() {
  const unidades = await lerBaseCnpj();
  log(`aba "${ABA_BASE}": ${unidades.length} unidade(s) com chave`);
  log('unidades:', unidades.map(u => u.unidade).join(' · '));

  const alvos = SO_UNI ? unidades.filter(u => u.unidade.toUpperCase().includes(SO_UNI)) : unidades;
  if (SO_UNI && !alvos.length) { console.error(`nenhuma unidade contendo "${SO_UNI}"`); process.exit(1); }

  if (MODE === 'auth') {
    for (const u of alvos) {
      let st = 0;
      try { st = await testarChave(u); } catch (e) { log(`${u.unidade}: erro — ${e.message}`); continue; }
      log(`${u.unidade}: HTTP ${st}${st >= 200 && st < 300 ? ' (ok)' : ''}`);
    }
    return;
  }

  const per = periodo(DIAS);
  log(`janela: ${per.dataInicial.slice(0, 10)} → ${per.dataFinal.slice(0, 10)} (${DIAS} dias, em fatias de ${PASSO})`);

  let todas = [], erros = 0;
  for (const u of alvos) {
    try {
      const regs = await porFatias(u, DIAS, PASSO);
      const lts = leiturasDe(regs, codUnidade(u.unidade));
      const placas = new Set(lts.map(l => l.placa));
      log(`${u.unidade}: ${regs.length} abastecimento(s) → ${lts.length} leitura(s) de hodômetro em ${placas.size} placa(s)`);
      if (PLACAS_ALVO.size) {
        const achadas = [...placas].filter(p => PLACAS_ALVO.has(p)).sort();
        if (achadas.length) log(`   ${achadas.length} placa(s) da lista procurada aqui: ${achadas.join(' ')}`);
      }
      todas.push(...lts);
    } catch (e) {
      log(`ERRO em ${u.unidade}: ${e.message}`);
      erros++;
    }
  }

  // a chave é (placa, data); o mesmo par pode vir repetido entre páginas
  const vistos = new Set();
  const limpas = todas.filter(l => {
    const k = l.placa + '|' + l.data;
    if (vistos.has(k)) return false;
    vistos.add(k); return true;
  });

  const porPlaca = new Map();
  for (const l of limpas) {
    const a = porPlaca.get(l.placa);
    if (!a || l.data > a.data) porPlaca.set(l.placa, l);
  }
  log(`total: ${limpas.length} leitura(s) · ${porPlaca.size} placa(s) com hodômetro`);
  if (PLACAS_ALVO.size) {
    const achadas = [...porPlaca.keys()].filter(p => PLACAS_ALVO.has(p));
    const faltam  = [...PLACAS_ALVO].filter(p => !porPlaca.has(p)).sort();
    log(`lista procurada: ${achadas.length}/${PLACAS_ALVO.size} placa(s) encontradas`);
    if (faltam.length) log(`   sem abastecimento na janela: ${faltam.join(' ')}`);
  }

  await gravar(limpas);
  if (erros) { console.error(`${erros} unidade(s) com erro`); process.exit(1); }
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
