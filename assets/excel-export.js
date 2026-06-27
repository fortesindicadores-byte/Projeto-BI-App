/* ============================================================
   Exportar Excel pelo BOTÃO DIREITO — tabelas e gráficos.
   Uso no painel (1 linha; auto-inicializa, carrega o SheetJS sozinho):
     <script src="../assets/excel-export.js"></script>   (../../ em combustivel/<sub>/)
   Clique direito sobre uma TABELA (.tbl-section/table) ou um GRÁFICO (canvas Chart.js)
   abre um menu "Exportar Excel". Fora desses elementos, o menu nativo do navegador funciona normal.
   ============================================================ */
(function(){
  const XLSX_SRC='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  function ensureXLSX(cb){
    if(window.XLSX) return cb();
    let s=document.getElementById('xlsx-cdn');
    if(s){ s.addEventListener('load',()=>cb()); s.addEventListener('error',()=>cb(new Error('xlsx'))); return; }
    s=document.createElement('script'); s.id='xlsx-cdn'; s.src=XLSX_SRC;
    s.onload=()=>cb(); s.onerror=()=>cb(new Error('xlsx'));
    document.head.appendChild(s);
  }
  function slug(s){return String(s||'dados').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'dados';}
  function sheetName(s){return (String(s||'Dados').replace(/[\\\/?*\[\]:]/g,' ').trim().slice(0,28))||'Dados';}
  function painelTitulo(){ return (document.querySelector('.brand h1')||{}).textContent || document.title || 'BI'; }
  function tituloTabela(sec){
    if(!sec) return 'Tabela';
    const t=sec.querySelector('.tbl-title,.sec-title,h2,h3'); return (t&&t.textContent.trim())||'Tabela';
  }
  function tituloGrafico(canvas){
    const card=canvas.closest('.chart-card,.tbl-section,section,div');
    const t=card&&card.querySelector('.chart-title,.tbl-title,.sec-title,h2,h3'); return (t&&t.textContent.trim())||'Grafico';
  }
  function baixarTabela(table, nome){
    ensureXLSX(err=>{ if(err){alert('Não foi possível carregar o componente de Excel. Verifique a conexão.');return;}
      try{
        const ws=XLSX.utils.table_to_sheet(table,{raw:false,display:true});
        const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,sheetName(nome));
        XLSX.writeFile(wb, slug(painelTitulo())+'_'+slug(nome)+'.xlsx');
      }catch(e){ console.error(e); alert('Erro ao exportar tabela: '+(e.message||e)); }
    });
  }
  function baixarGrafico(chart, nome){
    ensureXLSX(err=>{ if(err){alert('Não foi possível carregar o componente de Excel. Verifique a conexão.');return;}
      try{
        const labels=chart.data.labels||[];
        const dss=(chart.data.datasets||[]).filter(d=>!d._meta && d.data);
        const aoa=[['', ...dss.map(d=>d.label||'Série')]];
        labels.forEach((lb,i)=>aoa.push([lb, ...dss.map(d=>{const v=d.data[i];return (v&&typeof v==='object'&&'y'in v)?v.y:v;})]));
        const ws=XLSX.utils.aoa_to_sheet(aoa);
        const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,sheetName(nome));
        XLSX.writeFile(wb, slug(painelTitulo())+'_'+slug(nome)+'.xlsx');
      }catch(e){ console.error(e); alert('Erro ao exportar gráfico: '+(e.message||e)); }
    });
  }

  // ---- menu de contexto ----
  let menu;
  function ensureMenu(){
    if(menu) return menu;
    const css=document.createElement('style');
    css.textContent=`#xl-menu{position:fixed;z-index:10000;display:none;background:#0f1824;border:1px solid #2a3a50;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.7);overflow:hidden;font-family:'Montserrat',sans-serif;}
#xl-menu button{display:flex;align-items:center;gap:8px;background:none;border:none;color:#F1F5F9;font-size:12px;font-weight:700;padding:9px 14px;cursor:pointer;width:100%;text-align:left;white-space:nowrap;}
#xl-menu button:hover{background:rgba(34,197,94,.18);color:#3BB33B;}
#xl-menu .xl-i{width:14px;height:14px;flex:0 0 auto;}`;
    document.head.appendChild(css);
    menu=document.createElement('div'); menu.id='xl-menu';
    document.body.appendChild(menu);
    return menu;
  }
  function showMenu(x,y,label,action){
    const mn=ensureMenu();
    mn.innerHTML='';
    const b=document.createElement('button');
    b.innerHTML='<svg class="xl-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> '+label;
    b.onclick=()=>{ hideMenu(); action(); };
    mn.appendChild(b);
    mn.style.display='block';
    // posiciona dentro da viewport
    const w=mn.offsetWidth||180, h=mn.offsetHeight||40;
    mn.style.left=Math.min(x, window.innerWidth-w-6)+'px';
    mn.style.top=Math.min(y, window.innerHeight-h-6)+'px';
  }
  function hideMenu(){ if(menu) menu.style.display='none'; }
  document.addEventListener('click',hideMenu);
  document.addEventListener('scroll',hideMenu,true);
  window.addEventListener('blur',hideMenu);

  document.addEventListener('contextmenu',e=>{
    if(e.target.closest('#xl-menu')) return;
    // 1) tabela
    const sec=e.target.closest('.tbl-section');
    const table=(sec&&sec.querySelector('table'))||e.target.closest('table');
    if(table){ e.preventDefault(); showMenu(e.clientX,e.clientY,'Exportar Excel',()=>baixarTabela(table, tituloTabela(sec))); return; }
    // 2) gráfico (canvas Chart.js)
    const canvas=e.target.closest('canvas');
    if(canvas && window.Chart && typeof Chart.getChart==='function'){
      const ch=Chart.getChart(canvas);
      if(ch){ e.preventDefault(); showMenu(e.clientX,e.clientY,'Exportar Excel',()=>baixarGrafico(ch, tituloGrafico(canvas))); return; }
    }
    // fora disso: menu nativo do navegador
  });
})();
