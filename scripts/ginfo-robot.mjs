// ============================================================================
// Robô Ginfo (Power BI) — coleta automática para o Farol
// Roda no GitHub Actions (.github/workflows/ginfo-robot.yml), com Playwright.
//
// Modos (env GINFO_MODE):
//   login  (padrão) → só valida o login e salva screenshots em ./ginfo-artifacts/
//   run             → login + exporta os visuais de ABAS e grava no Supabase
//
// Env (Secrets no repositório):
//   GINFO_USER / GINFO_PASS      credenciais do bi.ginfo.app.br
//   GINFO_URL                    (opcional) URL de entrada/login — default abaixo
//   GEM_SUPABASE_SERVICE_KEY     service_role do projeto do portal (só p/ escrever)
//
// As ABAS são preenchidas conforme o mapeamento (aba a aba com o Renan):
//   { chave:'stress-test', url:'https://bi.ginfo.app.br/bi/<id>?...', visual:'<título do visual>' }
// A exportação usa o menu "..." → "Exportar dados" do próprio Power BI
// (baixa o xlsx completo do visual — a tabela na tela é virtualizada).
// ============================================================================
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const MODE  = (process.env.GINFO_MODE || 'login').trim();
const USER  = (process.env.GINFO_USER || '').trim();
const PASS  = (process.env.GINFO_PASS || '').trim();
const ENTRY = (process.env.GINFO_URL  || 'https://bi.ginfo.app.br/login').trim();
const EMPRESA = (process.env.GINFO_EMPRESA || 'CONLOG').trim();   // o login exige selecionar a Empresa
const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY = (process.env.GEM_SUPABASE_SERVICE_KEY || '').trim();

// ── ABAS DO GINFO (preencher conforme o mapeamento aba a aba) ──
// chave = linha em ginfo_snapshot · url = deep-link do relatório · visual = título do
// visual (opcional; sem título, o robô exporta a PRIMEIRA tabela da página).
// Regra: o dado fica SÓ no Supabase — o arquivo baixado é apagado após gravar.
const ABAS = [
  // 1.1 DOCUMENTOS → drill-through "Detalhes Veículos" → tabela = base ATIVOS
  // (Filial | Projeto | Placa | Marca | Modelo | Tipo Veículo | Estado | Ano Fabricação)
  { chave: 'ativos', url: 'https://bi.ginfo.app.br/bi/99029b42-f690-451b-95b1-9fad2c9b670d?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65' },
];

const ART = 'ginfo-artifacts';
fs.mkdirSync(ART, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function shot(page, nome) {
  try { await page.screenshot({ path: path.join(ART, nome + '.png'), fullPage: false }); log('screenshot:', nome); }
  catch (e) { log('screenshot falhou:', nome, e.message); }
}

// procura um locator em TODOS os frames (o Power BI roda dentro de iframe)
async function emFrames(page, fazer) {
  for (const fr of page.frames()) {
    try { const r = await fazer(fr); if (r) return r; } catch (e) {}
  }
  return null;
}

// Campo "Empresa": dropdown pesquisável (não é <select> nativo necessariamente).
// Tenta select nativo → senão clica no combobox, digita e escolhe a opção.
async function preencherEmpresa(page) {
  const sel = page.locator('select').first();
  if (await sel.count()) {
    try { await sel.selectOption({ label: EMPRESA }); log('empresa via <select>:', EMPRESA); return true; } catch (e) {}
  }
  const combo = page.locator('[role="combobox"], .select__control, .vs__dropdown-toggle, .v-select, input[placeholder*="mpresa" i], input[aria-autocomplete="list"]').first();
  if (await combo.count()) {
    try {
      await combo.click({ timeout: 8000 });
      await page.keyboard.type(EMPRESA, { delay: 60 });
      await page.waitForTimeout(1500);
      const opt = page.locator(`[role="option"]:has-text("${EMPRESA}"), .select__option:has-text("${EMPRESA}"), li:has-text("${EMPRESA}")`).first();
      if (await opt.count()) await opt.click(); else await page.keyboard.press('Enter');
      log('empresa via combobox:', EMPRESA);
      return true;
    } catch (e) { log('empresa: combobox falhou:', e.message); }
  }
  log('empresa: não achei o campo — confira o screenshot 01-entrada.');
  return false;
}

async function login(page) {
  log('abrindo', ENTRY);
  await page.goto(ENTRY, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await shot(page, '01-entrada');

  // ordem do form do Ginfo: Empresa (dropdown) → E-mail → Senha → Entrar
  await preencherEmpresa(page);
  const uInp = page.locator('input[type="email"], input[name*="mail" i], input[placeholder*="mail" i]').first();
  const pInp = page.locator('input[type="password"]').first();
  if (!(await pInp.count())) {
    log('não achei campo de senha — talvez já esteja logado (sessão) ou o login seja em outra URL.');
    await shot(page, '02-sem-form');
    return;
  }
  await uInp.fill(USER);
  await pInp.fill(PASS);
  await shot(page, '02-preenchido');
  const btn = page.locator('button:has-text("Entrar"), button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Acessar")').first();
  if (await btn.count()) await btn.click(); else await pInp.press('Enter');
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(6000);
  await shot(page, '03-pos-login');
  const url = page.url();
  log('pós-login em:', url);
  if (/\/login/i.test(url)) log('ATENÇÃO: continuamos na tela de login — confira Empresa/usuário/senha nos screenshots.');
}

// exporta os dados de UM visual: hover → menu "Mais opções (...)" → Exportar dados
async function exportarVisual(page, aba) {
  log('abrindo aba', aba.chave, aba.url);
  await page.goto(aba.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(15000);           // Power BI renderiza depois do load
  await shot(page, '10-' + aba.chave);

  // acha o visual (dentro dos iframes do Power BI): pelo título, ou a 1ª tabela da página
  const alvo = await emFrames(page, async fr => {
    const v = aba.visual
      ? fr.locator(`[aria-label*="${aba.visual}"], .visualTitle:has-text("${aba.visual}"), visual-container:has-text("${aba.visual}")`).first()
      : fr.locator('[role="grid"], .tableEx, .pivotTable, [role="table"]').first();
    return (await v.count()) ? { fr, v } : null;
  });
  if (!alvo) throw new Error(`visual ${aba.visual ? `"${aba.visual}"` : '(tabela)'} não encontrado em ${aba.chave}`);
  await alvo.v.hover();
  // botão "..." (Mais opções) do visual
  const opts = alvo.fr.locator('[aria-label*="Mais opções" i], [aria-label*="More options" i], [data-testid="visual-more-options-btn"]').first();
  await opts.click({ timeout: 15000 });
  const item = alvo.fr.locator('button:has-text("Exportar dados"), [role="menuitem"]:has-text("Exportar dados"), [role="menuitem"]:has-text("Export data")').first();
  await item.click({ timeout: 15000 });
  await shot(page, '11-' + aba.chave + '-dialogo');
  // diálogo de exportação: confirmar (baixa .xlsx)
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    (async () => {
      const ok = await emFrames(page, async fr => {
        const b = fr.locator('button:has-text("Exportar"), button:has-text("Export")').last();
        if (await b.count()) { await b.click(); return true; }
        return null;
      });
      if (!ok) log('não achei botão de confirmação — o download pode ter começado direto.');
    })(),
  ]);
  const arq = path.join(ART, aba.chave + '.xlsx');
  await download.saveAs(arq);
  log('baixado:', arq);
  return arq;
}

async function xlsxParaLinhas(arq) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(arq);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

async function gravarSupabase(chave, linhas) {
  if (!SB_KEY) { log(`[dry-run] ${chave}: ${linhas.length} linhas (sem GEM_SUPABASE_SERVICE_KEY)`); return; }
  const res = await fetch(`${SB_URL}/rest/v1/ginfo_snapshot?on_conflict=chave`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ chave, data: linhas, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  log(`gravado no Supabase: ${chave} (${linhas.length} linhas)`);
}

async function main() {
  if (!USER || !PASS) { console.error('Faltam Secrets: GINFO_USER / GINFO_PASS'); process.exit(1); }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  try {
    await login(page);
    if (MODE === 'login') { log('modo login: só o teste de acesso. Veja os screenshots nos artifacts.'); return; }
    if (!ABAS.length) { log('nenhuma aba configurada ainda em ABAS — mapeie as abas no scripts/ginfo-robot.mjs.'); return; }
    let erros = 0;
    for (const aba of ABAS) {
      try {
        const arq = await exportarVisual(page, aba);
        const linhas = await xlsxParaLinhas(arq);
        await gravarSupabase(aba.chave, linhas);
        // o dado fica SÓ no banco: apaga o arquivo baixado (sem service key,
        // é dry-run e o xlsx fica nos artifacts p/ conferência)
        if (SB_KEY) { try { fs.unlinkSync(arq); log('arquivo apagado (fica só no banco):', arq); } catch (e) {} }
      } catch (e) { erros++; log(`ERRO em ${aba.chave}:`, e.message); await shot(page, '99-erro-' + aba.chave); }
    }
    if (erros) { console.error(`${erros} aba(s) com erro`); process.exit(1); }
  } finally {
    await browser.close();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
