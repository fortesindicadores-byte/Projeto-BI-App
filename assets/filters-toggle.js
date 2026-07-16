/* ============================================================
   UI mobile compartilhada dos painéis. Inclua 1 linha (ajuste ../ conforme a pasta):
     <script src="../assets/filters-toggle.js"></script>
   Faz duas coisas:
   1) Botão "Filtros" que recolhe/expande a barra .header-filters
      (aberto no desktop, recolhido no mobile ≤768px; alterna body.filters-collapsed).
   2) CSS mobile que encolhe/quebra os toggles (.dim-toggle/.dim-btn) para caberem
      na tela e no gráfico.
   ============================================================ */
(function(){
  function injectCSS(){
    if(document.getElementById('filt-toggle-css')) return;
    var css=document.createElement('style');
    css.id='filt-toggle-css';
    css.textContent=
      ".filt-toggle-btn{display:inline-flex;align-items:center;gap:5px;background:rgba(249,115,22,.15);"+
      "border:1px solid rgba(249,115,22,.3);border-radius:4px;padding:5px 10px;cursor:pointer;"+
      "color:var(--orange,#F97316);font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;"+
      "text-transform:uppercase;letter-spacing:.5px;line-height:1;white-space:nowrap;}"+
      ".filt-toggle-btn:hover{background:rgba(249,115,22,.32);}"+
      ".filt-toggle-btn svg{flex:0 0 auto;}"+
      "body.filters-collapsed .header-filters{display:none!important;}"+
      "@media(max-width:768px){"+
        ".filt-toggle-btn{font-size:9px;padding:4px 7px;gap:4px;}"+
        ".filt-toggle-btn svg{width:11px;height:11px;}"+
        /* toggles cabem na tela: encolhem e quebram linha se preciso */
        ".dim-toggle{flex-wrap:wrap;overflow:visible;max-width:100%;}"+
        ".dim-btn{font-size:9px!important;padding:5px 8px!important;letter-spacing:.2px!important;}"+
      "}";
    document.head.appendChild(css);
  }
  function init(){
    injectCSS();
    var filters=document.querySelector('.header-filters');
    if(!filters) return;                                   // sem filtros: só o CSS de toggles
    if(document.getElementById('filt-toggle-btn')) return; // idempotente
    var right=document.querySelector('.header-right')||filters.parentElement;

    var btn=document.createElement('button');
    btn.id='filt-toggle-btn';
    btn.type='button';
    btn.className='filt-toggle-btn';
    btn.title='Mostrar/ocultar filtros';
    btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" '+
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'+
      '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg><span>Filtros</span>';
    btn.addEventListener('click',function(){document.body.classList.toggle('filters-collapsed');});

    if(right.firstChild) right.insertBefore(btn,right.firstChild); else right.appendChild(btn);

    // recolhido por padrão só no mobile
    try{ if(window.matchMedia&&window.matchMedia('(max-width:768px)').matches) document.body.classList.add('filters-collapsed'); }catch(e){}
  }
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded',init);
})();
