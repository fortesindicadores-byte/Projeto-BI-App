// ============================================================================
// Robô Ginfo (Power BI) — coleta automática para o Farol
// Roda no GitHub Actions (.github/workflows/ginfo-robot.yml), com Playwright.
//
// Modos (env GINFO_MODE): login · mapa (reconhecimento do portal) · run
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

/* ── conferência (não muda o run diário) ──────────────────────────────────
   GINFO_ABA  roda só uma chave (ex.: checklist-031120)
   GINFO_MES  força o mês do slicer (ex.: julho) — para usar um mês conhecido
              como CONTROLE: se o mês de controle traz o número esperado pelo
              mesmo caminho, a mecânica está boa e o mês magro é real.
   GINFO_DRY  não grava no Supabase; só imprime o resumo do que veio.
   O resumo NUNCA imprime coluna de pessoa (o repositório é público).        */
const SO_ABA    = (process.env.GINFO_ABA || '').trim();
const MES_FORCA = (process.env.GINFO_MES || '').trim();
const DRY       = process.env.GINFO_DRY === '1';
const COL_PESSOA = /motorista|mecânico|mecanico|avaliador|placa|chassis|condutor|nome/i;

// ── ABAS DO GINFO (preencher conforme o mapeamento aba a aba) ──
// chave = linha em ginfo_snapshot · url = deep-link do relatório · visual = título do
// visual (opcional; sem título, o robô exporta a PRIMEIRA tabela da página).
// Regra: o dado fica SÓ no Supabase — o arquivo baixado é apagado após gravar.
const MES_LBL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MES_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesSlicer = d => MES_LBL[d.getMonth()] + '-' + String(d.getFullYear()).slice(2);   // ex.: 'Jul-26'
// até o 3º dia ÚTIL do mês (seg–sex)? — corte do Checklist/OS crítica
function ateTerceiroDiaUtil(d) {
  let uteis = 0;
  for (let dia = 1; dia <= d.getDate(); dia++) {
    const w = new Date(d.getFullYear(), d.getMonth(), dia).getDay();
    if (w >= 1 && w <= 5) uteis++;
  }
  return uteis <= 3;
}
const ABAS = [
  // 1.1 DOCUMENTOS → drill-through "Detalhes Veículos" → tabela = base ATIVOS
  // (Filial | Projeto | Placa | Marca | Modelo | Tipo Veículo | Estado | Ano Fabricação)
  { chave: 'ativos', reportId: '99029b42-f690-451b-95b1-9fad2c9b670d',
    menu: ['FROTA', '1.1 - DOCUMENTOS'], drill: { card: 'VEÍCULOS', item: 'Detalhes Veículos' } },
  // STRESS TEST FROTA → tabela detalhada por placa (a de mais colunas da página).
  // Regra de período: até o dia 10, Mês = mês anterior e Quinzena = Segunda.
  // (Do dia 11 em diante: regra a confirmar com o Renan — por ora fica o padrão da página.)
  { chave: 'stress-test-frota', reportId: 'ce4f37f8-1c4c-499f-a80c-3a3ce80594cb',
    menu: ['STRESS TEST', 'STRESS TEST FROTA'],
    slicers: () => {
      const h = new Date();
      if (h.getDate() > 10) return [];
      const ant = new Date(h.getFullYear(), h.getMonth() - 1, 1);
      return [{ campo: 'Mês', valor: mesSlicer(ant) }, { campo: 'Quinzena', valor: 'Segunda' }];
    } },
  // STRESS TEST EMPILHADEIRA → tabela detalhada "Análise Descontos", achada
  // pela coluna "Chassis" (única dela na página — as tabelas por Transportador/
  // Filial não têm; mirar pelo TÍTULO não funciona: o container tem caixa 0x0).
  // Regra de período: até o dia 10, só Mês = mês anterior (não tem slicer de Quinzena).
  { chave: 'stress-test-empilhadeira', reportId: 'd1cead3d-e28a-487b-a1bd-8b72cdd6da55',
    menu: ['STRESS TEST', 'STRESS TEST EMPILHADEIRA'],
    header: 'Chassis',
    slicers: () => {
      const h = new Date();
      if (h.getDate() > 10) return [];
      const ant = new Date(h.getFullYear(), h.getMonth() - 1, 1);
      return [{ campo: 'Mês', valor: mesSlicer(ant) }];
    } },
  // CIVF → última tabela da página (detalhada por veículo: Transportador | Filial
  // Freightech | Veículo | Projeto | Data CIVF | Status | Manutenção | Lavação |
  // Desconto Manutenção | Desconto Lavagem | Desconto Total) = aba CIFV do Farol.
  // Regra de período: até o dia 10, só Mês = mês anterior.
  { chave: 'civf', reportId: '5bd5e3ac-7ebc-4c7b-963e-1c3d20ba4acd',
    menu: ['CIVF', 'CIVF'], ultima: true,
    slicers: () => {
      const h = new Date();
      if (h.getDate() > 10) return [];
      const ant = new Date(h.getFullYear(), h.getMonth() - 1, 1);
      return [{ campo: 'Mês', valor: mesSlicer(ant) }];
    } },
  // 2.2 PREVENTIVAS → 3ª tabela da página (ordem visual, de cima p/ baixo) = aba
  // Preventivas do Farol (colunas E–U; A–D da planilha são fórmulas: Placa
  // Mercosul/Projeto/Unidade = join com a base 'ativos' pela placa; Aderência =
  // regra da planilha — o LEITOR recalcula; o robô grava só o que o Ginfo traz).
  { chave: 'preventivas', menu: ['FROTA', '2.2 - PREVENTIVAS'], indice: 3 },
  // 3.4 PNEUS → tabela de Alinhamentos (Filial | Placa | Próx. Even. | Status |
  // Dias | Documento) — achada pela coluna "Documento" = aba Alinhamentos do Farol.
  { chave: 'alinhamentos', reportId: '3ab8927b-b1c5-4f10-8f36-dad6bb8a8a22',
    menu: ['FROTA', '3.4 - PNEUS'], header: 'Documento' },
  // 2.4 ORDEM SERVIÇO → botão direito no card "NÃO EXECUTADAS" → Drill-through →
  // "Detalhes Ordem Serviço" → tabela (Nº OS | Data | Status | Filial | Origem |
  // Tipo | Criticidade | SLAs | Segmento | Fornecedor | Mecânico | Motorista |
  // Placa) = aba OS em Aberto do Farol. "Dias em Aberto" (col. A da planilha) é
  // fórmula = AGORA() − Data, mínimo 0 — o leitor recalcula na hora de exibir.
  { chave: 'os-em-aberto', reportId: '81e8f48c-09f2-4bc7-a84e-0718378732c9',
    menu: ['FROTA', '2.4 - ORDEM SERVIÇO'], drill: { card: 'NÃO EXECUTADAS', item: 'Detalhes Ordem Serviço' } },
  // 1.3 ADERÊNCIA FROTA - 031120 → única tabela da página, com o ano todo
  // (Mapa | Data do mapa | Data OS | Início/Fim técnico | Problema | Nº OS |
  // Tipo Checklist | Status | Filial | Motorista | Placa | Tipo Veículo |
  // Projeto). Alimenta o farol NOVO "Checklist" (Saída com OS Crítica do mês).
  // 1.3 ADERÊNCIA FROTA - 031120 → botão direito no card "SAÍDAS COM OS
  // CRÍTICA" → Drill-through → "Detalhes Saídas Com OS Crítica" → na página de
  // detalhe, slicer Mês (nome completo, ex. "julho") → exportar a tabela
  // detalhada (Mapa | Data do mapa | Data OS | Início/Fim técnico | Problema |
  // Nº OS | Tipo Checklist | Status | Filial | Motorista | Placa | Tipo
  // Veículo | Projeto). Regra de período (Renan, 03/08/2026): até o 3º DIA
  // ÚTIL do mês ainda exporta o mês ANTERIOR; depois começa o mês atual.
  { chave: 'checklist-031120', reportId: '76e82774-d5d4-4cda-bb13-65a1a64387ef',
    menu: ['FROTA', '1.3 - ADERÊNCIA FROTA - 031120'],
    drill: { card: 'SAÍDAS COM OS CRÍTICA', item: 'Detalhes Saídas Com OS Crítica' },
    slicers: () => {
      const h = new Date();
      const ref = ateTerceiroDiaUtil(h) ? new Date(h.getFullYear(), h.getMonth() - 1, 1) : h;
      return [{ campo: 'Mês', valor: MES_FULL[ref.getMonth()] }];
    } },
];

const ART = 'ginfo-artifacts';
fs.mkdirSync(ART, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function shot(page, nome) {
  try { await page.screenshot({ path: path.join(ART, nome + '.png'), fullPage: false }); log('screenshot:', nome); }
  catch (e) { log('screenshot falhou:', nome, e.message); }
}

/* O portal novo (GINFO Analytics, 08/2026) abre cada relatório numa ABA e
   MANTÉM as anteriores vivas no DOM: com duas abertas, os dois iframes do
   Power BI coexistem, cada um com suas tabelas. Varrer todos os frames faria
   o robô exportar a tabela da ABA ERRADA — sem erro nenhum, gravando dado
   trocado no Supabase. Por isso toda busca é restrita ao relatório da aba:
   pelo reportId quando conhecido (é o mesmo GUID dos antigos deep-links),
   senão o último iframe aberto, que é a aba recém-clicada.               */
function framesDaAba(page, aba) {
  const pbi = page.frames().filter(f => /app\.powerbi\.com\/reportEmbed/.test(f.url()));
  let alvo = null;
  if (aba && aba.reportId) alvo = pbi.find(f => f.url().includes(aba.reportId)) || null;
  if (!alvo) alvo = pbi[pbi.length - 1] || null;
  // o mainFrame entra porque menus e flyouts do portal renderizam fora do embed
  return alvo ? [alvo, page.mainFrame()] : page.frames();
}

// procura um locator nos frames da aba atual (o Power BI roda dentro de iframe)
async function emFrames(page, fazer, aba) {
  for (const fr of framesDaAba(page, aba)) {
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

// Seletores de tabela do Power BI (variam por versão do embed)
const SEL_TABELA = '[role="grid"], [role="table"], .tableEx, [class*="tableEx"], .pivotTable, [class*="pivotTable"]';
// espera a página do Power BI renderizar e acha o alvo (polling de até 60s).
// Modos (na ordem): visual = pelo TÍTULO · header = tabela que tem essa COLUNA ·
// indice = N-ésima tabela na ordem visual (de cima p/ baixo) · padrão = a tabela
// com MAIS COLUNAS (a detalhada da página). Só considera elementos VISÍVEIS —
// o embed mantém visuais fora de tela/ocultos que resolvem no seletor mas não clicam.
async function acharAlvo(page, aba) {
  // lista as TABELAS visíveis pelos [role=grid/table] — 1 elemento por tabela
  // real. (Os <visual-container> do embed têm caixa 0x0 — o conteúdo fica em
  // divs internas — então NÃO servem p/ medir posição/visibilidade.)
  const tabelasVisiveis = async () => {
    const tabs = [];
    for (const fr of framesDaAba(page, aba)) {
      try {
        const grids = fr.locator('[role="grid"], [role="table"]');
        const n = await grids.count();
        for (let i = 0; i < n; i++) {
          const g = grids.nth(i);
          const box = await g.boundingBox().catch(() => null);
          if (!box || box.width < 60 || box.height < 40) continue;   // oculto/decorativo
          if (tabs.some(t => Math.abs(t.x - box.x) < 8 && Math.abs(t.y - box.y) < 8)) continue;
          const cols = await g.locator('[role="columnheader"]').count();
          tabs.push({ fr, v: g, x: box.x, y: box.y, cols });
        }
      } catch (e) {}
    }
    tabs.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    return tabs;
  };
  for (let tent = 0; tent < 12; tent++) {
    if (aba.visual) {
      // preferência: o CONTAINER do visual que tem o título E um grid dentro
      // (hover nele faz o botão "..." aparecer); só depois o título solto.
      const alvo = await emFrames(page, async fr => {
        let v = fr.locator(`visual-container:has([role="grid"]):has-text("${aba.visual}"), visual-container:has([role="table"]):has-text("${aba.visual}")`).filter({ visible: true }).first();
        if (!(await v.count())) v = fr.locator(`visual-container:has-text("${aba.visual}"), [aria-label*="${aba.visual}"], .visualTitle:has-text("${aba.visual}")`).filter({ visible: true }).first();
        return (await v.count()) ? { fr, v } : null;
      }, aba);
      if (alvo) return alvo;
    } else if (aba.ultima) {
      // "última tabela da página" (a detalhada fica embaixo) — espera pelo menos
      // 2 visuais de tabela p/ não pegar o resumo enquanto o resto ainda carrega
      const tabs = await tabelasVisiveis();
      if (tabs.length >= 2) {
        const t = tabs[tabs.length - 1];
        log(`última tabela escolhida (${tabs.length} na página, ${t.cols} colunas)`);
        return t;
      }
    } else if (aba.header) {
      for (const hd of (Array.isArray(aba.header) ? aba.header : [aba.header])) {
        const alvo = await emFrames(page, async fr => {
          const g = fr.locator(SEL_TABELA)
            .filter({ has: fr.locator(`[role="columnheader"]:has-text("${hd}")`) })
            .filter({ visible: true }).first();
          return (await g.count()) ? { fr, v: g } : null;
        }, aba);
        if (alvo) { log(`tabela com a coluna "${hd}" encontrada`); return alvo; }
      }
    } else if (aba.indice) {
      const tabs = await tabelasVisiveis();
      if (tabs.length >= aba.indice) {
        log(`tabela nº ${aba.indice} de ${tabs.length} escolhida (${tabs[aba.indice - 1].cols} colunas)`);
        return tabs[aba.indice - 1];
      }
      if (tabs.length) log(`aguardando: só ${tabs.length} tabela(s) visíveis (preciso de ${aba.indice})`);
    } else {
      const tabs = await tabelasVisiveis();
      if (tabs.length) {
        const best = tabs.reduce((a, b) => (b.cols > a.cols ? b : a));
        log(`tabela escolhida: ${best.cols} coluna(s)`);
        return best;
      }
    }
    await page.waitForTimeout(5000);
  }
  // diagnóstico: o que cada frame contém (sai no log do Actions)
  for (const fr of page.frames()) {
    try {
      const vc = await fr.locator('visual-container, [class*="visualContainer"], [class*="visual-container"]').count();
      const gr = await fr.locator('[role="grid"], [role="table"]').count();
      const rows = await fr.locator('[role="row"]').count();
      log('frame:', (fr.url() || '(sem url)').slice(0, 100), '| visuais:', vc, '| grids:', gr, '| rows:', rows);
    } catch (e) {}
  }
  return null;
}

// aplica um slicer dropdown do Power BI: abre o dropdown do campo e clica no item.
// No PBI, clicar num item de slicer de caixinhas SUBSTITUI a seleção (não soma).
async function aplicarSlicer(page, campo, valor) {
  const hit = await emFrames(page, async fr => {
    const dd = fr.locator(`.slicer-dropdown-menu:below(:text("${campo}"))`).first();
    if (await dd.count()) return { fr, dd };
    const alt = fr.locator(`[aria-label="${campo}"]`).first();
    if (await alt.count()) return { fr, dd: alt };
    return null;
  });
  if (!hit) { log(`slicer "${campo}" não encontrado`); return false; }
  await hit.dd.click({ timeout: 10000 });
  await page.waitForTimeout(2500);   // lista do dropdown pode levar um instante a mais p/ renderizar
  const buscarItem = () => emFrames(page, async fr => {
    const i = fr.locator(`.slicerItemContainer:has-text("${valor}"), [role="option"]:has-text("${valor}"), .slicerText:text-is("${valor}"), span:text-is("${valor}")`).first();
    return (await i.count()) ? i : null;
  });
  let item = await buscarItem();
  for (let t = 0; t < 2 && !item; t++) {   // retry — lista pode ainda estar montando
    await page.waitForTimeout(1500);
    item = await buscarItem();
  }
  if (!item) {
    // diagnóstico: quais itens o dropdown realmente tem (fica no log do Actions)
    const textos = [];
    for (const fr of page.frames()) {
      try {
        const its = fr.locator('.slicerItemContainer, [role="option"]').filter({ visible: true });
        const n = Math.min(await its.count(), 20);
        for (let i = 0; i < n; i++) textos.push((await its.nth(i).innerText().catch(() => '')).trim().replace(/\s+/g, ' '));
      } catch (e) {}
    }
    log(`item "${valor}" do slicer "${campo}" não encontrado — itens disponíveis:`, JSON.stringify(textos.filter(Boolean)));
    await page.keyboard.press('Escape');
    return false;
  }
  await item.click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');   // fecha o dropdown
  await page.waitForTimeout(4000);       // dá tempo dos visuais recarregarem
  log(`slicer "${campo}" = "${valor}" aplicado`);
  return true;
}

// O portal é um app Vue: deep-link recarrega o app e ele VOLTA para /bi/inicio.
// Caminho confiável = navegar pelo MENU lateral (seção → item), como um humano.
async function clicarMenu(page, secao, item) {
  if (secao === item) {   // ex.: CIVF > CIVF — expande a seção e clica na 2ª ocorrência
    try { await page.getByText(secao, { exact: true }).first().click({ timeout: 8000 }); await page.waitForTimeout(1200); } catch (e) {}
    await page.getByText(item, { exact: true }).last().click({ timeout: 15000 });
    await page.waitForTimeout(15000);
    return;
  }
  const itemLoc = () => page.getByText(item, { exact: false }).first();
  if (!(await itemLoc().isVisible().catch(() => false))) {
    // sidebar fechada? tenta o botão redondo (hambúrguer) e expande a seção
    if (!(await page.getByText(secao, { exact: true }).first().isVisible().catch(() => false))) {
      try { await page.locator('button').first().click({ timeout: 4000 }); await page.waitForTimeout(1000); } catch (e) {}
    }
    try { await page.getByText(secao, { exact: true }).first().click({ timeout: 8000 }); await page.waitForTimeout(1200); } catch (e) { log('seção', secao, 'não clicável (talvez já aberta)'); }
  }
  await itemLoc().click({ timeout: 15000 });
  await page.waitForTimeout(15000);           // embed do Power BI carrega
}
// drill-through: botão direito no card → (Drill through/Detalhamento) → página de detalhe
async function drillThrough(page, cardTexto, itemMenu) {
  // o card pode demorar a renderizar → polling de até 45s
  // só nos frames do Power BI — o texto do card também existe no menu lateral
  // do portal (ex.: "VEÍCULOS" em "2.1 - INDISP. MANUT. VEÍCULOS") e clicar lá
  // é interceptado pelo iframe do relatório.
  const pbiFrames = () => page.frames().filter(f => /powerbi|reportEmbed/i.test(f.url()));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // acha o RÓTULO EXATO do card, com caixa (case-sensitive): "NÃO EXECUTADAS"
  // (card) não pode casar com a coluna "Não Executadas" da tabela ao lado.
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
  let item = null;
  const OFFS = [28, 46, 64, 14];   // deslocamentos p/ acertar o NÚMERO abaixo do rótulo
  for (let t = 0; t < 4 && !item; t++) {   // até 4 tentativas de abrir o menu
    // botão direito POR COORDENADA logo abaixo do rótulo (onde fica o número
    // do card) — clicar no rótulo dá menu "(Nenhuma ação disponível)"
    const box = await lbl.boundingBox();
    if (!box) throw new Error(`rótulo do card "${cardTexto}" sem posição na tela`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height + OFFS[t], { button: 'right' });
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
      item = await buscarItem();   // alguns embeds põem o destino direto no menu
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
      log('menu do botão direito (tentativa ' + (t + 1) + '):', JSON.stringify(its.filter(Boolean)));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1500);
    }
  }
  if (!item) throw new Error(`item de drill "${itemMenu}" não encontrado`);
  await item.click();
  await page.waitForTimeout(15000);           // página de detalhe renderiza
}

// exporta os dados de UM visual: hover → menu "Mais opções (...)" → Exportar dados
async function exportarVisual(page, aba) {
  // O portal virou uma SPA: a URL é sempre /bi/inicio e o relatório abre numa
  // ABA. Os deep-links /bi/<guid> não existem mais (davam ERR_CONNECTION_
  // TIMED_OUT desde 20/08) — a navegação é SEMPRE pelo menu.
  const INICIO = 'https://bi.ginfo.app.br/bi/inicio';
  log('abrindo aba', aba.chave, '(menu:', (aba.menu || []).join(' → ') + ')');
  if (!/\/bi\/inicio/.test(page.url())) {
    await page.goto(INICIO, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(8000);
  }
  if (/\/login/i.test(page.url())) {   // sessão derrubada (ex.: outro login no portal)
    log('sessão caiu — refazendo o login');
    await login(page);
    await page.goto(INICIO, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(8000);
  }
  if (!aba.menu) throw new Error(`${aba.chave} sem caminho de menu — o portal novo não aceita deep-link`);
  log('navegando pelo menu:', aba.menu.join(' → '));
  await clicarMenu(page, aba.menu[0], aba.menu[1]);
  await shot(page, '10-' + aba.chave);
  if (aba.drill) { await drillThrough(page, aba.drill.card, aba.drill.item); await shot(page, '10b-' + aba.chave); }

  // filtros/slicers da aba (ex.: Mês anterior + Quinzena Segunda até o dia 10)
  if (typeof aba.slicers === 'function') {
    for (let s of aba.slicers()) {
      if (MES_FORCA && /^m[eê]s$/i.test(s.campo)) {
        log(`mês forçado por GINFO_MES: "${s.valor}" → "${MES_FORCA}"`);
        s = { ...s, valor: MES_FORCA };
      }
      const ok = await aplicarSlicer(page, s.campo, s.valor);
      await shot(page, '11-' + aba.chave + '-' + s.campo.toLowerCase().replace(/[^a-z0-9]+/gi, '-'));
      // slicer não aplicado = a tela ficou no filtro errado (ou sem filtro nenhum);
      // aborta em vez de exportar/gravar um snapshot incompleto por cima do bom.
      if (!ok) throw new Error(`slicer "${s.campo}"="${s.valor}" não aplicado em ${aba.chave} — abortando p/ não gravar dado incompleto`);
    }
  }

  const alvo = await acharAlvo(page, aba);
  if (!alvo) { await shot(page, '98-sem-visual-' + aba.chave); throw new Error(`visual ${aba.visual ? `"${aba.visual}"` : '(tabela)'} não encontrado em ${aba.chave}`); }
  // botão "..." (Mais opções) só aparece com o mouse sobre o visual — re-hover
  // com retry (~30s); procura primeiro DENTRO do visual, depois frame e página.
  const SEL_OPTS = '[aria-label*="Mais opções" i], [aria-label*="More options" i], [data-testid="visual-more-options-btn"], [title*="Mais opções" i], .vcMenuBtn';
  let opts = null;
  for (let t = 0; t < 10 && !opts; t++) {
    try { await alvo.v.hover(); } catch (e) {}
    await page.waitForTimeout(1200);
    for (const root of [alvo.v, alvo.fr, page]) {
      try {
        const b = root.locator(SEL_OPTS).filter({ visible: true }).first();
        if (await b.count()) { opts = b; break; }
      } catch (e) {}
    }
    if (!opts) await page.waitForTimeout(1800);
  }
  if (!opts) throw new Error('botão "Mais opções (...)" não apareceu ao pairar sobre o visual');
  await opts.click({ timeout: 15000 });
  await page.waitForTimeout(800);
  // item "Exportar dados" — o flyout pode renderizar no frame ou no topo do documento
  const SEL_ITEM = 'button:has-text("Exportar dados"), [role="menuitem"]:has-text("Exportar dados"), [role="menuitem"]:has-text("Export data"), [title*="Exportar dados" i]';
  const itemHit = await emFrames(page, async fr => {
    const i = fr.locator(SEL_ITEM).first();
    return (await i.count()) ? i : null;
  }) || page.locator(SEL_ITEM).first();
  await itemHit.click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await shot(page, '11-' + aba.chave + '-dialogo');
  // diálogo de exportação: confirmar (baixa .xlsx). O diálogo pode renderizar no
  // frame do PBI OU na página do portal, e pode demorar a montar → tenta por ~30s.
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
  if (!confirmado) {
    // diagnóstico p/ o log: que botões existem na tela? (o download ainda pode vir direto)
    const textos = [];
    const coleta = async root => {
      try {
        const bs = root.locator('button').filter({ visible: true });
        const n = Math.min(await bs.count(), 40);
        for (let i = 0; i < n; i++) textos.push((await bs.nth(i).innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 40));
      } catch (e) {}
    };
    await coleta(page);
    for (const fr of page.frames()) await coleta(fr);
    log('sem botão de confirmação — botões visíveis:', JSON.stringify([...new Set(textos.filter(Boolean))]));
  }
  const download = await dlPromise;
  const arq = path.join(ART, aba.chave + '.xlsx');
  await download.saveAs(arq);
  log('baixado:', arq);
  return arq;
}

async function xlsxParaLinhas(arq) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(arq);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(ws, { defval: null });
  // O Power BI fecha o export com uma linha de RODAPÉ ("Filtros aplicados:" +
  // a lista de filtros do visual, tudo na 1ª coluna). Ela não é dado: gravada
  // no ginfo_snapshot, virava um registro fantasma que o Farol contava como
  // evento — no checklist de agosto era a ÚNICA linha, e o painel mostrava 1
  // saída com OS crítica onde não havia nenhuma.
  const ehRodape = l => {
    // só a linha do rodapé: tem conteúdo E todo esse conteúdo é o texto dos
    // filtros. Linha vazia não conta (every de lista vazia é true), e uma
    // linha de dado que por acaso comece com esse texto tem outras colunas.
    const vals = Object.values(l).filter(v => v != null && String(v).trim() !== '');
    return vals.length > 0 && vals.every(v => /^\s*filtros aplicados\s*:/i.test(String(v)));
  };
  const limpas = linhas.filter(l => !ehRodape(l));
  const cortadas = linhas.length - limpas.length;
  if (cortadas) {
    log(`rodapé "Filtros aplicados" descartado (${cortadas} linha)`);
    const rod = linhas.find(ehRodape);
    const txt = Object.values(rod).find(v => v != null && String(v).trim() !== '');
    log('   filtros que o visual estava usando:', String(txt).replace(/\s*\n\s*/g, ' | '));
  }
  return limpas;
}

async function gravarSupabase(chave, linhas) {
  if (DRY) { log(`[GINFO_DRY] ${chave}: ${linhas.length} linhas — NÃO gravado no Supabase`); return; }
  if (!SB_KEY) { log(`[dry-run] ${chave}: ${linhas.length} linhas (sem GEM_SUPABASE_SERVICE_KEY)`); return; }
  const res = await fetch(`${SB_URL}/rest/v1/ginfo_snapshot?on_conflict=chave`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ chave, data: linhas, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  log(`gravado no Supabase: ${chave} (${linhas.length} linhas)`);
}

/* ── modo `mapa`: reconhecimento do portal ──────────────────────────────────
   Em 08/2026 o Ginfo trocou o layout do MENU (virou "GINFO Analytics", com
   busca Ctrl+K, abas no topo e a seção FROTA já expandida). Os PAINÉIS
   continuam iguais — só a navegação quebrou. Este modo não exporta nada:
   fotografa e DESCREVE a interface nova, para a navegação ser reescrita com
   base no que está na tela e não no que a gente imagina.                    */
async function mapa(page) {
  await shot(page, '00-home-nova');
  log('url após login:', page.url());

  // 1) tudo que parece item de menu na lateral
  const itens = await page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const out = [];
    document.querySelectorAll('a,button,li,div[role=button],[class*=menu] *,[class*=nav] *').forEach(e => {
      if (!vis(e)) return;
      const t = (e.textContent || '').trim();
      if (!t || t.length > 60) return;
      if (e.children.length > 2) return;                 // só folhas
      const r = e.getBoundingClientRect();
      if (r.left > 420) return;                          // lateral esquerda
      out.push({ t, tag: e.tagName.toLowerCase(), x: Math.round(r.left), y: Math.round(r.top),
                 href: e.getAttribute('href') || '' });
    });
    // dedupe por texto
    const visto = new Set();
    return out.filter(o => { const k = o.t + '|' + o.y; if (visto.has(k)) return false; visto.add(k); return true; })
              .sort((a, b) => a.y - b.y);
  });
  log(`itens na lateral (${itens.length}):`);
  itens.forEach(i => log(`   [${i.tag}] y=${i.y} ${i.href ? 'href=' + i.href + ' ' : ''}"${i.t}"`));

  // 2) a busca de relatório (Ctrl+K) seria a navegação mais robusta — existe?
  const temBusca = await page.getByPlaceholder(/buscar relat/i).count().catch(() => 0);
  log('campo "Buscar relatório" encontrado:', temBusca > 0);

  // 3) abrir um relatório conhecido e ver ONDE o Power BI renderiza agora
  for (const alvo of ['2.4 - ORDEM SERVIÇO', '1.3 - ADERÊNCIA FROTA - 031120']) {
    try {
      log(`--- abrindo "${alvo}" pelo menu ---`);
      await page.getByText(alvo, { exact: false }).first().click({ timeout: 15000 });
      await page.waitForTimeout(20000);
      log('   url:', page.url());
      await shot(page, '01-aberto-' + alvo.slice(0, 12).replace(/[^A-Za-z0-9]/g, ''));
      const frames = page.frames().length;
      log('   frames:', frames);
      // o portal novo abre cada relatório numa ABA no topo (com X para fechar):
      // o robô vai precisar saber trocar/fechar aba, senão elas acumulam
      const abasTopo = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('*').forEach(e => {
          const r = e.getBoundingClientRect();
          if (r.top > 60 || r.height < 18 || r.height > 60 || r.width < 40) return;
          const t = (e.textContent || '').trim();
          if (t && t.length < 50 && e.children.length <= 2) out.push({ t, x: Math.round(r.left) });
        });
        const visto = new Set();
        return out.filter(o => { if (visto.has(o.t)) return false; visto.add(o.t); return true; })
                  .sort((a, b) => a.x - b.x);
      });
      log('   abas no topo:', abasTopo.map(a => `"${a.t}"`).join(' · ') || '(nenhuma)');
      for (const fr of page.frames()) {
        const n = await fr.locator('[role=grid],[role=table]').count().catch(() => 0);
        const v = await fr.locator('visual-container,.visualContainer').count().catch(() => 0);
        if (n || v || fr !== page.mainFrame()) log(`   frame ${fr.url().slice(0, 70)} → grids:${n} visuais:${v}`);
      }
    } catch (e) { log('   falhou:', e.message.slice(0, 120)); }
  }
}

/* resumo de conferência: quantas linhas e como se distribuem. Só colunas que
   não identificam pessoa nem veículo — o log do Actions é público. */
function resumo(chave, linhas) {
  log(`[GINFO_DRY] resumo de ${chave}: ${linhas.length} linha(s)`);
  if (!linhas.length) return;
  for (const col of Object.keys(linhas[0])) {
    if (COL_PESSOA.test(col)) continue;
    const vals = linhas.map(l => String(l[col] ?? '').trim()).filter(Boolean);
    const dist = [...new Set(vals)];
    if (!dist.length || dist.length > 25) continue;   // texto livre / alta cardinalidade
    const cnt = {};
    vals.forEach(v => { cnt[v] = (cnt[v] || 0) + 1; });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}=${n}`);
    log(`   ${col}: ${top.join(' · ')}`);
  }
}

async function main() {
  if (!USER || !PASS) { console.error('Faltam Secrets: GINFO_USER / GINFO_PASS'); process.exit(1); }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  try {
    await login(page);
    if (MODE === 'login') { log('modo login: só o teste de acesso. Veja os screenshots nos artifacts.'); return; }
    if (MODE === 'mapa')  { await mapa(page); return; }
    if (!ABAS.length) { log('nenhuma aba configurada ainda em ABAS — mapeie as abas no scripts/ginfo-robot.mjs.'); return; }
    let erros = 0;
    const alvos = SO_ABA ? ABAS.filter(a => a.chave === SO_ABA) : ABAS;
    if (SO_ABA && !alvos.length) { console.error(`GINFO_ABA="${SO_ABA}" não existe em ABAS`); process.exit(1); }
    if (SO_ABA) log(`rodando só a aba ${SO_ABA}`);
    for (const aba of alvos) {
      // 2 tentativas por aba — a sessão do Ginfo pode cair no meio (outro
      // login no portal derruba a anterior); a 2ª tentativa refaz o login.
      for (let tent = 1; tent <= 2; tent++) {
        try {
          if (/\/login/i.test(page.url())) { log('sessão caiu — refazendo o login'); await login(page); }
          const arq = await exportarVisual(page, aba);
          const linhas = await xlsxParaLinhas(arq);
          log('colunas de', aba.chave + ':', JSON.stringify(Object.keys(linhas[0] || {})));
          if (DRY) resumo(aba.chave, linhas);
          await gravarSupabase(aba.chave, linhas);
          // o dado fica SÓ no banco: apaga o arquivo baixado (sem service key,
          // é dry-run e o xlsx fica nos artifacts p/ conferência)
          if (SB_KEY) { try { fs.unlinkSync(arq); log('arquivo apagado (fica só no banco):', arq); } catch (e) {} }
          break;
        } catch (e) {
          log(`ERRO em ${aba.chave} (tentativa ${tent}):`, e.message);
          await shot(page, '99-erro-' + aba.chave + '-t' + tent);
          if (tent === 2 && !aba.opcional) erros++;
          if (tent === 2 && aba.opcional) log(`(${aba.chave} é opcional — não derruba o run)`);
        }
      }
    }
    if (erros) { console.error(`${erros} aba(s) com erro`); process.exit(1); }
  } finally {
    await browser.close();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
