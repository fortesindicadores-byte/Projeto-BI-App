// ============================================================
// Sortable tables — clique no cabeçalho para ordenar por qualquer coluna.
// Roda automaticamente em TODAS as <table> da página (exceto as que já
// têm sort próprio — th com onclick ou class="sortable" — ou que tenham
// o atributo data-no-sort na <table>).
//
// Sobrevive a re-render: cada painel troca thead/tbody via innerHTML ao
// atualizar dados/filtros/toggles — um MutationObserver por tabela
// reconecta os cabeçalhos e reaplica a ordenação ativa automaticamente.
// ============================================================
(function(){
  'use strict';

  const MESES = {jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};

  function normTxt(s){
    return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  }

  // devolve {type:'num'|'date'|'str', value} ou {type:'str', value:null} p/ vazio
  function parseKey(raw){
    let s = String(raw==null?'':raw).trim();
    if(!s || s==='—' || s==='-' || s==='–' || /^sem dados$/i.test(s)) return {type:'str', value:null};

    // data dd/mm/yyyy ou dd/mm/yy
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(m){
      let y = +m[3]; if(y < 100) y += 2000;
      const d = new Date(y, +m[2]-1, +m[1]);
      if(!isNaN(d)) return {type:'date', value:d.getTime()};
    }
    // mês/ano tipo "jun/26", "Jun/2026"
    m = s.match(/^([a-zçã]{3})[a-zçã]*\/(\d{2,4})$/i);
    if(m && MESES[normTxt(m[1]).slice(0,3)]!=null){
      let y = +m[2]; if(y < 100) y += 2000;
      return {type:'date', value:new Date(y, MESES[normTxt(m[1]).slice(0,3)], 1).getTime()};
    }
    // mm/yyyy
    m = s.match(/^(\d{1,2})\/(\d{4})$/);
    if(m) return {type:'date', value:new Date(+m[2], +m[1]-1, 1).getTime()};

    // número (aceita R$, %, pp, anos/dias, ▲▼, parênteses p/ negativo)
    let t = s.replace(/^[▲▼\s]+/,'').replace(/^R\$\s*/i,'').trim();
    t = t.replace(/\s*(pp|anos?|dias?|km\/l|km|l|%)\s*$/i,'').trim();
    const neg = /^-/.test(t) || /^\(.*\)$/.test(t);
    t = t.replace(/^[-+]/,'').replace(/^\(|\)$/g,'').trim();
    let num = null;
    if(/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) num = parseFloat(t.replace(/\./g,'').replace(',','.'));
    else if(/^\d+,\d+$/.test(t)) num = parseFloat(t.replace(',','.'));
    else if(/^\d{1,3}(\.\d{3})+$/.test(t)) num = parseFloat(t.replace(/\./g,''));
    else if(/^\d+\.\d{1,2}$/.test(t)) num = parseFloat(t);
    else if(/^\d+$/.test(t)) num = parseFloat(t);
    if(num!=null && isFinite(num)) return {type:'num', value: neg ? -num : num};

    return {type:'str', value: normTxt(s)};
  }

  function compareForSort(a,b,dir){
    const aNull = a.value==null, bNull = b.value==null;
    if(aNull && bNull) return 0;
    if(aNull) return 1;    // vazio sempre por último, nas duas direções
    if(bNull) return -1;
    let c;
    if(a.type==='num' && b.type==='num') c = a.value - b.value;
    else if(a.type==='date' && b.type==='date') c = a.value - b.value;
    else c = String(a.value).localeCompare(String(b.value), 'pt-BR', {sensitivity:'base', numeric:true});
    return c * dir;
  }

  function headerColIndex(th){
    let idx = 0, sib = th.previousElementSibling;
    while(sib){ idx += parseInt(sib.getAttribute('colspan')||'1',10); sib = sib.previousElementSibling; }
    return idx;
  }

  // linha de cabeçalho "de verdade": última <tr> do <thead>, ou — se não
  // houver <thead> — a 1ª linha do corpo, caso ela só tenha <th>.
  function getHeaderRow(table){
    if(table.tHead){
      const trs = table.tHead.rows;
      return trs.length ? trs[trs.length-1] : null;
    }
    const tbody = table.tBodies[0];
    if(tbody && tbody.rows.length){
      const first = tbody.rows[0];
      if(first.querySelector('th') && !first.querySelector('td')) return first;
    }
    return null;
  }

  function isExcludedRow(tr){
    if(/\btotal\b|\bsubtotal\b/i.test(tr.className)) return true;
    const cells = tr.children;
    if(cells.length===1 && cells[0].hasAttribute('colspan')) return true; // placeholder "Sem dados"
    return false;
  }

  function applySort(table, colIdx, dir){
    const tbody = table.tBodies[table.tBodies.length-1];
    if(!tbody) return;
    const headerRow = getHeaderRow(table);
    const allRows = Array.from(tbody.rows);
    const skip = new Set();
    allRows.forEach(r=>{ if(r===headerRow || isExcludedRow(r)) skip.add(r); });
    const totalRows = allRows.filter(r=>skip.has(r) && r!==headerRow && /\btotal\b|\bsubtotal\b/i.test(r.className));
    const placeholderRows = allRows.filter(r=>skip.has(r) && r!==headerRow && !/\btotal\b|\bsubtotal\b/i.test(r.className));
    const dataRows = allRows.filter(r=>!skip.has(r));

    // data-sort na célula manda no lugar do texto: serve para colunas cujo
    // rótulo não ordena sozinho — "Vencida · 12d" (ordena por dias de atraso)
    // ou um chip de etapa (ordena pelo fluxo, não pelo alfabeto).
    const withKey = dataRows.map(r=>{
      const cell = r.children[colIdx];
      const raw = cell ? (cell.dataset && cell.dataset.sort!=null ? cell.dataset.sort : cell.textContent) : '';
      return {r, key: parseKey(raw)};
    });
    withKey.sort((a,b)=>compareForSort(a.key,b.key,dir));

    table.__stSorting = true;
    const frag = document.createDocumentFragment();
    withKey.forEach(x=>frag.appendChild(x.r));
    placeholderRows.forEach(r=>frag.appendChild(r));
    totalRows.forEach(r=>frag.appendChild(r));
    tbody.appendChild(frag);
    queueMicrotask(()=>{ table.__stSorting = false; });
  }

  function clearActive(headerRow, exceptTh){
    Array.from(headerRow.children).forEach(c=>{
      if(c!==exceptTh) c.classList.remove('st-active','st-asc','st-desc');
    });
  }

  function onHeaderClick(table, th){
    const headerRow = th.parentElement;
    const wasAsc = th.classList.contains('st-active') && th.classList.contains('st-asc');
    const dir = wasAsc ? -1 : 1;
    clearActive(headerRow, th);
    th.classList.add('st-active');
    th.classList.toggle('st-asc', dir===1);
    th.classList.toggle('st-desc', dir===-1);
    const colIdx = headerColIndex(th);
    table.__stActive = {colIdx, dir, text: th.textContent.trim()};
    applySort(table, colIdx, dir);
  }

  function wireHeader(table, th){
    if(th.dataset.stWired) return;
    if(th.hasAttribute('onclick') || th.classList.contains('sortable')) return; // já tem sort próprio
    if(parseInt(th.getAttribute('colspan')||'1',10) > 1) return; // não mapeia 1:1 pra uma coluna
    if(!th.textContent.trim()) return; // coluna de ação/ícone sem rótulo
    th.dataset.stWired = '1';
    th.classList.add('st-th');
    th.addEventListener('click', ()=>onHeaderClick(table, th));
  }

  function initTable(table){
    if(table.dataset.noSort!=null) return;
    const headerRow = getHeaderRow(table);
    if(!headerRow) return;
    table.classList.add('st-enabled');
    Array.from(headerRow.children).forEach(th=>{
      if(th.tagName==='TH') wireHeader(table, th);
    });
    if(!table.__stObserved){
      table.__stObserved = true;
      const obs = new MutationObserver(()=>{
        if(table.__stSorting) return;
        const hr = getHeaderRow(table);
        if(hr) Array.from(hr.children).forEach(th=>{ if(th.tagName==='TH') wireHeader(table, th); });
        if(table.__stActive){
          const hr2 = getHeaderRow(table);
          const cells = hr2 ? Array.from(hr2.children).filter(c=>c.tagName==='TH') : [];
          let target = cells[table.__stActive.colIdx];
          if(!target || target.textContent.trim()!==table.__stActive.text){
            target = cells.find(c=>c.textContent.trim()===table.__stActive.text);
          }
          if(target){
            clearActive(hr2, target);
            target.classList.add('st-active', table.__stActive.dir===1?'st-asc':'st-desc');
            applySort(table, headerColIndex(target), table.__stActive.dir);
          } else {
            table.__stActive = null;
          }
        }
      });
      obs.observe(table, {childList:true, subtree:true});
    }
  }

  function scan(root){
    (root||document).querySelectorAll('table').forEach(initTable);
  }

  const style = document.createElement('style');
  style.textContent = `
    .st-th{cursor:pointer;user-select:none;}
    .st-th::after{content:'';font-size:.82em;opacity:0;transition:opacity .12s;}
    .st-th:hover::after{content:'↕';margin-left:5px;opacity:.45;}
    .st-th.st-active::after{margin-left:5px;opacity:1;color:#F97316;}
    .st-th.st-active.st-asc::after{content:'▲';}
    .st-th.st-active.st-desc::after{content:'▼';}
  `;
  document.head.appendChild(style);

  function boot(){
    scan(document);
    const bodyObs = new MutationObserver(muts=>{
      for(const m of muts){
        m.addedNodes.forEach(n=>{
          if(n.nodeType!==1) return;
          if(n.tagName==='TABLE') initTable(n);
          else if(n.querySelectorAll) n.querySelectorAll('table').forEach(initTable);
        });
      }
    });
    bodyObs.observe(document.body, {childList:true, subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SortableTables = { scan };
})();
