// ============================================================
// Gantt view — barra por ação numa linha do tempo mensal.
// Usado pelo Planner Corporativo e pelos FCAs (preenchimento/consolidado).
//
// window.GanttView.html(items) → HTML pronto p/ innerHTML.
//   item: { id, label, tag, resp, status, start, end }
//     · start = criação (created_at) · end = prazo (pode faltar)
//     · status: Não iniciada / Em andamento / Concluída / Cancelada
//
// Comportamento:
//   · escala mensal do 1º mês com dado até o mês do maior prazo (mín. hoje);
//   · barra colorida pelo status (mesmas cores do Kanban);
//   · atrasada (ativa com prazo < hoje): rastro vermelho do prazo até hoje;
//   · sem prazo: barra tracejada da criação até hoje;
//   · linha "hoje" vertical; clique na linha → o painel abre seu modal
//     (delegação via .gv-row[data-id], cada painel liga o seu handler).
// ============================================================
(function(global){
  'use strict';

  const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const day=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x;};
  function parseD(v){
    if(!v) return null;
    if(v instanceof Date) return isNaN(v)?null:day(v);
    const s=String(v).slice(0,10);
    const d=new Date(s+'T00:00:00');
    return isNaN(d)?null:d;
  }
  const stKey=s=>{
    s=String(s||'').toLowerCase();
    if(s.includes('conclu'))return 'con';
    if(s.includes('andamento'))return 'and';
    if(s.includes('cancel'))return 'can';
    return 'nao';
  };
  const ST_ORD={and:0,nao:1,con:2,can:3};

  // CSS injetado uma vez (cores pelas CSS vars dos painéis; fallbacks fixos)
  const CSS=`
  .gv-wrap{background:rgba(20,27,38,.55);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px 0 6px;backdrop-filter:blur(16px);box-shadow:0 2px 12px rgba(0,0,0,.25);}
  body.light-mode .gv-wrap{background:rgba(128,128,128,.14);border:none;box-shadow:none;}
  .gv-scroll{overflow-x:auto;padding:0 12px;}
  .gv-inner{min-width:760px;}
  .gv-grid{display:grid;grid-template-columns:250px 1fr;}
  .gv-head-label{font-size:10px;font-weight:700;color:var(--text2,#94A3B8);text-transform:uppercase;letter-spacing:.5px;padding:6px 10px 10px;border-bottom:1px solid rgba(148,163,184,.25);}
  .gv-months{position:relative;display:flex;border-bottom:1px solid rgba(148,163,184,.25);}
  .gv-month{font-size:10px;font-weight:700;color:var(--text2,#94A3B8);text-transform:uppercase;letter-spacing:.5px;padding:6px 0 10px;text-align:center;border-left:1px solid rgba(148,163,184,.12);}
  .gv-row-label{font-size:11.5px;color:var(--text,#F1F5F9);padding:8px 10px;border-bottom:1px solid rgba(148,163,184,.10);display:flex;flex-direction:column;justify-content:center;gap:3px;line-height:1.25;min-height:40px;cursor:pointer;}
  .gv-row-label b{font-weight:700;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  .gv-row-sub{font-size:9.5px;color:var(--text3,#64748B);}
  .gv-tag{display:inline-block;background:rgba(249,115,22,.15);color:var(--orange,#F97316);border:1px solid rgba(249,115,22,.3);font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;padding:0 6px;border-radius:4px;margin-right:5px;vertical-align:1px;}
  body.light-mode .gv-tag{color:#1a1a1a;background:#F97316;border-color:#F97316;}   /* laranja padrão CHEIO no claro */
  .gv-row-bars{position:relative;border-bottom:1px solid rgba(148,163,184,.10);border-left:1px solid rgba(148,163,184,.12);cursor:pointer;min-height:40px;}
  .gv-row:hover .gv-row-label,.gv-row:hover .gv-row-bars{background:rgba(255,255,255,.04);}
  body.light-mode .gv-row:hover .gv-row-label,body.light-mode .gv-row:hover .gv-row-bars{background:rgba(0,0,0,.04);}
  .gv-bar{position:absolute;top:50%;transform:translateY(-50%);height:14px;border-radius:7px;min-width:8px;}
  .gv-bar.nao{background:var(--red,#FF6666);}
  .gv-bar.and{background:var(--amber,#F4A100);}
  .gv-bar.con{background:var(--green,#3BB33B);}
  .gv-bar.can{background:#64748B;}
  .gv-bar.semprazo{background:transparent;border:2px dashed var(--text3,#64748B);}
  .gv-late{position:absolute;top:50%;transform:translateY(-50%);height:4px;background:repeating-linear-gradient(90deg,var(--red,#FF6666) 0 6px,transparent 6px 10px);}
  .gv-prazo{font-size:9px;font-weight:800;position:absolute;top:50%;transform:translateY(-50%);color:var(--text2,#94A3B8);white-space:nowrap;padding-left:6px;}
  .gv-today{position:absolute;top:0;bottom:0;width:0;border-left:2px dashed var(--orange,#F97316);opacity:.6;z-index:2;pointer-events:none;}
  .gv-today-lbl{position:absolute;top:-2px;transform:translateX(-50%);font-size:8px;font-weight:800;color:var(--orange,#F97316);text-transform:uppercase;letter-spacing:.5px;background:inherit;}
  body.light-mode .gv-row-label{color:#1a1a1a;}
  body.light-mode .gv-head-label,body.light-mode .gv-month,body.light-mode .gv-prazo{color:#444;}
  body.light-mode .gv-row-sub{color:#666;}
  body.light-mode .gv-bar.semprazo{border-color:#999;}
  .gv-legend{display:flex;flex-wrap:wrap;gap:14px;padding:10px 14px 6px;font-size:10px;color:var(--text2,#94A3B8);}
  .gv-legend i{display:inline-block;width:16px;height:8px;border-radius:4px;margin-right:5px;vertical-align:-1px;}
  .gv-empty{text-align:center;color:var(--text3,#64748B);padding:40px 0;font-size:13px;}
  @media(max-width:768px){.gv-grid{grid-template-columns:150px 1fr;}.gv-row-label{font-size:10.5px;padding:6px 8px;}.gv-inner{min-width:640px;}}
  `;
  function injectCSS(){
    if(document.getElementById('gv-style'))return;
    const st=document.createElement('style');
    st.id='gv-style';
    st.textContent=CSS;
    document.head.appendChild(st);
  }

  function html(items){
    injectCSS();
    const hoje=day(new Date());
    const rows=(items||[]).map(it=>{
      const start=parseD(it.start)||hoje;
      const end=parseD(it.end);
      return {...it,_start:start,_end:end,_st:stKey(it.status)};
    });
    if(!rows.length) return '<div class="gv-wrap"><div class="gv-empty">Nenhuma ação com os filtros selecionados</div></div>';

    // ordena: em andamento → não iniciadas (por prazo; sem prazo ao fim) → concluídas → canceladas
    rows.sort((a,b)=>(ST_ORD[a._st]-ST_ORD[b._st])
      ||((a._end?a._end.getTime():Infinity)-(b._end?b._end.getTime():Infinity))
      ||(a._start-b._start));

    // range mensal: 1º dia do menor start até o fim do mês do maior end (mín. hoje)
    let min=rows[0]._start, max=hoje;
    rows.forEach(r=>{ if(r._start<min)min=r._start; const e=r._end||hoje; if(e>max)max=e; });
    const m0=new Date(min.getFullYear(),min.getMonth(),1);
    const m1=new Date(max.getFullYear(),max.getMonth()+1,1);   // exclusivo
    const total=m1-m0;
    const pos=d=>Math.max(0,Math.min(100,(d-m0)/total*100));

    const months=[];
    for(let d=new Date(m0);d<m1;d.setMonth(d.getMonth()+1))
      months.push({lbl:MES[d.getMonth()]+'/'+String(d.getFullYear()).slice(2),
        w:(new Date(d.getFullYear(),d.getMonth()+1,1)-d)/total*100});

    const nMeses=months.length;
    const minW=Math.max(760,250+nMeses*80);
    const todayPct=pos(hoje);
    const todayLine=`<div class="gv-today" style="left:${todayPct}%"></div>`;

    const body=rows.map(r=>{
      const tag=r.tag?`<span class="gv-tag">${esc(r.tag)}</span>`:'';
      const sub=[r.resp,r._end?('prazo '+r._end.toLocaleDateString('pt-BR')):'sem prazo'].filter(Boolean).join(' · ');
      let bars;
      if(!r._end){
        const a=pos(r._start),b=Math.max(pos(hoje),a+1);
        bars=`<div class="gv-bar semprazo" style="left:${a}%;width:${(b-a)}%"></div>`;
      }else{
        const fim=r._end<r._start?r._start:r._end;
        const a=pos(r._start),b=Math.max(pos(fim),a+0.6);
        bars=`<div class="gv-bar ${r._st}" style="left:${a}%;width:${(b-a)}%"></div>`;
        const ativa=r._st==='nao'||r._st==='and';
        if(ativa&&fim<hoje){                             // atrasada: rastro do prazo até hoje
          bars+=`<div class="gv-late" style="left:${b}%;width:${Math.max(pos(hoje)-b,0.4)}%"></div>`;
        }
        bars+=`<div class="gv-prazo" style="left:${Math.max(b,ativa&&fim<hoje?pos(hoje):b)}%">${fim.toLocaleDateString('pt-BR').slice(0,5)}</div>`;
      }
      return `<div class="gv-row gv-grid" data-id="${esc(r.id)}">
        <div class="gv-row-label"><b>${tag}${esc(r.label)||'(sem descrição)'}</b>${sub?`<span class="gv-row-sub">${esc(sub)}</span>`:''}</div>
        <div class="gv-row-bars">${todayLine}${bars}</div>
      </div>`;
    }).join('');

    return `<div class="gv-wrap"><div class="gv-scroll"><div class="gv-inner" style="min-width:${minW}px">
      <div class="gv-grid">
        <div class="gv-head-label">Ação</div>
        <div class="gv-months">${months.map(m=>`<div class="gv-month" style="width:${m.w}%">${m.lbl}</div>`).join('')}<div class="gv-today" style="left:${todayPct}%"><span class="gv-today-lbl">hoje</span></div></div>
      </div>
      ${body}
    </div></div>
    <div class="gv-legend">
      <span><i style="background:var(--red,#FF6666)"></i>Não iniciada</span>
      <span><i style="background:var(--amber,#F4A100)"></i>Em andamento</span>
      <span><i style="background:var(--green,#3BB33B)"></i>Concluída</span>
      <span><i style="background:#64748B"></i>Cancelada</span>
      <span><i style="background:repeating-linear-gradient(90deg,var(--red,#FF6666) 0 6px,transparent 6px 10px);border-radius:0"></i>Atraso (do prazo até hoje)</span>
      <span><i style="background:transparent;border:2px dashed var(--text3,#64748B)"></i>Sem prazo</span>
    </div></div>`;
  }

  global.GanttView={html};
})(window);
