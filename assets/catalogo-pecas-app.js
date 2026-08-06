// ============================================================
// Catálogo de Peças — app compartilhado pelos dois painéis
// (o do hub e o clone externo, que também mostra as abas de ERP).
//
//   CatalogoPecas.init({ fontes:[window.CAT_DADOS, ...], placas:true })
//
// Layout no padrão do suprimentos-padronizacao: shell com sidebar retrátil
// (recolhe para a esquerda pelo botão do header), hero com os números fora de
// card e tbl-section para as tabelas.
//
// Filtro em TODO cabeçalho de coluna (multisseleção + ordenação, estilo
// autofiltro), busca livre e — no painel do hub — filtro por unidade e placa,
// que cruza a frota do ginfo_snapshot com a coluna de aplicação da peça.
// ============================================================
(function (global) {
  'use strict';

  // Versão da build, lida do ?v= do próprio <script>. Vai para um badge no
  // header — assim dá para saber, olhando o print, se o navegador está com o
  // arquivo novo ou com o cache do GitHub Pages.
  const VERSAO = (() => {
    const sc = document.currentScript || [...document.scripts].find(x => /catalogo-pecas-app/.test(x.src));
    const m = sc && sc.src.match(/[?&]v=(\d+)/);
    return m ? m[1] : '';
  })();

  const GRUPOS = [
    { nome: 'Catálogo',        abas: ['Lista de Peças'] },
    { nome: 'Cadastro no ERP', abas: ['A. Peça+NCM', 'B. Peça+Material+NCM'] },
    { nome: 'Apoio',           abas: ['Modelos da Frota', 'Índice NCM'] },
    { nome: 'Leitura',         abas: ['Leia-me', 'Resumo', 'Validação', 'Fontes'] },
  ];
  // Abas que saem do painel (ficam só no Excel) e colunas que não entram.
  const ABAS_FORA = ['1. Genérico', '2. Meio-termo'];
  const COL_FORA  = /posi[çc][ãa]o\s*\(?\s*(tipi|cap[íi]tulo)/i;
  // Colunas que ficam FORA DA TABELA mas continuam nos dados — os filtros do
  // topo e o cruzamento por placa usam Aplicação/Modelo. Sem elas a tabela cabe
  // na largura da tela e não precisa de rolagem horizontal.
  const COL_OCULTA = /^ipi\b|^confian|^c[óo]digo de refer|^fonte do c[óo]digo|^modelo \(aplica|^aplica[çc][ãa]o \(tipos|^ativos atendidos|^observa/i;
  const LOTE = 300;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const txt = c => String(c == null ? '' : c).trim();
  const cheias = r => r.filter(c => txt(c) !== '').length;
  const nf = n => Number(n).toLocaleString('pt-BR');
  const _n = s => txt(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const CSS = `
  .shell{display:flex;min-height:calc(100vh - var(--hh,46px));}
  .sidebar{width:230px;flex-shrink:0;background:var(--sidebar,#0a0f18);border-right:1px solid rgba(255,255,255,.06);
    padding:14px 10px;display:flex;flex-direction:column;gap:4px;transition:width .18s ease;
    position:sticky;top:var(--hh,46px);height:calc(100vh - var(--hh,46px));overflow-y:auto;}
  .shell.collapsed .sidebar{width:0;padding:0;overflow:hidden;border-right:none;}
  .nav-sec{font-size:9px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;
    padding:10px 12px 6px;white-space:nowrap;overflow:hidden;}
  .shell.collapsed .nav-sec{opacity:0;}
  .nav-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border-radius:6px;
    cursor:pointer;color:#cbd5e1;font-weight:600;font-size:12.5px;white-space:nowrap;border:1px solid transparent;
    background:none;font-family:'Montserrat',sans-serif;width:100%;text-align:left;}
  .nav-item:hover{background:rgba(249,115,22,.10);color:var(--orange);}
  .nav-item.active{background:rgba(249,115,22,.14);border-color:rgba(249,115,22,.3);color:var(--orange);}
  .nav-item .lbl{overflow:hidden;text-overflow:ellipsis;}
  .nav-item .qt{font-size:9px;color:#64748b;font-weight:700;}
  .nav-item.active .qt{color:var(--orange);opacity:.8;}
  .shell.collapsed .nav-item{display:none;}

  .main{flex:1;min-width:0;padding:22px 26px 70px;}
  .page-title{font-size:19px;font-weight:800;color:var(--text);margin-bottom:3px;}
  .page-sub{font-size:11.5px;color:var(--text2);margin-bottom:20px;max-width:900px;line-height:1.5;}
  .hero{display:flex;align-items:flex-end;gap:56px;flex-wrap:wrap;margin-bottom:22px;padding:4px 0;}
  .hero-label{font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}
  .hero-value{font-size:46px;font-weight:800;color:var(--text);line-height:1;}
  .hero-value.accent{color:var(--orange);}
  .hero-sub{font-size:10px;color:var(--text2);margin-top:7px;font-weight:600;}
  @media(max-width:768px){.hero{gap:24px;}.hero-value{font-size:30px;}}

  .tbl-section{background:rgba(20,27,38,.55);border:1px solid rgba(255,255,255,.07);border-radius:8px;
    padding:18px 20px 16px;margin-bottom:16px;backdrop-filter:blur(16px);box-shadow:0 2px 12px rgba(0,0,0,.25);}
  .tbl-title{font-size:19px;font-weight:800;color:var(--text);margin-bottom:3px;}
  .tbl-sub{font-size:13px;color:var(--text2);margin-bottom:16px;}
  .tbl-tools{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap;}
  .search{background:#0a0f18;border:1px solid #2a3a50;border-radius:5px;color:var(--text);
    font-family:'Montserrat',sans-serif;font-size:12px;padding:7px 11px;min-width:240px;}
  .search:focus{outline:none;border-color:var(--orange);}
  .pill{font-size:10px;font-weight:700;color:var(--text2);background:rgba(255,255,255,.05);
    border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:4px 10px;white-space:nowrap;}
  .limpar{background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.3);border-radius:5px;color:var(--orange);
    font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;padding:6px 11px;cursor:pointer;}
  .limpar:hover{background:rgba(249,115,22,.3);}
  /* overflow-x:hidden é a única diferença proposital: a tabela fecha em 100%
     da largura, então não existe barra horizontal para mostrar. */
  .tbl-scroll{overflow-y:auto;overflow-x:hidden;max-height:66vh;}
  .cp-tbl{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}
  .cp-tbl thead th{position:sticky;top:0;background:var(--card);color:var(--text);font-size:11px;font-weight:700;
    padding:8px 8px 12px;border-bottom:1px solid rgba(255,255,255,.10);text-transform:uppercase;
    letter-spacing:.5px;text-align:left;vertical-align:bottom;z-index:2;cursor:pointer;user-select:none;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .cp-tbl thead th:hover{color:var(--orange);}
  .cp-tbl thead th.filtrada{color:var(--orange);}
  /* o padrão não tem seta em cabeçalho: só aparece no hover ou quando a
     coluna está filtrada */
  .cp-tbl thead th .fi{opacity:0;margin-left:4px;font-size:9px;transition:opacity .12s;}
  .cp-tbl thead th:hover .fi{opacity:.6;}
  .cp-tbl thead th.filtrada .fi{opacity:1;}
  /* uma linha por registro, com reticências e tooltip — igual ao padrão. Nada
     de quebrar em várias linhas: era isso que deixava a tabela fora do padrão. */
  .cp-tbl td{padding:13px 8px;border:none;color:var(--text);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .cp-tbl tbody tr:hover{background:rgba(255,255,255,.035);}
  body.light-mode .cp-tbl tbody tr:hover{background:rgba(0,0,0,.05);}

  .colmenu{position:fixed;z-index:400;background:#0f1824;border:1px solid #2a3a50;border-radius:6px;
    box-shadow:0 8px 24px rgba(0,0,0,.7);width:266px;max-height:400px;display:flex;flex-direction:column;}
  body.light-mode .colmenu{background:#fff;border-color:#cbd5e1;}
  .colmenu .cm-ord{display:flex;border-bottom:1px solid #1e2d40;}
  .colmenu .cm-ord button{flex:1;background:none;border:none;color:var(--text2);cursor:pointer;
    font-family:'Montserrat',sans-serif;font-size:10.5px;font-weight:700;padding:9px 6px;}
  .colmenu .cm-ord button:hover{background:rgba(249,115,22,.12);color:var(--orange);}
  .colmenu .cm-busca{margin:8px;background:#0a0f18;border:1px solid #2a3a50;border-radius:5px;color:var(--text);
    font-family:'Montserrat',sans-serif;font-size:11.5px;padding:6px 9px;}
  body.light-mode .colmenu .cm-busca{background:#fff;border-color:#cbd5e1;}
  .colmenu .cm-lista{overflow-y:auto;flex:1;padding:0 4px 6px;}
  .colmenu label{display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:11.5px;color:var(--text2);
    cursor:pointer;border-radius:4px;}
  .colmenu label:hover{background:rgba(255,255,255,.05);color:var(--text);}
  .colmenu label.todos{border-bottom:1px solid #1e2d40;color:var(--text);font-weight:700;}
  .colmenu input[type=checkbox]{accent-color:var(--orange);cursor:pointer;width:14px;height:14px;flex:0 0 auto;}
  .colmenu .cm-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

  .panel-txt{background:rgba(20,27,38,.55);border:1px solid rgba(255,255,255,.07);border-radius:8px;
    padding:16px 20px;margin-bottom:16px;backdrop-filter:blur(16px);box-shadow:0 2px 12px rgba(0,0,0,.25);}
  .panel-txt h3{font-size:14px;font-weight:800;color:var(--orange);margin:14px 0 6px;}
  .panel-txt h3:first-child{margin-top:0;}
  .panel-txt p{font-size:12.5px;color:var(--text2);line-height:1.65;margin-bottom:5px;}
  .cp-mais{display:block;margin:12px auto 0;background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.3);
    color:var(--orange);font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;border-radius:6px;
    padding:7px 16px;cursor:pointer;}
  .cp-mais:hover{background:rgba(249,115,22,.28);}
  .cp-vazio{color:var(--text3);font-size:12px;padding:14px 0;}

  body.light-mode{--bg:#eef0f3;--sidebar:#0a0f18;}
  body.light-mode .main{background:#F0F0F0;--text:#1a1a1a;--text2:#444;--text3:#666;}
  /* mesmo card do visao-financeira: cinza translúcido, sem borda e sem sombra */
  body.light-mode .tbl-section,body.light-mode .panel-txt{background:rgba(128,128,128,.14)!important;
    border:none!important;box-shadow:none!important;--text:#1a1a1a;--text2:#444;--text3:#555;color:var(--text);}
  body.light-mode .cp-tbl thead th{background:#F0F0F0!important;color:#1a1a1a;border-bottom-color:rgba(0,0,0,.10);}
  body.light-mode .search{background:#fff;border-color:#cbd5e1;color:#1a1a1a;}
  body.light-mode .pill{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.12);}
  body.light-mode .cp-mais{background:rgba(249,115,22,.12);}
  body.light-mode .page-title{color:#1a1a1a;} body.light-mode .page-sub{color:#444;}
  body.light-mode .hero-value{color:#1a1a1a;} body.light-mode .hero-value.accent{color:var(--orange);}
  body.light-mode .hero-label,body.light-mode .hero-sub{color:#555;}

  /* ── Filtros no header ── bloco copiado do visao-financeira ─────────────── */
  .header-filters{flex-basis:100%;order:4;margin-top:10px;
    display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;}
  .filter-group{display:flex;flex-direction:column;gap:3px;}
  .filter-hint{flex-basis:100%;font-size:10px;color:#475569;font-style:italic;margin-top:3px;line-height:1.2;}
  .ms-wrap{position:relative;}
  .ms-btn{display:flex;align-items:center;gap:8px;background:#0a0f18;color:#F1F5F9;
    border:1px solid #2a3a50;border-radius:4px;font-family:'Montserrat',sans-serif;font-size:11px;
    font-weight:700;padding:6px 12px;cursor:pointer;text-transform:uppercase;letter-spacing:.5px;
    white-space:nowrap;min-width:110px;}
  .ms-btn:hover{border-color:var(--orange);}
  .ms-lbl{flex:1;text-align:left;}
  .ms-cnt{background:var(--orange);color:#000;border-radius:10px;padding:1px 6px;font-size:9px;
    font-weight:800;display:none;}
  .ms-btn svg{flex-shrink:0;opacity:.8;}
  .ms-panel{display:none;flex-direction:column;position:absolute;top:calc(100% + 4px);left:0;z-index:500;
    background:#0f1824;border:1px solid #2a3a50;border-radius:4px;min-width:230px;max-height:300px;
    box-shadow:0 8px 24px rgba(0,0,0,.7);}
  .ms-panel.open{display:flex;}
  .ms-search{padding:7px 10px;border-bottom:1px solid #1e2d40;display:flex;align-items:center;gap:6px;flex-shrink:0;}
  .ms-search svg{opacity:.4;flex-shrink:0;}
  .ms-search input{flex:1;background:transparent;border:none;color:#F1F5F9;
    font-family:'Montserrat',sans-serif;font-size:11px;outline:none;}
  .ms-search input::placeholder{color:#475569;}
  .ms-list{overflow-y:auto;flex:1;}
  .ms-opt{display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;font-size:11px;
    color:#94A3B8;text-transform:uppercase;letter-spacing:.3px;}
  .ms-opt:hover{background:rgba(255,255,255,.05);color:#F1F5F9;}
  .ms-opt.all-opt{border-bottom:1px solid #1e2d40;color:#F1F5F9;font-weight:700;}
  .ms-opt input[type=checkbox]{accent-color:var(--orange);cursor:pointer;width:14px;height:14px;flex-shrink:0;}
  .ms-opt .ms-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .ms-only{margin-left:auto;font-size:8px;color:var(--orange);padding:1px 5px;border-radius:2px;
    cursor:pointer;white-space:nowrap;flex-shrink:0;opacity:0;transition:opacity .12s;}
  .ms-opt:hover .ms-only{opacity:1;}
  .ms-only:hover{background:rgba(249,115,22,.2);}
  .ms-list::-webkit-scrollbar{width:4px;}
  .ms-list::-webkit-scrollbar-track{background:transparent;}
  .ms-list::-webkit-scrollbar-thumb{background:#2a3a50;border-radius:2px;}
  .f-limpa{background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.3);border-radius:4px;
    color:var(--orange);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;padding:6px 11px;
    cursor:pointer;text-transform:uppercase;letter-spacing:.5px;align-self:flex-start;}
  .f-limpa:hover{background:rgba(249,115,22,.3);}

  @media(max-width:768px){
    .header-filters{gap:5px;margin-top:7px;}
    .filter-group{flex:0 0 calc(33.333% - 4px);}
    .ms-wrap{width:100%;}
    .ms-btn{width:100%;min-width:0;font-size:8px;padding:3px 6px;gap:4px;}
    .f-hint{display:none;}
  }

  @media(max-width:768px){
    .sidebar{position:fixed;z-index:150;left:0;top:var(--hh,46px);box-shadow:6px 0 24px rgba(0,0,0,.5);}
    .shell.collapsed .sidebar{width:0;padding:0;overflow:hidden;}
    .main{padding:14px 12px 60px;}
    /* no mobile o assets/mobile.js esconde colunas — as larguras fixas iriam
       sobrar para colunas ocultas e espremer as visíveis. */
    .cp-tbl{font-size:11px;table-layout:auto;}
    .cp-tbl col{width:auto!important;}
    .cp-tbl thead th{position:static;}
    .tbl-scroll{max-height:none;}
  }`;

  function injetarCSS() {
    if (document.getElementById('cp-style')) return;
    const st = document.createElement('style');
    st.id = 'cp-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ── Segmentação: a aba vira blocos de texto e de tabela ───────────────────
  function segmentar(rows) {
    const ehCab = i => cheias(rows[i]) >= 3 && rows[i + 1] && cheias(rows[i + 1]) >= 2;
    const blocos = [];
    let i = 0;
    while (i < rows.length) {
      if (cheias(rows[i]) === 0) { i++; continue; }
      if (ehCab(i)) {
        let cols = rows[i].map((c, j) => txt(c) || 'col' + (j + 1));
        const manter = cols.map(c => !COL_FORA.test(c));
        const body = [];
        let j = i + 1;
        while (j < rows.length && cheias(rows[j]) > 0) { body.push(rows[j]); j++; }
        let rs = body;
        if (manter.some(m => !m)) {
          cols = cols.filter((_, x) => manter[x]);
          rs = body.map(r => r.filter((_, x) => manter[x]));
        }
        // colunas cujo valor é uma lista ("TRUCK | TOCO | VUC"): filtram por item
        const amostra = rs.slice(0, 80);
        const tok = new Set(cols.map((_, x) => x).filter(x =>
          amostra.filter(r => String(r[x] || '').includes('|')).length > amostra.length * .25));
        const vis = cols.map((c, x) => x).filter(x => !COL_OCULTA.test(cols[x]));
        blocos.push({ tipo: 'tabela', cols, rows: rs, tok, vis });
        i = j;
      } else {
        const linhas = [];
        while (i < rows.length && cheias(rows[i]) > 0 && !ehCab(i)) {
          const cs = rows[i].filter(c => txt(c) !== '');
          const t = cs.map(txt).join('  ·  ');
          linhas.push({ t, titulo: cs.length === 1 && t.length <= 70 });
          i++;
        }
        blocos.push({ tipo: 'texto', linhas });
      }
    }
    return blocos;
  }

  // ── Estado ───────────────────────────────────────────────────────────────
  let DADOS = {}, ABAS = [], atual = null, BLOCOS = {}, USA_PLACA = false;
  let FROTA = [], placasSel = new Set(), unidsSel = new Set();
  const st = new Map();   // chave → {busca, ordCol, ordDir, filtros:Map(col→Set), mostrando}

  const chave = (aba, i) => aba + '#' + i;
  function estado(k) {
    if (!st.has(k)) st.set(k, { busca: '', ordCol: null, ordDir: 'asc', filtros: new Map(), mostrando: LOTE });
    return st.get(k);
  }
  function blocosDe(aba) {
    if (!BLOCOS[aba]) BLOCOS[aba] = segmentar(DADOS[aba] || []);
    return BLOCOS[aba];
  }

  const numBR = v => {
    const s = txt(v).replace(/\s|%/g, '');
    if (!s || !/\d/.test(s)) return null;
    const n = Number(s.replace(/\./g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  };

  // ── Filtro por placa: cruza a frota com a coluna de aplicação da peça ─────
  function idxCol(cols, ...alvos) {
    for (const a of alvos) {
      const i = cols.findIndex(c => _n(c).includes(_n(a)));
      if (i >= 0) return i;
    }
    return -1;
  }
  // "Modelo (aplicação específica)" vem ANTES de "Aplicação (tipos da frota)" e
  // também contém "aplicação" — por isso cada coluna tem seu próprio teste.
  const iAplic = cols => {
    const i = cols.findIndex(c => /aplica/i.test(c) && /tipo/i.test(c));
    return i >= 0 ? i : cols.findIndex(c => /^aplica/i.test(txt(c)));
  };
  const iModelo = cols => cols.findIndex(c => /^modelo/i.test(txt(c)));
  const toks = s => _n(s).split(/[|,;\/]+/).map(x => x.trim()).filter(x => x && x !== '—' && x !== '-');

  function filtroFrota(bloco, linhas) {
    if (!USA_PLACA || (!placasSel.size && !unidsSel.size)) return linhas;
    const sel = FROTA.filter(v => (!unidsSel.size || unidsSel.has(v.uni)) && (!placasSel.size || placasSel.has(v.placa)));
    if (!sel.length) return linhas;
    const tipos = new Set(sel.map(v => _n(v.tipo)).filter(Boolean));
    const modelos = [...new Set(sel.map(v => _n(v.modelo)).filter(Boolean))];
    const iAp = iAplic(bloco.cols);
    const iMo = iModelo(bloco.cols);
    if (iAp < 0 && iMo < 0) return linhas;
    return linhas.filter(r => {
      if (iMo >= 0) {
        const mo = toks(r[iMo]);
        if (mo.length && modelos.some(m => mo.some(x => x.includes(m) || m.includes(x)))) return true;
      }
      if (iAp < 0) return false;
      const ap = toks(r[iAp]);
      if (!ap.length) return false;
      for (const t of tipos) if (ap.some(x => x === t || x.includes(t) || t.includes(x))) return true;
      return false;
    });
  }

  // valores distintos de uma coluna (explodindo as listas "A | B | C")
  function valoresCol(bloco, col) {
    const s = new Set();
    if (bloco.tok && bloco.tok.has(col)) {
      bloco.rows.forEach(r => String(r[col] == null ? '' : r[col]).split('|')
        .forEach(v => { v = v.trim(); if (v) s.add(v); }));
    } else {
      bloco.rows.forEach(r => s.add(txt(r[col])));
    }
    return [...s].sort((a, b) => {
      const na = numBR(a), nb = numBR(b);
      if (na !== null && nb !== null) return na - nb;
      return a.localeCompare(b, 'pt-BR');
    });
  }
  const casaCol = (bloco, col, vals, r) => bloco.tok && bloco.tok.has(col)
    ? String(r[col] == null ? '' : r[col]).split('|').some(v => vals.has(v.trim()))
    : vals.has(txt(r[col]));

  function aplicar(bloco, e) {
    let l = bloco.rows;
    l = filtroFrota(bloco, l);
    e.filtros.forEach((vals, col) => {
      if (vals.size) l = l.filter(r => casaCol(bloco, col, vals, r));
    });
    if (e.busca) {
      const termos = e.busca.toLowerCase().split(/\s+/).filter(Boolean);
      l = l.filter(r => { const s = r.map(txt).join(' ').toLowerCase(); return termos.every(t => s.includes(t)); });
    }
    if (e.ordCol !== null) {
      const f = e.ordDir === 'asc' ? 1 : -1;
      l = l.slice().sort((a, b) => {
        const na = numBR(a[e.ordCol]), nb = numBR(b[e.ordCol]);
        if (na !== null && nb !== null) return (na - nb) * f;
        if (na !== null) return -1;
        if (nb !== null) return 1;
        return txt(a[e.ordCol]).localeCompare(txt(b[e.ordCol]), 'pt-BR') * f;
      });
    }
    return l;
  }

  // ── Largura das colunas: texto longo ganha espaço, código/número fica curto ─
  const LARG = [
    { re: /^item$|^n[ºo°]$/i, w: 92 },
    // ATENÇÃO: /ipi/ solto casava dentro de "Descrição oficial (TIPI)" e
    // espremia a coluna do texto mais longo da tabela.
    { re: /^ipi\b|^ativos|^variantes|^ano\b|^qtd|^quant|^%|^itens\b/i, w: 86 },
    { re: /confian|situa[çc]/i,                                  w: 104 },
    { re: /ncm|c[óo]digo|marca|status/i, w: 120 },
    { re: /grupo/i,                                              w: 120 },
    { re: /fam[íi]lia|material|unidade|filial|classe/i,          w: 155 },
    { re: /descri|observa|especifica|aplica/i,                   w: 300 },
    { re: /sistema|fonte|norma|leitura|verifica|distingue/i,     w: 220 },
    { re: /pe[çc]a|modelo/i,                                     w: 240 },
  ];
  const _largCache = new Map();
  function larguras(cols) {
    const ck = cols.join('|');
    if (!_largCache.has(ck)) {
      _largCache.set(ck, cols.map(c => LARG.find(l => l.re.test(c)) || { w: 160 }));
    }
    return _largCache.get(ck);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function renderTabela(bloco, k, titulo) {
    const e = estado(k);
    const linhas = aplicar(bloco, e);
    const vis = linhas.slice(0, e.mostrando);
    const cols = bloco.vis || bloco.cols.map((_, i) => i);   // índices exibidos
    const lg = larguras(bloco.cols);
    // largura em % do total visível: a tabela sempre ocupa 100% da largura e
    // nunca gera rolagem horizontal — o texto longo quebra em linhas.
    const tot = cols.reduce((s, i) => s + lg[i].w, 0);
    const cls = i => keepMobile(bloco.cols)[i] ? 'mt-keep' : 'mt-hide';
    const colg = `<colgroup>${cols.map(i => `<col style="width:${(lg[i].w / tot * 100).toFixed(3)}%">`).join('')}</colgroup>`;
    const seta = i => e.ordCol === i ? (e.ordDir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<div class="tbl-section" data-tbl="${esc(k)}" data-linhas="${linhas.length}">
      ${titulo ? `<div class="tbl-title">${esc(titulo)}</div>` : ''}
      ${linhas.length ? `<div class="tbl-scroll"><table class="cp-tbl">${colg}<thead><tr>${
        cols.map(i => `<th class="${cls(i)}${e.filtros.get(i) && e.filtros.get(i).size ? ' filtrada' : ''}" data-col="${i}">${esc(bloco.cols[i])}${seta(i)}<span class="fi">▾</span></th>`).join('')
      }</tr></thead><tbody>${
        vis.map(r => `<tr>${cols.map(i => {
          const v = r[i] === undefined ? '' : r[i];
          return `<td class="${cls(i)}" title="${esc(v)}">${esc(v)}</td>`;
        }).join('')}</tr>`).join('')
      }</tbody></table></div>` : '<div class="cp-vazio">Nada encontrado com os filtros aplicados.</div>'}
      ${linhas.length > vis.length ? `<button class="cp-mais">Mostrar mais ${nf(Math.min(LOTE, linhas.length - vis.length))} (faltam ${nf(linhas.length - vis.length)})</button>` : ''}
    </div>`;
  }

  // No mobile o assets/mobile.js compacta a tabela; sem marcação ele mantém as
  // primeiras colunas (Item/Grupo/Família) e esconde justamente Peça e NCM.
  const _keepCache = new Map();
  function keepMobile(cols) {
    const ck = cols.join('|');
    if (!_keepCache.has(ck)) {
      let k = cols.map(c => /pe[çc]a|ncm/i.test(c));
      if (!k.some(Boolean)) k = cols.map((_, i) => i < 2);
      _keepCache.set(ck, k);
    }
    return _keepCache.get(ck);
  }

  function heroDe(aba, blocos) {
    const tbs = blocos.filter(b => b.tipo === 'tabela');
    if (!tbs.length) return '';
    const b = tbs.reduce((a, x) => x.rows.length > a.rows.length ? x : a);
    const e = estado(chave(aba, blocos.indexOf(b)));
    const linhas = aplicar(b, e);
    const iFam = idxCol(b.cols, 'Família'), iNcm = idxCol(b.cols, 'NCM'), iGr = idxCol(b.cols, 'Grupo');
    const dist = i => i < 0 ? null : new Set(linhas.map(r => txt(r[i])).filter(Boolean)).size;
    const it = [
      { l: 'Itens', v: nf(linhas.length), s: linhas.length !== b.rows.length ? 'de ' + nf(b.rows.length) : 'na aba', acc: true },
      iFam >= 0 ? { l: 'Famílias', v: nf(dist(iFam)), s: 'distintas' } : null,
      iNcm >= 0 ? { l: 'NCMs', v: nf(dist(iNcm)), s: 'distintos' } : null,
      iGr >= 0 ? { l: 'Grupos', v: nf(dist(iGr)), s: 'distintos' } : null,
    ].filter(Boolean);
    return `<div class="hero">${it.map(x =>
      `<div class="hero-item"><div class="hero-label">${x.l}</div><div class="hero-value${x.acc ? ' accent' : ''}">${x.v}</div><div class="hero-sub">${x.s}</div></div>`
    ).join('')}</div>`;
  }

  // ── Barra de filtros no header ────────────────────────────────────────────
  // Mesma mecânica do visao-financeira: _sel vazio = "Todos", link "only",
  // busca dentro do painel, badge com a contagem e — o que faltava — CASCATA:
  // as opções de cada filtro saem das linhas que passam por TODOS OS OUTROS
  // filtros, então o que não existe no recorte atual deixa de aparecer.
  const PREF = [/^grupo/i, /^fam[íi]lia/i, /^sistema/i, /^pe[çc]a/i, /^material/i,
    /^aplica/i, /^modelo/i, /^ncm$/i, /^confian/i, /^marca/i, /^classe/i, /^tipo/i,
    /^status/i, /^estado/i, /^situa[çc]/i, /^cen[áa]rio/i, /^verifica/i];

  const _caret = `<svg width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6z" fill="#F97316"/></svg>`;
  const _lupa  = `<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="5" cy="5" r="4" stroke="#94A3B8" stroke-width="1.5" fill="none"/><line x1="8.5" y1="8.5" x2="11" y2="11" stroke="#94A3B8" stroke-width="1.5"/></svg>`;

  function tabelaPrincipal(aba) {
    const bl = blocosDe(aba), tbs = bl.filter(b => b.tipo === 'tabela');
    if (!tbs.length) return null;
    const b = tbs.reduce((a, x) => x.rows.length > a.rows.length ? x : a);
    return { b, k: chave(aba, bl.indexOf(b)) };
  }

  function colunasFiltro(bloco) {
    const cand = bloco.cols.map((c, i) => ({ c, i }))
      .filter(({ c, i }) => {
        if (/^item$|^n[ºo°]$|ipi|ativos|variantes|^%|quant|^itens|c[óo]digo|fonte/i.test(c)) return false;
        const n = valoresCol(bloco, i).length;
        return n > 1 && n <= 2500;
      });
    const ord = x => { const p = PREF.findIndex(re => re.test(x.c)); return p < 0 ? 99 : p; };
    return cand.sort((a, b) => ord(a) - ord(b) || a.i - b.i).slice(0, 10);
  }

  // ── multi-select no padrão do visao-financeira ────────────────────────────
  function msWrapHtml(id, label) {
    return `<div class="filter-group"><div class="ms-wrap" id="${id}">
      <button class="ms-btn"><span class="ms-lbl">${esc(label)}</span><span class="ms-cnt"></span>${_caret}</button>
      <div class="ms-panel">
        <div class="ms-search">${_lupa}<input type="text" placeholder="Digite para pesquisar…"></div>
        <div class="ms-list"></div>
      </div></div></div>`;
  }

  function syncBadge(wrap) {
    const cnt = wrap.querySelector('.ms-cnt'), n = wrap._sel ? wrap._sel.size : 0;
    if (cnt) { cnt.textContent = n; cnt.style.display = n ? '' : 'none'; }
  }

  // Liga um .ms-wrap (uma única vez) e devolve o render, usado pela cascata.
  function ligarMs(wrap, aoMudar) {
    if (!(wrap._sel instanceof Set)) wrap._sel = new Set();
    const sel = wrap._sel;
    const list = wrap.querySelector('.ms-list');
    const srch = wrap.querySelector('.ms-search input');
    const render = q => {
      const it = wrap._items || [];
      const f = _n(q === undefined ? (srch.value || '') : q);
      const shown = it.filter(v => _n(v).includes(f));
      const allChk = sel.size === 0;
      list.innerHTML =
        (!f ? `<label class="ms-opt all-opt"><input type="checkbox" class="ms-all" ${allChk ? 'checked' : ''}><span class="ms-txt">Todos</span></label>` : '') +
        shown.slice(0, 1500).map(v => `<label class="ms-opt"><input type="checkbox" data-v="${esc(v)}" ${allChk || sel.has(v) ? 'checked' : ''}><span class="ms-txt">${esc(v) || '(vazio)'}</span><span class="ms-only" data-v="${esc(v)}">only</span></label>`).join('');
      syncBadge(wrap);
    };
    wrap._render = render;
    if (!wrap._wired) {
      wrap._wired = true;
      wrap.querySelector('.ms-btn').addEventListener('click', () => {
        const pn = wrap.querySelector('.ms-panel');
        const aberto = pn.classList.contains('open');
        document.querySelectorAll('.ms-panel.open').forEach(p => p.classList.remove('open'));
        if (!aberto) { pn.classList.add('open'); setTimeout(() => srch.focus(), 50); }
      });
      list.addEventListener('change', e => {
        const box = e.target;
        const todos = () => wrap._items || [];
        if (box.classList.contains('ms-all')) sel.clear();
        else if (sel.size === 0) {
          if (!box.checked) todos().forEach(v => { if (v !== box.dataset.v) sel.add(v); });
        } else {
          if (box.checked) sel.add(box.dataset.v); else sel.delete(box.dataset.v);
          const all = todos();
          if (all.length && all.every(v => sel.has(v))) sel.clear();
        }
        render(srch.value); aoMudar();
      });
      list.addEventListener('click', e => {
        const only = e.target.closest('.ms-only');
        if (!only) return;
        e.preventDefault(); e.stopPropagation();
        sel.clear(); sel.add(only.dataset.v);
        render(srch.value); aoMudar();
      });
      srch.addEventListener('input', () => render(srch.value));
      srch.addEventListener('click', e => e.stopPropagation());
    }
    render();
  }

  function setMsOptions(wrap, items) {
    if (!wrap) return;
    wrap._items = items;
    if (wrap._sel && wrap._sel.size) [...wrap._sel].forEach(v => { if (!items.includes(v)) wrap._sel.delete(v); });
    if (wrap._render) wrap._render();
  }

  // ── Estado dos filtros do topo ────────────────────────────────────────────
  let COLF = [], FKEY = null, FBLOCO = null;
  const msW = id => document.getElementById(id);
  const selDe = id => { const w = msW(id); return w && w._sel ? w._sel : new Set(); };

  // Uma linha passa por todos os filtros de coluna, menos o indicado.
  function passaExceto(r, exceto) {
    for (const { i } of COLF) {
      if (i === exceto) continue;
      const sel = selDe('ms-c' + i);
      if (sel.size && !casaCol(FBLOCO, i, sel, r)) return false;
    }
    return true;
  }

  // Frota: opções de Unidade/Placa também em cascata uma sobre a outra.
  function veiculosSel(exceto) {
    const u = exceto === 'uni' ? new Set() : selDe('ms-uni');
    const p = exceto === 'placa' ? new Set() : selDe('ms-placa');
    return FROTA.filter(v => (!u.size || u.has(v.uni)) && (!p.size || p.has(v.placa)));
  }

  function refreshCascata() {
    if (!FBLOCO) return;
    if (USA_PLACA && FROTA.length) {
      setMsOptions(msW('ms-uni'), [...new Set(veiculosSel('uni').map(v => v.uni))].filter(Boolean).sort());
      setMsOptions(msW('ms-placa'), [...new Set(veiculosSel('placa').map(v => v.placa))].filter(Boolean).sort());
    }
    for (const { i } of COLF) {
      const base = filtroFrota(FBLOCO, FBLOCO.rows).filter(r => passaExceto(r, i));
      const vals = new Set();
      if (FBLOCO.tok && FBLOCO.tok.has(i))
        base.forEach(r => String(r[i] == null ? '' : r[i]).split('|').forEach(v => { v = v.trim(); if (v) vals.add(v); }));
      else base.forEach(r => vals.add(txt(r[i])));
      setMsOptions(msW('ms-c' + i), [...vals].sort((a, b) => {
        const na = numBR(a), nb = numBR(b);
        return (na !== null && nb !== null) ? na - nb : a.localeCompare(b, 'pt-BR');
      }));
    }
    const n = COLF.filter(({ i }) => selDe('ms-c' + i).size).length
            + (selDe('ms-uni').size ? 1 : 0) + (selDe('ms-placa').size ? 1 : 0);
    const bt = document.getElementById('f-limpa');
    if (bt) { bt.textContent = `Limpar filtros (${n})`; bt.style.display = n ? '' : 'none'; }
  }

  // Lê os filtros do topo para o estado da tabela e repinta.
  function aplicarFiltros() {
    if (!FKEY) return;
    const e = estado(FKEY);
    e.filtros.clear();
    for (const { i } of COLF) { const sel = selDe('ms-c' + i); if (sel.size) e.filtros.set(i, new Set(sel)); }
    unidsSel = new Set(selDe('ms-uni'));
    placasSel = new Set(selDe('ms-placa'));
    e.mostrando = LOTE;
    repinta(FKEY);
    refreshCascata();
  }

  // Monta a barra do zero (troca de aba: as colunas mudam).
  function montarFiltros(aba) {
    const cx = document.getElementById('cp-filtros');
    if (!cx) return;
    const tp = tabelaPrincipal(aba);
    if (!tp) { cx.innerHTML = ''; COLF = []; FKEY = FBLOCO = null; ajustaHH(); return; }
    FKEY = tp.k; FBLOCO = tp.b;
    COLF = colunasFiltro(tp.b);
    unidsSel = new Set(); placasSel = new Set();

    let h = '';
    if (USA_PLACA && FROTA.length) h += msWrapHtml('ms-uni', 'Unidade') + msWrapHtml('ms-placa', 'Placa');
    h += COLF.map(({ c, i }) => msWrapHtml('ms-c' + i, c.replace(/\s*\(.*/, ''))).join('');
    h += `<button class="f-limpa" id="f-limpa" style="display:none">Limpar filtros</button>`;
    h += `<div class="filter-hint">Todo cabeçalho de coluna também filtra e ordena.</div>`;
    cx.innerHTML = h;

    cx.querySelectorAll('.ms-wrap').forEach(w => ligarMs(w, aplicarFiltros));
    const bt = document.getElementById('f-limpa');
    if (bt) bt.addEventListener('click', () => {
      cx.querySelectorAll('.ms-wrap').forEach(w => { if (w._sel) w._sel.clear(); });
      aplicarFiltros();
    });
    refreshCascata();
    ajustaHH();
  }

  function renderAba(aba) {
    atual = aba;
    const blocos = blocosDe(aba);
    const nTb = blocos.filter(b => b.tipo === 'tabela').length;
    const html = blocos.map((b, i) => b.tipo === 'tabela'
      ? renderTabela(b, chave(aba, i), null)
      : `<div class="panel-txt">${b.linhas.map(l => l.titulo ? `<h3>${esc(l.t)}</h3>` : `<p>${esc(l.t)}</p>`).join('')}</div>`
    ).join('');
    document.getElementById('cp-main').innerHTML =
      `<div class="page-title">${esc(aba)}</div>
       <div class="page-sub">${nTb ? 'Filtros no topo da página · todo cabeçalho de coluna também filtra e ordena.' : 'Conteúdo descritivo desta aba da planilha.'}</div>
       ${heroDe(aba, blocos)}${html}`;
    montarFiltros(aba);
    window.scrollTo({ top: 0 });
  }

  function repinta(k) {
    const el = document.querySelector(`[data-tbl="${k}"]`);
    if (!el) return;
    const [aba, i] = k.split('#');
    const novo = document.createElement('div');
    novo.innerHTML = renderTabela(blocosDe(aba)[+i], k, null);
    el.replaceWith(novo.firstElementChild);
    const h = document.querySelector('.hero');
    if (h) { const n = document.createElement('div'); n.innerHTML = heroDe(aba, blocosDe(aba)); if (n.firstElementChild) h.replaceWith(n.firstElementChild); }
    if (k === FKEY) refreshCascata();
  }

  // ── Menu de coluna (ordenar + multisseleção de valores) ──────────────────
  let menuAberto = null;
  function fecharMenu() { if (menuAberto) { menuAberto.remove(); menuAberto = null; } }
  function abrirMenu(th, k) {
    fecharMenu();
    const col = +th.dataset.col;
    const [aba, bi] = k.split('#');
    const bloco = blocosDe(aba)[+bi];
    const e = estado(k);
    const wTopo = document.getElementById('ms-c' + col);   // mesmo filtro, lá em cima
    const sel = (wTopo && wTopo._sel) || e.filtros.get(col) || new Set();
    // as opções seguem a cascata: só o que existe no recorte atual
    const vals = (wTopo && wTopo._items) || valoresCol(bloco, col);
    const m = document.createElement('div');
    m.className = 'colmenu';
    m.innerHTML = `<div class="cm-ord">
        <button data-ord="asc">Ordenar A→Z</button><button data-ord="desc">Ordenar Z→A</button>
      </div>
      <input class="cm-busca" type="search" placeholder="Filtrar valores…">
      <div class="cm-lista">
        <label class="todos"><input type="checkbox" data-todos ${sel.size ? '' : 'checked'}><span class="cm-txt">(Todos)</span></label>
        ${vals.slice(0, 600).map(v => `<label><input type="checkbox" value="${esc(v)}"${sel.has(v) ? ' checked' : ''}><span class="cm-txt">${esc(v) || '(vazio)'}</span></label>`).join('')}
      </div>`;
    document.body.appendChild(m);
    const r = th.getBoundingClientRect();
    m.style.left = Math.min(r.left, window.innerWidth - 276) + 'px';
    m.style.top = Math.min(r.bottom + 2, window.innerHeight - 410) + 'px';
    menuAberto = m;

    m.querySelector('.cm-busca').addEventListener('input', ev => {
      const t = ev.target.value.toLowerCase();
      m.querySelectorAll('.cm-lista label:not(.todos)').forEach(l =>
        l.style.display = l.textContent.toLowerCase().includes(t) ? '' : 'none');
    });
    m.addEventListener('click', ev => {
      const ob = ev.target.closest('[data-ord]');
      if (ob) { e.ordCol = col; e.ordDir = ob.dataset.ord; e.mostrando = LOTE; fecharMenu(); repinta(k); return; }
      ev.stopPropagation();
    });
    m.addEventListener('change', () => {
      const marcadas = [...m.querySelectorAll('.cm-lista input[value]')].filter(c => c.checked).map(c => c.value);
      const todos = m.querySelector('[data-todos]');
      const limpar = document.activeElement === todos;
      if (limpar) m.querySelectorAll('.cm-lista input[value]').forEach(c => { c.checked = false; });
      else todos.checked = marcadas.length === 0;
      const novo = limpar ? [] : marcadas;
      if (wTopo && wTopo._sel) {                       // mantém topo e cabeçalho em sincronia
        wTopo._sel.clear(); novo.forEach(v => wTopo._sel.add(v));
        if (wTopo._render) wTopo._render();
      }
      if (novo.length) e.filtros.set(col, new Set(novo)); else e.filtros.delete(col);
      e.mostrando = LOTE;
      repinta(k);
      fecharMenu();
    });
  }

  function menuLateral() {
    return GRUPOS.map(g => {
      const its = g.abas.filter(a => ABAS.includes(a));
      if (!its.length) return '';
      return `<div class="nav-sec">${esc(g.nome)}</div>` + its.map(a =>
        `<button class="nav-item" data-aba="${esc(a)}"><span class="lbl">${esc(a)}</span><span class="qt">${nf((DADOS[a] || []).length)}</span></button>`
      ).join('');
    }).join('');
  }

  // ── Frota (só no painel do hub) ──────────────────────────────────────────
  async function carregarFrota(cfg) {
    try {
      const sb = supabase.createClient(cfg.sbUrl, cfg.sbKey);
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const { data: row } = await sb.from('ginfo_snapshot').select('data').eq('chave', 'ativos').maybeSingle();
      if (!row || !Array.isArray(row.data)) return;
      const k = (o, ...ns) => { for (const n of ns) { const f = Object.keys(o).find(x => _n(x) === _n(n)); if (f) return f; } return null; };
      const s = row.data[0] || {};
      const K = { pl: k(s, 'Placa'), tv: k(s, 'Tipo Veículo', 'Tipo Veiculo', 'Tipo'), mo: k(s, 'Modelo'), fi: k(s, 'Filial') };
      FROTA = row.data.map(r => ({
        placa: txt(r[K.pl]), tipo: txt(r[K.tv]), modelo: txt(r[K.mo]), uni: txt(r[K.fi]),
      })).filter(v => v.placa);
    } catch (e) { console.error('frota', e); }
  }

  // ── Eventos da barra de filtros do header ────────────────────────────────
  // o header cresce com a barra de filtros — a sidebar acompanha
  function ajustaHH() {
    const hd = document.querySelector('.header');
    if (hd) document.documentElement.style.setProperty('--hh', hd.offsetHeight + 'px');
  }

  // O GitHub Pages entrega o HTML com max-age, então o navegador continua
  // rodando a build antiga por minutos depois do deploy. Aqui a página busca o
  // próprio HTML sem cache e, se lá fora já existe uma build mais nova, se
  // recarrega apontando para ela. O sessionStorage impede laço.
  async function checarAtualizacao() {
    if (!VERSAO || sessionStorage.getItem('cp_reload') === VERSAO) return;
    try {
      const r = await fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const m = (await r.text()).match(/catalogo-pecas-app\.js\?v=(\d+)/);
      if (m && m[1] > VERSAO) {
        sessionStorage.setItem('cp_reload', m[1]);
        location.replace(location.pathname + '?v=' + m[1]);
      }
    } catch (e) { /* offline: segue com o que tem */ }
  }

  function init(cfg) {
    injetarCSS();
    checarAtualizacao();
    DADOS = Object.assign({}, ...(cfg.fontes || []).filter(Boolean));
    ABAS_FORA.forEach(a => { delete DADOS[a]; });
    ABAS = Object.keys(DADOS);
    USA_PLACA = !!cfg.placas;

    const raiz = document.getElementById('cp-raiz');
    raiz.innerHTML = `<div class="shell" id="cp-shell">
      <nav class="sidebar" id="cp-sidebar">${menuLateral()}</nav>
      <div class="main" id="cp-main"></div>
    </div>`;

    if (VERSAO) {
      const hr = document.querySelector('.header-right');
      if (hr && !document.getElementById('cp-versao')) {
        const b = document.createElement('span');
        b.id = 'cp-versao';
        b.className = 'status-badge';
        b.style.cssText = 'background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);color:#94A3B8';
        b.title = 'Versão da build carregada';
        b.textContent = 'build ' + VERSAO;
        hr.insertBefore(b, hr.firstChild);
      }
    }

    const btn = document.getElementById('menuBtn');
    if (btn) btn.addEventListener('click', () => document.getElementById('cp-shell').classList.toggle('collapsed'));

    raiz.addEventListener('click', ev => {
      const it = ev.target.closest('.nav-item');
      if (it) {
        raiz.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        it.classList.add('active');
        renderAba(it.dataset.aba);
        if (window.innerWidth <= 768) document.getElementById('cp-shell').classList.add('collapsed');
        return;
      }
      const th = ev.target.closest('.cp-tbl thead th');
      if (th) { abrirMenu(th, th.closest('[data-tbl]').dataset.tbl); return; }
      const lim = ev.target.closest('.limpar');
      if (lim) {
        const k = lim.closest('[data-tbl]').dataset.tbl;
        estado(k).filtros.clear();
        estado(k).mostrando = LOTE;
        repinta(k);
        return;
      }
      const mais = ev.target.closest('.cp-mais');
      if (mais) {
        const k = mais.closest('[data-tbl]').dataset.tbl;
        estado(k).mostrando += LOTE;
        repinta(k);
      }
    });

    ajustaHH();
    window.addEventListener('resize', ajustaHH);

    document.addEventListener('click', ev => {
      if (menuAberto && !ev.target.closest('.colmenu') && !ev.target.closest('.cp-tbl thead th')) fecharMenu();
      if (!ev.target.closest('.ms-wrap')) document.querySelectorAll('.ms-panel.open').forEach(p => p.classList.remove('open'));
    });
    window.addEventListener('scroll', fecharMenu, { passive: true });

    const primeira = GRUPOS.flatMap(g => g.abas).find(a => ABAS.includes(a)) || ABAS[0];
    const alvo = raiz.querySelector('.nav-item[data-aba="' + primeira.replace(/"/g, '\\"') + '"]');
    if (alvo) alvo.click();

    if (USA_PLACA) carregarFrota(cfg).then(() => { if (FROTA.length) montarFiltros(atual); });
  }

  global.CatalogoPecas = { init };
})(window);
