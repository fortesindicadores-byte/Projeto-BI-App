# Projeto BI App — Guia para o Claude

## Visão geral

Repositório central de todos os painéis de BI da empresa, em substituição ao Looker Studio.
Cada painel é um arquivo `index.html` autocontido — sem framework, sem backend, sem build step.

GitHub Pages: `https://fortesindicadores-byte.github.io/Projeto-BI-App/`

---

## Estrutura de pastas

```
Projeto-BI-App/
├── visao-financeira/       → Painel DRE Consolidado (ATIVO)
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

## Padrão visual obrigatório

```css
--bg:      #0C1017   /* fundo principal */
--card:    #141B26   /* cards */
--card2:   #1A2335   /* cards secundários */
--border:  #1E2D40   /* bordas */
--orange:  #F97316   /* cor primária — destaques, títulos, botões */
--blue:    #38BDF8   /* cor secundária — linhas remunerado */
--text:    #F1F5F9   /* texto principal */
--text2:   #94A3B8   /* texto secundário */
--green:   #3BB33B   /* positivo */
--red:     #FF6666   /* negativo */
```

- Fonte: **Montserrat** (Google Fonts)
- Gráficos: **Chart.js 4.4.0** via CDN
- Dados: embutidos no HTML ou via Google Sheets (fetchData com SHEET_ID)
- Sem framework CSS, sem React, sem Node

---

## Responsividade mobile

Breakpoint: `@media(max-width:768px)`

Regras obrigatórias para tabelas no mobile:
```css
table { table-layout: fixed; width: 100%; font-size: 1.6vmin; }
thead th { font-size: 1.6vmin; padding: 4px 2px; letter-spacing: 0; }
tr.total td { font-size: 1.6vmin; }
.grp-lbl { font-size: 1.6vmin; }
```

Gráficos: usar `ResizeObserver` ou recriar via `renderCharts(lastF)` no `window resize`.
Samsung S25 Ultra tem bug de orientação conhecido — não resolvível sem reload (tradeoff inaceitável).

---

## Padrão de filtros (visao-financeira como referência)

### Filtros disponíveis
| ID | Nome | Comportamento |
|---|---|---|
| `ms-ano` | **Ano** | **OBRIGATÓRIO em todos os painéis** — aparece sempre antes de `ms-vig` |
| `ms-vig` | Vigência | filtra tudo incluindo Receita Líquida |
| `ms-uni` | Unidade | filtra tudo incluindo Receita Líquida |
| `ms-nv3` | Projeto | filtra tudo incluindo Receita Líquida; usa prefixo antes do `-` |
| `ms-pac` | Pacotes | Receita Líquida sempre passa |
| `ms-cta` | Conta | Receita Líquida sempre passa |

### Filtro Ano — padrão obrigatório
Extrair anos das vigências após carregar os dados, sempre antes de construir `ms-vig`:
```javascript
// Vigência formato Date (visao-financeira):
const anos = [...new Set(vigs.map(d => String(d.getFullYear())))].sort().reverse();
buildMsFilter('ms-ano', anos);

// Vigência formato "MM/YYYY" (demais painéis):
const anos = [...new Set(vigencias.map(v => v.slice(-4)))].sort().reverse();
buildMsFilter('ms-ano', anos);
```
Adicionar check de ano em toda função de filtragem de linhas.

### Regra crítica
A **Receita Líquida deve sempre passar** nos filtros de Pacote e Conta (necessária para calcular AV%).
Nos filtros de Unidade e Projeto, ela é filtrada normalmente (lê receita da unidade/projeto).

### Helper de Projeto
```javascript
const getNv3Prefix = v => v ? v.split('-')[0].trim() : v;
```
Agrupa "ADMINISTRATIVO - CGR", "ADMINISTRATIVO - FLP" etc. em "ADMINISTRATIVO".

### Itens zerados no filtro
Projetos e Contas sem custo real/remunerado não aparecem nas listas:
```javascript
const hasCost = r => hasVal(r) && r[C.cta] !== 'Receita Líquida';
const hasVal  = r => Math.abs(+r[C.rem]) > 0 || Math.abs(+r[C.real]) > 0;
```

---

## Formatação de números

```javascript
const fmt    = v => /* auto: bi / mi / k / inteiro */
const fmtD   = v => /* com sinal + */
const pct    = v => v.toFixed(1) + '%'   // hero e cards
const pctInt = v => Math.round(v) + '%'  // colunas Δ% nas tabelas
const pp     = v => v.toFixed(2) + ' pp'
```

---

## Último acesso (localStorage)

Todos os painéis devem ter o badge de último acesso:
```javascript
function initAccessLog(){
  let name = localStorage.getItem('bi_user_name');
  if(!name){ name = prompt('Qual é o seu nome?') || 'Desconhecido'; localStorage.setItem('bi_user_name', name); }
  const lastRaw = localStorage.getItem('bi_last_access');
  if(lastRaw){
    const d = new Date(lastRaw);
    const lastUser = localStorage.getItem('bi_last_user') || name;
    // exibir badge: `Último acesso: DD/MM/YYYY HH:MM · Nome`
  }
  localStorage.setItem('bi_last_access', new Date().toISOString());
  localStorage.setItem('bi_last_user', name);
}
```

---

## Padrão Light/Dark Mode

Todos os painéis têm alternância de tema com botão lua/sol no `.header-right`.

### CSS obrigatório (após `.refresh-btn:hover`)
```css
.theme-btn{background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.3);border-radius:4px;padding:5px 7px;cursor:pointer;color:var(--orange);display:flex;align-items:center;}
.theme-btn:hover{background:rgba(249,115,22,.25);}
body.light-mode .main{background:#F0F0F0;--text:#1a1a1a;--text2:#444444;--text3:#666666;}
/* Cards: branco sólido + sombra sutil, sem borda */
body.light-mode .card,body.light-mode .kpi-card{background:#FFFFFF!important;border-color:transparent!important;box-shadow:0 2px 12px rgba(0,0,0,.10)!important;--text:#1a1a1a;--text2:#444444;--text3:#555555;}
/* Para painéis com .chart-card e .tbl-section (visao-financeira): */
body.light-mode .chart-card,body.light-mode .tbl-section{background:#FFFFFF!important;border-color:transparent!important;box-shadow:0 2px 12px rgba(0,0,0,.10)!important;--text:#1a1a1a;--text2:#444444;--text3:#555555;}
```

**Regras:**
- `body` NÃO muda — só `.main`. Header e filtros permanecem escuros.
- Cards: `rgba(255,255,255,.70)` + borda `rgba(0,0,0,.22)` + texto `#1a1a1a`.
- Cards com `color:` hardcoded (não CSS var): adicionar override explícito em `.kpi-card .elemento`.

### HTML — botão no `.header-right` (antes do `.refresh-btn`)
```html
<button class="theme-btn" id="themeBtn" title="Modo claro/escuro"></button>
```

### JS (ao final do `<script>`, antes de `</script>`)
```javascript
const _sun=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const _moon=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
function applyTheme(t){
  document.body.classList.toggle('light-mode',t==='light');
  localStorage.setItem('bi_theme',t);
  const b=document.getElementById('themeBtn');
  if(b) b.innerHTML=t==='light'?_moon:_sun;
  // Re-renderizar gráficos Chart.js para aplicar cores dinâmicas:
  if(typeof lastF!=='undefined'&&lastF) renderCharts(lastF); // visao-financeira
  // if(M.length) renderAll();                                 // financeiro-pessoal
}
(function(){
  const t=localStorage.getItem('bi_theme')||'dark';
  applyTheme(t);
  document.getElementById('themeBtn').addEventListener('click',
    ()=>applyTheme(document.body.classList.contains('light-mode')?'dark':'light'));
})();
```

### Cores dinâmicas no Chart.js
Qualquer cor hardcoded nos charts que precise mudar entre temas:
```javascript
// Em vez de constantes fixas, usar getters:
const getGrid=()=>({color:document.body.classList.contains('light-mode')?'rgba(0,0,0,.08)':'rgba(255,255,255,.06)'});
const getTick=(sz=10)=>({color:document.body.classList.contains('light-mode')?'#444444':'#94A3B8',font:{family:'Montserrat',size:sz}});
// Linhas brancas (ex: Orçado, Receita):
const orcC=isLight?'#999999':'#F1F5F9';
// Datalabels:
color:document.body.classList.contains('light-mode')?'#333333':'#F1F5F9'
// Legend:
const legend={labels:{color:isLight?'#1a1a1a':'#F1F5F9',...}};
```
`isLight` deve ser declarada **antes** de qualquer uso dentro da função render.

### localStorage
- `bi_theme` → `'dark'` | `'light'` (padrão: `'dark'`)

---

## Como criar um novo painel

1. Copiar `_template/index.html` para a pasta correspondente
2. Atualizar `<title>`, `.brand h1`, `.brand p`
3. Definir `SHEET_ID` e `SHEET_TAB` com a aba do Google Sheets
4. Implementar `fetchData()`, `populateFilters()`, `atualizar()`
5. Fazer push para `main` — GitHub Pages publica automaticamente

**URL resultante:** `https://fortesindicadores-byte.github.io/Projeto-BI-App/{pasta}/`

---

## Roadmap futuro

- Controle de acesso: login, níveis de usuário, log de sessões via **Supabase**
- Painéis a criar: Painel Km, Eficiência Km/L, Preço R$/L, Consumo CO², R$ por km, Disponibilidade, Reunião Mensal, Auditorias, FCA, Painel de Metas
