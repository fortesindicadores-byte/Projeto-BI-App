/* ============================================================
   Exportar pelo BOTÃO DIREITO — Excel e Imagem (PNG em alta resolução).
   Uso no painel (1 linha; auto-inicializa, carrega SheetJS/html2canvas sozinho):
     <script src="../assets/excel-export.js"></script>   (../../ em combustivel/<sub>/)
   Clique direito sobre uma TABELA (.tbl-section/table), um GRÁFICO (canvas Chart.js)
   ou um CARD (.kpi-card/.card/.chart-card/.peso-box/.podio-section) abre um menu com
   "Exportar Excel" (quando faz sentido) e "Exportar imagem (PNG)".
   Fora desses elementos, o menu nativo do navegador funciona normal.
   ============================================================ */
(function(){
  const XLSX_SRC='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const H2C_SRC='https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  function ensureXLSX(cb){
    if(window.XLSX) return cb();
    let s=document.getElementById('xlsx-cdn');
    if(s){ s.addEventListener('load',()=>cb()); s.addEventListener('error',()=>cb(new Error('xlsx'))); return; }
    s=document.createElement('script'); s.id='xlsx-cdn'; s.src=XLSX_SRC;
    s.onload=()=>cb(); s.onerror=()=>cb(new Error('xlsx'));
    document.head.appendChild(s);
  }
  function ensureH2C(cb){
    if(window.html2canvas) return cb();
    let s=document.getElementById('h2c-cdn');
    if(s){ s.addEventListener('load',()=>cb()); s.addEventListener('error',()=>cb(new Error('h2c'))); return; }
    s=document.createElement('script'); s.id='h2c-cdn'; s.src=H2C_SRC;
    s.onload=()=>cb(); s.onerror=()=>cb(new Error('h2c'));
    document.head.appendChild(s);
  }
  function slug(s){return String(s||'dados').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'dados';}
  function sheetName(s){return (String(s||'Dados').replace(/[\\\/?*\[\]:]/g,' ').trim().slice(0,28))||'Dados';}
  function painelTitulo(){ return (document.querySelector('.brand h1')||{}).textContent || document.title || 'BI'; }
  function tituloTabela(sec){
    if(!sec) return 'Tabela';
    const t=sec.querySelector('.tbl-title,.sec-title,.rtit,h2,h3'); return (t&&t.textContent.trim())||'Tabela';
  }
  function tituloGrafico(canvas){
    const card=canvas.closest('.chart-card,.tbl-section,.tab-wrap,section,div');
    const t=card&&card.querySelector('.chart-title,.tbl-title,.sec-title,.rtit,h2,h3'); return (t&&t.textContent.trim())||'Grafico';
  }
  // Converte texto formatado em NÚMERO (p/ análise no Excel). Trata pt-BR (vírgula
  // decimal, ponto milhar), toFixed (ponto decimal), %, pp, R$, sufixos mi/bi/k, º.
  // Rótulos/datas/horas ficam como texto (retorna null). Desambigua ponto milhar×decimal.
  function parseNum(raw){
    if(raw==null) return null;
    let s=String(raw).trim().replace(/[−–]/g,'-');   // normaliza − (minus) e – (en-dash) p/ ASCII
    if(!s || /^[—\-]+$/.test(s)) return null;
    if(/[\/:]/.test(s)) return null;                 // datas/horas → texto
    const low=s.toLowerCase();
    const resid=low.replace(/[0-9.,\s%+\-()º°ª]/g,'').replace(/r\$/g,'').replace(/\$/g,'').replace(/milh\w*|mil|mi|bi|pp|k/g,'');
    if(resid.length) return null;                     // sobrou letra → rótulo/texto
    let mult=1;
    if(/\bbi\b/.test(low)) mult=1e9;
    else if(/\bmil\b/.test(low)) mult=1e3;               // 'mil' ANTES de 'mi' ('mil' contém 'mi')
    else if(/\bmi\b/.test(low)||/milh/.test(low)) mult=1e6;
    else if(/[\d\s]k\b/.test(low)) mult=1e3;
    let t=s.replace(/[^0-9.,-]/g,'');
    const neg=/^-/.test(t); t=t.replace(/-/g,'');
    if(!/[0-9]/.test(t)) return null;
    if(t.indexOf(',')>=0){ t=t.replace(/\./g,'').replace(',','.'); }
    else if(t.indexOf('.')>=0){
      const parts=t.split('.'), afterLast=parts[parts.length-1];
      if(parts.length>2 || (afterLast.length===3 && parts[0]!=='0' && parts[0]!=='')) t=t.replace(/\./g,'');
    }
    let n=parseFloat(t); if(!isFinite(n)) return null;
    return (neg?-n:n)*mult;
  }
  // valor de uma célula → número (respeita data-v cru se o painel fornecer), senão texto
  function cellVal(cell){
    const dv=cell.getAttribute&&cell.getAttribute('data-v');
    if(dv!=null && dv!=='' && isFinite(+dv)) return +dv;
    // células editáveis: usa o valor do campo, não o textContent (que é vazio)
    const fld=cell.querySelector&&cell.querySelector('input,select,textarea');
    const raw=fld ? (fld.value||'') : cell.textContent;
    const n=parseNum(raw);
    return n==null ? String(raw).trim() : n;
  }
  function baixarTabela(table, nome){
    ensureXLSX(err=>{ if(err){alert('Não foi possível carregar o componente de Excel. Verifique a conexão.');return;}
      try{
        const aoa=[];
        table.querySelectorAll('tr').forEach(tr=>{
          const row=[];
          tr.querySelectorAll('th,td').forEach(cell=>{
            row.push(cellVal(cell));
            const span=parseInt(cell.getAttribute('colspan')||'1',10);
            for(let k=1;k<span;k++) row.push(null);
          });
          if(row.length) aoa.push(row);
        });
        const ws=XLSX.utils.aoa_to_sheet(aoa);
        const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,sheetName(nome));
        XLSX.writeFile(wb, slug(painelTitulo())+'_'+slug(nome)+'.xlsx');
      }catch(e){ console.error(e); alert('Erro ao exportar tabela: '+(e.message||e)); }
    });
  }
  // ---- Exportar CARDS (label + valor numérico) ----
  const CARD_SEL='.kpi-card,.kpi,.scard,.stat-card,.sc-card,.card';
  const LBL_SEL='.card-label,.kpi-lbl,.hero-label,.slbl,.sc-label,.card-lbl,.stat-label,.card-title';
  const VAL_SEL='.card-value,.kpi-val,.hero-value,.sval,.sc-value,.card-val,.stat-value,.card-num';
  const CARD_GROUP='.cards-row,.cards-grid,.kpi-row,.scards,.sc-row,.cards,.card-grid';
  function cardsDe(el){
    const card=el.closest(CARD_SEL); if(!card) return null;
    const group=card.closest(CARD_GROUP)||card.parentElement;
    const all=[].slice.call(group.querySelectorAll(CARD_SEL)).filter(c=>!c.querySelector(CARD_SEL)); // só cards folha
    return all.length?all:[card];
  }
  function baixarCards(cards, nome){
    ensureXLSX(err=>{ if(err){alert('Não foi possível carregar o componente de Excel. Verifique a conexão.');return;}
      try{
        const aoa=[['Indicador','Valor']];
        cards.forEach(c=>{
          const lblEl=c.querySelector(LBL_SEL), valEl=c.querySelector(VAL_SEL);
          const lbl=((lblEl&&lblEl.textContent)||'').trim()||'Item';
          const vtxt=((valEl&&valEl.textContent)||'').trim();
          const n=parseNum(vtxt);
          aoa.push([lbl, n==null?vtxt:n]);
        });
        const ws=XLSX.utils.aoa_to_sheet(aoa);
        const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,sheetName(nome));
        XLSX.writeFile(wb, slug(painelTitulo())+'_'+slug(nome)+'.xlsx');
      }catch(e){ console.error(e); alert('Erro ao exportar cards: '+(e.message||e)); }
    });
  }
  function baixarGrafico(chart, nome){
    ensureXLSX(err=>{ if(err){alert('Não foi possível carregar o componente de Excel. Verifique a conexão.');return;}
      try{
        // hook: o painel pode fornecer colunas customizadas p/ este gráfico
        let aoa;
        const custom = (typeof chart.$exportAoA==='function') ? chart.$exportAoA() : (Array.isArray(chart.$exportAoA)?chart.$exportAoA:null);
        if(custom && custom.length){ aoa = custom; }
        else {
          const labels=chart.data.labels||[];
          const dss=(chart.data.datasets||[]).filter(d=>!d._meta && d.data);
          aoa=[['', ...dss.map(d=>d.label||'Série')]];
          labels.forEach((lb,i)=>aoa.push([lb, ...dss.map(d=>{const v=d.data[i];return (v&&typeof v==='object'&&'y'in v)?v.y:v;})]));
        }
        const ws=XLSX.utils.aoa_to_sheet(aoa);
        const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,sheetName(nome));
        XLSX.writeFile(wb, slug(painelTitulo())+'_'+slug(nome)+'.xlsx');
      }catch(e){ console.error(e); alert('Erro ao exportar gráfico: '+(e.message||e)); }
    });
  }

  // ---- Exportar BASE + IMPACTO (2 abas: Base e Memória de cálculo) ----
  // O painel liga o hook num elemento do card de impacto:
  //   el.$exportImpacto = () => ({ nome, base:[[hdr],[...linhas com coluna IMPACTO]], memoria:[[...]] })
  function findImpactoEl(target){ let e=target; while(e){ if(e.$exportImpacto) return e; e=e.parentElement; } return null; }
  function baixarImpacto(getData, nomeFallback){
    ensureXLSX(err=>{ if(err){alert('Não foi possível carregar o componente de Excel. Verifique a conexão.');return;}
      try{
        const d=(typeof getData==='function')?getData():getData;
        if(!d||!d.base||!d.base.length){ alert('Sem base para exportar.'); return; }
        const wb=XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d.base), sheetName('Base'));
        if(d.memoria&&d.memoria.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d.memoria), sheetName('Memória de cálculo'));
        XLSX.writeFile(wb, slug(painelTitulo())+'_'+slug(d.nome||nomeFallback||'impacto')+'.xlsx');
      }catch(e){ console.error(e); alert('Erro ao exportar base de impacto: '+(e.message||e)); }
    });
  }

  // ---- Exportar IMAGEM (PNG) em alta resolução ----
  function baixarPNG(canvas, nome){
    canvas.toBlob(blob=>{
      if(!blob){ alert('Erro ao gerar imagem.'); return; }
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=slug(painelTitulo())+'_'+slug(nome)+'.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    },'image/png');
  }
  function bgDe(el){
    // Fundo p/ o PNG: precisa ser OPACO. Cards têm fundo semi-transparente (rgba .14/.55) que,
    // pintado sobre preto, escurece a imagem no modo claro — então pulamos e subimos até achar
    // um fundo opaco (o .main = #F0F0F0 no claro / var(--bg) no escuro).
    const alpha=c=>{const m=String(c).match(/rgba?\(([^)]+)\)/);if(!m)return 1;const p=m[1].split(',');return p.length>3?parseFloat(p[3]):1;};
    let e=el;
    while(e){ const c=getComputedStyle(e).backgroundColor; if(c && c!=='transparent' && alpha(c)>=0.9) return c; e=e.parentElement; }
    const body=getComputedStyle(document.body).backgroundColor;
    return (body && alpha(body)>=0.9) ? body : (document.body.classList.contains('light-mode')?'#F0F0F0':'#0C1017');
  }
  const SCALE=4; // fallback
  // Escala ADAPTATIVA: elementos menores (cards de gráfico) saem muito mais nítidos (até 8×);
  // elementos grandes (tabelões) limitam a escala para não estourar memória (~32MP alvo).
  function scaleFor(el){ try{ const r=el.getBoundingClientRect(); const px=Math.max(1,r.width*r.height);
    return Math.max(3, Math.min(8, Math.sqrt(32e6/px))); }catch(e){ return SCALE; } }
  // Chart.js resiste a mudar DPI em runtime; então re-renderiza o gráfico num canvas temporário
  // em alta DPI (3×) e devolve um dataURL nítido p/ trocar no clone do html2canvas.
  function chartHiRes(chart, scl){
    try{
      const cv=chart.canvas, r=cv.getBoundingClientRect();
      const cssW=Math.round(r.width), cssH=Math.round(r.height);
      if(!cssW||!cssH||!window.Chart) return null;
      const tmp=document.createElement('canvas'); tmp.style.width=cssW+'px'; tmp.style.height=cssH+'px';
      const host=document.createElement('div'); host.style.cssText='position:fixed;left:-99999px;top:0;width:'+cssW+'px;height:'+cssH+'px;'; host.appendChild(tmp); document.body.appendChild(host);
      const cfg=chart.config;
      const t=new window.Chart(tmp,{type:cfg.type,data:cfg.data,options:Object.assign({},cfg.options,{responsive:false,animation:false,devicePixelRatio:scl||SCALE}),plugins:cfg.plugins});
      const url=tmp.toDataURL('image/png');
      t.destroy(); host.remove();
      return {url,cssW,cssH};
    }catch(e){ console.warn('chartHiRes',e); return null; }
  }
  function capturaImagem(el, nome, chart, transp){
    ensureH2C(err=>{ if(err){ alert('Não foi possível carregar o componente de imagem. Verifique a conexão.'); return; }
      const scl=scaleFor(el);                     // escala adaptativa (gráficos até 8×)
      const hi = chart ? chartHiRes(chart, scl) : null;
      if(hi && chart) chart.canvas.setAttribute('data-hires-tgt','1');
      el.setAttribute('data-h2c-root','1');
      // html2canvas 1.4.1 NÃO resolve var(--x) em 'color'/'background' (pinta preto).
      // Solução: grava a cor/fundo COMPUTADOS num atributo p/ reaplicar como valor concreto no clone.
      const nodes=[el].concat([].slice.call(el.querySelectorAll('*')));
      nodes.forEach(n=>{ try{ const cs=getComputedStyle(n); n.setAttribute('data-h2c-c',cs.color); n.setAttribute('data-h2c-bg',cs.backgroundColor); }catch(e){} });
      html2canvas(el,{scale:scl,backgroundColor:transp?null:bgDe(el),useCORS:true,logging:false,scrollX:0,scrollY:-window.scrollY,
        onclone:(doc)=>{
          doc.querySelectorAll('[data-h2c-c]').forEach(n=>{ n.style.color=n.getAttribute('data-h2c-c'); const bg=n.getAttribute('data-h2c-bg'); if(bg&&bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent') n.style.backgroundColor=bg; });
          // canto do raiz DETERMINÍSTICO: o html2canvas 1.4.1 clipa o border-radius do elemento raiz
          // de forma inconsistente (às vezes arredonda, às vezes sai quadrado) → forçamos reto p/ o PNG
          // sair sempre igual, independentemente do conteúdo/estado.
          const _root=doc.querySelector('[data-h2c-root="1"]'); if(_root) _root.style.borderRadius='0';
          if(transp){ const rc=doc.querySelector('[data-h2c-root="1"]');   // fundo transparente: remove o fundo/sombra do card raiz
            if(rc){ rc.style.backgroundColor='transparent'; rc.style.boxShadow='none'; rc.style.border='none'; rc.style.backdropFilter='none'; } }
          if(hi){ const c=doc.querySelector('canvas[data-hires-tgt="1"]')||doc.querySelector('canvas');
            if(c&&c.parentNode){ const img=doc.createElement('img'); img.src=hi.url; img.style.width=hi.cssW+'px'; img.style.height=hi.cssH+'px'; img.style.display='block'; c.parentNode.replaceChild(img,c); } }
        }
      }).then(cv=>{ baixarPNG(cv, transp? nome+'-transparente' : nome); })
        .catch(e=>{ console.error(e); alert('Erro ao gerar imagem: '+(e.message||e)); })
        .finally(()=>{ if(chart) chart.canvas.removeAttribute('data-hires-tgt'); el.removeAttribute('data-h2c-root'); nodes.forEach(n=>{ n.removeAttribute('data-h2c-c'); n.removeAttribute('data-h2c-bg'); }); });
    });
  }
  // bloco "exportável como imagem" mais próximo do clique
  const IMG_BLOCK='.tbl-section,.chart-card,.tab-wrap,.kpi-card,.card,.kcard,.kcol,.gantt,.rel-section,.fato-block,.peso-box,.podio-section,.hero,section';
  function blocoImagem(target){ return target.closest(IMG_BLOCK); }

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
  const IC_FILE='<svg class="xl-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  const IC_IMG='<svg class="xl-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
  function showMenu(x,y,items){
    const mn=ensureMenu();
    mn.innerHTML='';
    items.forEach(it=>{
      const b=document.createElement('button');
      b.innerHTML=(it.icon||IC_FILE)+' '+it.label;
      b.onclick=()=>{ hideMenu(); it.action(); };
      mn.appendChild(b);
    });
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
    // 1) tabela → Excel + Imagem (da seção inteira)
    const sec=e.target.closest('.tbl-section,.tab-wrap');
    const table=(sec&&sec.querySelector('table'))||e.target.closest('table');
    if(table){
      e.preventDefault();
      const nome=tituloTabela(sec), alvoImg=sec||table;
      showMenu(e.clientX,e.clientY,[
        {icon:IC_FILE,label:'Exportar Excel',action:()=>baixarTabela(table, nome)},
        {icon:IC_IMG, label:'Exportar imagem (PNG)',action:()=>capturaImagem(alvoImg, nome)},
        {icon:IC_IMG, label:'PNG fundo transparente',action:()=>capturaImagem(alvoImg, nome, undefined, true)}
      ]);
      return;
    }
    // 2) gráfico (canvas Chart.js) → Excel (dados) + Imagem (card do gráfico em alta DPI)
    const canvas=e.target.closest('canvas');
    if(canvas && window.Chart && typeof Chart.getChart==='function'){
      const ch=Chart.getChart(canvas);
      if(ch){
        e.preventDefault();
        const nome=tituloGrafico(canvas);
        const card=canvas.closest('.chart-card,.tab-wrap')||canvas.closest('.tbl-section,section')||canvas.parentElement;
        showMenu(e.clientX,e.clientY,[
          {icon:IC_FILE,label:'Exportar Excel',action:()=>baixarGrafico(ch, nome)},
          {icon:IC_IMG, label:'Exportar imagem (PNG)',action:()=>capturaImagem(card, nome, ch)},
          {icon:IC_IMG, label:'PNG fundo transparente',action:()=>capturaImagem(card, nome, ch, true)}
        ]);
        return;
      }
    }
    // 3) card / bloco (sem tabela nem gráfico) → Excel (se for card) + Imagem
    const bloco=blocoImagem(e.target);
    if(bloco){
      e.preventDefault();
      const t=bloco.querySelector('.chart-title,.tbl-title,.sec-title,.card-label,.kpi-lbl,h2,h3');
      const nome=(t&&t.textContent.trim())||'card';
      const items=[];
      const impEl=findImpactoEl(e.target);
      if(impEl) items.push({icon:IC_FILE,label:'Exportar base + Impacto (Excel)',action:()=>baixarImpacto(impEl.$exportImpacto,'Impacto')});
      const cards=cardsDe(e.target);
      const cardsOk=cards&&cards.some(c=>c.querySelector(LBL_SEL)&&c.querySelector(VAL_SEL));
      if(cardsOk) items.push({icon:IC_FILE,label:'Exportar Excel (cards)',action:()=>baixarCards(cards, 'Cards')});
      items.push({icon:IC_IMG,label:'Exportar imagem (PNG)',action:()=>capturaImagem(bloco, nome)});
      items.push({icon:IC_IMG,label:'PNG fundo transparente',action:()=>capturaImagem(bloco, nome, undefined, true)});
      showMenu(e.clientX,e.clientY,items);
      return;
    }
    // fora disso: menu nativo do navegador
  });
})();
