# Projeto BI App — Guia para o Claude

## Visão geral

Repositório central de todos os painéis de BI da empresa, em substituição ao Looker Studio.
Cada painel é um arquivo `index.html` autocontido — sem framework, sem backend, sem build step.

GitHub Pages: `https://fortesindicadores-byte.github.io/Projeto-BI-App/`

---

## Estrutura de pastas

```
Projeto-BI-App/
├── visao-financeira/       → Painel DRE Consolidado (ATIVO) ← referência principal
├── combustivel/
│   ├── arvore-combustivel/ → Árvore de Combustível (ATIVO)
│   ├── eficiencia-kml/     → (vazio)
│   ├── preco-litro/        → (vazio)
│   └── consumo-co2/        → (vazio)
├── financeiro-pessoal/     → Controle Financeiro Renan & Tati (ATIVO)
├── painel-km/              → (vazio)
├── eficiencia-ativacao/    → (vazio)
├── rs-por-km/              → (vazio)
├── disponibilidade/        → (vazio)
├── reuniao-mensal/         → (vazio)
├── auditorias/             → (vazio)
├── fca/                    → (vazio)
└── painel-metas/           → (vazio)
```

Pastas vazias têm `.gitkeep`. Ao criar um novo painel, substituir por `index.html`.

---

## 1. Paleta de cores e fundo

```css
:root {
  --bg:      #0C1017;  /* fundo principal do body */
  --card:    #141B26;  /* cards */
  --card2:   #1A2335;  /* cards secundários */
  --border:  #1E2D40;  /* bordas */
  --orange:  #F97316;  /* cor primária — destaques, títulos, botões */
  --blue:    #38BDF8;  /* cor secundária — linhas remunerado */
  --text:    #F1F5F9;  /* texto principal */
  --text2:   #94A3B8;  /* texto secundário */
  --text3:   #475569;  /* texto terciário */
  --green:   #3BB33B;  /* positivo / favorável */
  --red:     #FF6666;  /* negativo / desfavorável */
}
```

**Body background** — gradiente sutil laranja + azul sobre `--bg`:
```css
body {
  background:
    radial-gradient(ellipse at 10% 25%, rgba(249,115,22,.06) 0%, transparent 50%),
    radial-gradient(ellipse at 90% 75%, rgba(56,189,248,.05) 0%, transparent 50%),
    var(--bg);
  color: var(--text);
  font-family: 'Montserrat', -apple-system, sans-serif;
  font-size: 13px; min-height: 100vh;
}
```

---

## 2. Tipografia

- Fonte: **Montserrat** (Google Fonts) — pesos 400, 500, 600, 700, 800
- CDN: `<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">`
- Aplicar em todos os elementos Chart.js: `font:{family:'Montserrat'}`

| Elemento | Tamanho | Peso |
|---|---|---|
| Hero value | 52px | 800 |
| Título de tabela / seção | 16px | 800 |
| Título de card | 15px | 800 |
| Card value | 24px | 800 |
| Card label (nome) | 10px | 600 |
| Dados da tabela | 12px | 400–500 |
| Cabeçalho de coluna | 11px | 700 |
| Row total | 12px | 700 |
| Badges / hints | 9–10px | 400 |

---

## 3. Barra de título (header)

Fundo semi-transparente escuro, sticky, com blur — **não muda no modo claro**.

```css
.header {
  background: rgba(12,16,23,.75);
  border-bottom: 1px solid rgba(255,255,255,.07);
  padding: 10px 24px 12px;
  display: flex; flex-wrap: wrap; align-items: center;
  position: sticky; top: 0; z-index: 100;
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 2px 12px rgba(0,0,0,.3);
}
.brand h1 { font-size: 16px; font-weight: 700; color: var(--orange); }
.brand p  { font-size: 10px; color: var(--text2); margin-top: 2px; }
```

**Header right** — botões e badges à direita:
```html
<div class="header-right">
  <button class="theme-btn" id="themeBtn" title="Modo claro/escuro"></button>
  <button class="refresh-btn" onclick="atualizar()" title="Atualizar dados">
    <!-- SVG de setas circulares -->
  </button>
  <span class="status-badge" id="status-badge">Carregando…</span>
  <span class="access-badge" id="access-badge" style="display:none"></span>
</div>
```

```css
.status-badge {
  font-size:10px; color:var(--text);
  background:rgba(249,115,22,.15); border:1px solid rgba(249,115,22,.3);
  border-radius:4px; padding:3px 10px; white-space:nowrap;
}
.access-badge {
  font-size:10px; color:var(--text2);
  background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1);
  border-radius:4px; padding:3px 10px; white-space:nowrap;
}
.refresh-btn {
  background:rgba(249,115,22,.15); border:1px solid rgba(249,115,22,.3);
  border-radius:4px; padding:5px 9px; cursor:pointer; color:var(--orange);
  display:flex; align-items:center;
}
.refresh-btn:hover { background:rgba(249,115,22,.32); }
```

**Mobile** — compactar badges e filtros, manter header escuro:
```css
@media(max-width:768px){
  .header-right { flex-direction:row; align-items:center; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
  .header-right .refresh-btn { display:none; }
  .status-badge, .access-badge { font-size:8px; padding:2px 6px; }
  .theme-btn { padding:3px 5px; }
  .theme-btn svg { width:13px; height:13px; }
  .filter-hint { display:none; }
}
```

---

## 4. Modelo inicial do painel — Hero + Cards

**Regra:** o KPI principal fica **fora de card**, grande, no topo. Os demais ficam em cards.

```html
<!-- HERO: número sem card -->
<div class="hero">
  <div class="hero-main">
    <div class="hero-label">RECEITA LÍQUIDA</div>
    <div class="hero-value" id="hero-val">—</div>
    <div class="hero-deltas">
      <div class="hero-delta"><span>Δ Orç. %</span><b id="d-orc" class="cg">—</b></div>
      <div class="hero-delta"><span>Δ Rem. %</span><b id="d-rem" class="cg">—</b></div>
      <div class="hero-delta"><span>YoY %</span>  <b id="d-yoy" class="cg">—</b></div>
    </div>
  </div>
</div>

<!-- CARDS: grid 5 colunas -->
<div class="cards-row">
  <div class="kpi-card">
    <div class="card-label">Orçado</div>
    <div class="card-value" id="c-orc">—</div>
    <div class="card-meta"><div class="card-meta-item">YoY: <b id="c-orc-yoy">—</b></div></div>
  </div>
  <!-- ... -->
</div>
```

```css
/* Hero */
.hero-label     { font-size:10px; font-weight:600; color:var(--text2); text-transform:uppercase; letter-spacing:1px; }
.hero-value     { font-size:52px; font-weight:800; color:var(--text); line-height:1; }
.hero-delta     { font-size:10px; color:var(--text2); }
.hero-delta b   { font-size:14px; font-weight:700; display:block; margin-top:2px; }

/* Cards grid */
.cards-row { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:12px; }
.kpi-card  {
  background:rgba(20,27,38,.55); border:1px solid rgba(255,255,255,.07); border-radius:8px;
  padding:14px 16px; display:flex; flex-direction:column; gap:3px;
  backdrop-filter:blur(16px); box-shadow:0 2px 12px rgba(0,0,0,.25);
}
.card-label   { font-size:10px; font-weight:600; color:var(--text2); text-transform:uppercase; letter-spacing:.5px; }
.card-value   { font-size:24px; font-weight:800; color:var(--text); line-height:1.1; margin-top:2px; }
.card-delta-v { font-size:20px; font-weight:800; margin-top:2px; color:var(--text); }
.card-delta-p { font-size:12px; font-weight:600; margin-top:1px; color:var(--text); }
.card-imp     { font-size:10px; color:var(--text2); margin-top:4px; }
```

---

## 5. Filtros multi-select (flags)

Cada filtro é um dropdown com checkbox "Todos" + opções individuais — vários podem estar selecionados simultaneamente. O botão mostra o label + badge com contagem quando há seleção.

```css
.ms-btn {
  display:flex; align-items:center; gap:8px;
  background:#0a0f18; color:var(--text);
  border:1px solid #2a3a50; border-radius:4px;
  font-family:'Montserrat',sans-serif; font-size:11px; font-weight:700;
  padding:6px 12px; cursor:pointer; text-transform:uppercase;
  letter-spacing:.5px; white-space:nowrap; min-width:110px;
}
.ms-btn:hover { border-color:var(--orange); }
.ms-cnt { background:var(--orange); color:#000; border-radius:10px; padding:1px 6px; font-size:9px; font-weight:800; display:none; }
.ms-panel { display:none; flex-direction:column; position:absolute; top:calc(100% + 4px); left:0; z-index:500;
  background:#0f1824; border:1px solid #2a3a50; border-radius:4px; min-width:230px; max-height:300px; box-shadow:0 8px 24px rgba(0,0,0,.7); }
.ms-panel.open { display:flex; }
.ms-opt { display:flex; align-items:center; gap:8px; padding:7px 12px; cursor:pointer; font-size:11px; color:var(--text2); }
.ms-opt:hover { background:rgba(255,255,255,.05); color:var(--text); }
.ms-opt.all-opt { border-bottom:1px solid #1e2d40; color:var(--text); font-weight:700; }
.ms-opt input[type=checkbox] { accent-color:var(--orange); cursor:pointer; width:14px; height:14px; }
```

**Filtro Ano** — obrigatório, sempre o primeiro, populado a partir dos dados:
```javascript
// Formato Date:   [...new Set(vigs.map(d => String(d.getFullYear())))].sort().reverse()
// Formato MM/YYYY: [...new Set(vigs.map(v => v.slice(-4)))].sort().reverse()
buildMsFilter('ms-ano', anos);
```

**Mobile** — 3 filtros por linha (visao-financeira com 6), 2 por linha (4 filtros), lado a lado (2 filtros):
```css
@media(max-width:768px){
  .header-filters { gap:5px; }
  .filter-group { flex:0 0 calc(33.333% - 4px); } /* ajustar % conforme nº de filtros */
  .ms-wrap { width:100%; }
  .ms-btn { width:100%; min-width:0; font-size:8px; padding:3px 6px; }
}
```

---

## 6. Atualização automática e botão de refresh

```javascript
// Botão de refresh — ícone de setas (SVG inline)
// Chamar atualizar() ao clicar

async function atualizar() {
  set('status-badge', 'Carregando…');
  try {
    await fetchData();
    const now = new Date();
    set('status-badge', `Atualizado ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`);
  } catch(e) {
    set('status-badge', 'Erro ao carregar dados');
  }
}

// Init ao carregar
document.addEventListener('DOMContentLoaded', () => { initAccessLog(); atualizar(); });
```

O botão de refresh fica oculto no mobile (`display:none`) — o painel atualiza apenas ao abrir.

---

## 7. Último acesso (localStorage)

```javascript
function initAccessLog() {
  let name = localStorage.getItem('bi_user_name');
  if (!name) {
    name = prompt('Qual é o seu nome?') || 'Desconhecido';
    localStorage.setItem('bi_user_name', name);
  }
  const lastRaw = localStorage.getItem('bi_last_access');
  if (lastRaw) {
    const d = new Date(lastRaw);
    const lastUser = localStorage.getItem('bi_last_user') || name;
    const badge = document.getElementById('access-badge');
    if (badge) {
      badge.textContent = `Último acesso: ${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · ${lastUser}`;
      badge.style.display = '';
    }
  }
  localStorage.setItem('bi_last_access', new Date().toISOString());
  localStorage.setItem('bi_last_user', name);
}
```

**localStorage keys:** `bi_user_name` · `bi_last_access` · `bi_last_user` · `bi_theme`

---

## 8. Modo claro / escuro

Botão lua/sol no `.header-right`. Header e filtros permanecem sempre escuros.

### CSS (após `.refresh-btn:hover`)
```css
.theme-btn { background:rgba(249,115,22,.15); border:1px solid rgba(249,115,22,.3); border-radius:4px; padding:5px 7px; cursor:pointer; color:var(--orange); display:flex; align-items:center; }
.theme-btn:hover { background:rgba(249,115,22,.25); }

body.light-mode .main { background:#F0F0F0; --text:#1a1a1a; --text2:#444444; --text3:#666666; }

/* Cards: branco sólido + sombra, sem borda */
body.light-mode .card,
body.light-mode .kpi-card { background:#FFFFFF!important; border-color:transparent!important; box-shadow:0 2px 12px rgba(0,0,0,.10)!important; --text:#1a1a1a; --text2:#444444; --text3:#555555; }

/* Para painéis com .chart-card e .tbl-section (visao-financeira): */
body.light-mode .chart-card,
body.light-mode .tbl-section { background:#FFFFFF!important; border-color:transparent!important; box-shadow:0 2px 12px rgba(0,0,0,.10)!important; --text:#1a1a1a; --text2:#444444; --text3:#555555; }

/* td sem color explícito herda branco do body — forçar escuro */
body.light-mode .card td { color:var(--text); }
```

### HTML (antes do `.refresh-btn`)
```html
<button class="theme-btn" id="themeBtn" title="Modo claro/escuro"></button>
```

### JS (ao final do `<script>`)
```javascript
const _sun=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const _moon=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
function applyTheme(t){
  document.body.classList.toggle('light-mode', t==='light');
  localStorage.setItem('bi_theme', t);
  const b = document.getElementById('themeBtn');
  if(b) b.innerHTML = t==='light' ? _moon : _sun;
  // re-renderizar charts com novas cores:
  if(typeof lastF !== 'undefined' && lastF) renderCharts(lastF); // visao-financeira
  // if(M.length) renderAll();                                    // financeiro-pessoal
}
(function(){
  const t = localStorage.getItem('bi_theme') || 'dark';
  applyTheme(t);
  document.getElementById('themeBtn').addEventListener('click',
    () => applyTheme(document.body.classList.contains('light-mode') ? 'dark' : 'light'));
})();
```

---

## 9. Modelos de gráficos (Chart.js 4.4.0)

CDN: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>`
Datalabels: `<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0"></script>` + `Chart.register(ChartDataLabels)`

### Cores dinâmicas (tema-aware) — OBRIGATÓRIO
```javascript
const getGrid = () => ({color: document.body.classList.contains('light-mode') ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.06)'});
const getTick = (sz=10) => ({color: document.body.classList.contains('light-mode') ? '#444444' : '#94A3B8', font:{family:'Montserrat',size:sz}});
```
**Atenção:** `isLight` deve ser declarada ANTES de qualquer uso dentro da função render (erro de `const` antes da inicialização).

### Gráfico de linha (referência)
```javascript
const isLight = document.body.classList.contains('light-mode');
const orcC  = isLight ? '#999999' : '#F1F5F9'; // linha branca → cinza em light
const legend = {labels:{color: isLight?'#1a1a1a':'#F1F5F9', font:{family:'Montserrat',size:10}, boxWidth:14}};
const tooltip = {backgroundColor:'#141B26', titleColor:'#F97316', bodyColor:'#F1F5F9', borderColor:'#1E2D40', borderWidth:1, titleFont:{family:'Montserrat'}, bodyFont:{family:'Montserrat'}};

// Dataset Realizado (laranja sólido):
{label:'REALIZADO', data, borderColor:'#F97316', borderWidth:3, tension:.3, fill:false}
// Dataset Remunerado (azul tracejado):
{label:'REMUNERADO', data, borderColor:'#38BDF8', borderWidth:2, tension:.3, fill:false, borderDash:[5,3]}
// Dataset Orçado (branco/cinza tracejado):
{label:'ORÇADO', data, borderColor:orcC, borderWidth:2, tension:.3, fill:false, borderDash:[5,3]}
```

### Pontos destacados (mês selecionado)
```javascript
pointRadius:      data.map((_, i) => highlighted.includes(i) ? 6 : 3),
pointBackgroundColor: data.map((_, i) => highlighted.includes(i) ? '#fff' : cor),
pointBorderWidth: data.map((_, i) => highlighted.includes(i) ? 3 : 0),
pointHoverRadius: 8,
```
- Selecionado: `radius:6`, borda branca espessa
- Não selecionado: `radius:3`, sem borda
- Legend built-in do Chart.js: `{display:false}` — usar HTML legend próprio

### Gráfico de barra (cluster/% distribuição)
```javascript
{data, backgroundColor:'rgba(239,68,68,.7)', borderColor:'#EF4444', borderWidth:1, borderRadius:3}
// datalabels:
color: document.body.classList.contains('light-mode') ? '#333333' : '#F1F5F9'
```

---

## 10. Condicional de cores para custos

**Regra:** custos são valores negativos. Delta positivo = gastou mais que referência = **vermelho**. Delta negativo = gastou menos = **verde**.

```javascript
// Para custos (ex: Realizado vs Remunerado):
const delta = rem - real;   // positivo = gastou mais = ruim
const bad   = delta > 0;    // true = vermelho

// Classes CSS:
element.className = bad ? 'cr' : 'cg';  // .cr = vermelho, .cg = verde

// Para receita (oposto):
const deltaRec = real - ref;
const badRec   = deltaRec < 0;  // receita menor que referência = ruim
```

```css
.cr   { color:var(--red)   !important; font-weight:700; }  /* vermelho — desfavorável */
.cg   { color:var(--green) !important; font-weight:700; }  /* verde — favorável */
.bad  { color:var(--red)   !important; }
.good { color:var(--green) !important; }
```

---

## 11. Formatação de números

**Regra universal:** sem `R$`, sem casas decimais, exceto percentuais.

```javascript
const numFmt = v => {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if(a >= 1e9) return s + Math.round(a/1e9) + ' bi';
  if(a >= 1e6) return s + Math.round(a/1e6) + ' mi';
  if(a >= 1e5) return s + Math.round(a/1e3) + 'k';
  return s + Math.round(a).toLocaleString('pt-BR');
};
const fmt    = v => numFmt(v);                         // valor principal
const pctInt = v => (v >= 0 ? '+' : '') + Math.round(v) + '%';  // Δ% em tabelas
const pctR   = (a, b) => b ? ((a/b-1)*100).toFixed(1)+'%' : '—'; // % relativo
const pp     = v => v.toFixed(2) + ' pp';             // pontos percentuais
```

| Valor | Resultado |
|---|---|
| 1.234.567.890 | `1 bi` |
| 26.170.000 | `26 mi` |
| 464.440 | `464k` |
| 1.234 | `1.234` |
| +3,5% | `+4%` (pctInt) |

---

## 12. Tabelas — padrão clean

Sem linhas de grade entre linhas, sem background nas células, cabeçalhos brancos, linha total com separador.

```css
/* Container */
.tbl-section {
  background:rgba(20,27,38,.55); border:1px solid rgba(255,255,255,.07); border-radius:8px;
  padding:18px 20px 16px; margin-bottom:16px;
  backdrop-filter:blur(16px); box-shadow:0 2px 12px rgba(0,0,0,.25);
}
.tbl-title { font-size:16px; font-weight:800; color:var(--text); margin-bottom:3px; }
.tbl-sub   { font-size:10px; color:var(--text2); margin-bottom:16px; }

/* Tabela */
table { width:100%; border-collapse:collapse; font-size:12px; }

/* Cabeçalho — branco, sem background, linha inferior sutil */
thead th {
  background:transparent; color:var(--text); font-size:11px; font-weight:700;
  padding:8px 8px 12px; border-bottom:1px solid rgba(255,255,255,.10);
  text-transform:uppercase; letter-spacing:.5px; white-space:nowrap;
}

/* Células — sem grade, sem borda entre linhas */
td { padding:13px 8px; border:none; color:var(--text); white-space:nowrap; }
tbody tr:hover { background:rgba(255,255,255,.035); }

/* Linha total — separador superior, fonte maior e bold */
tr.total td {
  color:var(--text); font-weight:700; font-size:12px;
  border-top:2px solid rgba(255,255,255,.12);
  padding-top:14px; padding-bottom:8px;
}
tr.total td.conta { font-weight:800; }

/* Números alinhados à direita */
td.num { text-align:right; }
```

**Mobile — proporcional com vmin:**
```css
@media(max-width:768px){
  table { table-layout:fixed; width:100%; font-size:1.6vmin; }
  thead th { font-size:1.6vmin; padding:4px 2px; letter-spacing:0; }
  tr.total td { font-size:1.6vmin; padding-top:6px; padding-bottom:4px; }
}
```

---

## Como criar um novo painel

1. Copiar `visao-financeira/index.html` como base (painel de referência)
2. Atualizar `<title>`, `.brand h1`, `.brand p`
3. Definir `SHEET_ID` e `SHEET_TAB` com a aba do Google Sheets
4. Implementar `fetchData()`, `populateFilters()`, `atualizar()`
5. Todos os padrões acima (1–12) já estão presentes — adaptar ao contexto do painel
6. Fazer push para `main` — GitHub Pages publica automaticamente

**URL resultante:** `https://fortesindicadores-byte.github.io/Projeto-BI-App/{pasta}/`

---

## Roadmap futuro

- Controle de acesso: login, níveis de usuário, log de sessões via **Supabase**
- Painéis a criar: Painel Km, Eficiência Km/L, Preço R$/L, Consumo CO², R$ por km, Disponibilidade, Reunião Mensal, Auditorias, FCA, Painel de Metas
