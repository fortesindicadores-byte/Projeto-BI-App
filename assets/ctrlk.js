// ============================================================
// Ctrl+K / ⌘K — foca a pesquisa do painel (Renan, 19/08/2026).
// Incluído em todas as páginas, como o mobile.js. Ordem de alvo:
//   1) [data-ctrlk] visível (o painel declara a busca principal);
//   2) primeiro campo de busca visível (placeholder/id com
//      "pesquisar"/"buscar"/"search");
//   3) painéis do layout padrão sem busca própria: abre o 1º filtro
//      multi-select (.ms-btn) e foca a busca do dropdown.
// Sem alvo, não faz nada — seguro em qualquer página.
// ============================================================
(function () {
  'use strict';
  function visivel(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || (e.key !== 'k' && e.key !== 'K')) return;
    e.preventDefault();

    let alvo = [...document.querySelectorAll('[data-ctrlk]')].find(visivel);

    if (!alvo) {
      alvo = [...document.querySelectorAll('input[type=text],input[type=search],input:not([type])')]
        .find(i => visivel(i) && !i.closest('.ms-panel') &&
          /pesquis|buscar|search/i.test((i.placeholder || '') + ' ' + (i.id || '') + ' ' + (i.className || '')));
    }

    if (!alvo) {
      const btn = [...document.querySelectorAll('.ms-btn')].find(visivel);
      if (btn) {
        btn.click();
        const wrap = btn.closest('.ms-wrap');
        const inp = wrap && wrap.querySelector('.ms-search input');
        if (inp) { inp.focus(); return; }
      }
    }

    if (alvo) { alvo.focus(); if (alvo.select) alvo.select(); }
  });
})();
