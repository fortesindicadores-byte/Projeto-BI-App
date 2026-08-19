// ============================================================
// gviz-cache — abre painel rápido (Renan, 19/08/2026: "pode fazer todos").
//
// Intercepta os pedidos ao gviz do Google Sheets NA ABERTURA da página e
// responde com o snapshot que o robô (gviz-robot) mantém no Supabase:
// ~200ms em vez de 1–4s por aba. Cobre os DOIS jeitos que os painéis usam:
//   · fetch("https://docs.google.com/spreadsheets/.../gviz/tq?...")
//   · JSONP (script com tqx=out:json;responseHandler:fn)
//
// REGRAS DE SEGURANÇA (nada quebra):
//   · Só age nos primeiros 15s da página — o botão "Atualizar dados" e os
//     setInterval de 1h continuam indo DIRETO ao Google (dado na hora).
//   · Snapshot ausente, com mais de 3h, ou Supabase lento (>1,2s): o
//     pedido segue para o Google exatamente como antes.
//   · Qualquer erro aqui dentro: comportamento original.
// ============================================================
(function () {
  'use strict';
  var SUPA = 'https://lozwipoeacpvplgkrxkq.supabase.co';
  var KEY = 'sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';
  var MAX_IDADE = 3 * 60 * 60 * 1000;   // snapshot vale por 3h (robô roda de hora em hora)
  var JANELA = 15000;                    // só a carga inicial usa o snapshot
  var NASCEU = Date.now();
  var fetchOrig = window.fetch ? window.fetch.bind(window) : null;
  if (!fetchOrig) return;

  window.GvizCache = { hits: 0, misses: 0 };

  // chave normalizada — TEM de bater com a do scripts/gviz-robot.mjs
  function chaveDe(url) {
    try {
      var u = new URL(url, location.href);
      if (u.hostname !== 'docs.google.com') return null;
      var m = u.pathname.match(/^\/spreadsheets\/d\/([^/]+)\/gviz\/tq$/);
      if (!m) return null;
      var p = u.searchParams;
      return m[1] + '|s=' + (p.get('sheet') || '') + '|g=' + (p.get('gid') || '') +
             '|q=' + (p.get('tq') || '') + '|h=' + (p.get('headers') || '');
    } catch (e) { return null; }
  }

  function dentroDaJanela() { return Date.now() - NASCEU < JANELA; }

  function buscaSnapshot(key) {
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctl && setTimeout(function () { ctl.abort(); }, 1200);
    return fetchOrig(SUPA + '/rest/v1/gviz_snapshot?key=eq.' + encodeURIComponent(key) + '&select=body,updated_at', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) return null;
      return r.json();
    }).then(function (rows) {
      var row = rows && rows[0];
      if (!row || !row.body) return null;
      if (Date.now() - new Date(row.updated_at).getTime() > MAX_IDADE) return null;
      return row.body;
    }).catch(function () { if (timer) clearTimeout(timer); return null; });
  }

  // ── fetch ──────────────────────────────────────────────────
  window.fetch = function (input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url);
      var key = url && dentroDaJanela() ? chaveDe(url) : null;
      if (key) {
        return buscaSnapshot(key).then(function (body) {
          if (body != null) { window.GvizCache.hits++; return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } }); }
          window.GvizCache.misses++;
          return fetchOrig(input, init);
        });
      }
    } catch (e) { /* segue o fluxo normal */ }
    return fetchOrig(input, init);
  };

  // ── JSONP (script com responseHandler) ─────────────────────
  // Extrai o objeto entre o 1º "(" e o último ")" da resposta gviz crua.
  function parseGviz(body) {
    var a = body.indexOf('('), b = body.lastIndexOf(')');
    if (a < 0 || b <= a) return null;
    return JSON.parse(body.slice(a + 1, b));
  }
  var appendOrig = Element.prototype.appendChild;
  Element.prototype.appendChild = function (node) {
    try {
      if (node && node.tagName === 'SCRIPT' && node.src && dentroDaJanela()) {
        var key = chaveDe(node.src);
        var fnm = (node.src.match(/responseHandler:([A-Za-z0-9_$]+)/) || [])[1];
        if (key && fnm) {
          var el = this;
          buscaSnapshot(key).then(function (body) {
            var obj = null;
            if (body != null) { try { obj = parseGviz(body); } catch (e) { obj = null; } }
            if (obj && typeof window[fnm] === 'function') { window.GvizCache.hits++; window[fnm](obj); return; }
            window.GvizCache.misses++;
            appendOrig.call(el, node);      // sem snapshot: JSONP normal
          });
          return node;                       // contrato do appendChild
        }
      }
    } catch (e) { /* segue o fluxo normal */ }
    return appendOrig.call(this, node);
  };
})();
