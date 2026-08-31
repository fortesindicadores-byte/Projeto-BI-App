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
const SO_UNI  = (process.env.PROFROTAS_UNIDADE || '').trim().toUpperCase();
const DRY     = process.env.PROFROTAS_DRY === '1';

const SHEET_ID = '1GKJM516l_Z-wM_KTgjAPzNVa4DEn8dmB66zW1UPuBL8';
const ABA_BASE = 'Base CNPJ';

const BASE_URL   = 'https://api-portal.profrotas.com.br';
const EP_AUTH    = '/api/frotista/autorizacao';
const EP_ABAST   = '/api/frotista/abastecimento/pesquisa';
const LIM_PAGINAS = 50;

const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY = (process.env.GEM_SUPABASE_SERVICE_KEY || '').trim();

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

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
  }
  return linhas;
}

/* ── registro da API → leitura de hodômetro ──────────────────────────────── */
const normPlaca = p => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

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
  log(`janela: ${per.dataInicial.slice(0, 10)} → ${per.dataFinal.slice(0, 10)} (${DIAS} dias)`);

  let todas = [], erros = 0;
  for (const u of alvos) {
    try {
      const regs = await abastecimentos(u, per);
      const lts = leiturasDe(regs, u.unidade);
      const placas = new Set(lts.map(l => l.placa));
      log(`${u.unidade}: ${regs.length} abastecimento(s) → ${lts.length} leitura(s) de hodômetro em ${placas.size} placa(s)`);
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

  await gravar(limpas);
  if (erros) { console.error(`${erros} unidade(s) com erro`); process.exit(1); }
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
