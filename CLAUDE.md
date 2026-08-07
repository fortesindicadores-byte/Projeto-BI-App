# Gestão em Movimento — Guia para o Claude

## Visão geral

Repositório central de todos os painéis de BI da empresa (Fortes Indicadores), em substituição ao Looker Studio.
Cada painel é um arquivo `index.html` autocontido — sem framework, sem backend, sem build step.

- **Repositório GitHub:** `fortesindicadores-byte/gestao-em-movimento` _(foi renomeado de `Projeto-BI-App`)_
- **GitHub Pages:** `https://fortesindicadores-byte.github.io/gestao-em-movimento/`
- **Hub principal:** `index.html` na raiz — contém autenticação Supabase + lista de painéis

> **Git push:** Hoje `git push origin main` **funciona** normalmente (deploy automático no GitHub Pages). _(Nota histórica: o repo foi renomeado de `Projeto-BI-App`; numa época o proxy local rejeitava o push e era preciso usar `mcp__github__push_files` — não é mais o caso.)_

> **SQL para o Supabase:** sempre que houver um script SQL para o Renan rodar (mesmo que já exista em `scripts/*.sql`), **colar o SQL completo direto no chat** — ele copia dali para o Supabase SQL Editor; não basta apontar o arquivo.

---

## Estrutura de pastas

```
gestao-em-movimento/
├── index.html              → Hub principal + Auth (Supabase) ← ATIVO
├── visao-financeira/       → Painel DRE Consolidado ← ATIVO, referência de layout
├── painel-km/              → Painel KM ← ATIVO
├── combustivel/
│   ├── arvore-combustivel/ → Árvore de Combustível ← ATIVO
│   ├── eficiencia-kml/     → (vazio)
│   ├── preco-litro/        → (vazio)
│   └── consumo-co2/        → (vazio)
├── financeiro-pessoal/     → Controle Financeiro Renan & Tati ← ATIVO (não aparece no hub)
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

## Hub principal (`index.html`) — Autenticação + Navegação

O `index.html` raiz é o hub central. Tem duas telas:
- **Auth screen** (`#auth-screen`): login / cadastro / esqueci senha / redefinir senha
- **Hub screen** (`#hub-screen`): grid de cards com os painéis, organizado por clusters

### Supabase (autenticação)
```javascript
const SUPABASE_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';
// CDN: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

**Configurações no Supabase Dashboard:**
- Site URL: `https://fortesindicadores-byte.github.io/gestao-em-movimento/`
- SMTP customizado: Resend (smtp.resend.com:465, user=resend, senha=API key da Resend)
- Email confirmation: ativado

**Fluxos implementados:**
1. Login com e-mail + senha (`sb.auth.signInWithPassword`)
2. Cadastro (`sb.auth.signUp`) — requer confirmação por e-mail
3. Esqueci senha (`sb.auth.resetPasswordForEmail`) — envia link via Resend
4. Redefinir senha (`sb.auth.updateUser({ password })`) — ativado pelo evento `PASSWORD_RECOVERY`
5. Logout (`sb.auth.signOut`)

**Erros traduzidos para PT-BR via `traduzirErro(msg)`:**
```javascript
function traduzirErro(msg) {
  if (!msg) return 'Erro desconhecido.';
  const m = msg.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('user already registered')) return 'Este e-mail já está cadastrado.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (m.includes('user not found')) return 'E-mail não encontrado.';
  if (m.includes('weak password') || m.includes('should be at least')) return 'Senha muito fraca. Use pelo menos 6 caracteres.';
  if (m.includes('network') || m.includes('fetch')) return 'Erro de conexão. Verifique sua internet.';
  return msg;
}
```

**Eye toggle (mostrar/ocultar senha):**
```javascript
function togglePass(id, btn) {
  const inp = document.getElementById(id);
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.innerHTML = show ? _eyeOff : _eyeOn;
}
```

**onAuthStateChange — eventos relevantes:**
```javascript
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) showHub(session.user);
  if (event === 'SIGNED_OUT') showAuth();
  if (event === 'PASSWORD_RECOVERY') {
    // mostra form-recovery, esconde form-login e form-forgot
  }
});
```

### Clusters do hub (ordem e conteúdo)

```
FINANCEIRO
  ├── Visão Financeira  → /visao-financeira/   (ATIVO)
  ├── Painel KM         → /painel-km/          (ATIVO)
  └── R$/KM             → /rs-por-km/          (Em breve)

OPERACIONAL
  ├── Ativação de Frota → /eficiencia-ativacao/ (Em breve)
  ├── Disponibilidade   → /disponibilidade/     (Em breve)
  └── Combustível       → /combustivel/arvore-combustivel/ (ATIVO — terá sub-hub quando múltiplos painéis prontos)

PROCESSOS
  ├── Gerot             → (Em breve)
  ├── Auditorias        → /auditorias/          (Em breve)
  └── FCA               → /fca/                 (Em breve)

RESULTADOS
  ├── Prog. Reconhecimento → (Em breve)
  ├── Aderência ao FCA     → (Em breve)
  └── Painel de Metas      → /painel-metas/     (Em breve)
```

**Financeiro Pessoal (`/financeiro-pessoal/`) NÃO aparece no hub** — é acesso direto pela URL.

### Layout do hub
```css
.hub-main { padding: 36px 32px 80px; margin: 0; }  /* sem max-width, alinhado à esquerda */
.category-header { display:flex; align-items:center; margin-bottom:16px; gap:0; }
.category-title { font-size:10px; font-weight:700; color:var(--text3); text-transform:uppercase; letter-spacing:1.8px; white-space:nowrap; padding-right:14px; }
.category-line { height:1px; background:rgba(255,255,255,.05); flex:0 0 auto; }
.cards-grid { display:grid; grid-template-columns:repeat(3,minmax(200px,300px)); gap:14px; }
```

**Linha separadora** tem largura igual ao grid de cards — calculada via JS:
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

**Layout dos painéis — sem max-width:** todos os painéis usam `.main{padding:20px 24px;}` sem `max-width` nem `margin:0 auto`, igual ao `visao-financeira`.

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

body.light-mode .card,
body.light-mode .kpi-card { background:#FFFFFF!important; border-color:transparent!important; box-shadow:0 2px 12px rgba(0,0,0,.10)!important; --text:#1a1a1a; --text2:#444444; --text3:#555555; }

body.light-mode .chart-card,
body.light-mode .tbl-section { background:#FFFFFF!important; border-color:transparent!important; box-shadow:0 2px 12px rgba(0,0,0,.10)!important; --text:#1a1a1a; --text2:#444444; --text3:#555555; }

body.light-mode .card td { color:var(--text); }
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
const orcC  = isLight ? '#999999' : '#F1F5F9';
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

---

## 10. Condicional de cores para custos

```javascript
// Para custos (ex: Realizado vs Remunerado):
const delta = rem - real;   // positivo = gastou mais = ruim
const bad   = delta > 0;
element.className = bad ? 'cr' : 'cg';

// Para receita (oposto):
const deltaRec = real - ref;
const badRec   = deltaRec < 0;  // receita menor que referência = ruim
```

```css
.cr   { color:var(--red)   !important; font-weight:700; }
.cg   { color:var(--green) !important; font-weight:700; }
.bad  { color:var(--red)   !important; }
.good { color:var(--green) !important; }
```

---

## 11. Formatação de números

```javascript
const numFmt = v => {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if(a >= 1e9) return s + Math.round(a/1e9) + ' bi';
  if(a >= 1e6) return s + Math.round(a/1e6) + ' mi';
  if(a >= 1e5) return s + Math.round(a/1e3) + 'k';
  return s + Math.round(a).toLocaleString('pt-BR');
};
const fmt    = v => numFmt(v);
const pctInt = v => (v >= 0 ? '+' : '') + Math.round(v) + '%';
const pctR   = (a, b) => b ? ((a/b-1)*100).toFixed(1)+'%' : '—';
const pp     = v => v.toFixed(2) + ' pp';
```

---

## 12. Tabelas — padrão clean

```css
.tbl-section {
  background:rgba(20,27,38,.55); border:1px solid rgba(255,255,255,.07); border-radius:8px;
  padding:18px 20px 16px; margin-bottom:16px;
  backdrop-filter:blur(16px); box-shadow:0 2px 12px rgba(0,0,0,.25);
}
.tbl-title { font-size:16px; font-weight:800; color:var(--text); margin-bottom:3px; }
.tbl-sub   { font-size:10px; color:var(--text2); margin-bottom:16px; }

table { width:100%; border-collapse:collapse; font-size:12px; }

thead th {
  background:transparent; color:var(--text); font-size:11px; font-weight:700;
  padding:8px 8px 12px; border-bottom:1px solid rgba(255,255,255,.10);
  text-transform:uppercase; letter-spacing:.5px; white-space:nowrap;
}

td { padding:13px 8px; border:none; color:var(--text); white-space:nowrap; }
tbody tr:hover { background:rgba(255,255,255,.035); }

tr.total td {
  color:var(--text); font-weight:700; font-size:12px;
  border-top:2px solid rgba(255,255,255,.12);
  padding-top:14px; padding-bottom:8px;
}
tr.total td.conta { font-weight:800; }
td.num { text-align:right; }
```

**Mobile:**
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
5. `.main` sem `max-width` nem `margin:0 auto` — layout full-width igual ao visao-financeira
6. Fazer push via `mcp__github__push_files` (ver nota no topo sobre git push)

**URL resultante:** `https://fortesindicadores-byte.github.io/gestao-em-movimento/{pasta}/`

---

## Árvore de Combustível — origem de cada card (meta: eliminar a aba `Árvore Comb.`)

Objetivo: montar a Árvore (`/combustivel/arvore-combustivel/`) puxando dados **direto das abas-fonte de cada painel**, para o usuário parar de manter a aba consolidada `Árvore Comb.`. Mapeamento definido pelo usuário (10/07/2026):

| Card na árvore | Origem (o que alimenta) |
|---|---|
| **Custo Combustível** (Rem/Real) | vem do **DRE** → mesma fonte da **Visão Financeira** |
| **KM Rodado** (Rem/Real) | vem do **Painel KM** |
| **R$/km** (Rem/Real) | **calculado**: apenas Custo Combustível ÷ KM Rodado (não tem fonte própria) |
| **R$/Litro** (Rem/Real) | vem do painel **R$/L** (`/combustivel/preco-litro/`) |
| **KM/L** (Rem/Real) | **já vem** do painel **Km/L** (`/combustivel/eficiencia-kml/`, aba `Km/L`) |
| **Decomposição · KM Rodado** (1ª Viagem, Recs, Noturnas, Virados) | aba **`Dispersão de km`** (base do Painel KM) — são **contagens de viagens**, não km |

**Decomposição — colunas e fórmula (aba `Dispersão de km`):** os quatro números são contagens de viagens.
- **Recs** = `Viagens Rec. Real` (col. Z)
- **Noturnas** = `Viagens Noturnas Real` (col. AC)
- **Virados** = `Viagens Mapa Aberto` (col. AM)
- **1ª Viagem** = `Viagens - Real` (col. W) − Recs − Noturnas − Virados

**Abas-fonte no workbook `Base Dispersão de km`** (mesmo `GV_ID`, tabs no rodapé): `De-Para · Dispersão de km · Consumo · Árvore Comb. · R$/L · Unidocs · Trechos sem KM · Ativos · Resumo Timeline CTEs`. `Dispersão de km` está nesse workbook (`GV_ID`) — puxa de lá. Na `Dispersão de km`: `Km Rem. TT` (AF) e `Km Rodado TT` (AG) alimentam o card KM Rodado (Rem/Real).

> **⚠️ ARMADILHA (bug real, corrigido 03/08/2026):** a aba `R$/L` do workbook `GV_ID` (Base Dispersão de km) é uma **cópia velha/incompleta** — só ~14-17 "Unidade Benner" cobertas, nunca teve GRL, NFR, ROTA-FLP em nenhum mês testado. A fonte CORRETA do preço remunerado é a aba `R$/L` do workbook **`KML_ID`** (`1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A`, mesmo do `Km/L`) — é o que o painel oficial `/combustivel/preco-litro/` sempre usou. A Árvore de Combustível apontava pro `GV_ID` por engano (corrigido: `gvFetchSheet(KML_ID,'R$/L')`). **NUNCA usar `gviz(GV_ID,'R$/L')` de novo** — só o `KML_ID`. VAN não tem preço remunerado em nenhum workbook (confirmado pelo Renan: proposital, sem preço médio por projeto).

**Custo Combustível (DRE / Visão Financeira):** workbook `1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8`, aba **`Frota`** (colunas `orc`=0, `rem`=1, `real`=2, `kmRem`=5, `kmReal`=6, `vig`=9, `uni`=10, `nv3`=11, `cta`=12). Custo Combustível = soma de `rem`/`real` das contas que caem no pacote **"Combustíveis"** (ver `PACOTES_MAP` no `visao-financeira/index.html`: Combustíveis Veículos e Equipamentos, Estorno de ICMS não Aproveitado, Fluídos (Arla), Arla, ICMS Crédito Presumido).

Situação atual do código: a Árvore lê a aba `Árvore Comb.` (`GV_ID=1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM`) para quase tudo, e já lê a aba `Km/L` (`KML_ID=1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A`) só para o card KM/L bater com o painel Eficiência.

**Como implementar com segurança:** os números precisam continuar batendo com a `Árvore Comb.` atual. Antes de trocar a fonte, inspecionar as abas reais (`Dispersão de km`, `R$/L`, `Frota`) via GitHub Actions (o sandbox não alcança docs.google), reproduzir os totais atuais e só então trocar.

---

## FCA & unidades — regras vigentes (ago/2026)

- **Unidades com tier:** CBA → `CBA T1` (Empurrada) · `CBA T1 WH` (Apoio/Empilhadeiras) · `CBA T2` (CDD); MCC → `MCC T1` (Empurrada) · `MCC T2` (CDI). Tier derivado do projeto: EMPURRADA→T1 · APOIO→T1 WH (só CBA) · demais→T2. A **RPM também é separada por tier**: a Base RPM vem por unidade do Gerot (`CUIABA EMPURRADA`/`CUIABA`/`CDD CUIABA`/`MACACU EMPURRADA`/`CDI MACACU`) e cai no recorte certo via `RPM_UNIT_MAP` do fca-preenchimento.
- **Acesso FCA multi-unidade:** `fca_profiles.unidade` é lista separada por vírgula (ex.: `CBA T1,MCC T1`); RLS via `fca_has_unit()` (scripts/split-cba-mcc.sql). Gestão por flags no Gerenciar Acessos do hub.
- **Custos por PACOTE (fca-preenchimento):** o fato gerado é o **pacote líquido** que estourou vs remunerado (`Pacote Manutenções` + `Desvio: ▲ R$ X · ▲ -Y%`); a **causa automática desdobra as contas** do maior desvio ao maior saving — ▲ estouro (vermelho) · ▼ saving (verde), coloridos nas visões de leitura via helper `tri()`. Combustíveis mantém os drivers (Dispersão de km + Km/L com bottom 3 placas + R$/L) antes das contas; Manutenções/Pneus trazem custo/placa ativa do pacote. Vale para as **próximas gerações**; o histórico por conta fica como está (não re-rodar `?gen=all` em vigência já gerada no modelo antigo — criaria os dois formatos).
- **Kanban primeiro:** fca-preenchimento, fca-consolidado E o **planner-corporativo** abrem no **Kanban** (botões Fatos/Tabela ao lado, padrão Planner); FCAs automáticos (sem ação) no topo das colunas, depois por vencimento; cards mostram prazo + badge de status + dias p/ vencer ou "vencida há Xd". Status inicial dos automáticos: `Não iniciada`.
- **Visão Gantt (04/08/2026):** botão **Gantt** no planner-corporativo, fca-preenchimento e fca-consolidado — componente compartilhado `assets/gantt-view.js` (`GanttView.html(items)`; item = `{id,label,tag,resp,status,start,end}`). Barra = criação (`created_at`) → prazo, cor do status (mesmas do Kanban), rastro vermelho tracejado = atraso (prazo→hoje), barra tracejada = sem prazo, linha "hoje". Clique na linha (`.gv-row[data-id]`) abre o modal do painel (delegação própria de cada painel). Alternância: Gantt ⇄ Kanban.
- **Farol · chip "Saída OS Crítica" (04/08/2026):** o hero dos faróis (renderHeroDots/unitStats em `farol-core.js`, stat `ck`) mostra o Checklist como binário — 0 saídas com OS crítica no mês de referência (regra do 3º dia útil) = **100%** verde; ≥1 = **0%** vermelho; sem coleta do robô = cinza. NÃO entra na média do hero (que segue sv/se/cf/pv/al/os/dp).
- **"(INATIVO)" nunca aparece:** mesclado na unidade/projeto base — dados via `scripts/limpar-inativo.sql`, telas via vassoura global no `assets/mobile.js`.
- **Mobile tipo app:** `assets/mobile.js` incluído em TODAS as páginas (zoom travado + tabela larga vira "+ Detalhar" no mobile). Páginas novas devem incluir o script.

## Robô Ginfo (Power BI → Farol) — em construção (ago/2026)

Automatiza a coleta dos dados que hoje são copiados manualmente do BI do Ginfo (`bi.ginfo.app.br`, Power BI homologado pela Ambev) para as abas que alimentam o Farol.

**Decisões fechadas com o Renan (02/08/2026):**
- Login: **usuário + senha simples** (sem MFA) — validar com o modo `login` do workflow. Tela: `https://bi.ginfo.app.br/login`, com **3 campos: Empresa (dropdown pesquisável = CONLOG) + E-mail + Senha** e botão "Entrar".
- Destino: **Supabase** (projeto do portal), tabela `ginfo_snapshot` (`scripts/ginfo-supabase.sql`) — leitura para logados, escrita só service_role.
- Escopo: **aba a aba** — o Renan vai mostrando cada aba do Ginfo e o mapeamento entra em `ABAS` no `scripts/ginfo-robot.mjs`.
- **Regra geral (02/08/2026): todo export vai SÓ para o Supabase** — o robô grava em `ginfo_snapshot` e apaga o xlsx; nada mais é colado no Sheets. Painéis/Farol passarão a ler essas bases do Supabase conforme cada aba for migrada. 1ª aba plugada: **`ativos`** (Detalhes Veículos do 1.1 DOCUMENTOS).

**Peças:** `scripts/ginfo-robot.mjs` (Playwright: login → menu "..." do visual → Exportar dados → xlsx → Supabase) · `.github/workflows/ginfo-robot.yml` (dispatch com modo login/run; **cron diário 7:00 BRT = `0 10 * * *` UTC, modo run** — mapeamento das 7 abas concluído em 02/08/2026; screenshots nos artifacts) · Secrets: `GINFO_USER`, `GINFO_PASS`, `GINFO_URL` (opcional), `GEM_SUPABASE_SERVICE_KEY`.

**O que é o Stress Test (contexto de negócio, 02/08/2026):** Frota = todo caminhão precisa rodar **pelo menos 1x por mês**. Empilhadeiras = toda empilhadeira precisa rodar **1x por quinzena, durante 24h, nos 3 turnos, com os checklists realizados**. Por isso a regra de período: **do dia 01 ao 10, sempre Mês = mês anterior** (Stress Tests e CIVF — avaliações do mês fechado); do dia 11 em diante fica o padrão da página (mês atual). Regra CONFIRMADA pelo Renan.

**Fluxo real hoje:** Ginfo (Power BI) → Renan copia manualmente → planilha **"Farol Semanal"** (Sheets, `FAROL_SHEET_ID`) → Farol lê as abas. O robô substitui o passo manual, aba a aba. Abas no rodapé da planilha: `De-para · Custos · Indisponibilidade · Disponibilidade · Ativos · Stress Test Veículos · Stress Test Empilhadeiras · CIFV · Preventivas · Alinhamentos · OS em Aberto`.

**Navegação no portal do Ginfo:** após o login cai em `/bi/inicio`; menu lateral esquerdo com seções expansíveis: **FROTA** (`1.1 - DOCUMENTOS · 1.2 - ADERÊNCIA CONFORMIDADE · 1.3 - ADERÊNCIA FROTA-031120 / FROTA-2ART / ARMAZÉM / APOIO / EMPURRADA · 1.4 - RESÍDUOS · 2.1 - INDISP. MANUT. VEÍCULOS · 2.1 - DISP. EMPILHADEIRA · 2.2 - PREVENTIVAS · …`), **STRESS TEST** (→ **STRESS TEST FROTA** e **STRESS TEST EMPILHADEIRA**, os dois relatórios usados no Farol), **CIVF** e **SEGURANÇA**. Os relatórios são Power BI embutidos com URL própria (`/bi/<guid>?autoAuth=true&ctid=…` — deep-link funciona); alguns dados exigem **drill-through** (botão direito num card → Drill-through → página de detalhe) antes de exportar.

**Receitas de coleta no Ginfo (conforme o Renan mostra):**
- **1.1 - DOCUMENTOS → Detalhes Veículos**: abrir pelo menu → botão direito no NÚMERO do card **VEÍCULOS** → Drill-through → **"Detalhes Veículos"**. A página de detalhe tem URL própria (`bi.ginfo.app.br/bi/99029b42-f690-451b-95b1-9fad2c9b670d?autoAuth=true&ctid=c16300de-7070-4b58-80c8-af99af1e1f65`) — robô tenta o deep-link direto; drill-through é o plano B. Na tabela (Filial | Projeto | Placa | Marca | Modelo | Tipo Veículo | Estado | Ano Fabricação — MESMAS colunas da aba **Ativos**), passar o mouse → botão **"..."** no canto do visual → Exportar dados. Cards da página: Total Veículos, Idade Média. Destino provável: base **Ativos** do Consolidado Geral (a confirmar com o Renan).

- **STRESS TEST FROTA** (menu STRESS TEST; URL provável `bi/ce4f37f8-1c4c-499f-a80c-3a3ce80594cb` — a confirmar): filtros Empresa/Regional/Filial/Tier/Projeto/Veículo/Ano/Mês/Quinzena/Placa. **Regra de período: até o dia 10 de qualquer mês** (antes das avaliações), selecionar no slicer **Mês = mês anterior** (ex.: Jul-26 no início de ago) e **Quinzena = Segunda** — o padrão "Mês Atual + Primeira" vem zerado no começo do mês. (Do dia 11 em diante: padrão da página, mês atual — confirmado.) Página tem cards (Veículos Freightech, Com/Sem Saídas, Stress Test %, Desconto…), tabela por Transportador, tabela por Filial e a tabela detalhada por placa (Período|Empresa|Filial Freightech|Placa|Projeto|Pallets|…|Justificativa|Status|Desconto) que alimenta a aba `Stress Test Veículos` do Farol.

- **STRESS TEST EMPILHADEIRA** (menu STRESS TEST; URL `bi/d1cead3d-e28a-487b-a1bd-8b72cdd6da55`): filtros Empresa/Regional/Filial/Tier/Contratada/Ano/**Mês**/Placa/Chassis Freightech — **sem slicer de Quinzena** (1ª e 2ª QZ são colunas). **Regra: até o dia 10, selecionar só Mês = mês anterior.** Exportar a tabela detalhada **"Análise Descontos"** (Prop. FT | Empresa FT | Filial FT | Filial GINFO | Filial FT x GINFO | Marca | Perfil | Placa Ginfo | Chassis | Contratada | Parada?/Status Just./Motivo/Desconto por quinzena | Desc. Total; o robô a acha pela coluna **"Chassis"**, única dela na página) → chave `stress-test-empilhadeira`, alimenta a aba `Stress Test Empilhadeiras` do Farol. SÓ essa tabela — confirmar antes de exportar qualquer outra desta página.

- **CIVF** (menu CIVF → CIVF; URL `bi/5bd5e3ac-7ebc-4c7b-963e-1c3d20ba4acd`): filtros Empresa/Regional/Filial/Tier/Status/Placa/Ano/**Mês**. **Regra: até o dia 10, Mês = mês anterior.** Exportar a **última tabela** da página (detalhada por veículo: Transportador | Filial Freightech | Veículo | Projeto | Data CIVF | Status | Manutenção | Lavação | Desconto Manutenção | Desconto Lavagem | Desconto Total) → alimenta a aba `CIFV` do Farol.

- **PREVENTIVAS** (menu FROTA → **2.2 - PREVENTIVAS**): exportar a **3ª tabela** da página (ordem visual, de cima p/ baixo), sem filtro — "..." → Exportar dados → alimenta a aba `Preventivas` do Farol (colunas E–U da planilha). As colunas A–D são fórmulas que o LEITOR recalcula: Placa Mercosul/Projeto/Unidade = PROCV na base `ativos` pela placa; **Aderência = regra da coluna A (confirmar a fórmula exata com o Renan quando plugar o painel)**.

- **ALINHAMENTOS** (menu FROTA → **3.4 - PNEUS**; URL `bi/3ab8927b-b1c5-4f10-8f36-dad6bb8a8a22`): exportar a tabela de alinhamentos (Filial | Placa | Próx. Even. | Status | Dias | Documento — tem o botão "Detalhes Alinhamentos" no rodapé; o robô a identifica pela coluna **"Documento"**, única da página) → aba `Alinhamentos` do Farol.

- **CHECKLIST / ADERÊNCIA 031120** (menu FROTA → **1.3 - ADERÊNCIA FROTA - 031120**; URL `bi/76e82774-d5d4-4cda-bb13-65a1a64387ef`; página "ADERÊNCIA FROTA" com Tipo=Saida + Origem=031120): botão direito no card **"SAÍDAS COM OS CRÍTICA"** → Drill-through → **"Detalhes Saídas Com OS Crítica"** → na página de detalhe, slicer **Mês** = nome COMPLETO minúsculo ("julho"; **até o 3º DIA ÚTIL do mês = mês anterior, depois = mês atual** — regra própria do Checklist, 03/08/2026; as demais abas seguem o dia 01–10) → "..." → Exportar dados. Colunas: Mapa | Data do mapa | Data OS | Início/Fim técnico | Problema | Nº OS | Tipo Checklist (Saída/Retorno) | Status | Filial | Motorista | Placa | Tipo Veículo | Projeto → chave `checklist-031120`. (NÃO usar a tabela da página principal — a coluna 'Motorista' acha o resumo Motorista×Aderência.) Alimenta o farol **"Checklist"**: card **"Saída com OS Crítica"** = linhas com Tipo Checklist = "Saída" no mês de referência (mesma regra dia 01–10) + tabela (Data | Motorista | Placa | Tipo Veículo | Projeto | Tipo Checklist | Status | Problema) — `loadChecklist()`/`renderChk()` no `farol-core.js`.

- **OS EM ABERTO** (menu FROTA → **2.4 - ORDEM SERVIÇO**; URL `bi/81e8f48c-09f2-4bc7-a84e-0718378732c9`): botão direito no card **"NÃO EXECUTADAS"** → Drill-through → **"Detalhes Ordem Serviço"** → exportar a tabela (Nº OS | Data | Status | Filial | Origem | Tipo | Criticidade | SLA Atendimento | SLA Serviço | Segmento | Fornecedor | Mecânico | Motorista | Placa) → aba `OS em Aberto` do Farol. A coluna A da planilha (**"Dias em Aberto"**) é fórmula `AGORA() − Data` (negativo → 0) — o leitor recalcula na exibição; o robô não grava.

**Farol lê do SUPABASE (02/08/2026) — Sheets é só FALLBACK:** `farolLoad()` busca `ginfo_snapshot` e converte cada base com um adaptador (`GADAPT`) que renomeia as colunas do export p/ os nomes que os leitores já usavam e recalcula as colunas de fórmula da planilha (regras confirmadas pelo Renan): **Preventivas** Aderência = Status "Vencido"→0 senão 1, Projeto = join com base `ativos` pela placa · **CIFV** Aderência = Desconto Total≠0→0 senão 1 · **Stress Test (V e E)** aderência = desconto 0→1 senão 0 (`stressVPct` mudou de COM SAÍDA p/ sem-desconto) · **OS** Dias em Aberto = hoje−Data (mín 0). Se uma base faltar/vier vazia → cai p/ a aba do Sheets. Datas de xlsx = serial do Excel → `parseFlex()`. Cada seção do Farol mostra na legenda a **"última exportação do Ginfo"** (updated_at da chave; `DATA.fonte` + `fx()` no renderFarol) ou "planilha (fallback)".

**Colunas reais dos exports (log do robô, 02/08/2026):**
- `ativos`: Filial | Projeto | Placa | Marca | Modelo | Tipo Veículo | Estado | Ano Fabricação
- `stress-test-frota`: Período | Empresa | Filial Freightech | Placa Freightech | Projeto | Pallets | Freightech | Última Saída | Origem | Destino | Saída | Saída na FIlial | **Viagens** (planilha: Total Viagens) | Justificativa | Status | Desconto
- `stress-test-empilhadeira`: Prop. FT | Empresa FT | Filial FT | Filial GINFO | Filial FT x GINFO | Marca | Perfil | Placa Ginfo | Chassis | Contratada | Parada? | Status Just. | Motivo | Desconto | "Parada? " | Status Just._1 | Motivo_1 | "Desconto " | Desc. Total (1ª/2ª quinzena = colunas duplicadas; a 2ª vem com sufixo/espaço)
- `civf`: Transportador | Filial Freightech | Veículo | Projeto | Data CIVF | Status | Manutenção | Lavação | Desconto Manutenção | Desconto Lavagem | Desconto Total
- `preventivas`: Placa | Marca | Modelo | Último Ciclo | Próximo Ciclo | Km/Hr Intervalo | Dias Intervalo | Última | Próxima | Km/Hr Última | Km/Hr Próxima | Km/Hr Atual | **Dias Próxima** | **Km/Hr Próxima_1** (= KM/HR P/ Próxima) | Status | OS Aberta | Filial (SEM Projeto/Unidade — join com `ativos`)
- `alinhamentos`: Filial | Placa | Próx. Evento | Status | Dias | Documento
- `os-em-aberto`: Nº OS | Data | Status | Filial | Origem | Tipo | Criticidade | SLA Atendimento | SLA Serviço | Segmento | Fornecedor | Mecânico | Motorista | Placa | Tipo Veículo | Data Início | Data Fim | Tempo OS | Observação | NPS | Avaliador | Valor Total
- `checklist-031120`: Mapa | Data do mapa | Data OS | Início técnico | Fim técnico | Problema | Nº OS | Tipo Checklist | Status | Filial | Motorista | Placa | Tipo Veículo | Projeto — via drill-through do card "SAÍDAS COM OS CRÍTICA" + slicer Mês (validado 03/08/2026, 23 linhas de julho). A tabela da página PRINCIPAL não serve (coluna Motorista acha o resumo Motorista×Aderência).

**Painel Ativos (`/ativos/`, cluster Visão Geral, 02/08/2026):** composição da frota lendo `ginfo_snapshot['ativos']` (precisa login do hub) — Qtde, Idade Média, faixas de idade, por unidade/tipo/modelo, tabelão do mais antigo p/ o mais novo. Estilo Disponibilidade.

**Abas mapeadas (conforme o Renan mostra):**
- **Custos** — FORA do escopo do robô: vem do DRE (manual) e será substituída pela **Carta de Custos** no futuro. Não mexer por enquanto. (Colunas: Δ ORÇ. | Δ FCT | Vigência | ESTRUTURA | UNIDADE | NÍVEL 3 | CONTA GERENCIAL | MÊS | ANO | ORÇADO | REMUNERADO | REALIZADO.)
- **Ativos** — automática (IMPORTRANGE do **Consolidado Geral**, mesmo workbook da Disponibilidade/`DISP_SHEET_ID`; colunas: Placa Mercosul | Filial | Projeto | Placa | Marca | Modelo | Tipo Veículo | Estado | Ano Fabricação). Papel: **base de-para por placa** — a aba Preventivas usa PROCV nela p/ preencher Projeto/Unidade, que o relatório do Ginfo NÃO traz → quando o robô exportar Preventivas, precisa reproduzir esse join (placa → Filial/Projeto via Ativos). Desejo futuro: **painel "Ativos/Frota"** no cluster Visão Geral (idade da frota, ativos por unidade/tipo/modelo).
- **Indisponibilidade** e **Disponibilidade** — FORA do escopo do robô Ginfo: já são automáticas. As unidades preenchem a indisponibilidade diária em planilhas próprias; um **Apps Script** consolida no Sheets **"Consolidado Geral"** e gera diariamente a aba de disponibilidade (compara indisponibilidades × ativos). Desejo registrado: **futuramente espelhar essas duas no Supabase** (job simples Sheets→Supabase, sem login — a planilha é link-readable; painéis Disponibilidade/Farol passariam a ler de lá).

Em paralelo: perguntar ao Ginfo se existe API/export oficial (trocaria o RPA por consulta estável).

## Robô Frota de Elite (Ginfo → Supabase, por vigência) — em construção (05/08/2026)

Automatiza a planilha **Frota de Elite** (`1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M`, hoje preenchida à mão a partir do Ginfo). Mesmo desenho do robô do Farol, com **duas diferenças**: coleta **mês a mês** e também o **acumulado do ano** (jan → mês de referência, ponderado pelo BI — não é média das médias).

**Peças:** `scripts/elite-robot.mjs` (Playwright) · `.github/workflows/elite-robot.yml` (dispatch `login`/`mes`/`backfill` + cron diário 7:30 BRT) · `scripts/elite-supabase.sql` → tabela **`elite_snapshot`** com PK `(indicador, vigencia, escopo)`, `escopo` ∈ `mes`|`ano`.

**Regras (Renan, 05/08/2026):**
- **Nomenclatura:** acabam "IV"/"IC" — tudo é **indicador**. Os ICs atuais são os únicos do Frota de Elite; os novos (Amplitude, MTBF/MTTR, OS Vencida, Blitz de Segurança, % Calibragem OK) entram **só no Gerot**, para gerar ação.
- **Atingimento = a própria aderência** em todos. O robô NÃO carimba meta — a estrutura de pesos do painel já está pronta.
- **Calendário:** roda todo dia do **dia 01 ao 15** gravando o **mês anterior fechado** + o acumulado do ano até ele; depois do 15 para e volta no dia 01. (≠ regra do dia 10 do Farol.)
- **Backfill a partir de 01/2026** (2025 não entra). Filtro de ano só no ano que vem.
- **MTBF e MTTR saem do mesmo relatório da Disponibilidade** (`2.4 - MTBF E MTTR`) — uma coleta, três indicadores.
- **API Prolog** (Amplitude, % Calibragem OK) já roda — reaproveitar.

**Mapa indicador → relatório (todos por Filial):**
| Indicador | Menu Ginfo | Período | Coluna |
|---|---|---|---|
| disponibilidade | FROTA → 2.4 - MTBF E MTTR | dropdown Ano+Mês | Disponibilidade Veículos (+ MTTR/MTBF) |
| preventivas | FROTA → 2.2 - PREVENTIVAS | datas "Data de Execução" (bloco VISÃO HISTÓRICA) | Aderência |
| pneus | FROTA → 3.4 - PNEUS | tiles ano+mês no rodapé (ctrl+clique p/ o ano) | Aderência Aferição |
| checklist-t2 | FROTA → 1.3 - ADERÊNCIA FROTA - 031120 | datas "Data" | Aderência |
| checklist-t1 | FROTA → 1.3 - ADERÊNCIA EMPURRADA | datas "Data" | **Aderência Saída** |
| checklist-wh | FROTA → 1.3 - ADERÊNCIA ARMAZÉM (**só EMPILHADEIRA**) | datas "Data" | **Aderência** (não a Aderência Ponto) |
| conformidade | FROTA → 1.2 - ADERÊNCIA CONFORMIDADE | dropdown Ano+Mês | Mensal ou Bimestral (regra abaixo) |
| stress-test-frota / -empilhadeira / civf | mesmas telas do Farol | dropdown Mês | aderência = desconto 0 → 1, senão 0 |
| sla-manutencao | FROTA → 2.4 - ORDEM SERVIÇO | datas "Data" | SLA Atendimento |

**Conformidade — regra do leitor:** PIRAI EMPURRADA, MACACU EMPURRADA, CUIABA EMPURRADA e CDD RIO DE JANEIRO usam **Aderência Bimestral** de **jan a jun**; as demais, **Mensal**. **De julho em diante, todas bimestral.** **As três empurradas só contam de mar/2026 em diante** (Renan, 07/08/2026): jan e fev ficam sem valor no mensal e nos IVs de conformidade (`confVale` no gerot-base). **Acumulado das empurradas ≠ escopo `ano`** (o jan→M do Ginfo inclui jan/fev contaminados — PIRAI dava 72% em vez dos 99,8% da tela mar→jul): o robô coleta a MESMA tela com Mês=mar→M e grava como indicador **`conformidade-mar`** (escopo `ano`, `soAno`/`mesInicial:2` no elite-robot, só 2026, vigências 03–12). O leitor (`marPrefix` no gerot-base) usa essas linhas para as empurradas em qualquer janela contígua que cubra março; janela começando depois de março cai na média mensal (approx). Sem mudança de schema — a PK `(indicador,vigencia,escopo)` já aceita.

**Três mecânicas de filtro** (o robô do Farol só tinha a primeira): `dropdown` (slicer Ano/Mês, com ctrl+clique para somar meses no acumulado) · `datas` (par de campos dd/mm/aaaa — escolhe o par mais próximo do rótulo, porque Preventivas tem dois pares) · `botoes` (tiles de ano/mês no rodapé dos Pneus, com seta "‹" para revelar meses fora da faixa). Período que não aplica **aborta a coleta** — nunca grava a tela no filtro errado por cima do dado bom.

**Iterar barato:** `ELITE_IND=disponibilidade` roda um indicador só; `ELITE_DE`/`ELITE_ATE` limitam o backfill; `ELITE_FORCAR=1` ignora a janela do dia 15; `refazer=true` (input do workflow, `ELITE_REFAZER=1`) recoleta o que já está gravado — sem ele o robô **pula** toda chave já existente em `elite_snapshot`.

**NADA DE "IV"/"IC" — é tudo INDICADOR (07/08/2026):** o leitor expõe **`GerotBase.INDICADORES`** (os indicadores-chave, iguais nas DUAS bases, lidos da MESMA fonte) e **`GerotBase.INDICADORES_GEROT`** (os adicionais, que só aparecem no Gerot e não pontuam no Frota de Elite). No painel do Gerot é **uma tabela só**, todas as linhas no mesmo estilo, com Meta / Real / % de Ating. / % Ating. YTD — sem seção separada e sem pílula "OK/Atenção". Campos sem prefixo `iv_` (`mttr`, `osVenc`, `blitz`, `prevFora`…), registros dos adicionais marcados com `soGerot:true` e `atg` = `meta/real` ('lower') ou `real/meta` ('higher'), via `atgDe()`.

**Indicadores adicionais SÓ NO GEROT (07/08/2026, plano do PPTX):** no painel Reunião de Planejamento Mensal — **OS Vencida** (contagem, planilha do Termômetro `10LRn3jrXEemqFiFAMbO8_bOLk98xrWTVXVUNDeQqLac`, col Q dos 4 tiers, somada Frota+Armazém por unidade; meta da regra: < 10) · **Blitz de Segurança** (col M do Transportes T2, só CDDs; meta 100%) — ambos por vigência `MM_Q`, valendo a Q2 do mês (senão Q1), via `loadTermometro()` no gerot-base. **MTTR/MTBF**: valores seguem do relatório "MTBF E MTTR" do Ginfo, meta = regra do termômetro (**melhor que o 3º quartil** das unidades na vigência — `metaMode:'quartil'`). **% Calibragem OK** (ex-"% Pressão"): meta corrigida para **≥ 98%** (regra do painel Calibragem, ±10% da ideal). **Amplitude**: meta 5mm (painel Milimetragem), já estava certa. Unidades do termômetro: Transportes T1 = MACACU/CUIABA/PIRAI (→ empurradas), WH T1 = CUIABA (→ CBA T1 WH), T2/WH T2 = nomes canônicos.

**LEITOR PLUGADO (06/08/2026):** `assets/gerot-base.js` lê o **elite_snapshot** (a planilha Frota de Elite saiu de cena; só o Combustível segue no Km/L via gviz). Contrato `records` mantido; `meta=null` e `atg = a própria aderência` (Renan: robô não carimba meta). Novo `GerotBase.acumFor(vigs)`: % por filial usa escopo `ano` quando a janela é jan→M (senão média mensal aproximada, com warn); stress/civf/pneus poolam as linhas mensais; comb Σkm/Σlitros. Consumidores: gerot (colunas de valor + YTD em acumulado), programa-reconhecimento (hero/cards/ranking/pódio em acumulado quando multi-vig; gráfico temporal segue mensal; cache v7 + hidratação em background), painel-metas (só ganhou o CDN do supabase; sua agregação própria de pontuação ficou como estava). De-para de filial dos exports = FIL2COD/refineCodG (cópia do farol-core); checklist-t1 força tier EMPURRADA (filial "CUIABA" na tela Empurrada é CBA T1, NÃO Armazém); checkWH usa a coluna `Aderência` exata (não `Aderência Ponto`).

**Pneus — fonte = aba `Pneus` do Sheets Frota de Elite (07/08/2026):** o Renan cola o export "detalhes" do Ginfo (CALIBRAGEM) na aba `Pneus` do workbook `1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M`: `Filial | Evento | Placa | Projeto | Período | Última Leitura | Status`. Cada linha = uma placa na vigência (coluna Período, "janeiro de 2026"); `Status = "Não Realizado"` → 0, senão 1. O leitor (`loadPneusSheet` no gerot-base) poola Σok/Σn por filial — mês e QUALQUER janela acumulada exatos, batendo com o Ginfo. Fallback: contagens da API no `elite_snapshot` (o robô continua coletando `pneus` como rede de segurança). IVs de pneus (amplitude/pressão/mm, Prolog) não mudaram.

**BACKFILL CONCLUÍDO (06/08/2026):** `elite_snapshot` tem 01→07/2026 completo nos dois escopos.
- **`mes`** — 11 indicadores × 7 vigências = **77/77**.
- **`ano`** — 9 indicadores × 7 vigências = **63/63**. Ficam de fora `pneus` (API: o leitor calcula qualquer janela) e `stress-test-empilhadeira` (a tela não acumula) — os dois com `semAcumulado:true`.

**O acumulado do ano é OBRIGATÓRIO e não se deriva** (Renan, 06/08): quando o painel filtra várias vigências, o número que vale é o acumulado. Para Disponibilidade, Preventivas, Conformidade, Checklists e SLA o valor mensal já é um percentual por filial — **média de médias ≠ acumulado ponderado**, que é o que o Ginfo calcula na tela quando se multisseleciona jan→mês. Só Stress Test e CIVF (linhas 1/0 por placa) e Pneus (API) é que o leitor pode somar sozinho. Por isso o escopo `ano` é gravado **por vigência**: filtrar jan→abr exige o acumulado até abril.

**Instabilidade conhecida do Ginfo:** ~8% das coletas falham por portal sem menu lateral, aba interna não encontrada ou campo de data ausente. O robô tenta 3× e aborta sem gravar. Para tapar buracos, redisparar o mesmo intervalo **sem** `refazer` — ele pula o que existe e refaz só o que falta.

**Fila do Actions:** em horário de pico o job pode ficar 15 min na fila sem runner e ser cancelado (`runner_id: 0`, sem log). Não é erro do robô nem cota (o repo é público) — é só redisparar.

## Robô Qlik (DRE → Custos) — EM ESPERA (03/08/2026)

**Status: PARQUEADO — decisão do Renan 03/08/2026.** O robô está 100% codificado (receita dos 5 passos abaixo), mas o Qlik Sense da Conlog **não é acessível pela internet**: `bi.conlogsa.com.br` público serve só o **GLPI** (chamados) — `/sense` dá 404 e a porta 4244 não responde de fora (split DNS: o Renan acessa pela rede interna/VPN). O GitHub Actions não alcança. Opções mapeadas: (1) TI publicar o Qlik externamente · (2) self-hosted runner na rede da Conlog · (3) script agendado no PC do Renan · (4) **ler direto do BANCO DE DADOS fonte do DRE — caminho que o Renan quer explorar no futuro**. Até lá: **aba Custos segue manual**. NÃO religar sem resolver a rede.

Substitui a aba **Custos** do Farol Semanal (única que ainda era manual, colada do DRE). Mesmo desenho do robô Ginfo: `scripts/qlik-robot.mjs` + `.github/workflows/qlik-robot.yml` (dispatch modo login/run) → grava em `ginfo_snapshot` (chave prevista: `custos-qlik`) → Farol/painéis leem de lá.

- **Servidor:** Qlik Sense Enterprise próprio da Conlog — `bi.conlogsa.com.br` (IP público 187.85.144.84; a porta 4244 aparece no gerenciador de senhas; auth com `qlikTicket` na URL). Login: conta de serviço formato `dominio\usuario` (Secrets `QLIK_USER`/`QLIK_PASS`; senha passou pelo chat em 03/08 → sugerir troca depois). `httpCredentials` no Playwright cobre NTLM; form de login coberto também.
- **Painel:** App **DRE Conlog I Oficial** → pasta **"ANALISE CONTAS FROTA - VIEW 2 - (FONTE DE DADOS RENAN)"** — URL `sense/app/2a9d3451-ce57-4a87-999d-df23c17c2a03/sheet/9b39dd9c-4c4b-48f7-817b-0d6b67c47e09`.
- **Receita (conforme o Renan mostra, em andamento):** a tabela só aparece após aplicar os filtros. Filtros no topo: ANO | MÊS | NÍVEL 1 | NÍVEL 2 | NÍVEL 3 | EMPRESA. Mecânica de seleção do Qlik: abrir o filterpane → clicar no valor → confirmar no **✓ verde**. Passo 1: **ANO** = ano do mês de referência. Passo 2: **MÊS** (valores "jan"…"dez" minúsculos) — **até o dia 10 = mês anterior, depois = mês atual**. Passo 3: **NÍVEL 1 = "1.3.1. OPERAÇÕES DEDICADAS AMBEV"** (texto truncado na tela → casar por "contém OPERAÇÕES DEDICADAS"). Passo 4: **Cód. Estrutura** — seleção múltipla pela **LUPA do cabeçalho da coluna** na tabela (digita o número, clica no valor exato, repete, ✓ verde): **ESTRUTURAS FROTA = 170, 171, 173, 174, 176, 177, 178, 180, 181, 183, 185, 186, 398, 572** (Nível 4; barra mostra "ESTRUTURA 14 de 366"; campo real do NÍVEL 1 = `desc_ope`). Passo 5 (export): **botão direito na tabela → "Exportar dados" → submenu (Voltar/como imagem/para PDF/dados) → "Exportar dados" de novo → caixinha "Exportação concluída" → clicar no hiperlink azul** ("Clique aqui para baixar seu arquivo de dados") → xlsx. Chave no Supabase: `custos-qlik`. Retry limpa TODAS as seleções antes (clique em valor já selecionado DES-seleciona no Qlik). A tabela tem as colunas: Cód. Estrutura | Unidade | … | NÍVEL 3 | CONTA GERENCIAL | MÊS | ANO | ORÇADO | REMUNERADO | REALIZADO. **Sem REMUNERADO no mês** → o LEITOR aplica a lógica de TENDÊNCIA da Carta de Custos (nota do Renan 03/08). _(Falta: qual visual exporta e por qual menu — aguardando print.)_
- Alvo: reproduzir as colunas da aba Custos (`Δ ORÇ. | Δ FCT | Vigência | ESTRUTURA | UNIDADE | NÍVEL 3 | CONTA GERENCIAL | MÊS | ANO | ORÇADO | REMUNERADO | REALIZADO`) — confirmar quais são fórmulas da planilha p/ recalcular na leitura.

## Próximas automações — Frota de Elite e RPM (anotado 04/08/2026, aguardando detalhes)

O Renan vai automatizar as bases **Frota de Elite** (programa-reconhecimento, hoje workbook `1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M` via GerotBase) e **RPM** (Base RPM do Gerot que alimenta o fca-preenchimento). Ele estava decidindo por qual começar porque **um indicador de um aparece no outro** (sobreposição entre as duas bases). Ele vai explicar aba a aba, como fez no robô Ginfo — ir salvando o mapeamento aqui conforme ele mostrar. Nada implementado ainda.

## Roadmap

**Painéis ativos:** Visão Financeira, Painel KM, Árvore de Combustível, Financeiro Pessoal (acesso direto)

**A criar:**
- Eficiência Km/L (`/combustivel/eficiencia-kml/`)
- Preço R$/L (`/combustivel/preco-litro/`)
- Consumo CO² (`/combustivel/consumo-co2/`)
- Sub-hub Combustível (`/combustivel/`) — quando múltiplos painéis prontos
- R$/KM (`/rs-por-km/`)
- Ativação de Frota (`/eficiencia-ativacao/`)
- Disponibilidade (`/disponibilidade/`)
- Gerot, Auditorias, FCA
- Programa de Reconhecimento, Aderência ao FCA, Painel de Metas
- Sub-hubs para clusters com múltiplos painéis

---

## Condução Econômica (gamificação do motorista) — visão de longo prazo

Painel em `/combustivel/conducao-economica/` (dentro do hub Combustível). **Clone do Frota de Elite** (`programa-reconhecimento/`) — mesma estrutura (hero "Pontuação Total Média", ranking, gráfico de evolução, tabela de Regras de Pontuação), mas **por MOTORISTA** e com indicadores de **condução econômica** no lugar dos do Gerot. **Sem pódio** (removido). Card no hub Combustível fica **visível só para admin** por enquanto (checa `fca_profiles.is_admin`). Hoje é **protótipo com dados de exemplo** (`generateRawRows()`), lendo só 2026.

**Pilares atuais (peso):** Faixa Verde de RPM 25 · Marcha Lenta/idle 20 · Aceleração 15 · Freada 10 · Velocidade 15 · Freio Motor & Banguela 10 · Câmbio 5. Score = média ponderada (0–100), redistribuindo o peso dos pilares ausentes. Freio Motor e Câmbio **só existem na vFleets** (Geotab não entrega → ficam ausentes). Cada célula mostra **pontos (grande) + resultado medido (pequeno)**, estilo termômetro. Pesos/indicadores só serão fechados **quando lermos a telemetria de verdade**.

**Duas telemetrias (cada motorista usa só UMA):**
- **Geotab MyGeotab** — JSON-RPC `POST /apiv1` (Authenticate → sessão 2 sem.; Get/GetFeed). Comportamento via ExceptionEvent (regras precisam estar habilitadas) + engine (RPM/idle/combustível).
- **vFleets / PS Latam "Condução Detalhada – DaaS"** — `GET https://api.vfleets.com.br/integrationcore-conducao/conducoes/detalhada?dia=YYYY-MM-DD`, token no header `Authorization`; **1 req/5 min**; agregado diário por motorista/veículo (CPF/CNH), muitos campos prontos (RPM em faixas, motorOcioso, aceleracoes, frenagens, velocidade em faixas, freioMotor, banguela, batendoTransmissao…). Endpoint `/processamentos` avisa dias reprocessados.

**Arquitetura combinada:** HTML público não pode ter segredo → **coletor** roda em **GitHub Actions (cron diário)** ou **Supabase Edge Function**, grava normalizado no **Supabase**; o painel troca `generateRawRows()` por leitura da tabela. De-para motorista ↔ unidade ↔ fonte (casar CPF/CNH do vFleets com Driver do Geotab).

**Roteiro em fases (definido pelo usuário):**
1. **Fase 1** — este painel de BI (ranking/score de condução econômica). ← em andamento
2. **Fase 2** — app do motorista: ele se cadastra e acompanha como está.
3. **Fase 3** — gamificação com dinheiro envolvido; app focado no motorista ver **quanto está deixando de ganhar**.
4. **Fase 4** — unir **condução segura + econômica** (aí entram os pilares de segurança: cinto, celular, colisão, fadiga…).
5. **Fase 5** — propor à **Ambev** usar o app e gamificar o **Brasil todo**, com piloto por **Geo**.
