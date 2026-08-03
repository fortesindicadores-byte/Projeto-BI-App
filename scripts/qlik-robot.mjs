// ============================================================================
// Robô Qlik (Qlik Sense Enterprise — bi.conlogsa.com.br) — Custos/DRE
// Substitui a aba "Custos" do Farol Semanal (hoje colada manualmente do DRE).
// Mesmo desenho do robô Ginfo: GitHub Actions + Playwright → Supabase
// (ginfo_snapshot) → painéis leem de lá; o arquivo baixado é apagado.
//
// Modos (env QLIK_MODE):
//   login  (padrão) → só valida o acesso e salva screenshots em ./qlik-artifacts/
//   run             → login + exporta os visuais de ABAS e grava no Supabase
//
// Env (Secrets no repositório):
//   QLIK_USER / QLIK_PASS        conta de serviço (formato dominio\usuario)
//   QLIK_URL                     (opcional) URL de entrada — default: hub do app
//   GEM_SUPABASE_SERVICE_KEY     service_role do projeto do portal
// ============================================================================
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const MODE = (process.env.QLIK_MODE || 'login').trim();
const USER = (process.env.QLIK_USER || '').trim();
const PASS = (process.env.QLIK_PASS || '').trim();
// painel do DRE mostrado pelo Renan (03/08/2026): app 2a9d3451… · sheet 9b39dd9c…
const APP_URL = 'https://bi.conlogsa.com.br/sense/app/2a9d3451-ce57-4a87-999d-df23c17c2a03/sheet/9b39dd9c-4c4b-48f7-817b-0d6b67c47e09/state/analysis';
const ENTRY = (process.env.QLIK_URL || APP_URL).trim();
const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY = (process.env.GEM_SUPABASE_SERVICE_KEY || '').trim();

// ── ABAS (preencher conforme o Renan mostra o passo a passo do export) ──
// { chave:'custos-qlik', filtros:()=>[...], visual:'<título>' }
// Mecânica de seleção do Qlik: clicar no filterpane → clicar no valor →
// confirmar no ✓ VERDE. A tabela só renderiza depois dos filtros.
const MES_Q = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// Regra de período (Renan, 03/08/2026): até o dia 10 → mês ANTERIOR; depois → mês atual.
const refMes = () => { const h = new Date(); return h.getDate() <= 10 ? new Date(h.getFullYear(), h.getMonth() - 1, 1) : h; };
const ABAS = [
  // export a mapear: qual visual/tabela e por qual menu — aguardando o Renan
  // { chave: 'custos-qlik',
  //   filtros: () => { const r = refMes(); return [
  //     { campo: 'ANO', valor: String(r.getFullYear()) },
  //     { campo: 'MÊS', valor: MES_Q[r.getMonth()] },
  //     { campo: 'NÍVEL 1', valor: 'OPERAÇÕES DEDICADAS AM' },   // 1.3.1. OPERAÇÕES DEDICADAS AMBEV (texto truncado na tela — casar por "contém")
  //   ]; },
  //   colunas: [{ coluna: 'Cód. Estrutura', valores: ESTRUTURAS_FROTA }] },
];

// ESTRUTURAS FROTA (Renan, 03/08/2026) — seleção na coluna "Cód. Estrutura"
const ESTRUTURAS_FROTA = ['170', '171', '173', '174', '176', '177', '178', '180', '181', '183', '185', '186', '398', '572'];

// seleção MÚLTIPLA pela LUPA do cabeçalho de uma coluna da tabela:
// abre a busca da coluna → para cada valor: digita, clica no item exato → ✓ verde
async function selecionarNaColuna(page, coluna, valores) {
  const th = page.locator(`[role="columnheader"]:has-text("${coluna}"), th:has-text("${coluna}"), .qv-st-header-cell:has-text("${coluna}")`).filter({ visible: true }).first();
  const lupa = th.locator('[class*="search" i], [data-testid*="search" i], .lui-icon--search').first();
  if (await lupa.count()) await lupa.click({ timeout: 10000 }); else await th.click({ timeout: 10000 });
  await page.waitForTimeout(1500);
  const busca = page.locator('input[type="search"], [class*="listbox" i] input, [role="listbox"] input, input[placeholder*="esquis" i], input[placeholder*="earch" i]').filter({ visible: true }).first();
  for (const v of valores) {
    try {
      await busca.fill(String(v));
      await page.waitForTimeout(900);
      const item = page.locator(`[role="listbox"] [role="option"], .qv-listbox li, [class*="listbox" i] [title]`).filter({ visible: true }).filter({ hasText: new RegExp('^\\s*' + String(v) + '\\s*$') }).first();
      if (await item.count()) { await item.click(); log(`coluna "${coluna}": ${v} selecionado`); }
      else log(`coluna "${coluna}": valor ${v} NÃO apareceu na busca`);
      await page.waitForTimeout(400);
    } catch (e) { log(`coluna "${coluna}": falha em ${v}:`, e.message); }
  }
  const ok = page.locator('[title*="Confirmar" i], [title*="Confirm" i], .sel-toolbar-confirm-button, [data-testid*="confirm" i], button.sel-toolbar-btn-confirm').filter({ visible: true }).first();
  if (await ok.count()) await ok.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  log(`coluna "${coluna}": ${valores.length} valores confirmados`);
}

// aplica um filtro (filterpane) do Qlik Sense: abre, clica no valor, ✓ verde
async function aplicarFiltroQlik(page, campo, valor) {
  const fp = page.getByText(campo, { exact: true }).filter({ visible: true }).first();
  await fp.click({ timeout: 15000 });
  await page.waitForTimeout(1500);
  // valor dentro do popup do listbox (fallback: texto exato em qualquer lugar visível)
  let item = page.locator(`[role="listbox"] [role="option"], .qv-listbox li, [class*="listbox" i] [title]`).filter({ hasText: valor }).filter({ visible: true }).first();
  if (!(await item.count())) item = page.getByText(valor, { exact: true }).filter({ visible: true }).last();
  await item.click({ timeout: 10000 });
  await page.waitForTimeout(800);
  // confirmar no ✓ verde da barra de seleção
  const ok = page.locator('[title*="Confirmar" i], [title*="Confirm" i], .sel-toolbar-confirm-button, [data-testid*="confirm" i], button.sel-toolbar-btn-confirm').filter({ visible: true }).first();
  if (await ok.count()) await ok.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);   // dá tempo da tabela recalcular
  log(`filtro "${campo}" = "${valor}" aplicado`);
}

const ART = 'qlik-artifacts';
fs.mkdirSync(ART, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function shot(page, nome) {
  try { await page.screenshot({ path: path.join(ART, nome + '.png'), fullPage: false }); log('screenshot:', nome); }
  catch (e) { log('screenshot falhou:', nome, e.message); }
}

async function login(page) {
  log('abrindo', ENTRY);
  await page.goto(ENTRY, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(e => log('goto:', e.message));
  await page.waitForTimeout(8000);
  await shot(page, '01-entrada');
  log('URL após abrir:', page.url());

  // form de login (Qlik Sense "internal forms authentication" ou tela custom)
  const pInp = page.locator('input[type="password"]').first();
  if (await pInp.count()) {
    const uInp = page.locator('input[type="text"], input[type="email"], input[name*="user" i], input[id*="user" i]').first();
    if (await uInp.count()) await uInp.fill(USER);
    await pInp.fill(PASS);
    await shot(page, '02-preenchido');
    const btn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Entrar"), button:has-text("Login"), button:has-text("Log in"), button:has-text("Acessar")').first();
    if (await btn.count()) await btn.click(); else await pInp.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(10000);
  } else {
    log('sem formulário de senha visível — pode ser NTLM (httpCredentials) ou sessão direta.');
  }
  await shot(page, '03-pos-login');
  log('pós-login em:', page.url());
  const titulo = await page.title().catch(() => '');
  log('título da página:', titulo);
  // diagnóstico: o app do Qlik carregou? (objetos qv-*/qlik na página)
  const objs = await page.locator('[tid], .qv-object, [class*="qv-"]').count().catch(() => 0);
  log('objetos Qlik detectados:', objs);
}

async function main() {
  if (!USER || !PASS) { console.error('Faltam Secrets: QLIK_USER / QLIK_PASS'); process.exit(1); }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1600, height: 900 },
    locale: 'pt-BR',
    ignoreHTTPSErrors: true,                       // servidor próprio: cert pode ser interno
    httpCredentials: { username: USER, password: PASS },  // cobre NTLM/Negotiate
  });
  const page = await ctx.newPage();
  try {
    await login(page);
    if (MODE === 'login') { log('modo login: só o teste de acesso. Veja os screenshots nos artifacts.'); return; }
    if (!ABAS.length) { log('nenhuma aba configurada ainda em ABAS — mapear com o Renan o passo a passo do export.'); return; }
    // (export entra aqui quando o mapeamento for feito)
  } finally {
    await browser.close();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
