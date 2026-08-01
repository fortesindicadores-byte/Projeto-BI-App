/* ============================================================
   Mobile app-like (compartilhado em TODAS as páginas do portal).
   Inclua 1 linha antes do </body> (ajuste ../ conforme a pasta):
     <script src="../assets/mobile.js"></script>

   1) TRAVA DE ZOOM — comportamento de app (Facebook/Instagram):
      sem pinça, sem duplo-toque; a página só se adapta à tela.
      - Android/Chrome: meta viewport (maximum-scale=1, user-scalable=no)
      - iOS/Safari: ignora o meta → bloqueia via gesturestart/gesturechange
      - duplo-toque: touch-action:manipulation
   2) TABELA GRANDE NO MOBILE → recolhida atrás de um botão
      "Detalhar": fica visível só o indicador principal (hero/cards)
      e o detalhe abre sob demanda, com scroll interno próprio.
      Tabelas que já couberam na tela não são tocadas.
   ============================================================ */
(function(){
  var d=document;

  /* ── 1) trava de zoom ── */
  function lockZoom(){
    var m=d.querySelector('meta[name="viewport"]');
    if(!m){m=d.createElement('meta');m.setAttribute('name','viewport');(d.head||d.documentElement).appendChild(m);}
    m.setAttribute('content','width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    var st=d.createElement('style');
    st.textContent=
      'html{touch-action:manipulation;-webkit-text-size-adjust:100%;}'+
      '@media(max-width:768px){html,body{overflow-x:hidden;}}'+
      '.mt-detail-btn{display:inline-flex;align-items:center;gap:6px;margin:2px 0 10px;background:rgba(249,115,22,.12);border:1px solid rgba(249,115,22,.3);border-radius:4px;padding:6px 12px;font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;color:#F97316;cursor:pointer;text-transform:uppercase;letter-spacing:.5px;}'+
      '[data-mt-wrap]{overflow-x:auto;max-width:100%;}';
    (d.head||d.documentElement).appendChild(st);
    ['gesturestart','gesturechange','gestureend'].forEach(function(ev){
      d.addEventListener(ev,function(e){e.preventDefault();},{passive:false});
    });
  }

  /* ── 2) tabelas grandes → "Detalhar" (só mobile) ── */
  var MQ=window.matchMedia('(max-width:768px)');
  function tooWide(t){return t.scrollWidth>d.documentElement.clientWidth+8;}
  function collapse(t){
    var box=d.createElement('div');
    var btn=d.createElement('button');btn.type='button';btn.className='mt-detail-btn';btn.textContent='+ Detalhar';
    var wrap=d.createElement('div');wrap.setAttribute('data-mt-wrap','1');wrap.style.display='none';
    t.parentNode.insertBefore(box,t);
    wrap.appendChild(t);box.appendChild(btn);box.appendChild(wrap);
    btn.addEventListener('click',function(){
      var open=wrap.style.display==='none';
      wrap.style.display=open?'':'none';
      btn.textContent=open?'− Ocultar detalhes':'+ Detalhar';
    });
  }
  /* ── 3) "(INATIVO)" nunca aparece na tela ──
     Vassoura global: remove o texto "(INATIVO)" de qualquer nó de texto
     renderizado (painéis, filtros, tabelas, cards). Só cosmética — os
     valores internos de filtro/dados não são alterados. */
  var RE_INAT=/\s*\(INATIVO\)/gi;
  function scrubInativo(){
    if(!document.body||document.body.textContent.indexOf('(INATIVO)')<0)return;
    var w=d.createTreeWalker(d.body,NodeFilter.SHOW_TEXT,null),n;
    while((n=w.nextNode())){
      if(n.nodeValue&&n.nodeValue.indexOf('(INATIVO)')>=0)
        n.nodeValue=n.nodeValue.replace(RE_INAT,'');
    }
  }

  var t0=null;
  function scan(){
    scrubInativo();
    if(!MQ.matches){ /* desktop / rotação: reabre e esconde os botões */
      d.querySelectorAll('[data-mt-wrap]').forEach(function(w){w.style.display='';});
      d.querySelectorAll('.mt-detail-btn').forEach(function(b){b.style.display='none';});
      return;
    }
    d.querySelectorAll('.mt-detail-btn').forEach(function(b){b.style.display='';});
    d.querySelectorAll('table').forEach(function(t){
      if(t.closest('[data-mt-wrap]'))return;               /* já tratada */
      if(!t.offsetParent)return;                            /* invisível agora */
      if(t.closest('.ms-panel,.farol-panel,.kmodal'))return;/* dropdowns/modais */
      if(tooWide(t))collapse(t);
    });
  }
  function schedule(){clearTimeout(t0);t0=setTimeout(scan,250);}
  function start(){
    lockZoom();
    new MutationObserver(schedule).observe(d.documentElement,{childList:true,subtree:true});
    window.addEventListener('resize',schedule);
    window.addEventListener('orientationchange',schedule);
    schedule();
  }
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',start);else start();
})();
