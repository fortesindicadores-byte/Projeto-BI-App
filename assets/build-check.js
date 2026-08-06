// ============================================================
// Mantém a página sempre na versão publicada — sem o usuário fazer nada.
//
// O GitHub Pages entrega o HTML com max-age, então depois de um deploy o
// navegador continua servindo a versão antiga por minutos: a pessoa olha uma
// tela desatualizada achando que a correção não foi feita, e nem Ctrl+F5
// resolve sempre (o Pages responde 304).
//
// Duas camadas:
//   1) Service Worker (sw.js na raiz) — rede-primeiro APENAS para a navegação
//      (o HTML, alguns KB). Depois de instalado uma vez, todo painel abre com
//      o arquivo publicado, sempre. Os .js/.css continuam vindo do cache do
//      navegador: já são versionados com ?v=, e forçar rede neles deixaria os
//      painéis pesados mais lentos a cada abertura.
//   2) Rede de segurança para a primeira visita (o SW só passa a controlar na
//      navegação seguinte): compara o <meta name="build"> em execução com o do
//      HTML ao vivo e, se houver um mais novo, recarrega nele uma única vez.
//
// Opcional: qualquer elemento com [data-build] recebe a versão carregada, o
// que permite conferir num print se a tela é o arquivo novo ou o cache.
// ============================================================
(function () {
  'use strict';

  // ── 1. Service Worker ────────────────────────────────────────────────────
  // O sw.js fica na raiz do site; o escopo passa a valer para todos os painéis.
  // Descobre a raiz a partir do src deste próprio script (…/assets/build-check.js).
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    try {
      const sc = document.currentScript
        || [...document.scripts].find(x => /assets\/build-check\.js/.test(x.src));
      const raiz = sc ? sc.src.replace(/assets\/build-check\.js.*$/, '') : '/';
      navigator.serviceWorker.register(raiz + 'sw.js', { scope: raiz }).catch(() => {});
    } catch (e) { /* navegador sem SW ou origem sem https: segue sem ele */ }
  }

  // ── 2. Rede de segurança da primeira visita ──────────────────────────────
  const meta = document.querySelector('meta[name="build"]');
  const atual = meta && meta.content.trim();
  if (!atual) return;

  document.querySelectorAll('[data-build]').forEach(el => { el.textContent = 'build ' + atual; });

  // Com o SW no comando o HTML já veio da rede — não gasta uma requisição extra.
  if (navigator.serviceWorker && navigator.serviceWorker.controller) return;

  // Sem SW (primeira visita, navegador antigo): confere UMA vez por sessão.
  const chave = 'gem_reload_' + location.pathname;
  if (sessionStorage.getItem(chave) === atual) return;
  sessionStorage.setItem(chave, atual);

  fetch(location.pathname + '?cb=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.text() : null)
    .then(html => {
      if (!html) return;
      const m = html.match(/<meta\s+name="build"\s+content="(\d+)"/i);
      if (m && m[1] > atual) {
        sessionStorage.setItem(chave, m[1]);
        location.replace(location.pathname + '?v=' + m[1]);
      }
    })
    .catch(() => { /* offline: segue com o que tem */ });
})();
