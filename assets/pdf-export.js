/* ============================================================
   Exportador de PDF — relatório em slides 16:9 (estilo PowerPoint)
   Compartilhado por todos os painéis. Uso no painel:
     <script src="../assets/pdf-export.js"></script>   (ajuste o ../ conforme a profundidade)
     <script> initPdfExport(); </script>               (após o restante carregar)
   Opções (todas opcionais):
     initPdfExport({ title, subtitle, main, fileBase })
   - title:    título do relatório (default: .brand h1 ou document.title)
   - subtitle: subtítulo (default: .brand p)
   - main:     seletor do container (default: 'main')
   - fileBase: base do nome do arquivo (default: slug do título)
   ============================================================ */
(function(){
  // ---------- CSS ----------
  const CSS = `
.pdf-wrap{position:relative;}
.pdf-btn{display:flex;align-items:center;gap:5px;background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.3);border-radius:4px;padding:5px 9px;cursor:pointer;color:var(--orange,#F97316);font-family:'Montserrat',sans-serif;font-size:11px;font-weight:800;letter-spacing:.5px;}
.pdf-btn:hover{background:rgba(249,115,22,.32);}
.pdf-btn:disabled{opacity:.55;cursor:default;}
.pdf-menu{display:none;position:absolute;top:calc(100% + 4px);right:0;z-index:600;flex-direction:column;background:#0f1824;border:1px solid #2a3a50;border-radius:6px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.7);min-width:118px;}
.pdf-menu.open{display:flex;}
.pdf-menu button{background:none;border:none;color:var(--text,#F1F5F9);font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;text-align:left;padding:8px 12px;cursor:pointer;}
.pdf-menu button:hover{background:rgba(249,115,22,.18);color:var(--orange,#F97316);}
#pdf-overlay{position:fixed;inset:0;z-index:9999;background:rgba(8,11,16,.82);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;}
#pdf-overlay .pdf-ov-box{display:flex;flex-direction:column;align-items:center;gap:14px;color:#F1F5F9;font-family:'Montserrat',sans-serif;font-size:14px;font-weight:700;letter-spacing:.5px;}
#pdf-overlay .pdf-ov-spin{width:34px;height:34px;border:3px solid rgba(249,115,22,.25);border-top-color:#F97316;border-radius:50%;animation:pdfspin .8s linear infinite;}
@keyframes pdfspin{to{transform:rotate(360deg);}}
#pdf-report-head{display:none;}
body.exporting #pdf-report-head{display:block;background:#FFFFFF;color:#111;padding:0 0 14px;margin-bottom:14px;border-bottom:2px solid #F97316;font-family:'Montserrat',sans-serif;}
body.exporting:not(.light-mode) #pdf-report-head{background:#0C1017;color:#F1F5F9;}
#pdf-report-head .rh-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
#pdf-report-head .rh-title{font-size:22px;font-weight:800;color:#0C1017;letter-spacing:.3px;}
#pdf-report-head .rh-sub{font-size:11px;color:#555;margin-top:2px;font-weight:600;}
#pdf-report-head .rh-meta{font-size:10px;color:#555;text-align:right;font-weight:600;line-height:1.5;}
#pdf-report-head .rh-filtros{margin-top:10px;font-size:10.5px;color:#222;line-height:1.6;}
#pdf-report-head .rh-filtros b{color:#F97316;}
body.exporting:not(.light-mode) #pdf-report-head .rh-title{color:#FFFFFF;}
body.exporting:not(.light-mode) #pdf-report-head .rh-sub,body.exporting:not(.light-mode) #pdf-report-head .rh-meta{color:#94A3B8;}
body.exporting:not(.light-mode) #pdf-report-head .rh-filtros{color:#CBD5E1;}
@media print{ .pdf-wrap{display:none;} }
`;

  let CFG = {};

  window.initPdfExport = function(cfg){
    CFG = cfg || {};
    const st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);

    // botão + menu no header-right (ou container informado)
    const cont = document.querySelector(CFG.btnContainer || '.header-right');
    if(cont){
      const wrap=document.createElement('div'); wrap.className='pdf-wrap';
      wrap.innerHTML =
        '<button class="pdf-btn" id="pdfBtn" title="Exportar relatório PDF (estado filtrado)">'+
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>'+
        '<span>PDF</span></button>'+
        '<div class="pdf-menu" id="pdfMenu"><button data-mode="light">☀ Claro</button><button data-mode="dark">🌙 Escuro</button></div>';
      cont.insertBefore(wrap, cont.firstChild);
      document.getElementById('pdfBtn').addEventListener('click',e=>{e.stopPropagation();document.getElementById('pdfMenu').classList.toggle('open');});
      wrap.querySelectorAll('.pdf-menu button').forEach(b=>b.addEventListener('click',()=>exportar(b.dataset.mode)));
      document.addEventListener('click',e=>{ if(!e.target.closest('.pdf-wrap')){const m=document.getElementById('pdfMenu'); if(m)m.classList.remove('open');} });
    }

    // cabeçalho do relatório no topo do main
    const main=getMain();
    if(main && !document.getElementById('pdf-report-head')){
      const title = CFG.title || (document.querySelector('.brand h1')||{}).textContent || document.title;
      const sub   = CFG.subtitle!=null ? CFG.subtitle : ((document.querySelector('.brand p')||{}).textContent || '');
      const head=document.createElement('div'); head.id='pdf-report-head';
      head.innerHTML =
        '<div class="rh-top"><div><div class="rh-title">'+esc(title)+'</div>'+
        (sub?'<div class="rh-sub">'+esc(sub)+'</div>':'')+'</div><div class="rh-meta" id="rh-meta"></div></div>'+
        '<div class="rh-filtros" id="rh-filtros"></div>';
      main.insertBefore(head, main.firstChild);
    }
  };

  function getMain(){ return (CFG.main&&document.querySelector(CFG.main)) || document.querySelector('main') || document.querySelector('.main'); }
  function esc(s){return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
  function slug(s){return String(s||'relatorio').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'');}

  function filtrosResumo(){
    const wraps=[...document.querySelectorAll('.ms-wrap')];
    if(!wraps.length) return '';
    const parts=wraps.map(w=>{
      let lbl='';
      const prev=w.previousElementSibling;
      if(prev && prev.classList.contains('filter-label')) lbl=prev.textContent.trim();
      else { const b=w.querySelector('.ms-btn'); lbl=(b?b.childNodes[0].textContent:w.id).trim(); }
      const sel=(w._sel && w._sel.size)?[...w._sel] : null;
      return '<b>'+esc(lbl)+':</b> '+ (sel? esc(sel.join(', ')) : 'Todos');
    });
    return 'Filtros aplicados &nbsp; '+parts.join(' &nbsp;·&nbsp; ');
  }

  async function exportar(mode){
    const mn=document.getElementById('pdfMenu'); if(mn)mn.classList.remove('open');
    if(typeof html2canvas==='undefined' || !window.jspdf){ alert('Biblioteca de PDF ainda carregando — tente de novo em instantes.'); return; }
    const claro = mode!=='dark';
    const btn=document.getElementById('pdfBtn');
    const main=getMain();
    const head=document.getElementById('pdf-report-head');
    if(head){
      const fr=document.getElementById('rh-filtros'); if(fr) fr.innerHTML=filtrosResumo();
      const now=new Date(), rm=document.getElementById('rh-meta');
      if(rm) rm.innerHTML='Gerado em '+now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'<br>Gestão em Movimento · BI Frota';
    }
    const temaOrig=document.body.classList.contains('light-mode')?'light':'dark';
    const temaAlvo=claro?'light':'dark';
    if(temaOrig!==temaAlvo && typeof window.applyTheme==='function') window.applyTheme(temaAlvo);
    document.body.classList.add('exporting');
    if(btn){ btn.disabled=true; const s=btn.querySelector('span'); if(s)s.textContent='Gerando…'; }
    const ov=document.createElement('div'); ov.id='pdf-overlay';
    ov.innerHTML='<div class="pdf-ov-box"><div class="pdf-ov-spin"></div>Gerando PDF…</div>';
    document.body.appendChild(ov);
    window.scrollTo(0,0);
    await new Promise(r=>setTimeout(r,500));
    try{
      const { jsPDF }=window.jspdf;
      const PW=338.67, PH=190.5, m=9, uw=PW-2*m, uh=PH-2*m, gap=6;   // 16:9 widescreen (PowerPoint)
      const bg=claro?'#FFFFFF':'#0C1017', RGB=claro?[255,255,255]:[12,16,23];
      const baseOpts={scale:2,backgroundColor:bg,useCORS:true,logging:false,ignoreElements:el=>el.id==='pdf-overlay'};
      const kids=[...main.children].filter(e=>e.id!=='pdf-report-head' && !e.classList.contains('divider') && e.offsetHeight>2 && getComputedStyle(e).display!=='none');
      const tbls=kids.filter(e=>e.classList.contains('tbl-section'));
      const nonT=kids.filter(e=>!e.classList.contains('tbl-section'));
      // captura: blocos comuns AO VIVO (gráficos lado a lado sem cortar); tabelas mais largas p/ preencher
      const topoEls=[head, ...nonT].filter(Boolean);
      const topoItems=[];
      for(const el of topoEls){ const c=await html2canvas(el,baseOpts); topoItems.push({url:c.toDataURL('image/jpeg',0.95), nat:c.height*uw/c.width}); }
      const tblItems=[];
      for(const el of tbls){ const c=await html2canvas(el,Object.assign({},baseOpts,{windowWidth:1560})); tblItems.push({url:c.toDataURL('image/jpeg',0.95), nat:c.height*uw/c.width}); }
      // monta slides: empacota blocos do topo (cabe ~1.3 slide e escala p/ caber); cada tabela um slide
      const slides=[]; let grp=[], sum=0;
      for(const it of topoItems){ if(grp.length && (sum+gap+it.nat)>1.3*uh){ slides.push(grp); grp=[]; sum=0; } if(grp.length) sum+=gap; sum+=it.nat; grp.push(it); }
      if(grp.length) slides.push(grp);
      for(const it of tblItems) slides.push([it]);
      let pdf=null;
      for(const slide of slides){
        const natTotal=slide.reduce((a,im)=>a+im.nat,0)+gap*(slide.length-1);
        const sf=Math.min(1, uh/natTotal);
        const drawW=uw*sf, x=m+(uw-drawW)/2, g=gap*sf;
        const grpH=slide.reduce((a,im)=>a+im.nat*sf,0)+g*(slide.length-1);
        let y=m+(uh-grpH)/2;
        if(!pdf) pdf=new jsPDF({unit:'mm',orientation:'landscape',format:[PW,PH]});
        else pdf.addPage([PW,PH],'landscape');
        pdf.setFillColor(RGB[0],RGB[1],RGB[2]); pdf.rect(0,0,PW,PH,'F');
        pdf.setFillColor(249,115,22); pdf.rect(PW*0.62,0,PW*0.38,6.5,'F');   // faixa laranja padrão
        for(const im of slide){ const h=im.nat*sf; pdf.addImage(im.url,'JPEG',x,y,drawW,h); y+=h+g; }
      }
      const fb=CFG.fileBase || slug((document.querySelector('.brand h1')||{}).textContent || document.title);
      pdf.save(fb+'_'+(claro?'claro':'escuro')+'_'+new Date().toISOString().slice(0,10)+'.pdf');
    }catch(e){ console.error(e); alert('Erro ao gerar PDF: '+(e&&e.message||e)); }
    finally{
      ov.remove();
      document.body.classList.remove('exporting');
      if(btn){ btn.disabled=false; const s=btn.querySelector('span'); if(s)s.textContent='PDF'; }
      if(temaOrig!==temaAlvo && typeof window.applyTheme==='function') window.applyTheme(temaOrig);
    }
  }
  window.exportarPDF = exportar;   // permite chamada externa
})();
