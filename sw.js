// ============================================================
// Service Worker — mata o cache de HTML do GitHub Pages, e SÓ isso.
//
// O problema: o Pages entrega index.html com max-age. Depois de um deploy o
// navegador continua servindo a página antiga por minutos, e a pessoa olha uma
// tela desatualizada achando que a correção não foi feita. Ctrl+F5 nem sempre
// resolve (o Pages responde 304) e pedir para o usuário abrir com "?x=1" é
// empurrar o problema para ele.
//
// ESCOPO DE PROPÓSITO ESTREITO — só NAVEGAÇÃO (o documento HTML), que é de
// alguns KB. Os .js/.css NÃO passam por aqui: eles já são versionados com ?v=,
// então um deploy muda a URL e o navegador baixa o novo sozinho. Forçar rede
// neles jogaria fora o cache dos arquivos grandes (catalogo-pecas-dados.js tem
// 3,4 MB) e deixaria os painéis mais lentos a cada abertura — o oposto do que
// se quer. Dados de API também não passam: vão direto, sem interceptação.
//
// Este SW não guarda nada. Sem storage próprio não há como servir conteúdo
// velho por engano, e um SW quebrado nunca "trava" o site.
//
// Registrado por assets/build-check.js, que está em todos os painéis.
// ============================================================
const VERSAO = 4;   // suba aqui para forçar a troca do próprio SW

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;   // só o HTML da página

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req, { cache: 'reload' })
      .catch(() => fetch(req, { cache: 'force-cache' }))          // sem rede: usa o que houver
  );
});
