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
const MES_LBL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const mesSlicer = d => MES_LBL[d.getMonth()] + '-' + String(d.getFullYear()).slice(2);   // ex.: 'Jul-26'
const ABAS = [
  // 1.1 DOCUMENTOS → drill-through "Detalhes Veículos" → tabela = base ATIVOS
  // (Filial | Projeto | Placa | Marca | Modelo | Tipo Veículo | Estado | Ano Fabricação)
  { chave: 'ativos', url: 'https://bi.ginfo.app.br/bi/99029b42-f690-451b-95b1-9fad2c9b670d?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    menu: ['FROTA', '1.1 - DOCUMENTOS'], drill: { card: 'VEÍCULOS', item: 'Detalhes Veículos' } },
  // STRESS TEST FROTA → tabela detalhada por placa (a de mais colunas da página).
  // Regra de período: até o dia 10, Mês = mês anterior e Quinzena = Segunda.
  // (Do dia 11 em diante: regra a confirmar com o Renan — por ora fica o padrão da página.)
  { chave: 'stress-test-frota', url: 'https://bi.ginfo.app.br/bi/ce4f37f8-1c4c-499f-a80c-3a3ce80594cb?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    menu: ['STRESS TEST', 'STRESS TEST FROTA'],
    slicers: () => {
      const h = new Date();
      if (h.getDate() > 10) return [];
      const ant = new Date(h.getFullYear(), h.getMonth() - 1, 1);
      return [{ campo: 'Mês', valor: mesSlicer(ant) }, { campo: 'Quinzena', valor: 'Segunda' }];
    } },
  // STRESS TEST EMPILHADEIRA → tabela "Análise Descontos" (pelo TÍTULO — a página
  // também tem "Análise Horímetros" logo abaixo, que não usamos).
  // Regra de período: até o dia 10, só Mês = mês anterior (não tem slicer de Quinzena).
  { chave: 'stress-test-empilhadeira', url: 'https://bi.ginfo.app.br/bi/d1cead3d-e28a-487b-a1bd-8b72cdd6da55?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    menu: ['STRESS TEST', 'STRESS TEST EMPILHADEIRA'],
    visual: 'Análise Descontos',
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
  { chave: 'civf', url: 'https://bi.ginfo.app.br/bi/5bd5e3ac-7ebc-4c7b-963e-1c3d20ba4acd?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
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
  { chave: 'alinhamentos', url: 'https://bi.ginfo.app.br/bi/3ab8927b-b1c5-4f10-8f36-dad6bb8a8a22?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    menu: ['FROTA', '3.4 - PNEUS'], header: 'Documento' },
  // 2.4 ORDEM SERVIÇO → botão direito no card "NÃO EXECUTADAS" → Drill-through →
  // "Detalhes Ordem Serviço" → tabela (Nº OS | Data | Status | Filial | Origem |
  // Tipo | Criticidade | SLAs | Segmento | Fornecedor | Mecânico | Motorista |
  // Placa) = aba OS em Aberto do Farol. "Dias em Aberto" (col. A da planilha) é
  // fórmula = AGORA() − Data, mínimo 0 — o leitor recalcula na hora de exibir.
  { chave: 'os-em-aberto', url: 'https://bi.ginfo.app.br/bi/81e8f48c-09f2-4bc7-a84e-0718378732c9?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    menu: ['FROTA', '2.4 - ORDEM SERVIÇO'], drill: { card: 'NÃO EXECUTADAS', item: 'Detalhes Ordem Serviço' } },
  // 1.3 ADERÊNCIA FROTA - 031120 → única tabela da página, com o ano todo
  // (Mapa | Data do mapa | Data OS | Início/Fim técnico | Problema | Nº OS |
  // Tipo Checklist | Status | Filial | Motorista | Placa | Tipo Veículo |
  // Projeto). Alimenta o farol NOVO "Checklist" (Saída com OS Crítica do mês).
  { chave: 'checklist-031120', url: 'https://bi.ginfo.app.br/bi/76e82774-d5d4-4cda-bb13-65a1a64387ef?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65',
    menu: ['FROTA', '1.3 - ADERÊNCIA FROTA - 031120'] },
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

// Seletores de tabela do Power BI (variam por versão do embed)
const SEL_TABELA = '[role="grid"], [role="table"], .tableEx, [class*="tableEx"], .pivotTable, [class*="pivotTable"]';
// espera a página do Power BI renderizar e acha o alvo (polling de até 60s).
// Modos (na ordem): visual = pelo TÍTULO · header = tabela que tem essa COLUNA ·
// indice = N-ésima tabela na ordem visual (de cima p/ baixo) · padrão = a tabela
// com MAIS COLUNAS (a detalhada da página). Só considera elementos VISÍVEIS —
// o embed mantém visuais fora de tela/ocultos que resolvem no seletor mas não clicam.
async function acharAlvo(page, aba) {
  // lista os VISUAIS de tabela visíveis (1 por visual-container que contém um
  // grid — evita contar wrappers/divs internos do mesmo visual várias vezes)
  const tabelasVisiveis = async () => {
    const tabs = [];
    for (const fr of page.frames()) {
      try {
        let grids = fr.locator('visual-container:has([role="grid"]), visual-container:has([role="table"])');
        if (!(await grids.count())) grids = fr.locator(SEL_TABELA);
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
      });
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
      const alvo = await emFrames(page, async fr => {
        const g = fr.locator(SEL_TABELA)
          .filter({ has: fr.locator(`[role="columnheader"]:has-text("${aba.header}")`) })
          .filter({ visible: true }).first();
        return (await g.count()) ? { fr, v: g } : null;
      });
      if (alvo) { log(`tabela com a coluna "${aba.header}" encontrada`); return alvo; }
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
  await page.waitForTimeout(1500);
  const item = await emFrames(page, async fr => {
    const i = fr.locator(`.slicerItemContainer:has-text("${valor}"), [role="option"]:has-text("${valor}"), .slicerText:text-is("${valor}"), span:text-is("${valor}")`).first();
    return (await i.count()) ? i : null;
  });
  if (!item) { log(`item "${valor}" do slicer "${campo}" não encontrado`); await page.keyboard.press('Escape'); return false; }
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
  let alvo = null;
  for (let t = 0; t < 9 && !alvo; t++) {
    alvo = await emFrames(page, async fr => {
      const c = fr.locator(`visual-container:has-text("${cardTexto}"), [aria-label*="${cardTexto}"]`).filter({ visible: true }).first();
      return (await c.count()) ? { fr, c } : null;
    });
    if (!alvo) await page.waitForTimeout(5000);
  }
  if (!alvo) throw new Error(`card "${cardTexto}" não encontrado p/ drill-through`);
  const buscarItem = () => emFrames(page, async fr => {
    const i = fr.locator(`[role="menuitem"]:has-text("${itemMenu}"), button:has-text("${itemMenu}"), [title*="${itemMenu}"]`).filter({ visible: true }).first();
    return (await i.count()) ? i : null;
  });
  let item = null;
  for (let t = 0; t < 4 && !item; t++) {   // até 4 tentativas de abrir o menu
    await alvo.c.click({ button: 'right' });
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
  const urlAba = aba.url || 'https://bi.ginfo.app.br/bi/inicio';   // sem deep-link conhecido → começa do início
  log('abrindo aba', aba.chave, urlAba);
  await page.goto(urlAba, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(10000);
  if (aba.menu && (!aba.url || /\/bi\/inicio/.test(page.url()))) {   // app devolveu p/ o início → vai pelo menu
    log('navegando pelo menu:', aba.menu.join(' → '));
    await clicarMenu(page, aba.menu[0], aba.menu[1]);
  } else {
    await page.waitForTimeout(5000);
  }
  await shot(page, '10-' + aba.chave);
  if (aba.drill) { await drillThrough(page, aba.drill.card, aba.drill.item); await shot(page, '10b-' + aba.chave); }

  // filtros/slicers da aba (ex.: Mês anterior + Quinzena Segunda até o dia 10)
  if (typeof aba.slicers === 'function') {
    for (const s of aba.slicers()) {
      await aplicarSlicer(page, s.campo, s.valor);
      await shot(page, '11-' + aba.chave + '-' + s.campo.toLowerCase().replace(/[^a-z0-9]+/gi, '-'));
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
