// ============================================================
// Auto-atualização da página quando sai uma build nova.
//
// O GitHub Pages entrega o HTML com max-age, então depois de um deploy o
// navegador continua servindo a versão antiga por minutos — e a pessoa olha
// uma tela desatualizada achando que a correção não foi feita.
//
// Uso: <meta name="build" content="AAAAMMDDHHMM"> no <head> e este script na
// página. Ele busca o próprio HTML sem cache, compara o build de lá com o que
// está rodando e, se houver um mais novo, recarrega apontando para ele.
// O sessionStorage impede laço.
// ============================================================
(function () {
  'use strict';
  const meta = document.querySelector('meta[name="build"]');
  const atual = meta && meta.content.trim();
  if (!atual) return;

  // mostra a build carregada no elemento [data-build], se a página tiver um —
  // assim dá para saber, olhando um print, se é o arquivo novo ou o cache
  document.querySelectorAll('[data-build]').forEach(el => { el.textContent = 'build ' + atual; });
  const chave = 'gem_reload_' + location.pathname;
  if (sessionStorage.getItem(chave) === atual) return;

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
