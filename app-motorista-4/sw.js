/* Service worker do DriverPro: é ele que faz a página virar APP — com ele e o
   manifest, o celular oferece "Adicionar à tela de início", e o app abre por
   ícone próprio, em tela cheia, sem barra de navegador.
   Estratégia: rede primeiro, cache como rede de segurança (pátio com sinal
   ruim mostra o último estado carregado). As chamadas ao Supabase NUNCA entram
   no cache — dado é sempre da rede. Ao publicar, trocar CACHE. */
const CACHE = 'driverpro-v13';
const ESSENCIAIS = ['./', './index.html', './manifest.json', './img/icone-192.png', './img/icone-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;   // Supabase, fontes: direto na rede
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const c2 = r.clone(); caches.open(CACHE).then(c => c.put(e.request, c2)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
