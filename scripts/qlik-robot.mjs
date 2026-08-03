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
// { chave:'custos-qlik', visual:'<título>' } — exportação via menu do visual.
const ABAS = [];

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
