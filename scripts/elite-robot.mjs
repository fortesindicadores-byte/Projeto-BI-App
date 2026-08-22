// ============================================================================
// Robô Frota de Elite (Ginfo / Power BI) — coleta por VIGÊNCIA para o Supabase
// Roda no GitHub Actions (.github/workflows/elite-robot.yml), com Playwright.
//
// Diferença para o robô do Farol (scripts/ginfo-robot.mjs), que pega só a foto
// de hoje: aqui cada indicador é coletado MÊS A MÊS e também no ACUMULADO DO ANO
// (jan → mês de referência), porque o painel Frota de Elite precisa do histórico
// e do ponderado do ano (não é média das médias mensais).
//
// Modos (env ELITE_MODE):
//   login    (padrão) → só valida o login e salva screenshots em ./elite-artifacts/
//   mes               → rotina diária: mês ANTERIOR + acumulado do ano até ele
//   backfill          → intervalo ELITE_DE..ELITE_ATE (MM/AAAA), mês a mês
//
// Env extras (para iterar barato durante o mapeamento):
//   ELITE_IND     lista de indicadores separada por vírgula (default: todos)
//   ELITE_ESCOPOS 'mes' | 'ano' | 'mes,ano' (default: mes,ano no modo mes; mes no backfill)
//   ELITE_DE / ELITE_ATE   'MM/AAAA' (backfill)
//   ELITE_FORCAR  '1' ignora a janela do dia 01–15 no modo mes
//
// Secrets (mesmos do robô do Farol):
//   GINFO_USER / GINFO_PASS / GINFO_URL / GINFO_EMPRESA / GEM_SUPABASE_SERVICE_KEY
//
// Regra de calendário (Renan, 05/08/2026): a rotina roda todo dia do dia 01 ao 15
// gravando o mês anterior fechado; depois do dia 15 para e volta no dia 01.
// ============================================================================
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const MODE    = (process.env.ELITE_MODE || 'login').trim();
const USER    = (process.env.GINFO_USER || '').trim();
const PASS    = (process.env.GINFO_PASS || '').trim();
const ENTRY   = (process.env.GINFO_URL  || 'https://bi.ginfo.app.br/login').trim();
const EMPRESA = (process.env.GINFO_EMPRESA || 'CONLOG').trim();
const SB_URL  = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY  = (process.env.GEM_SUPABASE_SERVICE_KEY || '').trim();
const FORCAR  = process.env.ELITE_FORCAR === '1';

const MES_LBL  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MES_FULL = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const VIG_INICIAL = '01/2026';   // backfill começa aqui (Renan: 2025 não entra)

const dois = n => String(n).padStart(2, '0');
const vigDe = d => dois(d.getMonth() + 1) + '/' + d.getFullYear();
const dataDe = d => dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear();
const mesDropdown = d => MES_LBL[d.getMonth()] + '-' + String(d.getFullYear()).slice(2);   // 'Jul-26'
const refDe = vig => { const [m, a] = vig.split('/').map(Number); return new Date(a, m - 1, 1); };
const fimDoMes = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);

// ── INDICADORES ──────────────────────────────────────────────────────────────
// periodo.tipo:
//   'dropdown' → slicers Ano + Mês (mês único no escopo 'mes'; jan→ref no 'ano')
//   'datas'    → par de campos de data (rotulo = label acima do par)
//   'botoes'   → tiles de ano + meses no rodapé (Pneus)
// tabela: como achar a tabela certa na página (header = coluna exclusiva dela).
// Atingimento = a própria aderência em todos (Renan) — o painel aplica os pesos.
const INDICADORES = [
  // 1. Disponibilidade (e MTBF/MTTR, que saem do MESMO relatório)
  { chave: 'disponibilidade', menu: ['FROTA', '2.4 - MTBF E MTTR'],
    url: 'https://bi.ginfo.app.br/bi/3da3aed9-7def-4ab5-b070-c907ceead10e?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    periodo: { tipo: 'dropdown' },
    tabela: { header: 'Disponibilidade Veículos' } },

  // 2. Preventivas — filtro fica no bloco "VISÃO HISTÓRICA" (Data de Execução)
  { chave: 'preventivas', menu: ['FROTA', '2.2 - PREVENTIVAS'],
    url: 'https://bi.ginfo.app.br/bi/d4638be4-d2f0-4581-84e3-0dce81201c65?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    periodo: { tipo: 'datas', rotulo: 'Data de Execução' },
    tabela: { header: 'Preventivas Realizadas' } },

  // 3. Pneus (Aferições) — VIA API, não pela tela do Ginfo (Renan, 05/08).
  // A faixa de meses daquela tela avança por uma seta de "próximo nível" que
  // não cedeu a nenhuma automação (clique, roda, scrollLeft, evento sintético).
  // O painel de Pneus tem a mesma informação no Supabase do Prolog, com o
  // histórico completo de inspeções — então dá para calcular QUALQUER mês sem
  // depender de clicar, o que também resolve o backfill de uma vez.
  { chave: 'pneus', api: 'pneus', semAcumulado: true },

  // 4.1 Checklist T2 — 031120 (página já vem com Tipo=Saida e Origem=031120)
  { chave: 'checklist-t2', menu: ['FROTA', '1.3 - ADERÊNCIA FROTA - 031120'],
    url: 'https://bi.ginfo.app.br/bi/76e82774-d5d4-4cda-bb13-65a1a64387ef?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    periodo: { tipo: 'datas', rotulo: 'Data' },
    tabela: { header: 'Placas sem Checklist' } },

  // 4.2 Checklist T1 — Empurrada · indicador = Aderência SAÍDA (Renan, 05/08)
  { chave: 'checklist-t1', menu: ['FROTA', '1.3 - ADERÊNCIA EMPURRADA'],
    periodo: { tipo: 'datas', rotulo: 'Data' },
    tabela: { header: 'Check Esperado' } },

  // 5. Checklist WH — Armazém · SÓ EMPILHADEIRA · indicador = Aderência
  { chave: 'checklist-wh', menu: ['FROTA', '1.3 - ADERÊNCIA ARMAZÉM'],
    periodo: { tipo: 'datas', rotulo: 'Data' },
    aba: 'EMPILHADEIRA',
    tabela: { header: 'Aderência Ponto' } },

  // 6. Conformidade — mensal x bimestral é regra do LEITOR (ver nota abaixo)
  // Os meses desta tela são NOMES POR EXTENSO ("julho"), não "Jul-26" — o robô
  // procurava um valor que não existe na lista (diagnóstico do run 11).
  // NOVA REGRA (Ginfo, 08/2026): a aderência passou a ser por PRAZO DE VENCIMENTO
  // (WH 30 dias, DU 60 dias), então acabou a distinção Mensal x Bimestral. A base
  // vem do drill "Detalhes Aderência Mensal": uma linha por cobrança, com
  // Competência (vigência) e Status. OK = Realizado Dentro Prazo | No Prazo.
  // A própria página já traz a tabela por Filial com as CINCO contagens de
  // status — não precisa do drill de detalhes (que, aliás, não abre por
  // automação: o botão direito no card não devolve menu nenhum).
  // Somar as contagens entre meses é idêntico a somar placa a placa, então o
  // acumulado sai exato do mensal e o escopo 'ano' fica dispensável.
  { chave: 'conformidade', menu: ['FROTA', '1.2 - ADERÊNCIA CONFORMIDADE'],
    periodo: { tipo: 'dropdown', mesFormato: 'nome' },
    tabela: { header: 'Filial' }, semAcumulado: true },

  // (o antigo 'conformidade-mar' saiu de cena: com contagens por status o
  //  acumulado sai da soma dos meses, sem precisar da janela mar→M do Ginfo)

  // 7. Stress Test Frota / Empilhadeira / CIVF — mesmas telas do robô do Farol,
  //    aqui coletadas POR VIGÊNCIA (aderência = desconto 0 → 1, senão 0; o leitor calcula)
  // Quinzena: o que vale na Frota é SEMPRE a 2ª (Renan, 05/08). A tela abre em
  // "Primeira" — o export saía com a quinzena errada ("descricao é Primeira").
  { chave: 'stress-test-frota', menu: ['STRESS TEST', 'STRESS TEST FROTA'],
    url: 'https://bi.ginfo.app.br/bi/ce4f37f8-1c4c-499f-a80c-3a3ce80594cb?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    periodo: { tipo: 'dropdown' },
    slicersFixos: [{ campo: 'Quinzena', valor: 'Segunda' }] },
  // Empilhadeira (Renan, 05/08): usar a tela como ela vem, sem mexer em filtro
  // nenhum além do Mês. NÃO tem filtro de quinzena (as duas são colunas e o
  // "Desc. Total" já soma). E NÃO tocar no "Ano": o que parece um slicer ali é
  // elemento de visual — clicar cria um filtro "Incluídos (1) 2026 + janeiro"
  // que, cruzado com o mês pedido, zera o resultado (deu 1 linha). O valor do
  // Mês já carrega o ano ("Jul-26"), então o Ano é dispensável.
  // Acumulado do ano: a multisseleção não acumula nessa tela, então o ano sai
  // da soma dos meses no leitor, em vez de forçar a UI.
  { chave: 'stress-test-empilhadeira', menu: ['STRESS TEST', 'STRESS TEST EMPILHADEIRA'],
    url: 'https://bi.ginfo.app.br/bi/d1cead3d-e28a-487b-a1bd-8b72cdd6da55?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    periodo: { tipo: 'dropdown', semAno: true }, semAcumulado: true,
    tabela: { header: 'Chassis' } },
  { chave: 'civf', menu: ['CIVF', 'CIVF'],
    url: 'https://bi.ginfo.app.br/bi/5bd5e3ac-7ebc-4c7b-963e-1c3d20ba4acd?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    periodo: { tipo: 'dropdown' }, tabela: { ultima: true } },

  // 8. SLA Manutenção — Ordem Serviço · indicador = SLA Atendimento
  { chave: 'sla-manutencao', menu: ['FROTA', '2.4 - ORDEM SERVIÇO'],
    url: 'https://bi.ginfo.app.br/bi/81e8f48c-09f2-4bc7-a84e-0718378732c9?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    periodo: { tipo: 'datas', rotulo: 'Data' },
    tabela: { header: 'SLA Atendimento' } },
];

const ART = 'elite-artifacts';
fs.mkdirSync(ART, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function shot(page, nome) {
  try { await page.screenshot({ path: path.join(ART, nome + '.png'), fullPage: false }); }
  catch (e) { log('screenshot falhou:', nome, e.message); }
}
async function emFrames(page, fazer) {
  for (const fr of page.frames()) {
    try { const r = await fazer(fr); if (r) return r; } catch (e) {}
  }
  return null;
}

// ── DRILL-THROUGH: botão direito num card → Drill-through → página de detalhe ──
// Portado do robô do Farol (scripts/ginfo-robot.mjs). Diferença: aqui o rótulo
// âncora pode estar ACIMA ou ABAIXO do número, então os deslocamentos vêm por
// configuração e aceitam valores negativos (subir a partir do rótulo).
async function drillThrough(page, cardTexto, itemMenu, offs) {
  const pbiFrames = () => page.frames().filter(f => /powerbi|reportEmbed/i.test(f.url()));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let lbl = null;
  for (let t = 0; t < 9 && !lbl; t++) {
    for (const fr of pbiFrames()) {
      try {
        const l = fr.getByText(new RegExp('^\\s*' + escRe(cardTexto) + '\\s*$')).filter({ visible: true }).first();
        if (await l.count()) { lbl = l; break; }
      } catch (e) {}
    }
    if (!lbl) await page.waitForTimeout(5000);
  }
  if (!lbl) throw new Error(`card "${cardTexto}" não encontrado p/ drill-through`);
  const buscarItem = () => emFrames(page, async fr => {
    const i = fr.locator(`[role="menuitem"]:has-text("${itemMenu}"), button:has-text("${itemMenu}"), [title*="${itemMenu}"]`).filter({ visible: true }).first();
    return (await i.count()) ? i : null;
  });
  const OFFS = offs && offs.length ? offs : [28, 46, 64, 14];
  let item = null;
  for (let t = 0; t < OFFS.length && !item; t++) {
    const box = await lbl.boundingBox();
    if (!box) throw new Error(`rótulo "${cardTexto}" sem posição na tela`);
    const y = OFFS[t] < 0 ? box.y + OFFS[t] : box.y + box.height + OFFS[t];
    await page.mouse.click(box.x + box.width / 2, y, { button: 'right' });
    await page.waitForTimeout(1500);
    const drill = await emFrames(page, async fr => {
      const d = fr.locator('[role="menuitem"]:has-text("Drill"), [role="menuitem"]:has-text("Detalhamento")').filter({ visible: true }).first();
      return (await d.count()) ? d : null;
    });
    if (drill) {
      try { await drill.hover(); } catch (e) {}
      await page.waitForTimeout(1200);
      item = await buscarItem();
      if (!item) { try { await drill.click(); await page.waitForTimeout(1200); item = await buscarItem(); } catch (e) {} }
    } else {
      item = await buscarItem();
    }
    if (!item) {
      const its = [];
      for (const fr of page.frames()) {
        try {
          const ms = fr.locator('[role="menuitem"]').filter({ visible: true });
          const n = Math.min(await ms.count(), 15);
          for (let i = 0; i < n; i++) its.push((await ms.nth(i).innerText().catch(() => '')).trim().replace(/\s+/g, ' '));
        } catch (e) {}
      }
      log(`menu do botão direito (offset ${OFFS[t]}):`, JSON.stringify(its.filter(Boolean)));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1200);
    }
  }
  if (!item) throw new Error(`item de drill "${itemMenu}" não encontrado`);
  await item.click();
  await page.waitForTimeout(15000);
  log(`drill-through: ${cardTexto} → ${itemMenu}`);
}

// ── LOGIN (mesma receita do robô do Farol: Empresa → e-mail → senha) ─────────
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
  await preencherEmpresa(page);
  const uInp = page.locator('input[type="email"], input[name*="mail" i], input[placeholder*="mail" i]').first();
  const pInp = page.locator('input[type="password"]').first();
  if (!(await pInp.count())) { log('sem campo de senha — talvez já logado.'); await shot(page, '02-sem-form'); return; }
  await uInp.fill(USER);
  await pInp.fill(PASS);
  const btn = page.locator('button:has-text("Entrar"), button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Acessar")').first();
  if (await btn.count()) await btn.click(); else await pInp.press('Enter');
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(6000);
  await shot(page, '03-pos-login');
  log('pós-login em:', page.url());
  if (/\/login/i.test(page.url())) log('ATENÇÃO: continuamos na tela de login — confira Empresa/usuário/senha.');
}

// ── CLIQUE ROBUSTO ──────────────────────────────────────────────────────────
// O portal tem duplicatas OCULTAS dos textos do menu, e as listas do Power BI
// são virtualizadas (o item existe mas está fora da área desenhada). Filtrar
// por "visível" descarta o item que só está rolado; não filtrar pega a
// duplicata escondida. O discriminador certo é ter CAIXA na tela: quem está só
// rolado tem boundingBox, quem está display:none não tem.
async function primeiroRenderizado(loc) {
  const n = await loc.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const e = loc.nth(i);
    const b = await e.boundingBox().catch(() => null);
    if (b && b.width > 0 && b.height > 0) return e;
  }
  return null;
}
// clica tentando, em ordem: elemento renderizado → force → evento sintético
// (o último funciona mesmo em item virtualizado que o Playwright recusa clicar)
async function clicarRobusto(page, loc, { ctrl = false, timeout = 10000 } = {}) {
  const alvo = (await primeiroRenderizado(loc)) || loc.first();
  const modo = ctrl ? { modifiers: ['Control'] } : {};
  try { await alvo.scrollIntoViewIfNeeded({ timeout: 4000 }); } catch (e) {}
  try { await alvo.click({ ...modo, timeout }); return true; } catch (e) {}
  try { await alvo.click({ ...modo, force: true, timeout: 5000 }); return true; } catch (e) {}
  try {
    await alvo.evaluate((el, c) => {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const o = { bubbles: true, cancelable: true, ctrlKey: c, view: window };
      el.dispatchEvent(new MouseEvent('mousedown', o));
      el.dispatchEvent(new MouseEvent('mouseup', o));
      el.dispatchEvent(new MouseEvent('click', o));
    }, ctrl);
    return true;
  } catch (e) { return false; }
}

// ── ESTADO DO PORTAL ─────────────────────────────────────────────────────────
// O Ginfo às vezes devolve a casca logada SEM o menu ("INÍCIO · ACESSAR HELP
// DESK · SAIR", sem FROTA/STRESS TEST). Nesse estado todo clique de menu falha
// e o relatório nunca abre — foi o que derrubou civf e sla-manutencao em todos
// os meses. Antes de usar o menu, confirma que ele montou; senão recarrega e,
// em último caso, refaz o login.
async function menuMontado(page) {
  try {
    const t = await page.locator('body').innerText({ timeout: 10000 });
    return /FROTA/i.test(t) && /STRESS\s*TEST/i.test(t);
  } catch (_) { return false; }
}

async function irPara(page, url, espera = 10000) {
  for (let t = 1; t <= 3; t++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(espera);
      return true;
    } catch (e) {
      log(`goto falhou (tentativa ${t}):`, String(e.message).split('\n')[0]);
      await page.waitForTimeout(5000);
    }
  }
  return false;
}

async function garantirPortal(page) {
  const INICIO = 'https://bi.ginfo.app.br/bi/inicio';
  for (let t = 1; t <= 3; t++) {
    if (/\/login/i.test(page.url())) { log('sessão caiu — refazendo o login'); await login(page); }
    else if (await menuMontado(page)) return true;
    else if (t === 1) { log('portal sem o menu lateral — recarregando'); await irPara(page, INICIO, 9000); }
    else { log('portal sem o menu lateral — refazendo o login'); await login(page); }
    if (await menuMontado(page)) return true;
    await irPara(page, INICIO, 9000);
    if (await menuMontado(page)) return true;
  }
  return false;
}

// ── NAVEGAÇÃO PELO MENU (deep-link recarrega o app Vue e volta p/ /bi/inicio) ─
// O menu lateral às vezes ainda não montou (ou o portal está na tela de
// boas-vindas). Tenta de novo, garantindo o portal entre as tentativas.
async function clicarMenu(page, secao, item) {
  for (let t = 0; t < 3; t++) {
    try { await clicarMenuUma(page, secao, item); return; }
    catch (e) {
      log(`menu ${secao} → ${item} falhou (tentativa ${t + 1}):`, String(e.message).split('\n')[0]);
      if (t === 2) throw e;
      await garantirPortal(page);
    }
  }
}
async function clicarMenuUma(page, secao, item) {
  // expande a seção (se ela mesma não estiver à vista, abre a sidebar)
  const secLoc = page.getByText(secao, { exact: true });
  if (await secLoc.count()) {
    await clicarRobusto(page, secLoc, { timeout: 8000 });
    await page.waitForTimeout(1500);
  } else {
    try { await page.locator('button').first().click({ timeout: 4000 }); await page.waitForTimeout(1000); } catch (e) {}
  }
  // NÃO filtrar por visível: a barra lateral rola, e um item abaixo da dobra
  // era descartado antes mesmo de tentar clicar (travava o STRESS TEST
  // EMPILHADEIRA depois de passar pelo FROTA). Rola até ele.
  let itemLoc = page.getByText(item, { exact: secao === item });
  for (let t = 0; t < 6 && !(await itemLoc.count()); t++) await page.waitForTimeout(2500);
  // CIVF → CIVF: seção e item têm o MESMO texto. O primeiro match é o cabeçalho
  // da seção — clicar nele recolhe o menu de novo (a página nunca abria).
  if (secao === item && (await itemLoc.count()) > 1) itemLoc = itemLoc.nth(1);
  if (!(await clicarRobusto(page, itemLoc, { timeout: 12000 })))
    throw new Error(`item de menu "${item}" não clicável`);
  await page.waitForTimeout(15000);
}

// ── FILTRO 1: slicer dropdown (Ano / Mês), com multisseleção p/ o acumulado ──
// Devolve TODOS os candidatos a dropdown do campo, do mais provável ao menos —
// quem chama tenta um a um até algum abrir com itens (na Conformidade o
// "mais próximo do rótulo" abria um dropdown vazio, que era o errado).
async function candidatosSlicer(page, campo) {
  const out = [];
  for (const fr of page.frames()) {
    try {
      const a = fr.locator(`.slicer-dropdown-menu:below(:text("${campo}"))`).first();
      if (await a.count()) out.push({ fr, dd: a });
      const b = fr.locator(`[aria-label="${campo}"]`).first();
      if (await b.count()) out.push({ fr, dd: b });
      const lbl = fr.getByText(campo, { exact: true }).filter({ visible: true }).first();
      if (!(await lbl.count())) continue;
      const lb = await lbl.boundingBox().catch(() => null);
      if (!lb) continue;
      const dds = fr.locator('.slicer-dropdown-menu, .slicer-restatement, .slicerHeader, [class*="slicer"][role="button"]').filter({ visible: true });
      const n = await dds.count();
      const arr = [];
      for (let i = 0; i < n; i++) {
        const e = dds.nth(i);
        const bb = await e.boundingBox().catch(() => null);
        if (!bb) continue;
        arr.push({ e, d: Math.hypot(bb.x - lb.x, bb.y - lb.y) });
      }
      arr.sort((x, y) => x.d - y.d);
      arr.slice(0, 3).forEach(x => out.push({ fr, dd: x.e }));
    } catch (e) {}
  }
  return out;
}
// diagnóstico p/ o log quando um slicer não é achado: que rótulos existem?
async function rotulosDeSlicer(page) {
  const out = [];
  for (const fr of page.frames()) {
    try {
      const ls = fr.locator('.slicer-dropdown-menu, .slicerHeader, [class*="slicer"] [class*="title" i]').filter({ visible: true });
      const n = Math.min(await ls.count(), 25);
      for (let i = 0; i < n; i++) out.push((await ls.nth(i).innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 40));
    } catch (e) {}
  }
  return out.filter(Boolean);
}
// O popup do slicer fica ABERTO depois da seleção e intercepta o clique no
// botão "..." do visual (Escape sozinho não fecha). Fecha clicando de novo no
// próprio dropdown (toggle) e confirma que o popup sumiu.
async function fecharPopupSlicer(page, dd) {
  for (let t = 0; t < 5; t++) {
    const aberto = await emFrames(page, async fr => {
      const p = fr.locator('.slicer-dropdown-popup, [id^="slicer-dropdown-popup"]').filter({ visible: true }).first();
      return (await p.count()) ? p : null;
    });
    if (!aberto) return true;
    if (t === 0 && dd) { try { await dd.click({ timeout: 5000 }); } catch (e) {} }
    else { await page.keyboard.press('Escape'); }
    await page.waitForTimeout(1200);
  }
  log('atenção: popup de slicer continuou aberto');
  return false;
}

// Sem filtro de "visível": na Aderência Conformidade os itens TÊM caixa na tela
// mas o Playwright não os considera visíveis, e a lista voltava vazia — era o
// que fazia o robô achar que nenhum dropdown tinha aberto.
async function itensDoSlicer(page) {
  const txt = [];
  for (const fr of page.frames()) {
    try {
      const t = await fr.locator('.slicerItemContainer, [role="option"], [role="listbox"] [role="treeitem"], .slicerText')
        .evaluateAll(els => els.filter(e => e.getClientRects().length).slice(0, 40)
          .map(e => (e.getAttribute('title') || e.textContent || '').trim().replace(/\s+/g, ' ')));
      txt.push(...t);
    } catch (e) {}
  }
  return txt.filter(Boolean);
}
// valores = 1 ou vários. No Power BI o 1º clique SUBSTITUI a seleção e os
// seguintes precisam de Ctrl para somar (é o mesmo ctrl+clique que o Renan faz).
async function aplicarSlicer(page, campo, valores) {
  const vals = Array.isArray(valores) ? valores : [valores];
  // o embed pode demorar a montar os slicers — procura por até ~45s em vez de
  // uma vez só (era o que derrubava a Aderência Conformidade)
  let cands = [];
  for (let t = 0; t < 9 && !cands.length; t++) {
    cands = await candidatosSlicer(page, campo);
    if (!cands.length) await page.waitForTimeout(5000);
  }
  if (!cands.length) {
    log(`slicer "${campo}" não encontrado — slicers visíveis:`, JSON.stringify(await rotulosDeSlicer(page)));
    return false;
  }
  // tenta cada candidato até um abrir COM ITENS (o mais próximo do rótulo nem
  // sempre é o certo — na Conformidade abria um dropdown vazio)
  let hit = null;
  for (const c of cands) {
    try { await c.dd.click({ timeout: 8000 }); } catch (e) { continue; }
    await page.waitForTimeout(2500);
    if ((await itensDoSlicer(page)).length) { hit = c; break; }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
  if (!hit) { log(`dropdown "${campo}" não abriu com itens (${cands.length} candidato(s))`); return false; }
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    const buscar = () => emFrames(page, async fr => {
      const it = fr.locator(`.slicerItemContainer:has-text("${v}"), [role="option"]:has-text("${v}"), .slicerText:text-is("${v}"), span:text-is("${v}")`).first();
      return (await it.count()) ? it : null;
    });
    let item = await buscar();
    for (let t = 0; t < 7 && !item; t++) { await page.waitForTimeout(2000); item = await buscar(); }
    if (!item) {
      log(`item "${v}" do slicer "${campo}" não encontrado — disponíveis:`, JSON.stringify(await itensDoSlicer(page)));
      await page.keyboard.press('Escape');
      return false;
    }
    // a lista do dropdown é virtualizada: o item existe mas o Playwright se
    // recusa a clicar ("element is not visible") — o clicarRobusto cai para um
    // evento sintético nesse caso (travava o Stress Test Empilhadeira no Fev-26)
    if (!(await clicarRobusto(page, item, { ctrl: i > 0, timeout: 10000 }))) {
      log(`item "${v}" do slicer "${campo}" não clicável`);
      await page.keyboard.press('Escape');
      return false;
    }
    await page.waitForTimeout(900);
  }
  await fecharPopupSlicer(page, hit.dd);
  await page.waitForTimeout(4000);
  log(`slicer "${campo}" = ${JSON.stringify(vals)} aplicado`);
  return true;
}

// O calendário do datepicker deixa um backdrop transparente do Angular por cima
// da página; clicar nele fecha (Escape nem sempre resolve).
async function fecharOverlay(page) {
  for (let t = 0; t < 4; t++) {
    const bd = await emFrames(page, async fr => {
      const b = fr.locator('.cdk-overlay-backdrop-showing, .cdk-overlay-backdrop').filter({ visible: true }).first();
      return (await b.count()) ? b : null;
    });
    if (!bd) return true;
    if (t === 0) await page.keyboard.press('Escape');
    else { try { await bd.click({ timeout: 3000, force: true }); } catch (e) {} }
    await page.waitForTimeout(1000);
  }
  log('atenção: overlay do datepicker continuou aberto');
  return false;
}

// ── FILTRO 2: par de campos de data (Preventivas, Checklists, SLA) ───────────
// A página pode ter mais de um par (ex.: Preventivas tem "Data de Execução" e
// "Data de Vencimento"); escolhe os dois campos MAIS PRÓXIMOS do rótulo pedido.
async function preencherDatas(page, rotulo, ini, fim) {
  const alvo = await emFrames(page, async fr => {
    const lbl = fr.getByText(rotulo, { exact: true }).filter({ visible: true }).first();
    if (!(await lbl.count())) return null;
    const cx = await lbl.boundingBox();
    if (!cx) return null;
    const inps = fr.locator('input[type="text"], input:not([type])').filter({ visible: true });
    const n = await inps.count();
    const cands = [];
    for (let i = 0; i < n; i++) {
      const el = inps.nth(i);
      const val = await el.inputValue().catch(() => '');
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test((val || '').trim())) continue;
      const b = await el.boundingBox().catch(() => null);
      if (!b) continue;
      cands.push({ el, x: b.x, d: Math.hypot(b.x - cx.x, b.y - cx.y) });
    }
    if (cands.length < 2) return null;
    cands.sort((a, b) => a.d - b.d);
    const par = cands.slice(0, 2).sort((a, b) => a.x - b.x);   // esquerda = início
    return { fr, ini: par[0].el, fim: par[1].el };
  });
  if (!alvo) { log(`campos de data de "${rotulo}" não encontrados`); return false; }
  // fill() em vez de click+digitar: o datepicker abre um overlay do Angular
  // (cdk-overlay-backdrop) que cobre a tela e intercepta o clique no 2º campo.
  // fill() não depende de ponteiro, então passa por cima do problema.
  for (const [el, valor] of [[alvo.ini, ini], [alvo.fim, fim]]) {
    await el.fill(valor, { timeout: 10000 });
    await el.press('Enter');
    await page.waitForTimeout(1200);
    await fecharOverlay(page);
  }
  await page.waitForTimeout(5000);
  log(`datas "${rotulo}": ${ini} → ${fim}`);
  return true;
}

// ── FILTRO 3: tiles de ano + meses no rodapé (Pneus) ─────────────────────────
// A faixa de meses é rolável: as setas "‹ ›" revelam quem está fora da janela.
// Rolar só para um lado deixa meses inalcançáveis, então alterna as direções.
// `perto` = caixa do tile do ANO. A página dos Pneus tem VÁRIOS slicers de mês
// (um por seção), então tanto as setas quanto os meses precisam ser os da mesma
// faixa horizontal — senão mexemos no filtro da seção errada.
const naFaixa = (bb, perto) => !perto || Math.abs((bb.y + bb.height / 2) - (perto.y + perto.height / 2)) < 120;
async function moverTiles(page, dir, perto = null) {
  const el = await emFrames(page, async fr => {
    const c = fr.locator('.navigationChevron, [class*="chevron" i], [aria-label*="Anterior" i], [aria-label*="Previous" i], [aria-label*="Próximo" i], [aria-label*="Next" i]');
    const n = await c.count();
    const arr = [];
    for (let i = 0; i < n; i++) {
      const e = c.nth(i);
      const bb = await e.boundingBox().catch(() => null);
      if (bb) arr.push({ e, bb });
    }
    if (!arr.length) return null;
    let cand = arr.filter(a => naFaixa(a.bb, perto));
    if (!cand.length) cand = arr;
    cand.sort((a, b) => a.bb.x - b.bb.x);
    return dir === 'prev' ? cand[0].e : cand[cand.length - 1].e;
  });
  if (el) {
    try { await el.click({ timeout: 5000 }); await page.waitForTimeout(1200); return true; } catch (e) {}
  }
  // Sem seta clicável: rola a faixa com a roda do mouse na horizontal. Nos
  // Pneus o grupo da Aderência Aferição renderiza só janeiro→junho; julho está
  // à direita e precisa de rolagem, não de outro seletor.
  {
    try {
      // sem referência de faixa (busca do ano), rola na área baixa da página,
      // onde ficam os tiles de período
      await page.mouse.move(700, perto ? perto.y + perto.height / 2 : 780);
      await page.mouse.wheel(dir === 'next' ? 400 : -400, 0);
      await page.waitForTimeout(1200);
      return true;
    } catch (e) {}
  }
  return false;
}
// clica um tile (ano ou mês). SEM filtro de visível: o tile pode estar fora da
// faixa rolável — rola até ele em vez de descartá-lo.
// Acha um tile (ano ou mês), rolando a faixa e esperando a página montar.
// `perto` = caixa do tile do ANO: restringe à mesma faixa horizontal, porque a
// página dos Pneus tem um slicer de mês por seção.
// Rola a faixa de meses DIRETO no elemento que tem rolagem horizontal, em vez
// de simular seta ou roda do mouse (nenhum dos dois move o slicer do Power BI).
// Acha o tile do ano dentro do frame para descobrir a faixa e empurra o
// scrollLeft de todo contêiner rolável naquela altura.
let ultimoAno = null;
// A faixa de meses dos Pneus NÃO rola: tem uma seta ">" logo depois do último
// mês ("Utilize a seta para navegar ao próximo nível"). É por isso que roda do
// mouse, setas genéricas e scrollLeft não moviam nada — não havia o que rolar.
// Acha o elemento pequeno e clicável imediatamente à direita do último tile da
// faixa do ano e clica nele.
async function setaProximoNivel(page, ano) {
  for (const fr of page.frames()) {
    try {
      const ok = await fr.evaluate(({ ano }) => {
        const tiles = [...document.querySelectorAll('.slicerItemContainer, [role="option"]')];
        const anoEl = tiles.find(e => (e.getAttribute('title') || e.textContent || '').trim() === String(ano));
        if (!anoEl) return false;
        const r = anoEl.getBoundingClientRect();
        const y = r.top + r.height / 2;
        const naFaixa = tiles.filter(e => {
          const b = e.getBoundingClientRect();
          return b.height > 0 && Math.abs(b.top + b.height / 2 - y) < 80;
        });
        if (!naFaixa.length) return false;
        const maxX = Math.max(...naFaixa.map(e => e.getBoundingClientRect().right));
        const cands = [...document.querySelectorAll('div,span,img,svg,button,i,path')].filter(e => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.width < 60 && b.height > 0 && b.height < 60
            && Math.abs(b.top + b.height / 2 - y) < 80
            && b.left >= maxX - 5 && b.left < maxX + 220;
        });
        if (!cands.length) return false;
        cands.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        const alvo = cands[0];
        const o = { bubbles: true, cancelable: true, view: window };
        alvo.dispatchEvent(new MouseEvent('mousedown', o));
        alvo.dispatchEvent(new MouseEvent('mouseup', o));
        alvo.dispatchEvent(new MouseEvent('click', o));
        return true;
      }, { ano });
      if (ok) return true;
    } catch (e) {}
  }
  return false;
}
async function rolarFaixaDoAno(page, ano, dir) {
  for (const fr of page.frames()) {
    try {
      const ok = await fr.evaluate(({ ano, dir }) => {
        const tiles = [...document.querySelectorAll('.slicerItemContainer, [role="option"]')];
        const anoEl = tiles.find(e => (e.getAttribute('title') || e.textContent || '').trim() === String(ano));
        if (!anoEl) return false;
        const r = anoEl.getBoundingClientRect();
        const y = r.top + r.height / 2;
        const conts = [...document.querySelectorAll('div')].filter(e => {
          if (e.scrollWidth <= e.clientWidth + 4) return false;
          const b = e.getBoundingClientRect();
          return b.height > 0 && Math.abs(b.top + b.height / 2 - y) < 150;
        });
        if (!conts.length) return false;
        conts.forEach(e => { e.scrollLeft += (dir === 'next' ? 320 : -320); });
        return true;
      }, { ano, dir });
      if (ok) return true;
    } catch (e) {}
  }
  return false;
}

async function acharTile(page, texto, perto = null) {
  for (let t = 0; t < 8; t++) {
    const b = await emFrames(page, async fr => {
      const els = fr.locator(`.slicerItemContainer:has-text("${texto}"), [role="option"]:has-text("${texto}"), span:text-is("${texto}")`);
      const n = await els.count();
      let melhor = null, dist = Infinity;
      for (let i = 0; i < n; i++) {
        const e = els.nth(i);
        const bb = await e.boundingBox().catch(() => null);
        if (!bb) continue;
        if (!perto) return e;
        const d = Math.abs((bb.y + bb.height / 2) - (perto.y + perto.height / 2));
        if (d < dist) { dist = d; melhor = e; }
      }
      return dist < 120 ? melhor : null;
    });
    if (b) return b;
    // procura primeiro para a DIREITA: os meses são clicados do mais recente
    // para o mais antigo, e o que falta costuma estar adiante na faixa
    const dir = t % 2 === 0 ? 'next' : 'prev';
    // avançar a faixa = clicar na seta ">" do slicer (não é rolagem); rolagem e
    // setas genéricas ficam como plano B para as outras telas
    let avancou = false;
    if (perto && ultimoAno && dir === 'next') avancou = await setaProximoNivel(page, ultimoAno);
    if (!avancou && perto && ultimoAno) avancou = await rolarFaixaDoAno(page, ultimoAno, dir);
    if (!avancou && !(await moverTiles(page, dir, perto))) await page.waitForTimeout(4000);
    await page.waitForTimeout(1500);
  }
  return null;
}
async function clicarTile(page, texto, modo = {}, perto = null) {
  const b = await acharTile(page, texto, perto);
  if (!b) return false;
  const ok = await clicarRobusto(page, b, { ctrl: !!(modo.modifiers || []).length, timeout: 8000 });
  await page.waitForTimeout(1200);
  return ok;
}
let ultimoAnoBox = null;   // faixa do slicer de período usado por último (Pneus)
async function selecionarBotoesPeriodo(page, ano, meses) {
  // Acha o tile do ANO e GUARDA a posição dele: os meses da mesma seção ficam
  // na mesma faixa horizontal. Sem isso, o robô clicava no primeiro "julho" do
  // documento — que é de outra seção da página (Calibragem/Milimetragem) — e a
  // tabela de Aderência Aferição ficava sem filtro de mês.
  ultimoAnoBox = null;
  ultimoAno = ano;
  const elAno = await acharTile(page, String(ano));   // com rolagem e espera
  if (elAno) {
    ultimoAnoBox = await elAno.boundingBox().catch(() => null);
    if (ultimoAnoBox) await clicarRobusto(page, elAno, { timeout: 8000 });
  }
  if (!ultimoAnoBox) { log(`tile do ano ${ano} não encontrado`); return false; }
  const clicar = (txt, modo) => clicarTile(page, txt, modo, ultimoAnoBox);
  await page.waitForTimeout(2500);
  // do mês MAIS RECENTE para o mais antigo: o recente já está visível, e a
  // rolagem segue sempre no mesmo sentido em vez de ir e voltar.
  const ordem = [...meses].reverse();
  for (let i = 0; i < ordem.length; i++) {
    if (!(await clicar(ordem[i], i === 0 ? {} : { modifiers: ['Control'] }))) {
      log(`tile do mês "${ordem[i]}" não encontrado`);
      return false;
    }
  }
  await page.waitForTimeout(4000);

  // Os tiles são TOGGLE: clicar num mês já selecionado o DESmarca (foi assim
  // que julho sumiu do acumulado). Confere o que ficou selecionado e corrige
  // com ctrl+clique, em vez de confiar na sequência de cliques.
  const querido = new Set(meses.map(m => m.toLowerCase()));
  for (let rodada = 0; rodada < 3; rodada++) {
    const sel = await mesesSelecionados(page);
    if (!sel) { log('atenção: não consegui ler a seleção dos tiles — seguindo sem conferir'); break; }
    const faltando = [...querido].filter(m => !sel.has(m));
    const sobrando = [...sel].filter(m => !querido.has(m));
    if (!faltando.length && !sobrando.length) break;
    log(`tiles rodada ${rodada + 1}: faltando ${JSON.stringify(faltando)} · sobrando ${JSON.stringify(sobrando)}`);
    if (rodada === 2) { log('não consegui acertar a seleção dos meses'); return false; }
    for (const m of [...faltando, ...sobrando]) await clicar(m, { modifiers: ['Control'] });
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(3000);
  log(`tiles: ${ano} · ${JSON.stringify(ordem)}`);
  return true;
}
// meses atualmente selecionados no slicer de tiles (Set em minúsculas) ou null
// se a tela não expõe o estado de seleção.
async function mesesSelecionados(page) {
  const sel = new Set();
  let achou = false;
  for (const fr of page.frames()) {
    try {
      // SEM filtro de visível: o mês selecionado pode ter saído da janela de
      // rolagem, e tratá-lo como "faltando" fazia o ctrl+clique DESmarcá-lo.
      const its = fr.locator('.slicerItemContainer[aria-selected="true"], [role="option"][aria-selected="true"], .slicerItemContainer.selected');
      const n = await its.count();
      if (n) achou = true;
      for (let i = 0; i < n; i++) {
        const t = (await its.nth(i).innerText().catch(() => '')).trim().toLowerCase();
        if (MES_FULL.includes(t)) sel.add(t);
      }
    } catch (e) {}
  }
  return achou ? sel : null;
}

// ── ACHAR A TABELA CERTA ────────────────────────────────────────────────────
const SEL_TABELA = '[role="grid"], [role="table"], .tableEx, [class*="tableEx"], .pivotTable, [class*="pivotTable"]';
async function tabelasVisiveis(page) {
  const tabs = [];
  for (const fr of page.frames()) {
    try {
      const grids = fr.locator('[role="grid"], [role="table"]');
      const n = await grids.count();
      for (let i = 0; i < n; i++) {
        const g = grids.nth(i);
        const box = await g.boundingBox().catch(() => null);
        if (!box || box.width < 60 || box.height < 40) continue;
        if (tabs.some(t => Math.abs(t.x - box.x) < 8 && Math.abs(t.y - box.y) < 8)) continue;
        tabs.push({ fr, v: g, x: box.x, y: box.y, cols: await g.locator('[role="columnheader"]').count() });
      }
    } catch (e) {}
  }
  tabs.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return tabs;
}
async function acharAlvo(page, cfg = {}) {
  for (let tent = 0; tent < 12; tent++) {
    if (cfg.header) {
      const alvo = await emFrames(page, async fr => {
        const g = fr.locator(SEL_TABELA)
          .filter({ has: fr.locator(`[role="columnheader"]:has-text("${cfg.header}")`) })
          .filter({ visible: true }).first();
        return (await g.count()) ? { fr, v: g } : null;
      });
      if (alvo) { log(`tabela com a coluna "${cfg.header}" encontrada`); return alvo; }
    } else if (cfg.ultima) {
      const tabs = await tabelasVisiveis(page);
      if (tabs.length >= 2) { log(`última tabela (${tabs.length} na página)`); return tabs[tabs.length - 1]; }
    } else {
      const tabs = await tabelasVisiveis(page);
      if (tabs.length) {
        const best = tabs.reduce((a, b) => (b.cols > a.cols ? b : a));
        log(`tabela escolhida: ${best.cols} coluna(s)`);
        return best;
      }
    }
    await page.waitForTimeout(5000);
  }
  for (const fr of page.frames()) {
    try {
      log('frame:', (fr.url() || '(sem url)').slice(0, 100),
        '| grids:', await fr.locator('[role="grid"], [role="table"]').count(),
        '| rows:', await fr.locator('[role="row"]').count());
    } catch (e) {}
  }
  return null;
}

// ── EXPORTAR o visual (hover → "..." → Exportar dados → confirma → xlsx) ────
async function exportarTabela(page, alvo, nomeArq, eopts = {}) {
  await fecharPopupSlicer(page);   // qualquer popup aberto bloqueia o clique no "..."
  const SEL_OPTS ='[aria-label*="Mais opções" i], [aria-label*="More options" i], [data-testid="visual-more-options-btn"], [title*="Mais opções" i], .vcMenuBtn';
  // O "..." fica FORA do grid (no cabeçalho do visual), então a busca acaba
  // caindo no frame inteiro — e pegar o PRIMEIRO exportava o visual errado
  // (foi o que aconteceu nas Preventivas, que trouxeram a tabela detalhada por
  // placa). Escolhe o "..." mais próximo do canto superior direito da tabela.
  const cx = await alvo.v.boundingBox().catch(() => null);
  let opts = null;
  for (let t = 0; t < 10 && !opts; t++) {
    try { await alvo.v.hover(); } catch (e) {}
    await page.waitForTimeout(1200);
    for (const root of [alvo.v, alvo.fr, page]) {
      try {
        const bs = root.locator(SEL_OPTS).filter({ visible: true });
        const n = await bs.count();
        if (!n) continue;
        let best = null, bd = Infinity;
        for (let i = 0; i < n; i++) {
          const b = bs.nth(i);
          if (!cx) { best = b; break; }
          const bb = await b.boundingBox().catch(() => null);
          if (!bb) continue;
          // opts.minY: ignora botões ACIMA do visual (o "..." de um card
          // vizinho ganhava por distância — foi o que exportou "No Prazo/341")
          if (eopts.minY != null && bb.y < eopts.minY) continue;
          const d = Math.hypot(bb.x - (cx.x + cx.width), bb.y - cx.y);
          if (d < bd) { bd = d; best = b; }
        }
        if (best) { opts = best; break; }
      } catch (e) {}
    }
    if (!opts) await page.waitForTimeout(1800);
  }
  if (!opts) throw new Error('botão "Mais opções (...)" não apareceu ao pairar sobre o visual');
  await opts.click({ timeout: 15000 });
  await page.waitForTimeout(800);
  const SEL_ITEM = 'button:has-text("Exportar dados"), [role="menuitem"]:has-text("Exportar dados"), [role="menuitem"]:has-text("Export data"), [title*="Exportar dados" i]';
  const item = await emFrames(page, async fr => {
    const i = fr.locator(SEL_ITEM).first();
    return (await i.count()) ? i : null;
  }) || page.locator(SEL_ITEM).first();
  await item.click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  const SEL_CONF = 'button:has-text("Exportar"), button:has-text("Export"), button:has-text("Baixar"), button:has-text("Download"), button:has-text("OK"), button:has-text("Continuar")';
  const dlPromise = page.waitForEvent('download', { timeout: 120000 });
  let confirmado = false;
  for (let t = 0; t < 12 && !confirmado; t++) {
    const tentar = async root => {
      try {
        const b = root.locator(SEL_CONF).filter({ visible: true }).filter({ hasNotText: 'Exportar dados' }).last();
        if (await b.count()) { await b.click({ timeout: 3000 }); return true; }
      } catch (e) {}
      return false;
    };
    confirmado = await tentar(page);
    if (!confirmado) for (const fr of page.frames()) { if (await tentar(fr)) { confirmado = true; break; } }
    if (!confirmado) await page.waitForTimeout(2500);
  }
  if (!confirmado) log('sem botão de confirmação visível — o download ainda pode vir direto');
  const download = await dlPromise;
  const arq = path.join(ART, nomeArq + '.xlsx');
  await download.saveAs(arq);
  log('baixado:', arq);
  return arq;
}

// O export do Power BI às vezes vem com um preâmbulo "Filtros aplicados:" antes
// do cabeçalho (e pode ter mais de uma planilha). Acha a aba com mais dados e o
// primeiro cabeçalho de verdade, e devolve o resumo dos filtros — que serve de
// conferência do período que a tela estava mostrando.
async function xlsxParaLinhas(arq) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(arq);
  let melhor = { linhas: [], filtros: null };
  for (const nome of wb.SheetNames) {
    const mat = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null, blankrows: false });
    let filtros = null;
    for (const r of mat) {
      const c0 = r && r[0] != null ? String(r[0]) : '';
      if (/filtros aplicados/i.test(c0)) filtros = c0.replace(/\s+/g, ' ').trim();
    }
    const iCab = mat.findIndex(r => r && r.filter(c => c != null && String(c).trim() !== '').length >= 3
      && !/filtros aplicados/i.test(String(r[0] || '')));
    if (iCab < 0) continue;
    const cols = mat[iCab].map((c, i) => (c == null || String(c).trim() === '' ? `col${i}` : String(c).trim()));
    const linhas = mat.slice(iCab + 1)
      .filter(r => r && r.some(c => c != null && String(c).trim() !== ''))
      .map(r => Object.fromEntries(cols.map((c, i) => [c, r[i] === undefined ? null : r[i]])));
    if (linhas.length > melhor.linhas.length) melhor = { linhas, filtros };
  }
  if (melhor.filtros) log('filtros do export:', melhor.filtros);
  return melhor;
}
// meses citados no resumo "Filtros aplicados" — é o único jeito confiável de
// saber o que a tela dos Pneus estava mostrando (os tiles não expõem seleção).
const mesesNosFiltros = f => {
  if (!f) return null;
  const l = String(f).toLowerCase();
  return new Set(MES_FULL.filter(m => l.includes(m)));
};

async function gravarSupabase(indicador, vigencia, escopo, linhas) {
  if (!SB_KEY) { log(`[dry-run] ${indicador} ${vigencia}/${escopo}: ${linhas.length} linhas`); return; }
  const res = await fetch(`${SB_URL}/rest/v1/elite_snapshot?on_conflict=indicador,vigencia,escopo`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ indicador, vigencia, escopo, data: linhas, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  JA.add(`${indicador}|${vigencia}|${escopo}`);
  log(`gravado: ${indicador} ${vigencia} (${escopo}) — ${linhas.length} linhas`);
}

// ── O QUE JÁ ESTÁ GRAVADO ───────────────────────────────────────────────────
// Uma coleta leva ~3 min; refazer o que já foi gravado estoura o tempo do job.
// ELITE_REFAZER=1 ignora este cache e coleta tudo de novo.
const JA = new Set();
async function carregarJaGravados() {
  if (!SB_KEY || process.env.ELITE_REFAZER === '1') return;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/elite_snapshot?select=indicador,vigencia,escopo`, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
    });
    if (!res.ok) { log('não consegui listar o que já está gravado:', res.status); return; }
    (await res.json()).forEach(r => JA.add(`${r.indicador}|${r.vigencia}|${r.escopo}`));
    log(`já gravados no Supabase: ${JA.size} registro(s) — serão pulados`);
  } catch (e) { log('não consegui listar o que já está gravado:', e.message); }
}

// ── DIAGNÓSTICO ─────────────────────────────────────────────────────────────
// Este ambiente não alcança o bi.ginfo.app.br: o único jeito de "ver" a tela é
// o robô despejar a estrutura real no log do Actions quando algo falha.
async function diagnostico(page, tag) {
  log(`DIAG ${tag} · url=${page.url()}`);
  try {
    const sb = await page.locator('#sidebar, #divSidebar, .sidebar').first()
      .evaluate(el => el.innerText.replace(/\s+/g, ' ').slice(0, 1200)).catch(() => null);
    if (sb) log('DIAG menu:', sb);
  } catch (e) {}
  for (const fr of page.frames()) {
    try {
      const its = await fr.locator('.slicerItemContainer, [role="option"]').evaluateAll(els =>
        els.slice(0, 30).map(e => ({
          t: (e.getAttribute('title') || e.textContent || '').trim().slice(0, 20),
          sel: e.getAttribute('aria-selected'),
          box: !!e.getClientRects().length,
        })));
      if (its.length) log('DIAG itens de slicer:', JSON.stringify(its));
      const sl = await fr.locator('[class*="slicer"]').evaluateAll(els =>
        [...new Set(els.slice(0, 40).map(e =>
          `${e.className}|${e.getAttribute('aria-label') || ''}|${(e.textContent || '').trim().slice(0, 18)}`))]);
      if (sl.length) log('DIAG slicers:', JSON.stringify(sl).slice(0, 2000));
      const gr = await fr.locator('[role="grid"], [role="table"]').evaluateAll(els =>
        els.map(e => [...e.querySelectorAll('[role="columnheader"]')].map(h => h.textContent.trim()).join(' | ').slice(0, 160)));
      if (gr.length) log('DIAG tabelas:', JSON.stringify(gr));
    } catch (e) {}
  }
}

// ── PNEUS VIA API (Supabase do painel de Pneus / Prolog) ────────────────────
// Regra do painel (pneus/painel.html, gráfico "Aderência às Aferições"):
//   aderência do mês = % da frota cuja ÚLTIMA aferição até o fim do mês está
//   dentro de 30 dias.
// Como o snapshot traz o histórico de inspeções, dá para calcular qualquer
// vigência sem depender da tela do Ginfo.
const PN_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const PN_KEY = 'sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';
// branch do Prolog → nome da Filial como vem do Ginfo (mesmo de-para do Gerot),
// para o elite_snapshot ficar consistente entre os indicadores
const BRANCH2FILIAL = {
  24: 'CDD CAMBORIU', 1878: 'CDD CUIABA', 1906: 'CUIABA', 1907: 'CUIABA EMPURRADA',
  20: 'CDD FLORIANOPOLIS', 30: 'CDD GUARULHOS', 2517: 'CDD NOVA FRIBURGO',
  26: 'CDD PELOTAS', 37: 'CDD RIO DE JANEIRO', 2277: 'CDD RONDONOPOLIS',
  1677: 'CDI MACACU', 1676: 'MACACU EMPURRADA', 38: 'PIRAI EMPURRADA',
};
async function coletarPneusApi(vigencia) {
  const ref = refDe(vigencia);
  const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59).getTime();
  const pega = async bid => {
    for (let a = 0; a < 5; a++) {
      try {
        const res = await fetch(`${PN_URL}/rest/v1/snapshot?branch_id=eq.${bid}&select=endpoint,data`,
          { headers: { apikey: PN_KEY, Authorization: 'Bearer ' + PN_KEY } });
        if (res.ok) return await res.json();
      } catch (e) {}
      await new Promise(r => setTimeout(r, 800));   // o free tier dá 500 intermitente nos jsonb grandes
    }
    return [];
  };
  const linhas = [];
  for (const bid of Object.keys(BRANCH2FILIAL)) {
    const rows = await pega(bid);
    const veic = (rows.find(r => r.endpoint === 'vehicles') || {}).data || [];
    const insp = (rows.find(r => r.endpoint === 'inspections') || {}).data || [];
    if (!veic.length) continue;
    const ultima = {};
    for (const i of insp) {
      const t = new Date(i.dataInspecao).getTime();
      if (!isFinite(t) || t > fim) continue;
      if (ultima[i.veiculoId] === undefined || t > ultima[i.veiculoId]) ultima[i.veiculoId] = t;
    }
    let ok = 0;
    for (const v of veic) {
      const u = ultima[v.id];
      if (u !== undefined && Math.floor((fim - u) / 86400000) <= 30) ok++;
    }
    linhas.push({
      Filial: BRANCH2FILIAL[bid],
      'Aderência Aferição': +(ok / veic.length * 100).toFixed(1),
      'Frota': veic.length,
      'Aferidos em 30 dias': ok,
    });
  }
  return linhas;
}

// ── COLETA de 1 indicador em 1 vigência/escopo ──────────────────────────────
async function coletar(page, ind, vigencia, escopo) {
  const ref = refDe(vigencia);
  const ini = escopo === 'ano' ? new Date(ref.getFullYear(), ind.mesInicial || 0, 1) : ref;
  const fim = fimDoMes(ref);
  const tag = `${ind.chave}-${vigencia.replace('/', '-')}-${escopo}`;

  // indicador que vem de API não abre navegador nenhum
  if (ind.api === 'pneus') {
    log(`— ${ind.chave} · ${vigencia} · ${escopo} (via API do painel de Pneus)`);
    const linhas = await coletarPneusApi(vigencia);
    if (!linhas.length) throw new Error(`API de pneus não devolveu dados em ${tag}`);
    log('colunas:', JSON.stringify(Object.keys(linhas[0])));
    await gravarSupabase(ind.chave, vigencia, escopo, linhas);
    return;
  }

  const urlAba = ind.url || 'https://bi.ginfo.app.br/bi/inicio';
  log(`— ${ind.chave} · ${vigencia} · ${escopo}`);
  await irPara(page, urlAba);
  if (/\/login/i.test(page.url())) {
    log('sessão caiu — refazendo o login');
    await login(page);
    await irPara(page, urlAba);
  }
  if (ind.menu && (!ind.url || /\/bi\/inicio/.test(page.url()))) {
    if (!(await menuMontado(page)) && !(await garantirPortal(page)))
      throw new Error('portal abriu sem o menu lateral — sessão não recuperada');
    log('navegando pelo menu:', ind.menu.join(' → '));
    await clicarMenu(page, ind.menu[0], ind.menu[1]);
  } else {
    await page.waitForTimeout(5000);
  }

  // aba interna do relatório (ex.: EMPILHADEIRA x PALETEIRA no Armazém)
  if (ind.aba) {
    const b = await emFrames(page, async fr => {
      const el = fr.getByText(ind.aba, { exact: true }).filter({ visible: true }).first();
      return (await el.count()) ? el : null;
    });
    if (!b) throw new Error(`aba "${ind.aba}" não encontrada em ${ind.chave}`);
    await b.click();
    await page.waitForTimeout(6000);
    log(`aba interna: ${ind.aba}`);
  }

  // período — falhar aqui ABORTA (nunca gravar a tela no filtro errado por cima do bom)
  const p = ind.periodo;
  let ok = false, mesesEsperados = null;
  if (p.tipo === 'dropdown') {
    // Conformidade lista o mês por extenso; as demais telas usam "Jul-26"
    const fmtMes = p.mesFormato === 'nome' ? (d => MES_FULL[d.getMonth()]) : mesDropdown;
    const mes0 = escopo === 'ano' ? (ind.mesInicial || 0) : ref.getMonth();
    const meses = Array.from({ length: ref.getMonth() + 1 - mes0 }, (_, i) => fmtMes(new Date(ref.getFullYear(), mes0 + i, 1)));
    // p.semAno: o valor do Mês já traz o ano ("Jul-26") e, em algumas telas, o
    // que parece o slicer "Ano" é um visual — clicar cria filtro de "Incluídos"
    ok = p.semAno ? true : await aplicarSlicer(page, 'Ano', String(ref.getFullYear()));
    if (ok) ok = await aplicarSlicer(page, 'Mês', meses);
  } else if (p.tipo === 'datas') {
    ok = await preencherDatas(page, p.rotulo, dataDe(ini), dataDe(fim));
  } else if (p.tipo === 'botoes') {
    mesesEsperados = escopo === 'ano'
      ? MES_FULL.slice(0, ref.getMonth() + 1)
      : [MES_FULL[ref.getMonth()]];
    ok = await selecionarBotoesPeriodo(page, ref.getFullYear(), mesesEsperados);
  }
  // filtros fixos da tela (ex.: as duas quinzenas do Stress Test Frota)
  if (ok && Array.isArray(ind.slicersFixos)) {
    for (const s of ind.slicersFixos) {
      ok = await aplicarSlicer(page, s.campo, s.valor);
      if (!ok) break;
    }
  }
  await shot(page, '10-' + tag);
  if (!ok) throw new Error(`período não aplicado em ${tag} — abortando p/ não gravar dado errado`);

  // drill-through DEPOIS do filtro: a página de detalhe herda o período aplicado
  if (ind.drill) {
    await drillThrough(page, ind.drill.card, ind.drill.item, ind.drill.offs);
    await shot(page, '10b-' + tag);
  }

  const alvo = await acharAlvo(page, ind.tabela || {});
  if (!alvo) { await shot(page, '98-sem-tabela-' + tag); throw new Error(`tabela não encontrada em ${tag}`); }
  let arq = await exportarTabela(page, alvo, tag);
  let { linhas, filtros } = await xlsxParaLinhas(arq);

  // Pneus: os tiles não expõem a seleção, então o resumo de filtros do export é
  // o verificador. Não bateu? alterna o que falta/sobra e exporta de novo; se
  // não fechar em 3 rodadas, ABORTA sem gravar.
  if (mesesEsperados) {
    const querido = new Set(mesesEsperados);
    for (let r = 0; r < 3; r++) {
      const sel = mesesNosFiltros(filtros);
      const igual = sel && sel.size === querido.size && [...querido].every(m => sel.has(m));
      if (igual) break;
      log(`meses do export: ${sel ? JSON.stringify([...sel]) : '(não identificados)'} · esperado ${JSON.stringify([...querido])}`);
      if (r === 2) throw new Error(`meses errados no export de ${tag} — abortando sem gravar`);
      const faltando = [...querido].filter(m => !sel || !sel.has(m));
      const sobrando = sel ? [...sel].filter(m => !querido.has(m)) : [];
      for (const m of [...faltando, ...sobrando]) await clicarTile(page, m, { modifiers: ['Control'] }, ultimoAnoBox);
      await page.waitForTimeout(4000);
      try { fs.unlinkSync(arq); } catch (e) {}
      const alvo2 = await acharAlvo(page, ind.tabela || {});
      if (!alvo2) throw new Error(`tabela não encontrada ao reexportar ${tag}`);
      arq = await exportarTabela(page, alvo2, tag);
      ({ linhas, filtros } = await xlsxParaLinhas(arq));
    }
  }

  if (!linhas.length) throw new Error(`export vazio em ${tag}`);
  if (linhas.length < 3) log(`ATENÇÃO: só ${linhas.length} linha(s) em ${tag} — confira o filtro no screenshot`);
  log('colunas:', JSON.stringify(Object.keys(linhas[0])));
  // bases detalhadas trazem a vigência na própria linha: mostra quais vieram,
  // para saber se o export respeitou o filtro ou trouxe o período inteiro
  {
    const kComp = Object.keys(linhas[0]).find(k => /compet[êe]ncia/i.test(k));
    if (kComp) {
      const c = {};
      linhas.forEach(r => { const v = String(r[kComp] ?? '').trim(); if (v) c[v] = (c[v] || 0) + 1; });
      log(`competências no export (${Object.keys(c).length}):`, JSON.stringify(c));
      const kSt = Object.keys(linhas[0]).find(k => /^status$/i.test(k));
      if (kSt) {
        const s = {};
        linhas.forEach(r => { const v = String(r[kSt] ?? '').trim(); if (v) s[v] = (s[v] || 0) + 1; });
        log('status distintos:', JSON.stringify(s));
      }
    }
  }
  await gravarSupabase(ind.chave, vigencia, escopo, linhas);
  if (SB_KEY) { try { fs.unlinkSync(arq); } catch (e) {} }
}

// ── PLANO DE EXECUÇÃO ───────────────────────────────────────────────────────
function vigenciasEntre(de, ate) {
  const out = [];
  let d = refDe(de);
  const f = refDe(ate);
  while (d <= f) { out.push(vigDe(d)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
  return out;
}

// ── SONDA: drill de detalhe da Conformidade (modo conf-drill) ────────────────
// A tentativa antiga era botão direito no CARD (5 offsets, sem menu). Aqui o
// alvo é a TABELA por Filial: no Power BI o drill-through responde no PONTO DE
// DADO, então clicamos com o direito nas células. Não grava nada — só loga os
// menus que aparecem, fotografa cada passo e, se a página de detalhe abrir,
// exporta a tabela e imprime as colunas + primeiras linhas nos logs.
async function sondaConfDrill(page) {
  // v4: a tabela do "Detalhes Aderência Mensal" está mapeada (15 colunas, com
  // Vencimento Vigente/Status por placa). O export da v3 pegou o card vizinho;
  // agora o alvo é a tabela grande (>=8 colunas) com minY travado nela.
  await irPara(page, 'https://bi.ginfo.app.br/bi/inicio');
  if (!(await menuMontado(page)) && !(await garantirPortal(page))) throw new Error('portal sem menu');
  await clicarMenu(page, 'FROTA', '1.2 - ADERÊNCIA CONFORMIDADE');
  const alvo = await acharAlvo(page, { header: 'Filial' });
  if (!alvo) throw new Error('tabela por Filial não apareceu');
  const cel = alvo.v.locator('[role="gridcell"]').first();
  const box = await cel.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForTimeout(2000);
  const drill = await emFrames(page, async fr => {
    const d = fr.locator('[role="menuitem"]').filter({ visible: true }).filter({ hasText: /drill/i }).first();
    return (await d.count()) ? d : null;
  });
  if (!drill) throw new Error('menu Drill-through não abriu');
  await drill.hover(); await page.waitForTimeout(1500);
  const item = await emFrames(page, async fr => {
    const i = fr.locator('[role="menuitem"]:has-text("Detalhes Aderência Mensal")').filter({ visible: true }).first();
    return (await i.count()) ? i : null;
  });
  if (!item) throw new Error('item "Detalhes Aderência Mensal" não apareceu');
  await item.click();
  await page.waitForTimeout(25000);
  const tabs = await tabelasVisiveis(page);
  const det = tabs.find(t => t.cols >= 8);
  if (!det) { await shot(page, 'cd4-sem-tabela'); throw new Error('tabela de detalhe (8+ colunas) não apareceu'); }
  const bb = await det.v.boundingBox();
  log('tabela de detalhe em', Math.round(bb.x), Math.round(bb.y), '·', det.cols, 'colunas');
  const arq = await exportarTabela(page, det, 'cd4-detalhe', { minY: bb.y - 60 });
  await dumpXlsx(arq, 'Detalhes Aderência Mensal');
}

// despeja o xlsx cru: nome/tamanho de cada aba + primeiras linhas como vieram
async function dumpXlsx(arq, rotulo) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(arq);
  log(`[${rotulo}] abas do xlsx:`, JSON.stringify(wb.SheetNames));
  for (const nome of wb.SheetNames) {
    const mat = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null, blankrows: false });
    log(`[${rotulo}] aba "${nome}": ${mat.length} linha(s)`);
    mat.slice(0, 12).forEach((r, i) => log(`  r${i}:`, JSON.stringify(r).slice(0, 400)));
  }
}

async function main() {
  if (!USER || !PASS) { console.error('Faltam Secrets: GINFO_USER / GINFO_PASS'); process.exit(1); }

  const soInd = (process.env.ELITE_IND || '').split(',').map(s => s.trim()).filter(Boolean);
  const inds = soInd.length ? INDICADORES.filter(i => soInd.includes(i.chave)) : INDICADORES;
  if (!inds.length) { console.error('ELITE_IND não casou com nenhum indicador'); process.exit(1); }

  const hoje = new Date();
  const mesAnterior = vigDe(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));
  let vigencias = [], escopos = [];

  if (MODE === 'mes') {
    // rotina: roda do dia 01 ao 15 gravando o mês anterior fechado + o acumulado do ano
    if (hoje.getDate() > 15 && !FORCAR) {
      log(`hoje é dia ${hoje.getDate()} — fora da janela 01–15; nada a fazer.`);
      return;
    }
    vigencias = [mesAnterior];
    escopos = (process.env.ELITE_ESCOPOS || 'mes,ano').split(',').map(s => s.trim()).filter(Boolean);
  } else if (MODE === 'backfill') {
    vigencias = vigenciasEntre(process.env.ELITE_DE || VIG_INICIAL, process.env.ELITE_ATE || mesAnterior);
    escopos = (process.env.ELITE_ESCOPOS || 'mes').split(',').map(s => s.trim()).filter(Boolean);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  try {
    await login(page);
    if (MODE === 'login') { log('modo login: só o teste de acesso. Veja os screenshots nos artifacts.'); return; }
    if (MODE === 'conf-drill') { await sondaConfDrill(page); return; }

    log(`plano: ${inds.length} indicador(es) × ${vigencias.length} vigência(s) × ${escopos.length} escopo(s)`);
    await carregarJaGravados();
    let erros = 0;
    for (const vig of vigencias) {
      for (const esc of escopos) {
        for (const ind of inds) {
          if (ind.soAno && esc !== 'ano') continue;           // só existe no acumulado
          const ord = v => v.slice(3) + v.slice(0, 2);        // 'MM/AAAA' → 'AAAAMM'
          if (ind.vigMin && ord(vig) < ord(ind.vigMin)) continue;
          if (ind.vigMax && ord(vig) > ord(ind.vigMax)) continue;
          if (esc === 'ano' && ind.semAcumulado) {
            log(`— ${ind.chave}: acumulado do ano sai da soma dos meses no leitor (a tela não acumula)`);
            continue;
          }
          if (JA.has(`${ind.chave}|${vig}|${esc}`)) { log(`— ${ind.chave} ${vig} (${esc}): já gravado, pulando`); continue; }
          for (let tent = 1; tent <= 3; tent++) {
            try {
              if (/\/login/i.test(page.url())) { log('sessão caiu — refazendo o login'); await login(page); }
              await coletar(page, ind, vig, esc);
              break;
            } catch (e) {
              log(`ERRO ${ind.chave} ${vig}/${esc} (tentativa ${tent}):`, e.message);
              await shot(page, `99-erro-${ind.chave}-${vig.replace('/', '-')}-${esc}-t${tent}`);
              if (tent === 1) await diagnostico(page, `${ind.chave} ${vig}/${esc}`);
              else await garantirPortal(page);
              if (tent === 3) erros++;
            }
          }
        }
      }
    }
    if (erros) { console.error(`${erros} coleta(s) com erro`); process.exit(1); }
  } finally {
    await browser.close();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
