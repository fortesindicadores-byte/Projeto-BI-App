// ============================================================
// Catálogo de Peças — app compartilhado pelos dois painéis
// (o do hub e o clone externo, que também mostra as abas de ERP).
//
//   CatalogoPecas.init({ fontes:[window.CAT_DADOS, ...], ordem:[...] })
//
// Cada aba da planilha vira uma seção. O conteúdo é heterogêneo (texto
// corrido no "Leia-me", tabelas grandes no "Lista de Peças", seções mistas
// no "Resumo"), então o render SEGMENTA a aba em blocos de texto e tabela em
// vez de assumir um formato único.
//
// Tabelas grandes (3,5 mil linhas) são renderizadas em lotes, com busca e
// ordenação sobre o conjunto INTEIRO — não só sobre o que está na tela.
// ============================================================
(function (global) {
  'use strict';

  const GRUPOS = [
    { nome: 'Catálogo',       abas: ['1. Genérico', '2. Meio-termo', 'Lista de Peças'] },
    { nome: 'Cadastro no ERP', abas: ['A. Peça+NCM', 'B. Peça+Material+NCM'] },
    { nome: 'Apoio',          abas: ['Modelos da Frota', 'Índice NCM'] },
    { nome: 'Leitura',        abas: ['Leia-me', 'Resumo', 'Validação', 'Fontes'] },
  ];
  const LOTE = 300;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const txt = c => String(c == null ? '' : c).trim();
  const cheias = r => r.filter(c => txt(c) !== '').length;

  const CSS = `
  .cp-wrap{display:flex;align-items:flex-start;gap:0;}
  .cp-side{width:250px;flex:0 0 250px;position:sticky;top:56px;max-height:calc(100vh - 56px);overflow-y:auto;
    padding:14px 10px 40px;border-right:1px solid rgba(255,255,255,.07);}
  .cp-side.recolhida{width:0;flex-basis:0;padding:0;overflow:hidden;border:none;}
  .cp-grupo{margin-bottom:6px;}
  .cp-grupo-h{display:flex;align-items:center;gap:6px;width:100%;background:none;border:none;cursor:pointer;
    font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;
    letter-spacing:1.4px;padding:8px 8px 6px;text-align:left;}
  .cp-grupo-h:hover{color:var(--text2);}
  .cp-caret{transition:transform .15s;flex:0 0 auto;}
  .cp-grupo.fechado .cp-caret{transform:rotate(-90deg);}
  .cp-grupo.fechado .cp-itens{display:none;}
  .cp-item{display:block;width:100%;text-align:left;background:none;border:none;cursor:pointer;
    font-family:'Montserrat',sans-serif;font-size:12.5px;color:var(--text2);padding:7px 10px;border-radius:6px;
    line-height:1.3;}
  .cp-item:hover{background:rgba(255,255,255,.05);color:var(--text);}
  .cp-item.ativo{background:rgba(249,115,22,.15);color:var(--orange);font-weight:700;}
  .cp-item small{display:block;font-size:9.5px;color:var(--text3);font-weight:400;margin-top:1px;}
  .cp-item.ativo small{color:var(--orange);opacity:.75;}

  .cp-main{flex:1;min-width:0;padding:20px 24px 60px;}
  .cp-titulo{font-size:20px;font-weight:800;color:var(--text);}
  .cp-sub{font-size:11px;color:var(--text2);margin:2px 0 16px;}
  .cp-bloco{background:rgba(20,27,38,.55);border:1px solid rgba(255,255,255,.07);border-radius:10px;
    padding:16px 18px;margin-bottom:14px;backdrop-filter:blur(16px);box-shadow:0 2px 12px rgba(0,0,0,.25);}
  .cp-bloco h3{font-size:14px;font-weight:800;color:var(--orange);margin:14px 0 6px;}
  .cp-bloco h3:first-child{margin-top:0;}
  .cp-bloco p{font-size:12.5px;color:var(--text2);line-height:1.65;margin-bottom:5px;}
  .cp-tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:10px;}
  .cp-busca{flex:1;min-width:180px;max-width:340px;background:#0a0f18;border:1px solid #2a3a50;border-radius:6px;
    color:var(--text);font-family:'Montserrat',sans-serif;font-size:12px;padding:7px 11px;}
  .cp-busca:focus{outline:none;border-color:var(--orange);}
  .cp-cont{font-size:10.5px;color:var(--text3);white-space:nowrap;}
  .cp-tblbox{overflow-x:auto;}
  .cp-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .cp-tbl thead th{background:transparent;color:var(--text);font-size:10.5px;font-weight:700;padding:8px 8px 11px;
    border-bottom:1px solid rgba(255,255,255,.10);text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;
    cursor:pointer;user-select:none;position:sticky;top:0;background:#141B26;z-index:3;}
  /* top:0 e não 56px — a caixa tem overflow-x, então ela vira o contêiner de
     rolagem e o sticky gruda DENTRO dela, sobrepondo a primeira linha */
  .cp-tbl thead th:hover{color:var(--orange);}
  .cp-tbl thead th .cp-ord{opacity:.45;font-size:9px;margin-left:3px;}
  .cp-tbl td{padding:9px 8px;border:none;color:var(--text);border-bottom:1px solid rgba(255,255,255,.04);
    vertical-align:top;line-height:1.4;}
  .cp-tbl tbody tr:hover{background:rgba(255,255,255,.035);}
  .cp-mais{display:block;margin:12px auto 0;background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.3);
    color:var(--orange);font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;border-radius:6px;
    padding:7px 16px;cursor:pointer;}
  .cp-mais:hover{background:rgba(249,115,22,.28);}
  .cp-vazio{color:var(--text3);font-size:12px;padding:14px 0;}
  .cp-side-btn{background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.3);border-radius:4px;
    padding:5px 8px;cursor:pointer;color:var(--orange);display:flex;align-items:center;}
  .cp-side-btn:hover{background:rgba(249,115,22,.28);}

  body.light-mode .cp-main,body.light-mode .cp-side{background:#F0F0F0;--text:#1a1a1a;--text2:#444;--text3:#666;}
  body.light-mode .cp-bloco{background:#FFF!important;border-color:transparent!important;box-shadow:0 2px 12px rgba(0,0,0,.10)!important;--text:#1a1a1a;--text2:#444;--text3:#555;}
  body.light-mode .cp-tbl thead th{background:#FFF;}
  body.light-mode .cp-busca{background:#FFF;border-color:#ccc;color:#1a1a1a;}
  body.light-mode .cp-item:hover{background:rgba(0,0,0,.05);}

  @media(max-width:768px){
    .cp-wrap{flex-direction:column;}
    .cp-side{position:static;width:100%;flex-basis:auto;max-height:none;border-right:none;
      border-bottom:1px solid rgba(255,255,255,.07);padding:10px;}
    .cp-side.recolhida{display:none;}
    .cp-main{padding:14px 12px 50px;}
    .cp-tbl{font-size:11px;}
    .cp-tbl thead th{position:static;}
  }`;

  function injetarCSS() {
    if (document.getElementById('cp-style')) return;
    const st = document.createElement('style');
    st.id = 'cp-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ── Segmentação: a aba vira blocos de texto e de tabela ────────────────────
  // Cabeçalho = linha com 3+ células preenchidas seguida de outra com 2+.
  function segmentar(rows) {
    const ehCab = i => cheias(rows[i]) >= 3 && rows[i + 1] && cheias(rows[i + 1]) >= 2;
    const blocos = [];
    let i = 0;
    while (i < rows.length) {
      if (cheias(rows[i]) === 0) { i++; continue; }
      if (ehCab(i)) {
        const cols = rows[i].map((c, j) => txt(c) || 'col' + (j + 1));
        const body = [];
        let j = i + 1;
        while (j < rows.length && cheias(rows[j]) > 0) { body.push(rows[j]); j++; }
        blocos.push({ tipo: 'tabela', cols, rows: body });
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

  // ── Estado ────────────────────────────────────────────────────────────────
  let DADOS = {}, ORDEM = [], atual = null;
  const estado = new Map();   // chave da tabela → {busca, ordCol, ordDir, mostrando}

  function chaveTbl(aba, idx) { return aba + '#' + idx; }

  const numBR = v => {
    const s = txt(v).replace(/\s|%/g, '');
    if (!s) return null;
    const n = Number(s.replace(/\./g, '').replace(',', '.'));
    return isFinite(n) && /[\d]/.test(s) ? n : null;
  };

  function ordenar(linhas, col, dir) {
    const fator = dir === 'asc' ? 1 : -1;
    return linhas.slice().sort((a, b) => {
      const va = a[col], vb = b[col];
      const na = typeof va === 'number' ? va : numBR(va);
      const nb = typeof vb === 'number' ? vb : numBR(vb);
      if (na !== null && nb !== null) return (na - nb) * fator;
      if (na !== null) return -1;
      if (nb !== null) return 1;
      return txt(va).localeCompare(txt(vb), 'pt-BR') * fator;
    });
  }

  function filtrar(linhas, busca) {
    if (!busca) return linhas;
    const termos = busca.toLowerCase().split(/\s+/).filter(Boolean);
    return linhas.filter(r => {
      const s = r.map(txt).join(' ').toLowerCase();
      return termos.every(t => s.includes(t));
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function renderTabela(bloco, chave) {
    const st = estado.get(chave) || { busca: '', ordCol: null, ordDir: 'asc', mostrando: LOTE };
    estado.set(chave, st);
    let linhas = filtrar(bloco.rows, st.busca);
    if (st.ordCol !== null) linhas = ordenar(linhas, st.ordCol, st.ordDir);
    const vis = linhas.slice(0, st.mostrando);
    const seta = i => st.ordCol === i ? (st.ordDir === 'asc' ? '▲' : '▼') : '';
    // No mobile o assets/mobile.js compacta a tabela; sem isso ele escolheria as
    // primeiras colunas (Item/Grupo/Família) e esconderia justamente Peça e NCM.
    // Ele respeita mt-keep/mt-hide já marcados, então a escolha é feita aqui.
    let keep = bloco.cols.map(c => /pe[çc]a|ncm/i.test(c));
    if (!keep.some(Boolean)) keep = bloco.cols.map((_, i) => i < 2);
    const cls = i => keep[i] ? 'mt-keep' : 'mt-hide';
    return `<div class="cp-bloco" data-tbl="${esc(chave)}">
      <div class="cp-tools">
        <input class="cp-busca" type="search" placeholder="Buscar nesta tabela…" value="${esc(st.busca)}">
        <span class="cp-cont">${linhas.length.toLocaleString('pt-BR')} de ${bloco.rows.length.toLocaleString('pt-BR')} linha(s)</span>
      </div>
      ${linhas.length ? `<div class="cp-tblbox"><table class="cp-tbl"><thead><tr>${
        bloco.cols.map((c, i) => `<th class="${cls(i)}" data-col="${i}">${esc(c)}<span class="cp-ord">${seta(i)}</span></th>`).join('')
      }</tr></thead><tbody>${
        vis.map(r => `<tr>${bloco.cols.map((_, i) => `<td class="${cls(i)}">${esc(r[i] === undefined ? '' : r[i])}</td>`).join('')}</tr>`).join('')
      }</tbody></table></div>` : '<div class="cp-vazio">Nada encontrado com esse filtro.</div>'}
      ${linhas.length > vis.length ? `<button class="cp-mais">Mostrar mais ${Math.min(LOTE, linhas.length - vis.length)} (faltam ${(linhas.length - vis.length).toLocaleString('pt-BR')})</button>` : ''}
    </div>`;
  }

  function renderAba(aba) {
    const rows = DADOS[aba] || [];
    const blocos = segmentar(rows);
    const total = blocos.filter(b => b.tipo === 'tabela').reduce((s, b) => s + b.rows.length, 0);
    const html = blocos.map((b, i) => b.tipo === 'tabela'
      ? renderTabela(b, chaveTbl(aba, i))
      : `<div class="cp-bloco">${b.linhas.map(l => l.titulo ? `<h3>${esc(l.t)}</h3>` : `<p>${esc(l.t)}</p>`).join('')}</div>`
    ).join('');
    document.getElementById('cp-main').innerHTML =
      `<div class="cp-titulo">${esc(aba)}</div>
       <div class="cp-sub">${total ? total.toLocaleString('pt-BR') + ' linha(s) · clique no cabeçalho para ordenar' : 'Conteúdo descritivo'}</div>
       ${html}`;
    // volta ao topo da página — scrollIntoView escondia o título sob o header fixo
    window.scrollTo({ top: 0 });
  }

  function achaBloco(chave) {
    const [aba, idx] = chave.split('#');
    return segmentar(DADOS[aba] || [])[+idx];
  }

  function repintaTabela(chave) {
    const el = document.querySelector(`[data-tbl="${CSS.escape ? CSS.escape(chave) : chave}"]`);
    if (!el) return;
    const novo = document.createElement('div');
    novo.innerHTML = renderTabela(achaBloco(chave), chave);
    el.replaceWith(novo.firstElementChild);
  }

  function menu(abas) {
    return GRUPOS.map(g => {
      const its = g.abas.filter(a => abas.includes(a));
      if (!its.length) return '';
      return `<div class="cp-grupo" data-grupo="${esc(g.nome)}">
        <button class="cp-grupo-h">
          <svg class="cp-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
          ${esc(g.nome)}
        </button>
        <div class="cp-itens">${its.map(a => {
          const n = (DADOS[a] || []).length;
          return `<button class="cp-item" data-aba="${esc(a)}">${esc(a)}<small>${n.toLocaleString('pt-BR')} linha(s)</small></button>`;
        }).join('')}</div>
      </div>`;
    }).join('');
  }

  function init(cfg) {
    injetarCSS();
    DADOS = Object.assign({}, ...(cfg.fontes || []).filter(Boolean));
    // ordem das abas = a da planilha, na sequência em que as fontes vieram
    ORDEM = (cfg.fontes || []).filter(Boolean).flatMap(f => Object.keys(f));
    const abas = ORDEM.slice();

    const raiz = document.getElementById('cp-raiz');
    raiz.innerHTML = `<div class="cp-wrap">
      <nav class="cp-side" id="cp-side">${menu(abas)}</nav>
      <div class="cp-main" id="cp-main"></div>
    </div>`;

    raiz.addEventListener('click', ev => {
      const gh = ev.target.closest('.cp-grupo-h');
      if (gh) { gh.parentElement.classList.toggle('fechado'); return; }
      const it = ev.target.closest('.cp-item');
      if (it) {
        raiz.querySelectorAll('.cp-item').forEach(b => b.classList.remove('ativo'));
        it.classList.add('ativo');
        atual = it.dataset.aba;
        renderAba(atual);
        if (window.innerWidth <= 768) document.getElementById('cp-side').classList.add('recolhida');
        return;
      }
      const th = ev.target.closest('.cp-tbl thead th');
      if (th) {
        const chave = th.closest('[data-tbl]').dataset.tbl;
        const st = estado.get(chave);
        const col = +th.dataset.col;
        st.ordDir = (st.ordCol === col && st.ordDir === 'asc') ? 'desc' : 'asc';
        st.ordCol = col;
        st.mostrando = LOTE;
        repintaTabela(chave);
        return;
      }
      const mais = ev.target.closest('.cp-mais');
      if (mais) {
        const chave = mais.closest('[data-tbl]').dataset.tbl;
        estado.get(chave).mostrando += LOTE;
        repintaTabela(chave);
      }
    });

    let deb = null;
    raiz.addEventListener('input', ev => {
      const inp = ev.target.closest('.cp-busca');
      if (!inp) return;
      const chave = inp.closest('[data-tbl]').dataset.tbl;
      const st = estado.get(chave);
      st.busca = inp.value;
      st.mostrando = LOTE;
      clearTimeout(deb);
      deb = setTimeout(() => {
        repintaTabela(chave);
        const novo = document.querySelector(`[data-tbl="${chave}"] .cp-busca`);
        if (novo) { novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
      }, 220);
    });

    const btn = document.getElementById('cp-side-btn');
    if (btn) btn.addEventListener('click', () => document.getElementById('cp-side').classList.toggle('recolhida'));

    // abre na primeira aba do primeiro grupo que existir
    const primeira = GRUPOS.flatMap(g => g.abas).find(a => abas.includes(a)) || abas[0];
    const alvo = raiz.querySelector(`.cp-item[data-aba="${primeira.replace(/"/g, '\\"')}"]`);
    if (alvo) alvo.click();
  }

  global.CatalogoPecas = { init };
})(window);
