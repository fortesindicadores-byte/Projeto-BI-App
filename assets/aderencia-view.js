/* ============================================================
   ADERÊNCIA — visão compartilhada (hero + KPIs + 2 gráficos + tabela)
   ------------------------------------------------------------
   É o Resumo do FCA Gerencial embalado para rodar em qualquer painel:
   Planner (por Assunto/Pessoa), FCA da unidade (por Conta/Indicador) e
   FCA Admin (por Unidade/Projeto/Conta). Um lugar só para a regra da
   métrica, as faixas de cor e o desenho da barra — se mudar aqui, muda
   nos três, que era justamente o pedido ("tudo igual ao Planner").

   USO
     container.innerHTML = AderenciaView.html({dims:[{k:'unidade',rot:'Unidade'},…]});
     AderenciaView.render(container, {linhas, dim, aoTrocarDim});

   CADA LINHA (o painel normaliza antes de entregar)
     {
       vig:   'jul/26',              // rótulo do mês (o que aparece no eixo)
       ord:   202606,               // chave de ordenação (ano*100+mês)
       concl: 'Concluída' | 'Andamento' | 'Não Iniciada',
       venc:  true|false,            // fora do prazo
       dims:  {unidade:'CGR', projeto:'ROTA', conta:'Combustíveis'}
     }

   Precisa do Chart.js 4 na página (mesmo CDN do FCA Gerencial).
   ============================================================ */
(function (global) {
  'use strict';

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ── faixas de cor: lidas do CSS, para o claro poder usar os tons fortes ──
  function band(p) {
    const cs = getComputedStyle(document.body), v = n => cs.getPropertyValue(n).trim();
    if (p == null) return v('--band-gray') || '#555555';
    if (p < 70)    return v('--band-red')  || '#FF5252';
    if (p < 85)    return v('--band-amber')|| '#F4A100';
    return           v('--band-green')|| '#3BB33B';
  }
  function bandRgba(p, a) {
    const c = band(p);
    if (c[0] !== '#' || c.length < 7) return c;
    return `rgba(${parseInt(c.slice(1,3),16)},${parseInt(c.slice(3,5),16)},${parseInt(c.slice(5,7),16)},${a})`;
  }
  const pct = v => v == null ? '—' : Math.round(v) + '%';

  // ── métrica: a mesma conta do FCA Gerencial ──
  // total = (concluídas*100 + em andamento*50) / total de ações
  function metrics(rows) {
    const tt = rows.length;
    let noP = 0, venc = 0, concl = 0, andam = 0, nini = 0;
    rows.forEach(o => {
      o.venc ? venc++ : noP++;
      if (o.concl === 'Concluída') concl++;
      else if (o.concl === 'Andamento') andam++;
      else nini++;
    });
    return {
      tt, noP, venc, concl, andam, nini,
      pPrazo: tt ? noP / tt * 100 : null,
      pConcl: tt ? concl / tt * 100 : null,
      total:  tt ? (concl * 100 + andam * 50) / tt : null,
    };
  }

  // ── meses do eixo: do 1º ao último com dado, sem buraco no meio ──
  function meses(linhas) {
    const m = new Map();
    linhas.forEach(o => { if (o.ord) m.set(o.ord, o.vig); });
    if (!m.size) return [];
    const ords = [...m.keys()].sort((a, b) => a - b);
    const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    const saida = [];
    for (let o = ords[0]; o <= ords[ords.length - 1]; o = (o % 100 === 11) ? (Math.floor(o/100)+1)*100 : o + 1) {
      saida.push({ ord: o, lbl: m.get(o) || (MES[o % 100] + '/' + String(Math.floor(o/100)).slice(2)) });
    }
    return saida;
  }

  // rótulo em cima da barra — igual ao do FCA Gerencial
  const barLabels = {
    id: 'aderencia-bar-labels',
    afterDatasetsDraw(c) {
      const ds = c.data.datasets[0], m = c.getDatasetMeta(0), ctx = c.ctx;
      ctx.save();
      ctx.font = '700 11px Montserrat';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = document.body.classList.contains('light-mode') || document.body.classList.contains('claro')
        ? '#1a1a1a' : '#F1F5F9';
      m.data.forEach((b, i) => {
        const v = ds.data[i];
        if (v == null) return;
        if (ds._on && !ds._on[i]) return;   // mês fora do filtro: barra apagada, sem rótulo
        ctx.fillText(Math.round(v) + '%', b.x, b.y - 4);
      });
      ctx.restore();
    },
  };

  const _charts = {};   // canvasId -> instância, para destruir antes de redesenhar

  // `foco` = quais meses estão selecionados no filtro de vigência. Os demais
  // continuam aparecendo, só que apagados — mesma leitura do Painel KM e da
  // Visão Financeira: o mês escolhido salta, o resto vira contexto.
  function grafico(canvasId, labels, data, foco) {
    const cv = document.getElementById(canvasId);
    if (!cv || typeof Chart === 'undefined') return;
    const claro = document.body.classList.contains('light-mode') || document.body.classList.contains('claro');
    const temFoco = !!(foco && foco.some(f => !f) && foco.some(f => f));
    const aceso = i => !temFoco || foco[i];
    const bg = data.map((v, i) => v == null ? 'transparent' : bandRgba(v, temFoco ? (aceso(i) ? .85 : .18) : .65));
    const bc = data.map((v, i) => v == null ? 'transparent' : (temFoco && !aceso(i) ? bandRgba(v, .30) : band(v)));
    const grid = { color: claro ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.06)' };
    const tick = { color: claro ? '#444' : '#94A3B8', font: { family: 'Montserrat', size: 11 } };
    // eixo Y adaptável em múltiplos de 10 — não fica travado em 0..100
    const vals = data.filter(v => v != null);
    const dMin = vals.length ? Math.min(...vals) : 0, dMax = vals.length ? Math.max(...vals) : 100;
    const yMin = Math.max(0, Math.floor((dMin - 8) / 10) * 10);
    const yMax = Math.min(100, Math.max(yMin + 20, Math.ceil((dMax + 6) / 10) * 10));
    if (_charts[canvasId]) _charts[canvasId].destroy();
    _charts[canvasId] = new Chart(cv, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: bg, borderColor: bc, borderWidth: 1, borderRadius: 3, maxBarThickness: 46,
        _on: data.map((_, i) => aceso(i)) }] },
      plugins: [barLabels],
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 22 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => Math.round(c.raw) + '%' } } },
        scales: { x: { grid, ticks: tick }, y: { min: yMin, max: yMax, grid, ticks: { ...tick, callback: v => v + '%' } } },
      },
    });
  }

  // ── markup ──
  function html(opts) {
    const dims = (opts && opts.dims) || [];
    const toggle = dims.length > 1
      ? `<div class="adv-toggle">${dims.map((d, i) =>
          `<button class="adv-dim${i ? '' : ' on'}" data-dim="${esc(d.k)}">${esc(d.rot)}</button>`).join('')}</div>`
      : '';
    return `<div class="adv">
      <div class="adv-hero">
        <div class="adv-hl">Aderência Total</div>
        <div class="adv-hn" data-adv="total">—</div>
        <div class="adv-sub">
          <div><span class="adv-hl">Aderência ao Prazo</span><b data-adv="prazo">—</b></div>
          <div><span class="adv-hl">Aderência à Conclusão</span><b data-adv="concl">—</b></div>
        </div>
        <div class="adv-faixas">
          <span><i style="background:var(--band-red,#FF5252)"></i>&lt; 70% — Crítico</span>
          <span><i style="background:var(--band-amber,#F4A100)"></i>≥ 70% e &lt; 85% — Atenção</span>
          <span><i style="background:var(--band-green,#3BB33B)"></i>≥ 85% — Adequado</span>
        </div>
      </div>

      <div class="adv-kpis">
        <div class="adv-kpi"><div class="adv-kl"><i class="adv-dot cinza"></i>Total de Ações</div><b data-adv="k-tt">—</b></div>
        <div class="adv-kpi"><div class="adv-kl"><i class="adv-dot verde"></i>Concluídas</div><b data-adv="k-concl">—</b></div>
        <div class="adv-kpi"><div class="adv-kl"><i class="adv-dot ambar"></i>Em Andamento</div><b data-adv="k-andam">—</b></div>
        <div class="adv-kpi"><div class="adv-kl"><i class="adv-dot vermelho"></i>Não Iniciadas</div><b data-adv="k-nini">—</b></div>
        <div class="adv-kpi"><div class="adv-kl"><i class="adv-dot verde"></i>No Prazo</div><b data-adv="k-nop">—</b></div>
        <div class="adv-kpi"><div class="adv-kl"><i class="adv-dot vermelho"></i>Fora do Prazo</div><b data-adv="k-venc">—</b></div>
      </div>

      <div class="adv-graficos">
        <div class="adv-card"><h3>Aderência ao Prazo · Mensal</h3><div class="adv-wrap"><canvas id="adv-ch-prazo"></canvas></div></div>
        <div class="adv-card"><h3>Aderência à Conclusão · Mensal</h3><div class="adv-wrap"><canvas id="adv-ch-concl"></canvas></div></div>
      </div>

      <div class="adv-card adv-tbl">
        <div class="adv-thead"><h3 data-adv="tbl-titulo">Aderência</h3>${toggle}</div>
        <div class="adv-rola"><table class="adv-table"><thead><tr>
          <th data-adv="th-dim">—</th><th class="num">TT Ações</th><th class="num">Conclusão</th><th class="num">Prazo</th><th class="num">Total</th>
        </tr></thead><tbody data-adv="tbody"></tbody></table></div>
      </div>
    </div>`;
  }

  // ── render ──
  function render(root, opts) {
    if (!root) return;
    const linhas = (opts && opts.linhas) || [];
    const dims   = (opts && opts.dims) || [];
    const dim    = (opts && opts.dim) || (dims[0] && dims[0].k) || '';
    const rot    = (dims.find(d => d.k === dim) || {}).rot || '';
    const q = sel => root.querySelector(`[data-adv="${sel}"]`);

    const g = metrics(linhas);
    const setN = (k, v) => { const e = q(k); if (e) e.textContent = v.toLocaleString('pt-BR'); };
    const setP = (k, v) => { const e = q(k); if (e) { e.textContent = pct(v); e.style.color = band(v); } };
    setP('total', g.total); setP('prazo', g.pPrazo); setP('concl', g.pConcl);
    setN('k-tt', g.tt); setN('k-concl', g.concl); setN('k-andam', g.andam);
    setN('k-nini', g.nini); setN('k-nop', g.noP); setN('k-venc', g.venc);

    // A série mensal usa as linhas SEM o filtro de vigência (quando o painel as
    // manda), para os outros meses continuarem no gráfico — apagados.
    const serie = (opts && opts.linhasMes) || linhas;
    const sel   = (opts && opts.vigsSel) || [];
    const ms = meses(serie);
    const labels = ms.map(m => m.lbl);
    const foco = ms.map(m => !sel.length || sel.includes(m.lbl));
    const porMes = m => metrics(serie.filter(o => o.ord === m.ord));
    grafico('adv-ch-prazo', labels, ms.map(m => porMes(m).pPrazo), foco);
    grafico('adv-ch-concl', labels, ms.map(m => porMes(m).pConcl), foco);

    // tabela por dimensão, da pior aderência para a melhor
    const tt = q('tbl-titulo'); if (tt) tt.textContent = 'Aderência por ' + rot;
    const th = q('th-dim');     if (th) th.textContent = rot;
    const chaves = [...new Set(linhas.map(o => (o.dims || {})[dim]).filter(v => v != null && v !== ''))];
    const itens = chaves.map(k => ({ k, ...metrics(linhas.filter(o => (o.dims || {})[dim] === k)) }))
      .sort((a, b) => (a.total == null ? 999 : a.total) - (b.total == null ? 999 : b.total)
                   || String(a.k).localeCompare(String(b.k), 'pt'));
    const tb = q('tbody');
    if (tb) tb.innerHTML = itens.length
      ? itens.map(it => `<tr>
          <td>${esc(it.k)}</td>
          <td class="num">${it.tt}</td>
          <td class="num" style="color:${band(it.pConcl)};font-weight:800">${pct(it.pConcl)}</td>
          <td class="num" style="color:${band(it.pPrazo)};font-weight:800">${pct(it.pPrazo)}</td>
          <td class="num"><span class="adv-pct" style="background:${band(it.total)}">${pct(it.total)}</span></td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="adv-vazio">Nenhuma ação com os filtros atuais.</td></tr>';

    // troca de dimensão (Unidade ⇄ Projeto ⇄ Conta, Assunto ⇄ Pessoa…)
    root.querySelectorAll('.adv-dim').forEach(b => {
      b.classList.toggle('on', b.dataset.dim === dim);
      if (!b._lig) {
        b._lig = true;
        b.addEventListener('click', () => {
          if (opts && typeof opts.aoTrocarDim === 'function') opts.aoTrocarDim(b.dataset.dim);
        });
      }
    });
  }

  global.AderenciaView = { html, render, metrics, band, bandRgba, pct };
})(window);
