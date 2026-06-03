# Gestão em Movimento — Referência Técnica Completa

> Documento gerado em 2026-06-03. Use este arquivo para continuar o desenvolvimento em qualquer nova sessão de chat.

---

## 1. Visão Geral

Repositório de painéis de BI da **Fortes Indicadores**, substituindo o Looker Studio.  
Cada painel = um arquivo `index.html` autocontido. Sem framework, sem backend, sem build step.

| Item | Valor |
|---|---|
| Repositório GitHub | `fortesindicadores-byte/gestao-em-movimento` _(renomeado de Projeto-BI-App)_ |
| GitHub Pages | `https://fortesindicadores-byte.github.io/gestao-em-movimento/` |
| Branch principal | `main` |
| Branch de dev (Claude) | `claude/great-allen-OVObS` |

---

## 2. Push Workflow — LEIA PRIMEIRO

> ⚠️ O repositório foi **renomeado** no GitHub (era `Projeto-BI-App`, agora `gestao-em-movimento`).  
> O proxy local ainda aponta para o nome antigo → `git push origin main` retorna **503**.  
> **NUNCA use `git push` para o main. Sempre use MCP.**

### Fluxo correto para cada mudança

```
1. Editar arquivo localmente
2. git add <arquivo> && git commit -m "mensagem"
3. git push -u origin claude/great-allen-OVObS   ← dev branch ok
4. Para publicar no main (GitHub Pages):
   → usar mcp__github__create_or_update_file
   → passar: owner, repo, path, message, content (base64 ou string), sha (do arquivo atual)
5. Após push MCP:
   git fetch origin main
   git checkout origin/main -- <arquivo>
   git add <arquivo> && git commit -m "sync: após push MCP"
   git push -u origin claude/great-allen-OVObS
```

### Como obter o SHA atual de um arquivo (necessário para update via MCP)

```
mcp__github__get_file_contents (owner: fortesindicadores-byte, repo: gestao-em-movimento, path: <caminho>)
→ retorna .sha do arquivo
```

### Se MCP exigir autenticação OAuth

```
mcp__github__authenticate  → gera URL
→ usuário abre URL no browser, autoriza
→ após autorizar, copiar URL de callback (http://localhost:<port>/callback?code=...&state=...)
mcp__github__complete_authentication (callback_url: <url copiada>)
→ MCP tools ficam disponíveis
```

---

## 3. Estrutura de Pastas

```
gestao-em-movimento/
├── index.html                        ← Hub + Auth (Supabase) — ATIVO
├── visao-financeira/index.html       ← DRE Consolidado — ATIVO ← REFERÊNCIA DE LAYOUT
├── painel-km/index.html              ← KM — ATIVO
├── combustivel/
│   ├── arvore-combustivel/index.html ← Árvore de Combustível — ATIVO
│   ├── eficiencia-kml/               ← vazio (.gitkeep)
│   ├── preco-litro/                  ← vazio
│   └── consumo-co2/                  ← vazio
├── rs-por-km/index.html              ← R$/KM — ATIVO
├── financeiro-pessoal/index.html     ← Controle Financeiro Renan & Tati — ATIVO (não está no hub)
├── eficiencia-ativacao/              ← vazio
├── disponibilidade/                  ← vazio
├── reuniao-mensal/                   ← vazio
├── auditorias/                       ← vazio
├── fca/                              ← vazio
└── painel-metas/                     ← vazio
```

---

## 4. Mudanças Pendentes de Push para Main

As alterações abaixo estão no branch `claude/great-allen-OVObS` mas **ainda NÃO estão no `main`** (GitHub Pages).

### 4.1 Hub — Correção de crash de autenticação (`index.html`)

O Supabase dispara evento `SIGNED_IN` a cada ~55 min (refresh de token), causando `checkApproval()` novamente e, se falhasse, jogava o usuário fora. Fix com flag `isApproved`:

```javascript
// Após isRegistering, adicionar:
let isApproved = false;

// Em showHub():
function showHub(user) {
  currentUser = user;
  isApproved = true;   // ← NOVO
  stopPolling();
  // ... resto ...
}

// Em showAuth():
function showAuth() {
  isApproved = false;  // ← NOVO
  // ... resto ...
}

// Em checkApproval() catch block:
} catch(e) {
  console.error('checkApproval:', e);
  if (!isApproved) showAuth();   // ← ERA: showAuth() sem condição
}

// Em onAuthStateChange:
if (event === 'SIGNED_IN' && session && !isRegistering && !isApproved)
  await checkApproval(session.user);  // ← ADICIONADO && !isApproved
```

### 4.2 Botão Voltar em todos os painéis ativos

Todos os 4 painéis ativos precisam de um botão `‹` no header-right que leva de volta ao hub.

**CSS** (adicionar após `.theme-btn:hover` em cada painel):
```css
.back-btn{background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.3);border-radius:4px;padding:4px 8px;display:flex;align-items:center;color:var(--orange);text-decoration:none;}
.back-btn:hover{background:rgba(249,115,22,.32);}
```

**HTML** (adicionar antes do `theme-btn` no `.header-right`):
```html
<a href="../" class="back-btn" title="Voltar ao Hub">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
</a>
```

**`href` por painel:**
- `visao-financeira/`: `href="../"`
- `painel-km/`: `href="../"`
- `rs-por-km/`: `href="../"`
- `combustivel/arvore-combustivel/`: `href="../../"` ← dois níveis acima

### 4.3 SHAs dos arquivos no main (para MCP update)

Buscar com `mcp__github__get_file_contents` antes de qualquer push:

| Arquivo | Último SHA conhecido |
|---|---|
| `index.html` | verificar na hora |
| `visao-financeira/index.html` | `b88705b7a8ef8f2da5d7bf3a60755e76dd0fe1ad` |
| `painel-km/index.html` | `84edec5b17e7bfa4d0270bf456384c03f84ee2ba` |
| `rs-por-km/index.html` | `340e505a35242f4e338822ab1b8b91067bb2992d` |
| `combustivel/arvore-combustivel/index.html` | verificar na hora |

> SHAs mudam a cada push. Sempre buscar o SHA atual antes de usar `create_or_update_file`.

---

## 5. Paleta de Cores

```css
:root {
  --bg:     #0C1017;  /* fundo principal do body */
  --card:   #141B26;  /* cards */
  --card2:  #1A2335;  /* cards secundários */
  --border: #1E2D40;  /* bordas */
  --orange: #F97316;  /* cor primária — títulos, botões, destaques */
  --blue:   #38BDF8;  /* cor secundária — linhas remunerado */
  --text:   #F1F5F9;  /* texto principal */
  --text2:  #94A3B8;  /* texto secundário */
  --text3:  #475569;  /* texto terciário */
  --green:  #3BB33B;  /* positivo / favorável */
  --red:    #FF6666;  /* negativo / desfavorável */
}
```

**Body gradient** (fundo com brilho sutil):
```css
body {
  background:
    radial-gradient(ellipse at 10% 25%, rgba(249,115,22,.06) 0%, transparent 50%),
    radial-gradient(ellipse at 90% 75%, rgba(56,189,248,.05) 0%, transparent 50%),
    var(--bg);
}
```

**Classes de cor semântica:**
```css
.cr   { color: var(--red)   !important; font-weight: 700; }  /* custo ruim / desvio negativo */
.cg   { color: var(--green) !important; font-weight: 700; }  /* custo bom  / desvio positivo */
.bad  { color: var(--red)   !important; }
.good { color: var(--green) !important; }
```

**Lógica de coloração:**
- Custo: `delta = rem - real` → `delta > 0` = `cr` (gastou mais = ruim)
- Receita: `delta = real - ref` → `delta < 0` = `cr` (recebeu menos = ruim)

---

## 6. Tipografia

- Fonte: **Montserrat** (Google Fonts)
- CDN: `<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">`
- Aplicar em Chart.js: `font: {family: 'Montserrat'}`

| Elemento | Tamanho | Peso |
|---|---|---|
| Hero value | 52px | 800 |
| Título de tabela/seção | 16px | 800 |
| Título de card | 15px | 800 |
| Card value | 24px | 800 |
| Card label (nome) | 10px | 600 |
| Dados da tabela | 12–13px | 400–500 |
| Cabeçalho de coluna | 11px | 700 |
| Row total | 12–13px | 700 |
| Badges / hints | 9–10px | 400 |

---

## 7. Header (Barra de Título)

Sticky, fundo semi-transparente escuro com blur — **não muda no modo claro**.

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

**Elementos do header-right (da esquerda p/ direita):**
1. `.back-btn` → seta voltar ao hub (pendente push)
2. `.theme-btn` → lua/sol (toggle modo claro/escuro)
3. `.refresh-btn` → botão atualizar dados (oculto no mobile)
4. `#status-badge` → "Carregando…" / "Atualizado DD/MM HH:MM"
5. `#access-badge` → "Último acesso: DD/MM HH:MM · Nome"

---

## 8. Fonte de Dados — Google Sheets GVIZ API

Cada painel busca dados de uma aba de Google Sheets via endpoint público JSON.

### Endpoint padrão
```javascript
const SHEET_ID  = '<id-da-planilha>';
const SHEET_TAB = '<nome-da-aba>';
const GVIZ_URL  = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_TAB)}`;
```

### Como fazer o fetch
```javascript
async function fetchData() {
  const res  = await fetch(GVIZ_URL);
  const text = await res.text();
  const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
  const rows = json.table.rows;
  // rows[i].c[j].v  → valor da célula linha i, coluna j
  // rows[i].c[j].f  → valor formatado (string)
}
```

### IDs das planilhas por painel

| Painel | SHEET_ID | SHEET_TAB |
|---|---|---|
| Visão Financeira | `1L8JpH0oKuLfCv_ZN9mvM_9FkWYhqf-1ZRjGBc4QiRls` | `DRE Consolidado` |
| Painel KM | `1L8JpH0oKuLfCv_ZN9mvM_9FkWYhqf-1ZRjGBc4QiRls` | `KM` |
| R$/KM | `1L8JpH0oKuLfCv_ZN9mvM_9FkWYhqf-1ZRjGBc4QiRls` | `RS por KM` |
| Árvore Combustível | `1L8JpH0oKuLfCv_ZN9mvM_9FkWYhqf-1ZRjGBc4QiRls` | `Combustivel` |

> ⚠️ IDs acima são ilustrativos. Verificar nos arquivos `index.html` de cada painel (`const SHEET_ID`, `const SHEET_TAB`).

---

## 9. Padrões de Dados — Campo `nv3`

O campo `nv3` nas planilhas segue o formato:

```
"PROJETO - UNIDADE (INATIVO)"
```

Exemplos reais: `"LOGÍSTICA - BLC (INATIVO)"`, `"LOGÍSTICA - CAB"`, `"TRANSPORTE - SP1"`

### Funções auxiliares

```javascript
// Extrai o prefixo (projeto) — tudo antes do "-"
const getNv3Prefix = v => v ? v.split('-')[0].trim() : v;
// Retorna: "LOGÍSTICA", "TRANSPORTE", etc.

// Extrai o label da unidade — tudo após o "-", sem "(INATIVO)"
const getUniLabel = v => {
  if (!v) return '';
  const i = v.indexOf('-');
  const s = i >= 0 ? v.slice(i + 1).trim() : v.trim();
  return s.replace(/\s*\(INATIVO\)\s*/i, '').trim();
};
// Retorna: "BLC", "CAB", "SP1", etc.
```

### Projetos/unidades conhecidos

A empresa opera com frota dividida em projetos (nível 3 — `nv3`):
- Cada linha de dado tem um `nv3` identificando o projeto e a unidade
- Unidades inativas aparecem com sufixo `(INATIVO)` no nv3 — deve ser removido nos labels de UI
- Os filtros de "Unidade" e "Projeto" são populados dinamicamente a partir dos dados

---

## 10. Filtros — Sistema Multi-Select

Cada filtro é um `<div class="ms-wrap">` com botão + dropdown. Suporta seleção múltipla.

### HTML base
```html
<div class="ms-wrap" style="position:relative">
  <button class="ms-btn" onclick="toggleMs('ms-ano')">
    ANO <span class="ms-cnt" id="ms-ano-cnt"></span>
  </button>
  <div class="ms-panel" id="ms-ano">
    <!-- populado via buildMsFilter() -->
  </div>
</div>
```

### Funções JS (copiar para cada painel)
```javascript
function buildMsFilter(id, opts, labelFn) {
  const panel = document.getElementById(id);
  panel.innerHTML = '';
  const allOpt = document.createElement('div');
  allOpt.className = 'ms-opt all-opt';
  allOpt.innerHTML = `<input type="checkbox" id="${id}-all" checked> <label for="${id}-all">Todos</label>`;
  allOpt.querySelector('input').addEventListener('change', e => {
    panel.querySelectorAll('.ms-opt:not(.all-opt) input').forEach(c => c.checked = e.target.checked);
    updateMsCnt(id); applyFilters();
  });
  panel.appendChild(allOpt);
  opts.forEach(opt => {
    const d = document.createElement('div');
    d.className = 'ms-opt';
    const label = labelFn ? labelFn(opt) : opt;
    d.innerHTML = `<input type="checkbox" value="${opt}" checked> <label>${label}</label>`;
    d.querySelector('input').addEventListener('change', () => { syncAllCheck(id); updateMsCnt(id); applyFilters(); });
    panel.appendChild(d);
  });
  updateMsCnt(id);
}

function getMsValues(id) {
  return [...document.querySelectorAll(`#${id} .ms-opt:not(.all-opt) input:checked`)].map(c => c.value);
}

function updateMsCnt(id) {
  const total   = document.querySelectorAll(`#${id} .ms-opt:not(.all-opt) input`).length;
  const checked = document.querySelectorAll(`#${id} .ms-opt:not(.all-opt) input:checked`).length;
  const cnt     = document.getElementById(`${id}-cnt`);
  if (cnt) { cnt.style.display = checked < total ? '' : 'none'; cnt.textContent = checked; }
}

function syncAllCheck(id) {
  const all  = document.querySelectorAll(`#${id} .ms-opt:not(.all-opt) input`).length;
  const chk  = document.querySelectorAll(`#${id} .ms-opt:not(.all-opt) input:checked`).length;
  const allCb = document.querySelector(`#${id}-all`);
  if (allCb) allCb.checked = (all === chk);
}

function toggleMs(id) {
  document.querySelectorAll('.ms-panel.open').forEach(p => { if (p.id !== id) p.classList.remove('open'); });
  document.getElementById(id).classList.toggle('open');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.ms-wrap')) document.querySelectorAll('.ms-panel.open').forEach(p => p.classList.remove('open'));
});
```

### Filtros por painel

| Painel | Filtros |
|---|---|
| Visão Financeira | Ano, Mês, Conta, Projeto (nv3), Unidade — 5 filtros, 3 por linha mobile |
| Painel KM | Ano, Mês, Projeto (nv3) — 3 filtros |
| R$/KM | Ano, Mês, Projeto — 3 filtros |
| Árvore Combustível | Ano, Mês, Projeto, Tipo Combustível — 4 filtros |

---

## 11. Formatação de Números

```javascript
// Número compacto com 2 casas decimais nos clusters
const numFmt = v => {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + ' bi';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + ' mi';
  if (a >= 1e5) return s + (a / 1e3).toFixed(2) + 'k';
  return s + Math.round(a).toLocaleString('pt-BR');
};
const fmt    = v => numFmt(v);
const pctInt = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';  // % com 1 decimal + sinal
const pctR   = (a, b) => b ? ((a / b - 1) * 100).toFixed(1) + '%' : '—';
const pp     = v => v.toFixed(2) + ' pp';
```

> **Painel KM (importante):** `pctInt` usa `.toFixed(1)` (1 decimal). Visão Financeira usa `Math.round` (inteiro). Verificar painel a painel.

---

## 12. Gráficos — Chart.js 4.4.0

**CDNs:**
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0"></script>
```
```javascript
Chart.register(ChartDataLabels);
```

### Helpers tema-aware (OBRIGATÓRIO — declarar antes de usar)
```javascript
const getGrid = () => ({
  color: document.body.classList.contains('light-mode') ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.06)'
});
const getTick = (sz = 10) => ({
  color: document.body.classList.contains('light-mode') ? '#444444' : '#94A3B8',
  font: {family: 'Montserrat', size: sz}
});
```

> ⚠️ Declarar `const isLight = document.body.classList.contains('light-mode')` **ANTES** de qualquer uso dentro da função render — erro de `const` antes da inicialização se declarado depois.

### Padrão de cores por dataset

| Dataset | Cor | Estilo |
|---|---|---|
| Realizado | `#F97316` (laranja) | Sólido, `borderWidth: 3` |
| Remunerado | `#38BDF8` (azul) | Tracejado `[5,3]`, `borderWidth: 2` |
| Orçado | `#F1F5F9` escuro / `#999999` claro | Tracejado `[5,3]`, `borderWidth: 2` |

### Gráfico de linha (template)
```javascript
{
  type: 'line',
  data: {
    labels: meses,
    datasets: [
      { label: 'REALIZADO', data: realData, borderColor: '#F97316', borderWidth: 3, tension: .3, fill: false,
        pointRadius: meses.map((_, i) => selecionados.includes(i) ? 6 : 3),
        pointBackgroundColor: meses.map((_, i) => selecionados.includes(i) ? '#fff' : '#F97316'),
        pointBorderWidth: meses.map((_, i) => selecionados.includes(i) ? 3 : 0) },
      { label: 'REMUNERADO', data: remData, borderColor: '#38BDF8', borderWidth: 2, tension: .3, fill: false, borderDash: [5,3] },
      { label: 'ORÇADO', data: orcData, borderColor: orcC, borderWidth: 2, tension: .3, fill: false, borderDash: [5,3] }
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: isLight ? '#1a1a1a' : '#F1F5F9', font: {family:'Montserrat', size:10}, boxWidth: 14 } },
      tooltip: { backgroundColor:'#141B26', titleColor:'#F97316', bodyColor:'#F1F5F9', borderColor:'#1E2D40', borderWidth:1,
        titleFont:{family:'Montserrat'}, bodyFont:{family:'Montserrat'} },
      datalabels: { display: false }
    },
    scales: {
      x: { grid: getGrid(), ticks: getTick() },
      y: { grid: getGrid(), ticks: { ...getTick(), callback: v => numFmt(v) } }
    }
  }
}
```

### Gráfico de barras (Δ% por Projeto — rs-por-km)
```javascript
{
  type: 'bar',
  data: { labels, datasets: [{ label: 'Δ%', data, backgroundColor: data.map(v => v >= 0 ? 'rgba(249,115,22,.75)' : 'rgba(255,102,102,.75)') }] },
  options: {
    indexAxis: 'y',  // barras horizontais
    plugins: {
      datalabels: {
        anchor: d => d.dataset.data[d.dataIndex] >= 0 ? 'end' : 'start',
        align:  d => d.dataset.data[d.dataIndex] >= 0 ? 'right' : 'left',
        color: '#F1F5F9', font: {family:'Montserrat', size:10, weight:'700'},
        formatter: v => v !== null ? (v >= 0 ? '+' : '') + Math.round(v) + '%' : ''
      }
    }
  }
}
```

### Gráfico de dispersão KM % (painel-km — barras verticais)
```javascript
// datalabels com 1 decimal:
formatter: v => v !== null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : ''
```

### Gráfico de árvore (arvore-combustivel)
- Barras horizontais agrupadas por projeto
- Cores por tipo de combustível (diesel/arla/gasolina)
- Datalabels com litros e R$ por barra

---

## 13. Tabelas — Padrão Clean

```css
.tbl-section {
  background: rgba(20,27,38,.55); border: 1px solid rgba(255,255,255,.07); border-radius: 8px;
  padding: 18px 20px 16px; margin-bottom: 16px;
  backdrop-filter: blur(16px); box-shadow: 0 2px 12px rgba(0,0,0,.25);
}
.tbl-title { font-size: 16px; font-weight: 800; color: var(--text); margin-bottom: 3px; }
.tbl-sub   { font-size: 10px; color: var(--text2); margin-bottom: 16px; }

table { width: 100%; border-collapse: collapse; font-size: 12px; }
thead th {
  background: transparent; color: var(--text); font-size: 11px; font-weight: 700;
  padding: 8px 8px 12px; border-bottom: 1px solid rgba(255,255,255,.10);
  text-transform: uppercase; letter-spacing: .5px; white-space: nowrap;
}
td { padding: 13px 8px; border: none; color: var(--text); white-space: nowrap; }
tbody tr:hover { background: rgba(255,255,255,.035); }
tr.total td {
  color: var(--text); font-weight: 700; font-size: 12px;
  border-top: 2px solid rgba(255,255,255,.12);
  padding-top: 14px; padding-bottom: 8px;
}
td.num { text-align: right; }
```

### Tipos de tabela por painel

| Painel | Tipo de tabela | Colunas principais |
|---|---|---|
| Visão Financeira | DRE por conta × mês | Conta, Jan…Dez, Total |
| Painel KM | KM por projeto × mês | Projeto, Realizado, Remunerado, Δ%, YoY% |
| R$/KM | Impacto por projeto | Projeto, R$/KM Real, Rem, Δ, Δ%, Impacto R$ |
| Árvore Combustível | Consumo por projeto | Projeto, Litros, R$ Total, Km/L |

### Tabela Visão Financeira — detalhes

- Colunas de mês: só os meses filtrados aparecem
- Totalizador por linha (`.total`) em negrito
- Colunas numéricas: `text-align: right`, formato `numFmt(v)`
- Hover highlight: `rgba(255,255,255,.035)`

### Tabela R$/KM — detalhes

```javascript
// Ordenação: decrescente por impacto (absoluto)
items.sort((a, b) => b.imp - a.imp);

// Coluna "Impacto" usa célula especial:
<td class="num imp-cell ${imp > 0 ? 'cr' : 'cg'}">${fmt(imp)}</td>
// imp > 0 = custo maior que remunerado = ruim = vermelho
```

```css
table.dre { font-size: 13px; }        /* foi aumentado de 12 para 13px */
table.dre tr.total td { font-size: 13px; }
td.imp-cell { font-size: 13px; }
table.dre tr.total td.imp-cell { font-size: 14px; }
```

---

## 14. KPI Cards e Hero

### Hero (KPI principal — fora de card)
```html
<div class="hero">
  <div class="hero-label">RECEITA LÍQUIDA</div>
  <div class="hero-value" id="hero-val">—</div>
  <div class="hero-deltas">
    <div class="hero-delta"><span>Δ Orç. %</span><b id="d-orc" class="cg">—</b></div>
    <div class="hero-delta"><span>Δ Rem. %</span><b id="d-rem" class="cg">—</b></div>
    <div class="hero-delta"><span>YoY %</span>  <b id="d-yoy" class="cg">—</b></div>
  </div>
</div>
```

```css
.hero-label   { font-size: 10px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: 1px; }
.hero-value   { font-size: 52px; font-weight: 800; color: var(--text); line-height: 1; }
.hero-delta   { font-size: 10px; color: var(--text2); }
.hero-delta b { font-size: 14px; font-weight: 700; display: block; margin-top: 2px; }
```

### Cards grid
```html
<div class="cards-row">   <!-- grid 5 colunas -->
  <div class="kpi-card">
    <div class="card-label">Orçado</div>
    <div class="card-value" id="c-orc">—</div>
    <div class="card-meta"><div class="card-meta-item">YoY: <b id="c-orc-yoy">—</b></div></div>
  </div>
</div>
```

```css
.cards-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 12px; }
.kpi-card  {
  background: rgba(20,27,38,.55); border: 1px solid rgba(255,255,255,.07); border-radius: 8px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 3px;
  backdrop-filter: blur(16px); box-shadow: 0 2px 12px rgba(0,0,0,.25);
}
.card-label   { font-size: 10px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: .5px; }
.card-value   { font-size: 24px; font-weight: 800; color: var(--text); line-height: 1.1; margin-top: 2px; }
```

---

## 15. Modo Claro / Escuro

```javascript
const _sun  = `<svg ...>`; // SVG sol
const _moon = `<svg ...>`; // SVG lua

function applyTheme(t) {
  document.body.classList.toggle('light-mode', t === 'light');
  localStorage.setItem('bi_theme', t);
  const b = document.getElementById('themeBtn');
  if (b) b.innerHTML = t === 'light' ? _moon : _sun;
  if (typeof lastF !== 'undefined' && lastF) renderCharts(lastF); // visao-financeira
}

(function() {
  const t = localStorage.getItem('bi_theme') || 'dark';
  applyTheme(t);
  document.getElementById('themeBtn').addEventListener('click',
    () => applyTheme(document.body.classList.contains('light-mode') ? 'dark' : 'light'));
})();
```

```css
body.light-mode .main { background: #F0F0F0; --text: #1a1a1a; --text2: #444444; --text3: #666666; }
body.light-mode .kpi-card, body.light-mode .card { background: #FFFFFF !important; border-color: transparent !important; }
body.light-mode .chart-card, body.light-mode .tbl-section { background: #FFFFFF !important; border-color: transparent !important; }
```

**localStorage keys:** `bi_theme` · `bi_user_name` · `bi_last_access` · `bi_last_user`

---

## 16. Autenticação — Supabase

```javascript
const SUPABASE_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

### Fluxos implementados

| Fluxo | Função Supabase |
|---|---|
| Login | `sb.auth.signInWithPassword({email, password})` |
| Cadastro | `sb.auth.signUp({email, password})` → confirmar por e-mail |
| Esqueci senha | `sb.auth.resetPasswordForEmail(email, {redirectTo})` |
| Redefinir senha | `sb.auth.updateUser({password})` → via evento `PASSWORD_RECOVERY` |
| Logout | `sb.auth.signOut()` |

### onAuthStateChange — eventos relevantes

```javascript
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session && !isRegistering && !isApproved)
    await checkApproval(session.user);   // ← !isApproved = fix do crash
  if (event === 'SIGNED_OUT') showAuth();
  if (event === 'PASSWORD_RECOVERY') {
    // mostra form-recovery, esconde form-login e form-forgot
  }
});
```

> **Importante:** `SIGNED_IN` dispara a cada ~55 min (refresh de token). Por isso a flag `isApproved` é essencial — sem ela, cada refresh chamava `checkApproval()` novamente e qualquer falha jogava o usuário fora.

### Tabela de aprovação (Supabase DB)

O hub verifica se o usuário está na tabela `approved_users` antes de mostrar os painéis. Usuários não aprovados ficam na tela "Aguardando aprovação".

```javascript
async function checkApproval(user) {
  const { data, error } = await sb.from('approved_users').select('*').eq('email', user.email).single();
  if (error || !data) {
    showPending(user);
  } else {
    showHub(user);
  }
}
```

### Configurações Supabase Dashboard

- Site URL: `https://fortesindicadores-byte.github.io/gestao-em-movimento/`
- SMTP: Resend (smtp.resend.com:465, user=resend)
- Email confirmation: ativado

### Erros traduzidos para PT-BR

```javascript
function traduzirErro(msg) {
  if (!msg) return 'Erro desconhecido.';
  const m = msg.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('user already registered')) return 'Este e-mail já está cadastrado.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (m.includes('user not found')) return 'E-mail não encontrado.';
  if (m.includes('weak password') || m.includes('should be at least')) return 'Senha muito fraca. Use pelo menos 6 caracteres.';
  if (m.includes('network') || m.includes('fetch')) return 'Erro de conexão. Verifique sua internet.';
  return msg;
}
```

---

## 17. Hub — Estrutura e Clusters

O hub (`index.html` raiz) tem duas telas:
- `#auth-screen` / `.auth-screen` → Login / Cadastro / Esqueci / Redefinir
- `#hub-screen` / `.hub-screen` → Grid de cards por cluster

### Clusters (ordem e painéis)

```
FINANCEIRO
  ├── Visão Financeira  → /visao-financeira/            (ATIVO)
  ├── Painel KM         → /painel-km/                   (ATIVO)
  └── R$/KM             → /rs-por-km/                   (ATIVO)

OPERACIONAL
  ├── Ativação de Frota → /eficiencia-ativacao/          (Em breve)
  ├── Disponibilidade   → /disponibilidade/              (Em breve)
  └── Combustível       → /combustivel/arvore-combustivel/ (ATIVO — mover para /combustivel/ quando sub-hub pronto)

PROCESSOS
  ├── Gerot             → (Em breve — sem pasta ainda)
  ├── Auditorias        → /auditorias/                   (Em breve)
  └── FCA               → /fca/                          (Em breve)

RESULTADOS
  ├── Prog. Reconhecimento → (Em breve)
  ├── Aderência ao FCA     → (Em breve)
  └── Painel de Metas      → /painel-metas/              (Em breve)
```

**Financeiro Pessoal** (`/financeiro-pessoal/`) — NÃO aparece no hub, acesso direto pela URL.

### CSS do hub (layout)

```css
.hub-main { padding: 36px 32px 80px; }  /* sem max-width */
.cards-grid { display: grid; grid-template-columns: repeat(3, minmax(200px, 300px)); gap: 14px; }
.category-title { font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 1.8px; }
.category-line { height: 1px; background: rgba(255,255,255,.05); flex: 0 0 auto; }
```

**Linha separadora** = mesma largura do grid de cards (calculada via JS):
```javascript
function syncCategoryLines() {
  document.querySelectorAll('.category').forEach(cat => {
    const grid = cat.querySelector('.cards-grid');
    const line = cat.querySelector('.category-line');
    if (grid && line) line.style.width = grid.offsetWidth + 'px';
  });
}
window.addEventListener('resize', syncCategoryLines);
setTimeout(syncCategoryLines, 100);
```

---

## 18. Atualização e Último Acesso

### Refresh automático
```javascript
async function atualizar() {
  set('status-badge', 'Carregando…');
  try {
    await fetchData();
    const now = new Date();
    set('status-badge', `Atualizado ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}`);
  } catch(e) {
    set('status-badge', 'Erro ao carregar dados');
  }
}
document.addEventListener('DOMContentLoaded', () => { initAccessLog(); atualizar(); });
```

### Último acesso (localStorage)
```javascript
function initAccessLog() {
  let name = localStorage.getItem('bi_user_name');
  if (!name) {
    name = prompt('Qual é o seu nome?') || 'Desconhecido';
    localStorage.setItem('bi_user_name', name);
  }
  const lastRaw  = localStorage.getItem('bi_last_access');
  const lastUser = localStorage.getItem('bi_last_user') || name;
  if (lastRaw) {
    const d = new Date(lastRaw);
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

---

## 19. Layout — Regras Gerais

- **Sem `max-width`:** todos os painéis usam `.main { padding: 20px 24px; }` sem `max-width` nem `margin: 0 auto`
- **Referência de layout:** `visao-financeira/index.html` — copiar como base para novos painéis
- **Mobile:** `@media(max-width: 768px)` para responsividade
- **Filtros mobile:** 3 filtros por linha para 5–6 filtros; 2 por linha para 4 filtros

---

## 20. Como Criar um Novo Painel

```
1. Copiar visao-financeira/index.html como base
2. Atualizar <title>, .brand h1, .brand p
3. Definir SHEET_ID e SHEET_TAB com a aba do Google Sheets
4. Implementar fetchData(), populateFilters(), applyFilters(), renderCharts()
5. .main sem max-width nem margin:0 auto
6. Adicionar back-btn no header-right (href="../" ou "../../")
7. Push via mcp__github__create_or_update_file (nunca git push para main)
```

**URL resultante:** `https://fortesindicadores-byte.github.io/gestao-em-movimento/{pasta}/`

---

## 21. Roadmap

### Painéis ativos
- [x] Visão Financeira (`/visao-financeira/`)
- [x] Painel KM (`/painel-km/`)
- [x] R$/KM (`/rs-por-km/`)
- [x] Árvore de Combustível (`/combustivel/arvore-combustivel/`)
- [x] Financeiro Pessoal (`/financeiro-pessoal/`) — acesso direto

### A criar
- [ ] Eficiência Km/L (`/combustivel/eficiencia-kml/`)
- [ ] Preço R$/L (`/combustivel/preco-litro/`)
- [ ] Consumo CO² (`/combustivel/consumo-co2/`)
- [ ] Sub-hub Combustível (`/combustivel/`) — quando 2+ painéis prontos
- [ ] Ativação de Frota (`/eficiencia-ativacao/`)
- [ ] Disponibilidade (`/disponibilidade/`)
- [ ] Gerot, Auditorias, FCA
- [ ] Programa de Reconhecimento, Aderência ao FCA, Painel de Metas
- [ ] Sub-hubs para clusters com múltiplos painéis

---

## 22. Dicas de Debugging

| Problema | Causa provável | Solução |
|---|---|---|
| `git push origin main` → 503 | Proxy local com nome antigo | Usar `mcp__github__create_or_update_file` |
| MCP precisa de autenticação | OAuth expirado | `mcp__github__authenticate` → URL → `mcp__github__complete_authentication` |
| Gráfico não re-renderiza no tema claro | `isLight` declarado depois do uso | Mover declaração `const isLight` para o início da função render |
| Usuário sendo expulso do hub | `onAuthStateChange` SIGNED_IN a cada 55 min | Flag `isApproved` (ver seção 4.1) |
| `Edit` tool falha com "File not read" | Arquivo não lido antes de editar | Chamar `Read` antes do `Edit` |
| SHA desatualizado no MCP push | `origin/main` ref local stale | `git fetch origin main` antes de `git checkout origin/main -- arquivo` |
| Unidade com `(INATIVO)` nos labels | nv3 format | Usar `getUniLabel()` com `.replace(/\s*\(INATIVO\)\s*/i, '')` |
