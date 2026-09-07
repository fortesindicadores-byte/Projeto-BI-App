# Gestão em Movimento — Guia para o Claude

## Visão geral

Repositório central de todos os painéis de BI da empresa (Fortes Indicadores), em substituição ao Looker Studio.
Cada painel é um arquivo `index.html` autocontido — sem framework, sem backend, sem build step.

- **Repositório GitHub:** `fortesindicadores-byte/gestao-em-movimento` _(foi renomeado de `Projeto-BI-App`)_
- **GitHub Pages:** `https://fortesindicadores-byte.github.io/gestao-em-movimento/`
- **Hub principal:** `index.html` na raiz — contém autenticação Supabase + lista de painéis

> **Git push:** Hoje `git push origin main` **funciona** normalmente (deploy automático no GitHub Pages). _(Nota histórica: o repo foi renomeado de `Projeto-BI-App`; numa época o proxy local rejeitava o push e era preciso usar `mcp__github__push_files` — não é mais o caso.)_

> **TUDO QUE O RENAN VAI RODAR VEM COLADO NO CHAT** (regra dele, 04/09/2026:
> *"Traga sempre, mas absolutamente sempre, scripts, querys, tudo aqui para eu
> copiar e colar. A não ser que consiga fazer direto por mim. Senão aqui!"*).
> Vale para SQL do Supabase, query de banco, Apps Script, comando de terminal —
> qualquer coisa. **Apontar o caminho do arquivo no repositório NÃO conta**: ele
> não vai abrir o repositório para copiar. Versionar o arquivo continua certo,
> mas o conteúdo tem de aparecer no chat, inteiro, pronto para colar. A única
> dispensa é quando eu mesmo consigo executar — aí executo e não peço nada.
>
> **A query dos abastecimentos do ERP foi a TI que passou** para o Renan
> consultar o banco (`scripts/erp-abastecimentos-query.sql`). Não perguntar de
> novo de onde ela veio.

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

## Layout Laranja Moderno — referência visual (Renan, 15/08/2026)

Referência de layout que o Renan escolheu para usarmos: **`docs/layout-laranja-moderno.webp`** (abrir a imagem antes de desenhar qualquer tela nesse estilo). Quando ele disser *"faz no layout laranja moderno"*, é isso aqui.

**O que define o estilo:**

- **Fundo quente, não azulado.** A página é um marrom-escuro alaranjado (~`#1B1113`) com um brilho radial laranja discreto nos cantos — a mesma ideia do nosso `body`, mas puxando para o quente em vez do azul.
- **Shell de app**: rail estreito à esquerda **só com ícones** (logo laranja no topo, item ativo = círculo laranja preenchido, os demais em `--text3`), busca em **pílula full-width** no topo e, à direita, ícones em círculo (engrenagem, sino) + avatar.
- **Cards** `border-radius:18–20px`, fundo um degrau mais claro que a página com leve tinta quente, borda de 1px em `rgba(255,255,255,.06)`, sem sombra dura. **Cards dentro de cards** (o "Activity manager" tem sub-cards) — o interno é mais escuro que o externo, nunca mais claro.
- **Números grandes** (32–40px, peso 800) com o **delta pequeno em laranja logo ao lado**, na mesma linha da base — não embaixo.
- **Botões**: pílula 100% redonda. Ação principal = laranja preenchido; secundária = contorno em `rgba(255,255,255,.12)` com o texto claro. Ícones de ação (`+`, refresh, export, `⋮`) viram **círculos ghost** no canto superior direito do card.
- **Barras com gradiente vertical laranja → roxo** (`#F97316` no topo → `#7C3AED` embaixo), topo e base arredondados, valores negativos descendo abaixo do zero com o gradiente invertido. A barra em foco ganha um **ponto branco com anel** e um **tooltip-card flutuante** (fundo escuro, cantos 12px, uma bolinha colorida por série).
- **Donut** com o arco em laranja sobre trilho cinza-escuro e o valor no centro.
- **Sparkline** em área com o mesmo gradiente laranja→roxo e um ponto branco marcando o último valor.
- **Toggle de par** (ex.: "Top performance" / "Worst performance"): duas pílulas lado a lado, a ativa laranja preenchida.

**Como isso conversa com o que já temos:** o laranja é o mesmo `--orange:#F97316`; o roxo `#7C3AED` entra **só como fim de gradiente** em gráfico, não vira cor de dado. Tipografia continua Montserrat. Regra de cor de resultado (verde/vermelho) não muda.

---

## Layout 2 Moderno — referência visual (Renan, 15/08/2026)

Segunda referência escolhida pelo Renan (dashboard "Fintrixity"): **`docs/layout-2-moderno.png`**. Quando ele disser *"faz no layout 2 moderno"*, é este. **Não confundir com o "Layout Laranja Moderno"** — os dois usam laranja, mas a base é oposta.

**O que define o estilo:**

- **Preto neutro, não quente.** Fundo quase preto (~`#0D0D0D`), sem tinta marrom nem brilho radial. O laranja aparece **pontualmente**, como destaque, não como clima da tela.
- **Sidebar COM rótulo** (não é rail de ícones): painel arredondado um degrau acima do fundo, marca no topo (quadrado laranja arredondado + nome), busca com dica `⌘K`, seções nomeadas em caixa alta (`FEATURES`), **badge de contagem** em pílula escura à direita do item, item ativo = retângulo arredondado mais claro. No rodapé, um **card de destaque** ("Upgrade Pro!") com botão laranja.
- **Topo:** setas voltar/avançar, **breadcrumb** (`Fintrixity › Dashboard`), e à direita ícones em círculo (ajuda, e-mail, sino) + avatar + **botão laranja de ação** ("Share").
- **Cabeçalho de conteúdo:** título + subtítulo à esquerda, e à direita pílulas fantasma de controle ("This Month ⌄", "↻ Reset Data").
- **Fila de KPIs com UM card laranja.** Três cards lado a lado: o principal é **laranja preenchido com texto branco**, os outros ficam escuros. Cada um tem ícone em quadrado arredondado, título + subtítulo, valor grande, **chip de delta** (`+1.5% ↑`) e um **rodapé clicável** ("See details" / "View summary") com botão-seta circular na ponta.
- **Sub-cards em grade 2×2** dentro de um card (as carteiras), cada um com ícone, valor, linha fina de limite e **status como texto colorido** (verde = ativo, laranja-vermelho = inativo) + `⋮`.
- **Gráfico cinza com um único destaque laranja:** todas as barras em cinza-escuro e **só a barra em foco** ganha gradiente laranja→branco, ponto branco no topo e **tooltip-card flutuante** com as linhas do valor. É o oposto do Layout Laranja Moderno, onde todas as barras são coloridas.
- **Toggle de período** (Monthly/Yearly) em pílula escura com a opção ativa em laranja.
- **Tabela** com coluna de checkbox, busca e "Filter" no cabeçalho do card, ícone redondo ao lado do nome, **status em pílula** com bolinha (verde = concluído) e `⋮` no fim da linha.

**Resumo da diferença:** Layout Laranja Moderno = tela inteira quente, gráficos coloridos em gradiente laranja→roxo. Layout 2 Moderno = tela preta neutra e sóbria, com o laranja reservado para **um** card, **uma** barra e os botões de ação.

---

## Layout 3 Moderno — referência visual (Renan, 15/08/2026)

Terceira referência escolhida pelo Renan (dashboard "Metric Flow"): **`docs/layout-3-moderno.png`**. É o mais **analítico** dos três — o que mais se parece com um painel de BI de verdade.

**O que define o estilo:**

- **Grafite neutro** (~`#141518`), com a sidebar num painel arredondado à parte e todo o app dentro de um container de cantos arredondados. Laranja só no logo, no item ativo e nos dados.
- **Sidebar com rótulo**, item ativo = pílula escura com **ícone e texto laranja** e borda fina; no rodapé, `Settings` e `Help Center` separados do menu principal.
- **Topo:** busca em pílula larga à esquerda; à direita **seletor de período com ícone de calendário** ("Wed, 29 May 2024"), sino com bolinha vermelha e avatar.
- **Fila de 4 KPIs iguais** (nenhum card colorido, ao contrário do Layout 2): rótulo à esquerda, **chip de variação no canto superior direito** — verde `↗ +12.5%` / vermelho `↘ -4.3%`, com fundo tingido —, valor grande e, abaixo de um filete, a **legenda do período** em texto apagado ("From Jun 01,2024 To Jun 29, 2024").
- **Heatmap "Orders by time"**: grade de quadradinhos arredondados, linhas = horas, colunas = dias da semana, intensidade em degraus de laranja, **legenda de faixas com bolinhas** no topo do card (`200+ · 500+ · 1.000+ · 2.000+`) e células vazias com **textura hachurada** em vez de cor chapada.
- **Gráfico de linha com crosshair**: duas séries suaves (laranja = Real, azul = Meta), legenda com tracinhos no canto superior direito, **linha vertical tracejada** no ponto em foco com um ponto em cada série e um **tooltip-card flutuante** listando as duas com suas bolinhas.
- **Mini-cards em grade** ("Sales by Country"): bandeira, nome e valor grande com a unidade pequena embaixo; cabeçalho do card com link **"View All"** à direita.
- **Tabela limpa**: cabeçalho em caixa alta apagada, valores alinhados, e a coluna de variação com **seta + cor** (verde sobe, vermelho desce).

**Quando usar qual:** Laranja Moderno = vitrine, tela quente e colorida. Layout 2 = app sóbrio com um destaque só. **Layout 3 = painel denso de números** — é o que mais serve para os nossos (KPIs com chip de variação, heatmap, linha Real × Meta, tabela).

---

# ⭐ LAYOUT PADRÃO DO PORTAL (Renan, 15/08/2026) — usar em TUDO daqui pra frente

Decisão do Renan em 15/08/2026, vendo a `visao-financeira-app`: **"essa visão ficou sensacional, quero que seja o nosso novo padrão. Vamos aplicar em todos os painéis que já existem."** Referências vivas: **`visao-financeira/index.html`** (painel completo: menu lateral, filtros, cards, gráficos, tabelas, forecast editável) e **`index.html` da raiz** (a mesma casca **sem** menu lateral, com os clusters em lista/colunas). Os dois entraram no ar em 15/08/2026, substituindo o hub e o painel antigos. O `disponibilidade-preenchimento` foi onde a linguagem nasceu.

## A casca (app shell)

```css
body{background:var(--fundo);overflow:hidden;font-family:'Montserrat';font-size:13px;}
.app{position:fixed;inset:12px;display:flex;overflow:hidden;
  background:var(--app);border:1px solid var(--card-brd);border-radius:16px;
  box-shadow:0 24px 60px rgba(0,0,0,.45);}
.app::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:0;
  background:radial-gradient(ellipse at 12% 0%,rgba(249,115,22,.07),transparent 55%),
             radial-gradient(ellipse at 92% 100%,rgba(46,144,232,.06),transparent 55%);}
.app>*{position:relative;z-index:1;}
```
A página **não rola** — o app ocupa a tela e cada área resolve o próprio espaço com flex. O brilho laranja/azul é da moldura (`::before`), não do body.

## Tokens (substituem a paleta antiga nos painéis novos)

```css
:root{                                   /* escuro */
  --fundo:  radial-gradient(80% 60% at 90% 0%, rgba(255,244,232,.045), transparent 60%),
            linear-gradient(45deg,#202022 0%,#202022 100%);   /* UNIFORME, ver nota abaixo */
  --luz:      inset 0 1px 0 rgba(255,255,255,.09);
  --luz-card: inset 0 1px 0 rgba(255,255,255,.08);
  --app:      rgba(30,40,60,.34);   --side:  rgba(30,30,30,.50);
  --card:     rgba(44,44,46,.78);   --linha: rgba(255,255,255,.06);
  --card-brd: rgba(255,255,255,.07);
  --brilho:   linear-gradient(180deg,rgba(255,255,255,.022) 0%,rgba(255,255,255,0) 46%);
  --txt:#EEF2FA; --txt2:#B2BCD2; --txt3:#676F83; --txt4:#4C505C;
  --hover:rgba(255,255,255,.06); --cabec:#2B2B30;
  --azul:#2E90E8; --verde:#3BB33B; --vermelho:#FF5252; --laranja:#F97316; --ambar:#F4A100;
}
body.claro{                              /* claro */
  --fundo:  radial-gradient(80% 60% at 90% 0%, rgba(255,255,255,.35), transparent 60%),
            linear-gradient(45deg,#E1E2E5 0%,#E1E2E5 100%);
  --luz:      inset 0 1px 0 rgba(255,255,255,.9);
  --luz-card: inset 0 1px 0 rgba(255,255,255,1);
  --app:      rgba(255,255,255,.34);  --side:  rgba(255,255,255,.50);
  --card:     rgba(255,255,255,.74);  --linha: rgba(15,23,42,.10);
  --card-brd: rgba(15,23,42,.10);
  --brilho:   linear-gradient(180deg,rgba(255,255,255,.6) 0%,rgba(255,255,255,0) 46%);
  --txt:#161D2B; --txt2:#4A5568; --txt3:#737D91; --txt4:#8B94A6;
  --hover:rgba(15,23,42,.05); --cabec:#DCDFE6;
  --azul:#1B6FC4; --verde:#00B300; --vermelho:#FF0000; --ambar:#E9A400;
}
```
**Tema claro é classe `body.claro`** (não `light-mode`), chave `bi_theme`, botão sol/lua no topo. Cards usam `background:var(--side)` — o mesmo tom do menu lateral (regra do Renan). Tudo que é "um degrau acima" (painéis, chips, inputs) usa `--side`; nada de `rgba` chapado. **Não mexer no valor de `--side` para ganhar contraste** — já tentei e quebrou a regra; o contraste vem do fundo uniforme e da sombra do card.

**Menus suspensos são OPACOS** — token `--pop` (`#26262B` escuro / `#FFFFFF` claro). Filtro (`.ms-panel`), seletor de unidades do Gerenciar Acessos (`.farol-panel`) e a dica da lateral usam `--pop` com sombra em duas camadas. Com fundo translúcido dá para ler o card de baixo através do menu — foi exatamente o que aconteceu.

**São cores TRANSLÚCIDAS de propósito** — é o empilhamento `--fundo` → `.app` (com `backdrop-filter:blur(20px)`) → `--side`/`--card` (com blur próprio e `--luz-card`) que dá o vidro. Trocar por hex chapado mata o efeito (já aconteceu). A moldura leva `.app{position:absolute;inset:34px;border-radius:22px;box-shadow:0 28px 70px rgba(0,0,0,.55), var(--luz)}` — **a sombra forte vale nos dois temas**, não suavizar no claro — e o `body::after` com a textura de grão fica por cima do fundo.

## Menu lateral (painéis)

`.side{width:206px}` · `.side.mini{width:56px}` (chave `<painel>_mini`), com:
- `.s-top` — ícone + nome do painel + botão de recolher;
- `.s-sec` — rótulo de seção em caixa alta (`Visões`, `Atalhos`);
- `.s-item` — item com ícone 14px + rótulo; ativo = fundo `--hover` + texto `--txt`;
- `.s-user` no rodapé — avatar circular + nome + sair. **`.av` precisa de `.s-user .av`** para não virar elipse (o `.s-user div{flex:1}` vence pela especificidade);
- **dica ao passar o mouse quando recolhido**: um `.dica` `position:fixed` posicionado por JS no `mouseenter`.

## Topo e filtros

Barra fina com título + subtítulo à esquerda (`JUL/26 · atualizado …`) e, à direita, os filtros multi-select como **botões-texto fantasma** (`.ms-btn`) que abrem `.ms-panel` com busca e "Todos". Contagem em pílula laranja (`.ms-cnt`). Botão de tema no fim.

## Conteúdo

- `.vw` — uma seção por visão, `display:none` / `.on` visível; a navegação é `setVw(v)` + `TIT[v]` no título.
- **Cards de KPI**: `.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}` + `.kpi{padding:19px 16px;border-radius:11px;background:var(--side);border:1px solid var(--card-brd)}`, rótulo 9.5px caixa alta, valor 25px/800, meta 10.5px.
- **Gráficos**: `.card.gcard` com título, subtítulo, legenda própria (`.gleg`) e `.gcv` com o canvas. Sem grade, barras coladas, rótulo de dados no topo. **Série condicional (vermelho/verde) tem legenda NEUTRA** — o quadradinho só diz "isso é a barra".
- **Tabelas** (`table.dre`): cabeçalho sticky em `--cabec`, `td` 9px 12px, `.sep-l` separando blocos, drill de pacote → contas (`tr.pac-row` / `tr.sub-row.show`). **Totalizadores (Total, EBITDA) levam `background:var(--cabec)`** — mesmo tom do cabeçalho, nos dois temas. Δ em BRL **e** em % ficam em negrito.
- **Cores de resultado**: `table.dre td.cr,.cr{color:var(--vermelho)!important;font-weight:700}` (idem `cg`, `cr-t`, `cg-t`) — **o `!important` é obrigatório**, senão `table.dre td{color:…}` vence pela especificidade.
- **Célula editável** (forecast): `td.edit` com fundo laranja 7%, borda tracejada, foco com anel; `td.edit.changed` em laranja. Ao focar troca para o número cru; ao sair, `parseNum` aceita `-2,87 mi`, `566k` e pt-BR.

## Gerenciar Acessos (dentro do hub)

Mesma moldura do hub, com o botão **← Hub** no topo. A lista de usuários é uma **grade** (`repeat(auto-fill,minmax(430px,1fr))`) — em tela cheia dá três colunas, em vez de uma linha por usuário com meia tela vazia entre o nome e os botões. O card segue a regra dos outros: fundo `--side`, borda `--card-brd` e a sombra em duas camadas. **Remover/Bloquear ficam absolutos no canto superior direito** e as linhas de texto levam `padding-right`, para os seletores de Acesso FCA e Recebe Farol usarem a largura inteira do card sem quebrar linha.

## Hub sem menu lateral (`index.html` da raiz)

Mesma casca, **sem `.side`**: topo com marca + busca de painel + tema + usuário, e o miolo em `.board`. **Dois arranjos para o mesmo conteúdo**, alternados pelo botão `#btModo` no topo (chave `gem_hub_modo`):

- **LISTA (padrão)** — clusters empilhados. O cluster **não é um card**: é só a barra de título (rótulo em caixa alta + filete + contagem) com o **"+" que vira "−"**. Ao abrir, mostra os **cards inteiros**, do tamanho normal e com o resumo em até 3 linhas. A primeira visita abre todos (`gem_hub_abertos` ausente ⇒ todos) e, quando não couber, **quem rola é o `.board`, nunca a página** — por isso `.board.lista .clu{flex:0 0 auto}`, senão o flex column comprime os clusters e corta os cards em vez de rolar.
- **COLUNAS** — um cluster por coluna (`grid-template-columns:repeat(N,minmax(0,1fr))`, N = clusters visíveis). Tudo aberto numa tela só, sem rolagem — validado de 1280×720 a 1920×1080, com a densidade caindo por altura de tela (descrição em 3 linhas acima de 940px, 2 abaixo; paddings menores abaixo de 800px).

A busca do topo filtra os cards e esconde cluster vazio; no modo lista ela **abre sozinha** o cluster que tem resultado e devolve o estado do usuário ao limpar. Cluster **Administração** e o card **Planner Corporativo** só aparecem para admin. Os cards saem de um array `CLUSTERS` no JS, não são HTML solto.

## Regras que não se negociam

1. **Nada de rolagem em desktop** — se não coube, encolhe fonte/padding ou divide em mais visões (foi o que levou o YTG + TGT e o Forecast a virarem "Bridge / Cenário 1 / Cenário 2").
2. **Celular**: `@media(max-width:860px)` desliga o flex de altura (`display:block`), devolve `overflow:auto` no body, transforma o menu lateral numa fileira horizontal e dá altura explícita a gráfico e tabela — senão eles colapsam para 0.
3. Todo painel inclui `assets/mobile.js`, `assets/sortable-table.js` e `assets/excel-export.js` (o exportador já entende `.tab-wrap`, `.tsec`, `.rtit` e `.gcard`). **PNG no layout de vidro:** o exportador ACHATA as camadas translúcidas (fundo uniforme → `.app::before` → card) compondo o alfa nó a nó (`effOf` no excel-export.js) — sem isso o html2canvas pinta cada `rgba` sobre o fundo errado e o PNG sai azul-marinho com cards cinza (bug real, 15/08/2026). O achatamento só é exato porque o fundo é uniforme — mais um motivo para não voltar o degradê.
4. Nomes de visão em português curto e sem jargão de arquivo: *Análise Nominal · AH e AV · YTG + TGT · Bridge/Cenário 1/Cenário 2 · Forecast · Cenário 1/Cenário 2*. **A primeira visão de TODO painel chama-se "Resumo Gerencial"** (Renan, 16/08/2026) — nunca só "Resumo".
5. **NADA DE FUNÇÃO QUE SOME NA RECONSTRUÇÃO** (Renan, 16/08/2026): Excel, PNG, PDF, ordenação, mobile — tudo que o painel antigo tinha continua no novo. Antes de promover um clone, comparar a lista de `<script src>` do arquivo antigo (`git show <commit>^:<pasta>/index.html | grep "script src"`) com a do novo e explicar cada ausência. Foi assim que o PDF do Acessos ficou de fora.

6. **NÃO INVENTAR — NUNCA, ABSOLUTAMENTE NUNCA** (Renan, 17/08/2026): o padrão já está definido; migrar um painel é **trocar a apresentação pela do padrão**, não redesenhar. Nada de elemento novo que não existia no painel antigo e não está no padrão — foi o caso da barrinha de progresso que inventei na coluna Aderência do Ranking, que ele viu e perguntou "isso aqui você inventou?". Se algo parece faltar, **perguntar antes**; se algo do padrão não cabe, dizer no chat — mas não criar componente por conta própria. Vale em dobro depois de o padrão estar fechado.

**A PÁGINA é mais escura que o PAINEL** (15/08/2026): é essa diferença que faz o app flutuar. No escuro a página é `#121214` e a camada do `.app` **clareia** (`rgba(255,255,255,.045)` → miolo ~`#1d1d1f`); no claro a página é `#E1E2E5` e o `.app` é `rgba(255,255,255,.34)` (miolo ~`#eaebed`). Quando uniformizei o fundo mantendo o `--app` escuro, os dois ficaram no mesmo tom e o painel virou um buraco — o efeito de painel flutuante vinha do degradê, que colocava a moldura sobre a ponta clara. Ao mexer, medir os DOIS pixels: página e miolo.

**Fundo é UNIFORME, não degradê** (Renan, 15/08/2026): o degradê diagonal clareava para o canto superior direito e os cards de lá sumiam. Os dois temas param no tom do MEIO do degradê antigo — `#E1E2E5` no claro, `#202022` no escuro —, que é o que reproduz o miolo do painel (`#eeeef0` / `#1c1c1e` medidos no pixel). Ao mexer nisso, **medir o pixel do miolo nas duas telas**, não confiar no olho.

**Roteiro de aplicação:** hub e Visão Financeira migrados em 15/08/2026; **Acessos** e **Scorecard** em 16/08/2026. Faltam os demais painéis.

**DIRETO NO OFICIAL E PUBLICADO NA HORA** (Renan, 16/08/2026): o padrão já está definido, então não há mais etapa de validação antes de subir. Mexer no painel oficial, **fazer o merge no `main`** e **avisar no chat que publicou** — nada de PR parado em rascunho esperando "ok". Ele já olhou duas vezes uma tela velha porque a mudança estava num PR não publicado; se a mudança não está no `main`, ela não existe. Ao publicar, subir também o `<meta name="build">` para o `build-check` derrubar o HTML em cache.

**A migração é DIRETO NO PAINEL OFICIAL** (Renan, 16/08/2026) — acabou a etapa do clone `<painel>-novo/`. O método continua o mesmo (casca extraída por script, lógica de dados colada inteira, só a apresentação trocada), e o git é a rede de segurança: o painel antigo está no histórico e volta com um `git show <commit>^:<pasta>/index.html`.

## Exportações no layout novo (Excel · PNG · PDF) — 16/08/2026

Os três exportadores funcionam no layout padrão; o painel só precisa incluir os scripts **nesta ordem** (`excel-export.js` ANTES do `pdf-export.js`, que reaproveita o preparo dele):

```html
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"></script>   <!-- no <head> -->
...
<script src="../assets/mobile.js"></script>
<script src="../assets/sortable-table.js"></script>
<script src="../assets/excel-export.js"></script>
<script src="../assets/pdf-export.js"></script>
<script>initPdfExport({ btnContainer:'#pdf-slot', btnClass:'s-item', btnAoFim:true,
  title:'Acessos', subtitle:()=>document.getElementById('titSub').textContent, fileBase:'acessos',
  main:()=>document.querySelector('.vw.on'),
  views:()=>Object.keys(TIT).map(k=>({label:TIT[k], ativar:()=>setVw(k)})),
  viewAtual:()=>VW, irPara:setVw,
  isLight:()=>document.body.classList.contains('claro'), setTheme:aplicaTema });</script>
<script src="../assets/build-check.js?v=AAAAMMDDHHMM"></script>   <!-- + <meta name="build"> no <head> -->
```

- **O "Gerar PDF" fica em ATALHOS, na lateral** (Renan, 16/08/2026) — não no topo e não junto das visões. O painel só põe um `<div id="pdf-slot"></div>` dentro do bloco `Atalhos` e passa `btnClass:'s-item'`; a lateral recolhida já reduz o item a ícone sozinha. **O menu suspenso mora no `<body>`**, não no wrap: dentro do `.app` (que tem `backdrop-filter`) um `position:fixed` se ancora no `.app` e não na tela, e o menu aparecia 34px fora do lugar.
- **UM SLIDE POR VISÃO** (Renan, 16/08/2026): como as visões já são do tamanho da página, cada slide é o **painel inteiro, com o menu lateral recolhido** — o PDF fica igual à tela. O fundo do slide é o tom uniforme da página do portal (`H2CPrep.fundoDe(body)`), e as camadas translúcidas são ACHATADAS na captura (sem isso, no tema claro o card branco sobre fundo branco some). Página 1 é a capa (título, subtítulo, filtros aplicados, data). Acessos = 5 páginas, Visão Financeira = 9.
- **Tabela que não coube gera uma página extra** com ela inteira (`tabelasCortadas()` detecta `scrollHeight > clientHeight`), para o relatório não perder linhas silenciosamente.
- **`filters-toggle.js` NÃO entra**: só age sobre `.header-filters`/`.dim-toggle`, que não existem no layout novo. É o único script do painel antigo que não volta.

**Duas armadilhas do html2canvas 1.4.1 (bugs reais, achados em 16/08/2026 e corrigidos no `assets/excel-export.js`, que expõe `window.H2CPrep` p/ os dois exportadores):**

1. **`color-mix()` ABORTA a captura.** O Chromium computa `color-mix(in srgb, …)` como `color(srgb r g b / a)`, e o html2canvas morre com *"Attempting to parse an unsupported color function"* — o PNG/PDF inteiro falha, não é degradação. Usamos `color-mix` no calor do calendário, no farol e nas linhas tingidas. O `normCor()` converte `color(srgb …)` → `rgba()` (é a mesma base, conversão exata) e o valor entra no clone via `data-h2c-*`.
2. **`box-shadow: inset` vira um bloco chapado.** O filete de luz dos cards (`--luz-card: inset 0 1px 0 rgba(255,255,255,.08)`) era pintado como uma faixa clara cobrindo metade do card. O `semInset()` remove só as camadas `inset` e mantém as de fora.

**Como migrar um painel (método validado no Acessos):** clonar a pasta, **extrair a casca do CSS da `visao-financeira` por script** (do `<style>` até `/* ── YTG + TGT ──` mais o bloco `@media(max-width:860px)`) em vez de reescrever de memória, colar a lógica de dados do painel antigo e trocar só a apresentação: `shell()` sai (o HTML passa a ser estático), `gate()` escreve em `#cols`, `light-mode` vira `claro`, tabelas ganham `class="dre"`, o status vai para `titSub` e entram `setVw`/`trocaMini`/`dica`/`aplicaTema` (chave **`bi_theme`**, a mesma do hub). Depois o Renan valida o clone e só então ele substitui o oficial.

**A sobra de altura é DIVIDIDA — nunca `max-height:none` no `.gr2`** (Renan cobrou 3×): o `.gr2` da casca trava em `44vh` porque lá embaixo há tabela; numa visão em que o gráfico é o miolo dá vontade de tirar o teto, e aí TODA a sobra vai para o gráfico e os cards ficam achatados. O certo é dar altura própria à fileira de cards (`min-height:clamp(112px,16.5vh,170px)` + `justify-content:center` no `.kpi`) e **manter um teto no gráfico** (`max-height:56vh`). Em 1600×900 isso dá ~150px de card e ~480px de gráfico; em 1366×768, ~127 e ~377.

**Regras que saíram da validação do Acessos:** cabeçalho de tabela **sempre alinhado com o conteúdo** (texto à esquerda, número à direita — a casca alinha tudo à direita, o que só serve para tabela numérica) · **nunca barra de rolagem horizontal** (a tabela se ajusta; coluna que estoura vira dica na linha) · fileiras de baixo usam **a mesma grade e o mesmo gap dos cards**, para as bordas baterem · a sobra de altura é **dividida** entre cards e gráficos, nunca despejada num só · eixo Y **justo ao pico** (`suggestedMax` ≈ pico × 1,12), senão o gráfico parece alto e vazio.

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
- **TODA tabela nova com `unidade` usa `fca_has_unit()`, NUNCA `= fca_my_unit()`** (bug real, 24/08/2026): a `carta_custos` tinha ficado com a regra de unidade única, que compara a unidade da linha com a STRING INTEIRA do perfil (`'MCC T1' = 'MCC T1,MCC T2'` → false). Sintoma: quem tem UMA unidade lança normal, quem tem DUAS não consegue (e, se o SELECT também estiver assim, nem enxerga os lançamentos). Eram 7 perfis afetados, não um. Corrigido por `scripts/carta-custos-rls.sql` (recria as 4 policies, inclusive a de SELECT — o `split-cba-mcc.sql` só trocava as de escrita, e só se a tabela já existisse na época). Auditoria: workflow **Carta RLS Check**. A TELA não tem culpa nesse tipo de caso — validado com um perfil `MCC T1,MCC T2`: a carta abre, escolhe a 1ª unidade e manda o insert certo; quem barra é o banco.
- **Custos por PACOTE (fca-preenchimento):** o fato gerado é o **pacote líquido** que estourou vs remunerado. **As CONTAS ficam DENTRO DO FATO** (Renan, 14/08/2026): `Pacote Combustíveis` + `Desvio: ▲ R$ X · ▲ -Y%` + `Contas:` + uma linha por conta, do maior desvio ao maior saving — ▲ estouro (vermelho) · ▼ saving (verde) via helper `tri()`. A **CAUSA nasce VAZIA**, para a unidade escrever o porquê. Saíram os drivers de Combustíveis (Dispersão de km, Km/L com bottom 3 placas, R$/L) e o custo/placa ativa de Manutenções/Pneus — viravam miscelânea; o driver fica no painel do indicador (por isso a geração não baixa mais `Dispersão de km` nem `Km/L`). O `fato_desvio` passou a ter **várias linhas**: `stripTags` converte `<br>`→`\n` e preserva as quebras, e as telas renderizam `\n`→`<br>`. **Estorno de ICMS não Aproveitado e ICMS Crédito Presumido NÃO são do pacote Combustíveis** — vão para `ICMS`, como na Visão Financeira (o `EXCL` do pushDRE tinha a chave sem o "DE" e nunca casava, por isso o Estorno aparecia).
- **Desvios da RPM = os INDICADORES DO GEROT abaixo da meta (Renan, 14/08/2026):** o botão "Desvios da RPM" NÃO lê mais a aba `Base RPM` do Sheets (ficou sem apuração de jul/2026 em diante — 546 linhas/mês com `% de Ating.` vazio — e por isso não gerava nada). A fonte é a MESMA do painel Gerot: `assets/gerot-base.js` → `elite_snapshot`. Regra: **qualquer indicador com `atgMeta` < 100% vira FCA** (chave e adicionais), na **última vigência com dados** (ou `?sync=rpm&vig=YYYY-MM`), unidade/projeto pelo `RPM_UNIT_MAP`, fato = nome do indicador, `fato_desvio` = `Meta: X | Real: Y | Ating: Z%` no formato do indicador (%, contagem, hh:mm, mm, km/L), causa vazia. Aditivo pela chave vig+RPM+projeto+fato: rodar todo mês acumula.
- **Combustível NÃO gera FCA de RPM** (Renan, 14/08/2026): é tratado no pacote Combustíveis dos Custos. O `field==='comb'` é pulado no `desviosDoGerot`.
- **Filtro Indicador/Conta** (fca-preenchimento e fca-consolidado): lista as CONTAS que aparecem nas linhas `- Conta: ▲ …` dentro do fato (Custos) e o nome do indicador (RPM) — dá para achar todo FCA que tem Arla estourando, por exemplo.
- **Admin edita o FATO:** no modal do fca-consolidado (Kanban/Gantt) o Fato e o desvio são campos editáveis, como já eram na visão Tabela.
- **Kanban primeiro:** fca-preenchimento, fca-consolidado E o **planner-corporativo** abrem no **Kanban** (botões Fatos/Tabela ao lado, padrão Planner); FCAs automáticos (sem ação) no topo das colunas, depois por vencimento; cards mostram prazo + badge de status + dias p/ vencer ou "vencida há Xd". Status inicial dos automáticos: `Não iniciada`.
- **Visão Gantt (04/08/2026):** botão **Gantt** no planner-corporativo, fca-preenchimento e fca-consolidado — componente compartilhado `assets/gantt-view.js` (`GanttView.html(items)`; item = `{id,label,tag,resp,status,start,end}`). Barra = criação (`created_at`) → prazo, cor do status (mesmas do Kanban), rastro vermelho tracejado = atraso (prazo→hoje), barra tracejada = sem prazo, linha "hoje". Clique na linha (`.gv-row[data-id]`) abre o modal do painel (delegação própria de cada painel). Alternância: Gantt ⇄ Kanban.
- **Farol · chip "Saída OS Crítica" (04/08/2026):** o hero dos faróis (renderHeroDots/unitStats em `farol-core.js`, stat `ck`) mostra o Checklist como binário — 0 saídas com OS crítica no mês de referência (regra do 3º dia útil) = **100%** verde; ≥1 = **0%** vermelho; sem coleta do robô = cinza. NÃO entra na média do hero (que segue sv/se/cf/pv/al/os/dp).
- **"(INATIVO)" nunca aparece:** mesclado na unidade/projeto base — dados via `scripts/limpar-inativo.sql`, telas via vassoura global no `assets/mobile.js`.
- **Mobile tipo app:** `assets/mobile.js` incluído em TODAS as páginas (zoom travado + tabela larga vira "+ Detalhar" no mobile). Páginas novas devem incluir o script.

## Fundo dos painéis (`assets/fundo.css`)

**DESLIGADO hoje (Renan, 10/08/2026): nenhuma página inclui o arquivo** — o hub voltou ao fundo liso de gradiente. O `<link>` está comentado no `index.html` da raiz; para religar, basta devolver a linha. O arquivo e a imagem continuam no repositório.

O CSS controla o **modo escuro**: `--gem-foto` (a imagem) + `--gem-scrim` (o escurecedor por cima). Quem quiser o fundo inclui `<link rel="stylesheet" href="assets/fundo.css">`. Os painéis ficam sem imagem de propósito (Renan, 08/2026), porque tela de número pede fundo liso. A URL da imagem é **relativa ao CSS** (`url('img/…')`), por isso serve igual em `/gerot/` e em `/combustivel/seara/arvore/`. Só mexe no escuro — `body.light-mode` fica intacto. Usa `!important` porque cada painel declara o próprio `body{background}` inline. Cards NÃO são tocados de propósito (cada painel tem o seu). A imagem é `assets/img/fundo-conlog.jpg` (caminhão de neon da CONLOG na estrada). **Imagem colada no chat não vira arquivo em disco** — o diretório de uploads só recebe anexos; quando precisar dos bytes de uma imagem colada, extraia do transcript da sessão (`/root/.claude/projects/<projeto>/<sessao>.jsonl`, blocos `{"type":"image","source":{"type":"base64"}}` nas mensagens do usuário).

**FILTRO NA ABA DO SHEETS ESCONDE DADO DO PAINEL (24/08/2026):** se alguém deixa um filtro aplicado na aba, o gviz devolve **só as linhas visíveis** — sem erro, sem aviso. Sintoma: cards zerados para todo recorte que "sumiu". Foi o caso da Árvore de Combustível, em que KM/L e R$/L vieram 0,00 enquanto Custo e KM Rodado traziam valor: a aba `Km/L` estava filtrada e o gviz entregou 32 linhas (só `ROTA - MCC` de jul/2026) das milhares que existem. **Antes de caçar bug no código, conferir se a aba está filtrada.** O workflow **KmL Aba Inspect** (`scripts/kml-aba-inspect.mjs`) mostra em segundos quantas linhas, vigências e projetos a aba está entregando; o **Arvore Comb Inspect** compara os rótulos de projeto das três fontes da Árvore.

## Snapshot do gviz (abertura rápida de TODOS os painéis) — 19/08/2026

Renan aprovou ("pode fazer todos"): a abertura dos painéis não espera mais o gviz do Google (1–4s/aba). Três peças:

- **`gviz_snapshot`** (scripts/gviz-snapshot.sql): tabela com o TEXTO CRU da resposta gviz por chave `"<sheet_id>|s=<aba>|g=<gid>|q=<tq>|h=<headers>"`. Leitura aberta (anon+auth — é o mesmo dado que o gviz já serve público); escrita só service_role.
- **Robô** (`scripts/gviz-robot.mjs` + workflow **Gviz Robot**, cron de hora em hora): baixa a lista `ALVOS` (~30 abas: DRE Frota/EBITDA, Dispersão de km, Árvore Comb., Km/L, R$/L, DPO/Demarco/FCA Total, Base RPM/ICs, tiers do Termômetro ×2, Seara ×3, Pneus do Elite, Manutenção, Base da Tendência) e faz upsert. Falha parcial não derruba o job (o shim cai p/ o Google). **Só regrava quando o conteúdo MUDOU** (21/08/2026, depois do aviso de Disk IO Budget do Nano no dashboard): o robô compara o md5 com a coluna `hash` e, se igual, faz só um PATCH no `updated_at` (o corpo de MBs fica intacto — poupa o WAL/TOAST); sem a coluna `hash` no banco, cai no upsert de sempre. **522 em massa = o PROJETO Supabase fora do ar** (visto em 21/08/2026: incidente do Supabase + projeto Unhealthy) — o robô vira o termômetro: run verde de novo = voltou.
- **`assets/gviz-cache.js`** (incluído no `<head>` de todas as páginas, como o mobile.js): intercepta fetch **e JSONP** (`responseHandler`) do docs.google.com e responde do snapshot em ~200ms. Regras: só age nos **primeiros 15s** da página (o botão "Atualizar dados" e os setInterval vão DIRETO ao Google — dado colado agora aparece no refresh manual); snapshot >3h, Supabase lento (>1,2s), chave fora da lista ou qualquer erro → o pedido segue ao Google como sempre. `window.GvizCache.{hits,misses}` p/ conferir no console.

**Como adicionar um alvo novo:** entrada em `ALVOS` do gviz-robot.mjs com os MESMOS parâmetros que o painel manda (sheet/gid/tq/headers têm de casar byte a byte — a chave é exata). **financeiro-pessoal fica FORA de propósito** (dados pessoais não entram no snapshot compartilhado — a página nem inclui o shim). Validado com Playwright: painel-km renderiza 100% do snapshot com o Google bloqueado (fetch e JSONP), números conferidos na mão.

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

**PORTAL NOVO — "GINFO Analytics" (27/08/2026):** o Ginfo trocou a casca em 20/08 e o robô ficou **7 dias sem coletar** (20 a 26/08), com o Farol e o Gestão à Vista parados em "última exportação: 19/08". Três coisas mudaram, e só a navegação: **os painéis continuam idênticos** (mesmos cards, tabelas, slicers e colunas de export — confirmado no run de 27/08).
1. **A URL é SEMPRE `/bi/inicio`** — virou SPA. Os deep-links `bi.ginfo.app.br/bi/<guid>?autoAuth=true&ctid=…` **não existem mais** e davam `ERR_CONNECTION_TIMED_OUT`. A navegação é sempre pelo MENU (que funciona).
2. **Cada relatório abre numa ABA** no topo (com X para fechar), e o Power BI carrega em `app.powerbi.com/reportEmbed?reportId=<guid>` — **o guid é o MESMO dos antigos deep-links**, então virou o campo `reportId` de cada aba em `ABAS`.
3. **As abas anteriores FICAM VIVAS no DOM** — com duas abertas, os dois iframes coexistem, cada um com suas tabelas. Varrer `page.frames()` faria o robô exportar **a tabela da ABA ERRADA**, sem erro nenhum, gravando dado trocado por cima do bom. Por isso `framesDaAba()` restringe toda busca ao relatório da aba (pelo `reportId`, ou o último iframe aberto).

Quando o portal mudar de novo, rodar o workflow em **modo `mapa`**: ele não exporta nada — fotografa a home, lista os itens da lateral, diz onde o Power BI renderiza, quais abas ficaram abertas e qual `reportId` cada uma tem. Foi ele que resolveu este caso em uma rodada.

**O AVISO DE FALHA FALHAVA EM SILÊNCIO (27/08/2026):** os 7 dias passaram despercebidos porque o e-mail de alerta era recusado pela Resend todo dia (403, sem domínio verificado, `vars.MAIL_TO` vazia) e o `curl` devolvia 0 — o passo passava como se tivesse enviado. Agora a resposta é impressa e o passo emite `::error::` quando a Resend recusa. **Falta configurar `vars.MAIL_TO`** com o e-mail dono da conta Resend (ou verificar um domínio), senão o alarme continua sem tocar.

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
- `checklist-031120`: Mapa | Data do mapa | Data OS | Início técnico | Fim técnico | Problema | Nº OS | Tipo Checklist | Status | Filial | Motorista | Placa | Tipo Veículo | Projeto — via drill-through do card "SAÍDAS COM OS CRÍTICA" + slicer Mês. A tabela da página PRINCIPAL não serve (coluna Motorista acha o resumo Motorista×Aderência). **A "validação de 03/08: 23 linhas de julho" era FALSA** (28/08/2026): aquele run foi às 08:59 e o commit que faz o robô ABORTAR quando o slicer não aplica só entrou às 14:41 do mesmo dia — o filtro de mês falhou calado e vieram as linhas do ANO INTEIRO. O indicador é magro mesmo: julho fechou com 2 saídas e agosto com 0 (conferido na tela pelo Renan). **O que o painel mostrava a mais era o RODAPÉ do Power BI**: todo export termina com uma linha "Filtros aplicados: …" na 1ª coluna, que era gravada no `ginfo_snapshot` como registro — no checklist de agosto era a ÚNICA linha, e o Farol contava 1 saída onde não havia nenhuma (nas outras chaves, uma linha fantasma em cada contagem). O `xlsxParaLinhas` descarta essa linha e loga os filtros que o visual estava usando — é por ali que se enxerga a régua da tela sem precisar de print.

**Painel Ativos (`/ativos/`, cluster Visão Geral, 02/08/2026):** composição da frota lendo `ginfo_snapshot['ativos']` (precisa login do hub) — Qtde, Idade Média, faixas de idade, por unidade/tipo/modelo, tabelão do mais antigo p/ o mais novo. Estilo Disponibilidade.

**Abas mapeadas (conforme o Renan mostra):**
- **Custos** — FORA do escopo do robô: vem do DRE (manual) e será substituída pela **Carta de Custos** no futuro. Não mexer por enquanto. (Colunas: Δ ORÇ. | Δ FCT | Vigência | ESTRUTURA | UNIDADE | NÍVEL 3 | CONTA GERENCIAL | MÊS | ANO | ORÇADO | REMUNERADO | REALIZADO.)
- **Ativos** — automática (IMPORTRANGE do **Consolidado Geral**, mesmo workbook da Disponibilidade/`DISP_SHEET_ID`; colunas: Placa Mercosul | Filial | Projeto | Placa | Marca | Modelo | Tipo Veículo | Estado | Ano Fabricação). Papel: **base de-para por placa** — a aba Preventivas usa PROCV nela p/ preencher Projeto/Unidade, que o relatório do Ginfo NÃO traz → quando o robô exportar Preventivas, precisa reproduzir esse join (placa → Filial/Projeto via Ativos). Desejo futuro: **painel "Ativos/Frota"** no cluster Visão Geral (idade da frota, ativos por unidade/tipo/modelo).
- **Indisponibilidade** e **Disponibilidade** — em MIGRAÇÃO para o Supabase (ver seção "Disponibilidade no Supabase" abaixo). O fluxo antigo (planilhas por unidade + Apps Script no "Consolidado Geral") segue rodando em paralelo até os números serem conferidos.

Em paralelo: perguntar ao Ginfo se existe API/export oficial (trocaria o RPA por consulta estável).

## Disponibilidade no Supabase — substitui o Apps Script (14/08/2026)

Decisão do Renan (14/08/2026): tirar a Disponibilidade/Indisponibilidade do Apps Script do "Consolidado Geral" e rodar tudo no banco, com as unidades preenchendo num app do portal (estilo FCA) e auditoria de quem atualiza. **Sem fluxo de validação de admin.** Diagnóstico que motivou: o Apps Script encadeava 4 funções num trigger; `atualizarDisponibilidade` reescrevia a aba inteira (~316k linhas) todo dia e estourava o tempo, deixando a Disponibilidade 1 dia atrás da Indisponibilidade (e com janela destrutiva entre clearContent e setValues).

**Modelo (scripts/disponibilidade-supabase.sql, rodado em 14/08/2026):**
- `indisponibilidade` — EVENTOS vivos, 1 linha por parada; a unidade abre quando o veículo para e fecha com `data_retorno` quando volta. Sem evento aberto = disponível. RLS: leitura p/ logados; escrita via `fca_has_unit()`/admin (mesmos acessos do FCA).
- `disp_checkins` — botão "Confirmar frota do dia" (auditoria de quem atualizou; INSERT only, nem admin apaga).
- `indisp_snapshot` / `disp_snapshot` — fotos diárias (histórico migrado do Sheets com `fonte='sheet'`; o dia a dia entra com `fonte='app'`). APPEND-ONLY: dias anteriores nunca são tocados.
- `unidade_depara` + `disp_unit_cod(nome, projeto)` — nome de filial → código do portal, com refino de tier CBA/MCC pelo projeto (inclui ANHANGUERA→ANG).
- `disp_snapshot_diario()` — pg_cron diário às 09h BRT (`0 12 * * *` UTC, job 'disp-snapshot-diario'): fotografa eventos abertos e agrega Ativos (ginfo_snapshot['ativos'], casando indisponível↔ativo pela placa) × indisponíveis. Idempotente no dia. Testada manualmente em 14/08 — OK.

**Páginas:** `/disponibilidade-preenchimento/` (app da unidade: frota do Ginfo, abrir/editar/fechar evento, busca, histórico, check-in; card "Indisponibilidade" no cluster Processos do hub) · `/disponibilidade-migracao/` (admin; importa o histórico das abas Disponibilidade e Indisponibilidade do Consolidado Geral; reimportável — apaga só `fonte='sheet'`).

**Ativos:** vêm do robô Ginfo (`ginfo_snapshot`, chave 'ativos', diário 7h BRT) — NÃO criar coletor novo.

**MIGRAÇÃO CONCLUÍDA E VALIDADA (14/08/2026):** workflow **Disp Migracao** (`scripts/disp-migracao.mjs`, dispatch no Actions, gviz→Supabase com a service key) rodou: `disp_snapshot` 16.939 linhas fonte=sheet (19/02→12/08/2026 — a base real é ~17k, não "316k") · `indisp_snapshot` 11.675 (17/02→13/08) · último dia da aba virou os EVENTOS ABERTOS (ANG=13 conferido linha a linha com a planilha). Reimportável: apaga só fonte='sheet' e pula placas com evento aberto.

**Decisões do Renan na construção (14/08/2026):** SEM Kanban (não é plano de ação) — app no shell do Planner com lateral (resumo + unidades + atalhos, menu recolhível) e miolo em LISTA · SEM check-in manual ("preencheu, confirmou" — auditoria = updated_by/updated_at dos eventos; `disp_checkins` existe mas está sem uso) · retorno SEMPRE por campo de data (mini-modal, entre a parada e hoje) · datalist de placa só com a placa · **FRETEIRO fora** de tudo · **ANG/Anhanguera não existe no Ginfo**: tabela `ativos_manual` (RLS por unidade) com 51 veículos do xlsx (Filial SEARA·ROTA, `scripts/ativos-manual.sql`), botão "+ Veículo" no template Ginfo SÓ na ANG, foto diária soma Ginfo+manuais (manual prioriza por placa) · visão **Resumo** = o painel de disponibilidade dentro do app (view `disp_resumo` dia×unidade; hero, % por dia, % por unidade, tabela hoje vs média 30d) — o Renan ainda vai detalhar o formato final espelhando o `/disponibilidade/` antigo.

**Pendências:** painel `/disponibilidade/` ainda lê o Sheets via gviz → aposentar quando o Resumo do app for validado · painel de aderência (quem atualiza/quem não, via updated_at dos eventos) · desligar o trigger do Apps Script SÓ depois de comparar os números por 1–2 semanas · detalhar a visão Resumo com o Renan.

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

**CONFORMIDADE — O CORTE DE AGOSTO/2026 (Renan, 11/08/2026):** o Ginfo trocou a régua no meio do ano, então **2026 tem duas metades e cada uma é medida com a régua da sua época** — senão a mudança premiaria ou puniria unidade sem que nada tivesse mudado na operação. **jan→jul/2026** vale o que o robô coletou ANTES da mudança (Mensal/Bimestral); **ago→dez/2026** vale a régua nova (contagens por status de prazo). Quando a janela cruza o corte, a conformidade é a **média simples das duas metades** — no fechamento do ano, `(aderência jan→jul + aderência ago→dez) ÷ 2`. No `gerot-base` isso é `CONF_CORTE='2026-08'` + `confRegraNova()` + `confMetade()`/`confAcum()`; o registro acumulado leva `metades:2` quando veio da média. Dentro de cada metade a conta é a de sempre: contagens poolam (régua nova), percentuais usam o escopo `ano` do Ginfo ou a média mensal (régua antiga). **O robô pula chave já gravada** — não rodar com `refazer` em jan→jul, ou os valores da régua antiga se perdem.

**A ADERÊNCIA NOVA CONFERE (validado 11/08/2026):** com os KPIs da tela (Aderência 82,02% · Nunca Realizado 59 · Não Realizado 353 · Realizado Fora Prazo 896), a fórmula `(Dentro Prazo + No Prazo) ÷ soma das cinco` exige 5.967 no numerador — bate com os "5 Mil + 1 Mil" arredondados da tela, e devolve exatamente 82,02%.

**CONFORMIDADE — REGRA NOVA DO GINFO (08/2026), substitui tudo abaixo:** o BI passou a medir a aderência pelo **prazo de vencimento** de cada equipamento (**WH** = Armazém/Apoio, 30 dias · **DU** = demais projetos, 60 dias), acabando com a queda artificial para ~50% no 1º mês do bimestre. Com isso **acabou a distinção Mensal × Bimestral** — a periodicidade já está embutida no status. A tela `1.2 - ADERÊNCIA CONFORMIDADE` agora traz a tabela por Filial com **cinco contagens**: `Nunca Realizado · Não Realizado · Realizado Fora Prazo · Realizado Dentro Prazo · No Prazo`, e **Aderência = (Dentro Prazo + No Prazo) ÷ soma das cinco** (conferido contra a tela: CUIABA 39,62%, PELOTAS 67,36%, NOVA FRIBURGO 67,50%, CDD RIO 67,98%, FLORIPA 68,52%, total 73,33%). Como são contagens, **somar os meses dá o acumulado exato** → `conf` entra no `POOL_FIELDS` e o **`conformidade-mar` foi aposentado** (coletor removido; o leitor mantém o caminho antigo só como fallback para o histórico ainda não recoletado). O robô continua achando a tabela pelo header `Filial`; o drill "Detalhes Aderência Mensal" não abre pelo CARD (testado em 5 posições), mas **ABRE pela CÉLULA da tabela** — ver "Conformidade por placa" abaixo. A regra das **empurradas só de abr/2026** (`confVale`) segue valendo, por ser decisão de negócio.

**CONFORMIDADE POR PLACA (`conformidade-detalhe`, 22/08/2026)** — a "placa mais vencida" que o Renan pediu no Gestão à Vista. Descobertas que mudaram o jogo: o drill-through da tela 1.2 **abre pelo botão direito na CÉLULA da tabela por Filial** (no card nunca respondeu — eram 5 offsets à toa) e o submenu tem DOIS destinos: **"Detalhes Aderência Mensal"** (uma linha por placa × competência: `Competência · Filial · Placa · Projeto · Tipo Veículo · Tipo Aderência WH/DU · Prazo · Início da Cobrança · Vencimento Vigente · Checklist Realizado em · Status · Próximo Vencimento · Realizações no Mês…`) e **"Detalhes NOK"** (item a item de checklist por placa — ainda sem uso). O drill **herda o filtro da linha clicada**, então a coleta é filial a filial; o ano inteiro vem de uma vez (filtro "Ano é <ano>") e as linhas são agrupadas por Competência (serial de xlsx → MM/AAAA) e gravadas em `elite_snapshot` como `conformidade-detalhe`/escopo `mes`. Peças: modo `conf-detalhe` no `scripts/elite-robot.mjs` + workflow **Conf Detalhe** (diário 8:00 BRT + dispatch) + auditoria **Conf Detalhe Check**. Três armadilhas REAIS já corrigidas: (1) na página de detalhe o export pegava o **card vizinho** ("No Prazo/341") — o "..." dele era o mais perto do canto e nem `minY` nem achar o botão pelo DOM resolveram (o do DOM é um placeholder interceptado); o que funciona é **esconder os visuais baixinhos** (`display:none` nos grids com <100px de altura) antes do export; (2) rodada parcial (Ginfo instável) **sobrescrevia a vigência inteira** — o salvar faz **MERGE por filial** (substitui só o que a rodada coletou); (3) alguns exports vêm com filtro de **regional** em vez de filial (a 1ª rodada inflou CDD CUIABA p/ 1794 linhas) — as linhas carregam a própria coluna Filial, então o merge por filial também saneia isso. Validado 22/08/2026: 8 vigências × 13/13 filiais, ~900–1.000 placas/mês, duplicatas exatas 2–4% (provável cobrança dupla legítima do ciclo WH — observar). O leitor está no Gestão à Vista (`loadConfDet`/`confPlacas`): tabela "Placas pendentes — da mais vencida para a menos" na visão Conformidade (pendente = Nunca/Não Realizado, ordenado por Vencimento Vigente; datas chegam como serial).

**Conformidade — regra ANTIGA (só para o histórico não recoletado):** PIRAI EMPURRADA, MACACU EMPURRADA, CUIABA EMPURRADA e CDD RIO DE JANEIRO usam **Aderência Bimestral** de **jan a jun**; as demais, **Mensal**. **De julho em diante, todas bimestral.** **As três empurradas só contam de ABR/2026 em diante** (Renan, 18/08/2026 — antes era mar/2026): **jan, fev E MAR** ficam sem valor no mensal, no acumulado e nos adicionais de conformidade (`confVale` + `CONF_EMP_INI` no gerot-base). Sem valor **não é zero**: o peso do indicador é redistribuído entre os que a unidade tem. **Acumulado das empurradas ≠ escopo `ano`** (o jan→M do Ginfo inclui os meses que não contam) — sai da **média dos meses que valem** (abr em diante), marcada como `approx`. O indicador **`conformidade-mar`** (janela mar→M, escopo `ano`) **saiu de cena de vez**: com março fora da regra aquela janela ficou contaminada; o coletor já tinha sido removido e agora o leitor também não busca mais. Se o acumulado exato das empurradas voltar a ser necessário, é coletar a mesma tela com Mês=abr→M. **A regra é da FILIAL, não da unidade unida** (bug real, 18/08/2026): com `fundir:true` o `canonUnit` renomeia a linha da MACACU EMPURRADA para MACACU **antes** do `confVale`, e mar/2026 continuava entrando com 47,8% na unidade unida. O `unitCru(filial,proj)` devolve o nome de origem sem fusão e é ele que manda no `confVale` e na escolha Mensal × Bimestral; o acerto do acumulado usa `fundido(CONF_EMP)`.

**Três mecânicas de filtro** (o robô do Farol só tinha a primeira): `dropdown` (slicer Ano/Mês, com ctrl+clique para somar meses no acumulado) · `datas` (par de campos dd/mm/aaaa — escolhe o par mais próximo do rótulo, porque Preventivas tem dois pares) · `botoes` (tiles de ano/mês no rodapé dos Pneus, com seta "‹" para revelar meses fora da faixa). Período que não aplica **aborta a coleta** — nunca grava a tela no filtro errado por cima do dado bom.

**Iterar barato:** `ELITE_IND=disponibilidade` roda um indicador só; `ELITE_DE`/`ELITE_ATE` limitam o backfill; `ELITE_FORCAR=1` ignora a janela do dia 15; `refazer=true` (input do workflow, `ELITE_REFAZER=1`) recoleta o que já está gravado — sem ele o robô **pula** toda chave já existente em `elite_snapshot`.

**NADA DE "IV"/"IC" — é tudo INDICADOR (07/08/2026):** o leitor expõe **`GerotBase.INDICADORES`** (os indicadores-chave, iguais nas DUAS bases, lidos da MESMA fonte) e **`GerotBase.INDICADORES_GEROT`** (os adicionais, que só aparecem no Gerot e não pontuam no Frota de Elite). No painel do Gerot é **uma tabela só**, todas as linhas no mesmo estilo, com Meta / Real / % de Ating. / % Ating. YTD — sem seção separada e sem pílula "OK/Atenção". Campos sem prefixo `iv_` (`mttr`, `osVenc`, `blitz`, `prevFora`…), registros dos adicionais marcados com `soGerot:true` e `atg` = `meta/real` ('lower') ou `real/meta` ('higher'), via `atgDe()`.

**Isenções do Stress Test de empilhadeira (Renan, 07/08/2026):** erro de cadastro ENTRE UNIDADES gerou desconto indevido — **EMP2024 (CDD Florianópolis)** e **EMP 2026 (CDD Pelotas)** contam **sem desconto de jan a mai/2026** (com isso Pelotas fica 100%). No `gerot-base` é a lista `ST_EMP_ISENTOS` + `stEmpIsento()`, casada pelo identificador (`Placa Ginfo`/`Chassis`, ignorando espaços) e pela vigência — **não pela unidade**, que é justamente o que estava errado. Vale no mensal e no acumulado, nos dois painéis.

**METAS dos indicadores-chave (Renan, 07/08/2026) — é delas que saem os FCAs da RPM:** Disponibilidade **95%** · Preventivas **100%** · Pneus **100%** · Checklist T1/T2 **95%** · Conformidade **100%** · Stress Test (Veíc. e Emp.) **100%** · CIVF **100%** · SLA **75%**. Checklist WH: **95%** (mesma regra de checklist do termômetro, que vale para ARM) — confirmado pelo Renan em 07/08/2026. Combustível continua com meta própria (km/L remunerado por unidade/vigência). No `gerot-base` isso é o mapa `METAS` + `recChave()`: cada registro leva `meta` e **`atgMeta` = real ÷ meta (cap 100)**, que é o que o **Gerot** mostra na coluna % de Ating.; o campo **`atg` continua sendo a própria aderência**, porque é ele que o **Frota de Elite** pontua (os pesos do programa já estão montados assim). Não trocar um pelo outro.

**O Gerot = os indicadores do Frota de Elite + 7 adicionais (6 do plano do PPTX, 07/08/2026, + Saída com OS Crítica, 14/08/2026):** `INDICADORES_GEROT`, nesta ordem — **Amplitude** (API Prolog, meta 5mm do painel Milimetragem) · **MTBF** e **MTTR** (valores do relatório "MTBF E MTTR" do Ginfo, meta = regra do termômetro: **melhor que o 3º quartil** das unidades na vigência, `metaMode:'quartil'`) · **OS Vencida** (planilha do Termômetro `10LRn3jrXEemqFiFAMbO8_bOLk98xrWTVXVUNDeQqLac`, col Q dos 4 tiers, somada Frota+Armazém por unidade; meta da regra: < 10) · **Saída com OS Crítica** (coluna "Saídas com OS Crítica" do export MENSAL do `checklist-t2` no elite_snapshot — a tela ADERÊNCIA FROTA 031120; validado 14/08/2026: soma jan→jul = 125, igual ao acumulado da tela do Ginfo. Meta ZERO, atingimento binário 0→100% / ≥1→0%; no Gerot a janela/YTD SOMA os meses (contagem, não média). Cobre CDDs/CDI; empurradas T1 e WH não têm a coluna → sem valor) · **Blitz de Segurança** (col M do Transportes T2, só CDDs; meta 100%) · **% Calibragem OK** (API Prolog, meta ≥ 98% do painel Calibragem, ±10% da ideal). Os dois do termômetro vêm por vigência `MM_Q`, valendo a Q2 do mês (senão Q1), via `loadTermometro()`; de-para: Transportes T1 = MACACU/CUIABA/PIRAI (→ empurradas), WH T1 = CUIABA (→ CBA T1 WH), T2/WH T2 = nomes canônicos. **NÃO inventar diagnósticos extras** (fora do prazo, sem anexo, tempo de checklist, conformidade Seg./Quali., SLA executada, MM média foram removidos — não estavam no pedido).

**CORTINA DA APURAÇÃO no Frota de Elite (Renan, 28/08/2026):** o resultado pode ficar **fechado até a divulgação**, para o suspense. Chave `frota_elite_visivel` na tabela **`portal_flags`** (`scripts/portal-flags.sql`): leitura aberta (o painel monta a tela antes de saber quem está olhando; a flag não é dado sensível), escrita só `fca_is_admin()`. Com a chave desligada, quem abre o `/programa-reconhecimento/` vê o card **"Estamos em período de apuração"** e o painel **nem carrega os dados** (`initData()` não roda); o **admin continua vendo os números**, com uma faixa amarela avisando que está oculto e o botão **Ocultar/Liberar resultado** no topo. Erro de rede não estraga o suspense nem tranca o painel: vale o **último estado conhecido** (`bi_elite_cortina` no localStorage). A coluna `mensagem` da tabela troca o texto do aviso sem mexer no HTML. **Aba já aberta não muda sozinha** — a unidade vê a virada no próximo carregamento (nada de realtime).

**MACACU UNIFICADO no Frota de Elite (Renan, 14/08/2026):** `CDI MACACU` + `MACACU EMPURRADA` viram **uma unidade só, `MACACU`**, no programa-reconhecimento — `GerotBase.load({fundir:true})`. É **opt-in**: Gerot, painel-metas e os FCAs da RPM continuam com os dois tiers separados (lá o `RPM_UNIT_MAP` depende dos nomes originais). A fusão acontece na ORIGEM (`canonUnit`), então **cada indicador é combinado pela sua própria régua, sem média de médias**: contagens poolam sozinhas (conformidade, pneus, stress, CIVF) e o combustível poola por **litros** (ver abaixo); os que só dão % ganham o **denominador da tela** como peso — disponibilidade pelas **horas reconstruídas** (`Tempo Indisponível ÷ (1 − disp)`, porque a tela não expõe o total), preventivas por `Preventivas Realizadas`, SLA por `Executadas`, checklist por `Viagens` (com T1 e T2 valendo juntos na mesma unidade), WH por `Realizados`. Validado contra jul/2026: disp 97,597% · SLA 84,434% · checklist 98,952% · conformidade 100% · CIVF 96,875%. Sem denominador em alguma linha, cai para média simples e avisa no console (`approx`). Nome/avatar da unidade unida ficam em `NOMES`/`AVATARES` do programa-reconhecimento.

**COMBUSTÍVEL NA FUSÃO É POOL DE LITROS, NUNCA Σkm ÷ Σlitros (bug real, 18/08/2026):** empurrada roda a ~2 km/L e CDI/rota a ~3,5 km/L — são **alvos diferentes**. Somar os km e os litros das duas e comparar contra a **média das metas** mistura frotas incomparáveis e derruba o atingimento da unidade unida para **abaixo dos dois lados**: em jul/2026 o MACACU dava 94,6% (CDI) e 103,1% (Empurrada) separados e **73,4%** unido — e como o combustível pesa 10, a pontuação da unidade caía ~3 pontos (98,0 → 95,1) em **todas** as vigências. O certo é cobrar cada filial contra a **própria** meta e ponderar pelo que ela gastou: `Σ(litros esperados) ÷ Σ(litros gastos) = Σ(atg_i × lit_i) ÷ Σlit_i` — que é o atingimento exato da unidade inteira e sempre cai entre os dois. No `gerot-base` isso é `combUm()` (por filial, como sempre foi) + `combFunde()` (o pool), com o `COMB` guardado **por filial de origem**; o `meta` da linha unida é derivado (`real ÷ atg`) para o trio meta/real/atg ficar coerente. Conferir com o workflow **Macacu Fusao Check** (`scripts/macacu-fusao-check.mjs`), que marca todo indicador que cai fora do intervalo dos dois lados — é assim que este bug apareceu.

**LEITOR PLUGADO (06/08/2026):** `assets/gerot-base.js` lê o **elite_snapshot** (a planilha Frota de Elite saiu de cena; só o Combustível segue no Km/L via gviz). Contrato `records` mantido; `meta=null` e `atg = a própria aderência` (Renan: robô não carimba meta). Novo `GerotBase.acumFor(vigs)`: % por filial usa escopo `ano` quando a janela é jan→M (senão média mensal aproximada, com warn); stress/civf/pneus poolam as linhas mensais; comb Σkm/Σlitros. Consumidores: gerot (colunas de valor + YTD em acumulado), programa-reconhecimento (hero/cards/ranking/pódio em acumulado quando multi-vig; gráfico temporal segue mensal; cache v7 + hidratação em background), painel-metas (só ganhou o CDN do supabase; sua agregação própria de pontuação ficou como estava). De-para de filial dos exports = FIL2COD/refineCodG (cópia do farol-core); checklist-t1 força tier EMPURRADA (filial "CUIABA" na tela Empurrada é CBA T1, NÃO Armazém); checkWH usa a coluna `Aderência` exata (não `Aderência Ponto`).

**`r.unit` É O NOME DA UNIDADE, NUNCA O CÓDIGO (bug real, 17/08/2026):** o `canonUnit` do gerot-base já resolve código → nome antes de devolver, então `records[].unit` vem `CDD CUIABA`, `CUIABA EMPURRADA`… Passar isso por `COD2UNIT` de novo devolve `undefined` em **todas** as linhas — foi o que o `icsDoElite()` do Scorecard fazia: o `elite_snapshot` parecia vazio, o painel caía no fallback da aba **Base RPM** (que parou de ser apurada em jul/2026, com `% de Ating.` em branco) e, como a lista de vigências nasce dos ICs, o Scorecard inteiro ficou travado em junho. O `COD2UNIT` exportado serve só para quem tem código na mão. **Os painéis de IC são TRÊS, não um:** `scorecard`, `diagnostico` e `resumo-executivo` — os dois últimos liam a Base RPM direto e foram migrados na mesma leva. Para conferir sem chutar: workflow **Scorecard ICs Check** (`scripts/scorecard-ics-check.mjs`) roda o **próprio `assets/gerot-base.js`** contra o Supabase real (dando a ele `window`/`document`/`supabase` mínimos em `node:vm`) e imprime as vigências e a pontuação por unidade — em 17/08/2026: 0 linhas pelo caminho antigo × 854 pelo corrigido, vigências 01→07/2026.

**Pneus — fonte = aba `Pneus` do Sheets Frota de Elite (07/08/2026):** o Renan cola o export "detalhes" do Ginfo (CALIBRAGEM) na aba `Pneus` do workbook `1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M`: `Filial | Evento | Placa | Projeto | Período | Última Leitura | Status`. Cada linha = uma placa na vigência (coluna Período, "janeiro de 2026"); `Status = "Não Realizado"` → 0, senão 1. **Sem filtro de Evento** — a aba tem CALIBRAGEM e MILIMETRAGEM e as duas contam, como o Renan definiu ("todas as placas"). O leitor (`loadPneusSheet` no gerot-base) poola Σok/Σn por filial — mês e QUALQUER janela acumulada exatos, batendo com o Ginfo. Fallback: contagens da API no `elite_snapshot` (o robô continua coletando `pneus` como rede de segurança). IVs de pneus (amplitude/calibragem, Prolog) não mudaram.

**FICA MANUAL — NÃO TENTAR AUTOMATIZAR DE NOVO (Renan, 07/08/2026):** o export do drill traz o ANO INTEIRO de uma vez (conferido: 9.011 linhas, jan→jul, ~1.290/mês, 13 filiais), então o Renan cola o arquivo e pronto — não é trabalho mensal. Cheguei a propor o robô coletar esse drill; ele vetou porque **é a mesma tela 3.4 - PNEUS, com os mesmos filtros que já travaram a automação** (os tiles de mês / seta de "próximo nível", cinco abordagens sem sucesso). Para conferir a aba depois de colar: workflow **Pneus Aba Inspect** (`scripts/pneus-aba-inspect.mjs`) — lista períodos presentes, status, eventos e a aderência por filial do último período, na mesma conta do leitor.

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

## Seara — workbook único, 3 abas (regra vigente 12/08/2026)

Workbook `1Rlwc0MZiupQI38gSN8VyBq_zMADgX9R_ZbfygNP-OXE`, abas no rodapé: **Base Remunerado** (`gid=0`) · **Base CTEs** (`gid=1672208132`) · **Combustível** (`gid=1982300845`). Alimenta `/seara-km/` e os painéis de `/combustivel/seara/`.

| o quê | de onde |
|---|---|
| **KM realizado** | aba **Combustível** — E placa · F mês (texto) · G ano · H modelo · J tipo de veículo · **K km rodado**. É a raiz das linhas do painel. |
| **KM remunerado** | aba **Base CTEs** — **coluna J** (`QT_QUILOMETROS_VIAGEM`), contada **UMA VEZ por `CD_VIAGEM_TRANSPORTE` (col B)**. C = placa, D = data. |
| **R$/km remunerado** | aba **Base Remunerado** — **coluna O (`ReaisPorKm`)**, por **placa (D) + vigência (A)**. É o custo variável inteiro do km. |

**A DEDUPLICAÇÃO POR VIAGEM É OBRIGATÓRIA.** A mesma viagem gera vários CTEs (normal, complementar, descarga, pernoite, CPL) e **todos repetem o km da viagem na coluna J**. Medido em 12/08/2026: 65.773 linhas para 4.078 viagens; `sum(J)` linha a linha dá **12.962.995 km** contra **552.868 km** reais — infla **23×**. O gviz não faz count-distinct: puxar `select B, C, D, J` e deduplicar no cliente.

**A COLUNA Z (`KM Rodado`) NÃO EXISTE MAIS** — a aba foi reestruturada e `select sum(Z)` devolve erro do gviz. O painel lia essa coluna e passou a ler a J/viagem, que **reproduz o mesmo número** (78.946 km em 06/2026, idêntico ao que a Z dava). Nada de voltar para a Z.

**A ENXUGADA FOI DESFEITA (Renan, 14/08/2026):** a versão larga das abas foi restaurada — `KmPorLitro` e `PrecoDiesel` voltaram à Base Remunerado e os painéis de combustível da Seara voltaram a usá-los como benchmark (a variante "tudo por J+O" de 13/08 foi revertida). **Fluxo do fechamento do mês:** o Renan cola o mês novo primeiro na aba **Combustível**; Base Remunerado e Base CTEs chegam depois. Enquanto o mês não existe nelas, os painéis usam o **mês anterior da mesma placa** para as TAXAS (KmPorLitro, PrecoDiesel e o peso de viagens) — nos painéis de combustível a quantidade (km remunerado da J) NÃO cai no mês anterior, fica vazia até o mês ser colado. **EXCEÇÃO — /seara-km/ (Renan, 20/08/2026):** no Painel KM da Seara a QUANTIDADE também cai no mês anterior: vigência que ainda não tem NENHUM CTE usa o km remunerado da última vigência anterior de cada placa (senão o Δ vira o realizado inteiro e o impacto explode), com aviso no card Km Remunerado ("⚠ jul/26 sem Base CTEs — usando o mês anterior"); quando a aba for colada, o valor real substitui sozinho (`remDe`/`mesesCTE` + flag `remFb` nas linhas). As colunas da Base Remunerado são achadas pelo **nome do cabeçalho** (fallback nos índices largos 15/17), e a data da Base CTEs é detectada entre **D** (layout enxuto) e **E** (layout largo) pelo que parseia como data — os painéis aguentam os dois layouts.

**R$/km — coluna O, não a N nem a T.** A **O** é a soma dos sete componentes variáveis (diesel + arla + manutenção + pneu + recapagem + lubrificante + lavagem); a **N (`TotalReaisPorKm`)** inclui o custo fixo rateado, que se paga rodando ou parado e **não** entra no impacto de um km a mais; a **T** é só o diesel. Conferido: os seis componentes não-combustível batem entre Base CTEs e Base Remunerado em todas as vigências (< 0,2%). Cobertura em 01→06/2026: **100%** das placas do painel acham o seu R$/km.

**Placa — chave canônica só para cruzar as abas.** Formato antigo `LLLNNNN` vira Mercosul `LLLNLNN` trocando o 5º caractere pelo dígito→letra (0=A … 9=J); quem já é Mercosul fica igual. **Na tela aparece a placa como está na origem.** Hoje as três abas estão 100% em Mercosul — a conversão é para o dia em que uma emplacar antes da outra.

**Ferramentas de conferência** (Actions, porque o sandbox não alcança o `docs.google`): `seara-km-viagem` (km por viagem × coluna Z, formato das placas, cobertura) · `seara-rskm-decomp` (decompõe o R$/km componente a componente) · `seara-rskm-inspect` (cabeçalhos das abas e comparação placa a placa).

**Achado em aberto (12/08/2026):** em **06/2026** o preço do diesel troca de lugar entre as duas bases — o da Base Remunerado cai de ~2,00 para 1,665 e o da CTE sobe de ~1,70 para 2,010, cada um indo exatamente para o nível do outro. Não afeta o painel (usa a coluna O), mas tem cara de preenchimento invertido no mês. Pendente de conferência do Renan.

## Automação do Combustível — contextualização em andamento (13/08/2026)

O Renan quer automatizar o combustível **em partes**, ele contextualizando aba a aba (mesmo método do robô Ginfo). **Nada implementado — aguardar ele mandar fazer.**

**Parte 1 · Km/L (alimenta `/combustivel/eficiencia-kml/`).** A aba `Km/L` fica no workbook **`1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A`** (é o `KML_ID` que a Árvore de Combustível e o painel de Eficiência já leem; nome do arquivo: **Consumo**). Abas no rodapé: `Km/L · R$/L · De-Para · Base CO² · Base Remunerado Modelo`.

A aba `Km/L` já vem **consolidada** — uma linha por recorte, com três blocos de colunas:
- **R$/km** — Remunerado · Realizado · Δ
- **Km/L** — Remunerado Médio · Remunerado Modelo · Realizado · Δ
- **R$/L** — Remunerado · Realizado · Δ

Recorte das linhas: **Operação · Empresa · Projeto · Unidade**, mais uma coluna **`Ativo`** com **três** valores — `VERDADEIRO`, `FALSO` e **`Fora FT`** (não é booleano; não tratar como tal).

**O ponto do Renan:** *"tenho essa aba que vem de uma planilha complexa"* — ou seja, o que o painel lê hoje é o **produto final** de uma cadeia de cálculo que mora fora daqui. Automatizar o Km/L significa reproduzir essa cadeia (ou achar a fonte a montante), não só copiar a aba consolidada. Esperar o Renan abrir a planilha de origem antes de propor desenho.

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

**Pilares atuais (peso):** Faixa Verde de RPM 25 · Marcha Lenta/idle 20 · Aceleração 15 · Velocidade 15 · Freio Motor & Banguela 10 · Câmbio 5. **FREADA BRUSCA NÃO PONTUA** (Renan, 26/08/2026): *"frenagem não entra em score de condução econômica"* — mede condução SEGURA, e segurança é a Fase 4. O robô continua GRAVANDO `frea_100km` no `ce_diario` (nas duas fontes), então o dado não se perde e não precisará ser recoletado quando a Fase 4 chegar; ele só não entra no score. Os pesos somam 90 e o score normaliza pela soma dos presentes, então a escala segue 0–100 (conferido: todos os pilares em 80 → 80, com ou sem os pilares que só a vFleets entrega). Score = média ponderada (0–100), redistribuindo o peso dos pilares ausentes. Freio Motor e Câmbio **só existem na vFleets** (Geotab não entrega → ficam ausentes). Cada célula mostra **pontos (grande) + resultado medido (pequeno)**, estilo termômetro. Pesos/indicadores só serão fechados **quando lermos a telemetria de verdade**.

**Duas telemetrias (cada motorista usa só UMA):**
- **Geotab MyGeotab** — JSON-RPC `POST /apiv1` (Authenticate → sessão 2 sem.; Get/GetFeed). **A credencial é o próprio login e senha do MyGeotab** (confirmado pelo time de tech em 26/08/2026, via Argus); **database = `ambev`** (default do robô). Coleta implementada em `geotabDia()`: **`Trip`** dá `distance` (km), `drivingDuration`, `idlingDuration` e `speedRange1/2/3Duration` — daí saem km, marcha lenta e velocidade; **`ExceptionEvent`** dá aceleração e freada bruscas, e por isso **se a regra estiver desligada na conta o pilar fica vazio sem erro nenhum** (a sonda lista as `Rule` da conta e avisa qual pilar ficou sem regra). Evento sem motorista é casado pelo `device` dentro da janela da viagem; viagem com `NoDriverId` é descartada. **RPM em faixa verde, freio motor e câmbio NÃO existem no Geotab** → ficam nulos e o painel redistribui o peso. Chave do motorista = CPF/CNH do cadastro (`licenseNumber`/`employeeNo`), o que permite casar a mesma pessoa com a vFleets; sem documento, `gt:<id>`.
**GEOTAB — ACESSO BLOQUEADO PELO CLEARANCE (26/08/2026, investigado a fundo):** a conta `renan.fortes@conlogsa.com.br` autentica no database `ambev` (servidor `ThisServer`, MyGeotab 11.139.534) e tem os **grupos de dados certos** — 19 grupos, incluindo `TRS_CONLOG` e as unidades (`UNI_EMP MACACU`, `UNI_EMP PIRAI`, `UNI_EMP CUIABA`, `UNI_AS CDD CUIABA`…), 43 grupos visíveis. Mesmo assim **toda consulta de dado volta VAZIA**: `Device` (inclusive filtrando grupo a grupo), `LogRecord`, `StatusData`, `FaultData`, `Trip`, `ExceptionEvent` e `DriverChange`, em três datas diferentes. **Sem erro nenhum** — o MyGeotab devolve lista vazia em vez de recusar, e é por isso que parecia "não tem dado". A causa é o **clearance `b2B23 — "Usuário Ambev"`**, que não libera leitura via API: grupo de dados diz QUAIS veículos, clearance diz O QUE a conta pode fazer. A prova definitiva: a conta lê **110 `Rule` e 193 `ReportTemplate`** — inclusive o `Speeding Violations` que ela recebe por e-mail diário —, ou seja, o clearance libera **objetos de CONFIGURAÇÃO** e bloqueia **objetos de DADOS**. Ler regra e template mas não ler veículo é a assinatura do problema. O caminho pelos relatórios não substitui a API: `Report` não responde a `Get` e o Geotab entrega relatório como arquivo por e-mail. Pedido aberto na Argus: clearance de leitura para `Device`/`Trip`/`ExceptionEvent`/`LogRecord`, de preferência num usuário de serviço só leitura. **Pendente confirmar se a operação usa identificação de motorista** (crachá/NFC/iButton): sem isso as viagens voltam com `NoDriverId` e só dá para medir por veículo, o que muda o desenho do painel.

**UNIDADES NO PROGRAMA (Renan, 06/09/2026: "por enquanto deixe só Piraí... ou uma opção de eu liberar unidades"):** `ce_app_regras.unidades text[]` (null/vazio = todas; começa com `{EMP PIRAI}`), seção 13 do `scripts/app-motorista.sql`. `ce_app_unidade_ativa(unidade)` é checada no login, no criar PIN, no autocadastro e na lista de unidades do autocadastro — motorista de unidade desligada vê "O DriverPro ainda não chegou na sua unidade". O admin liga/desliga pelos chips "Unidades no programa" da tela "Selecione o motorista" (`ce_app_unidades` / `ce_app_unidade_set`). **Só Piraí por enquanto** (Renan, 06/09/2026): as outras unidades têm mais Trimble e pouco Veltec/Geotab, então ficam fora até a telemetria cobrir todo mundo. **Top 15 fixo só corta em Piraí** (ago/2026: 59 acima de 1.000 km → 15; nas outras unidades todo mundo que passa de 1.000 km recebe, 3 delas com 1 elegível só). **CRITÉRIOS POR UNIDADE E GRUPO "PIRAÍ" (Renan, 06/09/2026: "Lata 5, Empurrada 15, olhados juntos como unidade Piraí; Lata elegibilidade 500 km")**, seção 14 do `scripts/app-motorista.sql`: tabela `ce_app_unidade_cfg(unidade, grupo, top_n, km_min, qlp)` — campo nulo cai na regra geral de `ce_app_regras` (e o `top_n`, na regra `top_pct% × qlp` mín. `top_min` se o QLP estiver informado). **Grupo = UM ranking e UM pódio** para todas as unidades do grupo; a cota (`top_n`) e o km mínimo continuam sendo os da unidade de cada motorista (`pos_uni` no `ce_app_dados`, `posicao_unidade` no JSON). Semente: `EMP PIRAI` (PIRAI, 15, 1.000 km) e `INS LATA PIRAI` (PIRAI, 5, 500 km). O admin edita tudo tocando no rótulo dentro do chip da unidade (`ce_app_unidade_cfg_set`). `ce_app_criterios()` é aberto (anon) e é de lá que o **painel** `/combustivel/conducao-economica/` lê km mínimo e cota por unidade (`critDe`), em vez das constantes `KM_MIN_ELEG`/`TOP_ELEG` de antes. O `ce_app_dados` devolve `unidade` = grupo (PIRAI) e `unidade_real`; `regras.top_n`/`km_min` já vêm resolvidos para a unidade. Custo de Piraí em ago/2026 com essa regra: R$ 3.860 (carteiras 2.481,87 + 828,27 + um pódio 550), teto R$ 4.550/mês. Cópia do app em **Montserrat** para comparação: `app-motorista-5/` (idêntica à 4, só a fonte; cache `driverpro-mont-v1`).

**PESOS EM BASE 100 — 50 / 30 / 20 (Renan, 07/09/2026: "não deveria ser 100? eu também aumentaria o peso da faixa verde"):** faixa verde 50, motor ligado sem rodar 30, acelerações 20. Antes era 25/20/15 (soma 60, resto do desenho de seis pilares). Os pesos moram em QUATRO lugares e têm de bater: `PESOS` no `scripts/conducao-robot.mjs` (o score gravado em `ce_scores_mensais`; os modos `carteira`/`programa` usam o mesmo objeto), `ce_app_regras.peso_*` (o app calcula as perdas por pilar com eles), `PILAR[*].peso` no painel `/combustivel/conducao-economica/` e a demo do app. Mudou o peso → rodar **`recalc`** no ano (feito em 07/09/2026: 1.431 linhas). O painel ganhou a visão **Carteira em R$** (`renderCarteira`): a mesma conta do app — saldo × nota ÷ 100 para elegíveis pela regra da unidade (`critDe`), pódio para os 3 primeiros do grupo, somando as vigências do recorte.

**NOMES DOS PILARES NO DRIVERPRO (Renan, 05/09/2026):** *Uso da faixa verde (até 1.700 RPM)* · *Motor ligado sem rodar* · *Acelerações bruscas*. A faixa medida pelo robô continua 1.100–1.700 rpm (o Renan pediu "até 1.500" no nome, eu perguntei, ele manteve 1.700 e corrigiu o nome). Cada card explica a nota traduzindo-a de volta na medida, com a MESMA régua do robô (`REGUA` no app = `REGUA` no conducao-robot.mjs: rpm direto, idle zera em 25%, acel zera em 3/100 km) — se a régua do robô mudar, mudar no app também. **Domínio próprio:** o app vai para um subdomínio só dele (**`driverpro.onespot.com.br`**, DNS no Registro.br), servido do repositório separado `fortesindicadores-byte/driverpro` (criado e populado por mim em 06/09/2026 via `add_repo`, com `CNAME` commitado na raiz), que espelha `app-motorista-4/` a cada 15 min pelo workflow **DriverPro Site Sync** (cópia em `scripts/driverpro-site-sync.yml`; o `--exclude CNAME` preserva o domínio). Falta só o Renan ligar Settings → Pages → Source main / root. O GitHub Pages aceita um domínio por repositório e o portal fica no github.io. Apresentações do programa (executiva e para os motoristas) em `docs/driverpro-apresentacao/` (HTML → PDF pelo `render.mjs`).

**O CPF DO MOTORISTA NO GEOTAB É O CAMPO `name` (Renan: "Impossível não ter isso", 05/09/2026):** o login do motorista no MyGeotab é o próprio CPF — 1.310 de 1.313 cadastros têm CPF válido ali (`licenseNumber`/`employeeNo` estão vazios em todos). O modo **`cpf`** do Conducao Robot varre o cadastro inteiro e preenche `ce_motoristas.cpf` onde está vazio (nunca sobrescreve); o `run` diário faz o mesmo para quem entrou depois (`gtPreencheCpf`). **A chave continua `gt:<id>`** — diário e mensal estão amarrados nela; o CPF serve só para o login do DriverPro (`ce_app_login`/`ce_app_criar_pin` acham a chave pelo CPF). Só CPF com dígitos verificadores certos conta (`cpfValido`), porque CNH também tem 11 dígitos. O CPF de teste `00000000191` mora no motorista sintético **`teste:driverpro`** (o DriverPro Check cria/mantém a linha com a service key; sem nota mensal, não entra em ranking) — nunca mais prender o CPF de teste a um motorista real (o `gt:b396` ficou um dia sem entrar por isso).

- **vFleets / PS Latam "Condução Detalhada – DaaS"** — `GET https://api.vfleets.com.br/integrationcore-conducao/conducoes/detalhada?dia=YYYY-MM-DD`, token no header `Authorization`; **1 req/5 min**; agregado diário por motorista/veículo (CPF/CNH), muitos campos prontos (RPM em faixas, motorOcioso, aceleracoes, frenagens, velocidade em faixas, freioMotor, banguela, batendoTransmissao…). Endpoint `/processamentos` avisa dias reprocessados.

**Arquitetura combinada:** HTML público não pode ter segredo → **coletor** roda em **GitHub Actions (cron diário)** ou **Supabase Edge Function**, grava normalizado no **Supabase**; o painel troca `generateRawRows()` por leitura da tabela. De-para motorista ↔ unidade ↔ fonte (casar CPF/CNH do vFleets com Driver do Geotab).

**MANUAL DaaS v1.8 LIDO (25/08/2026) — a API NÃO entrega percentual nenhum.** Ela entrega **contadores e tempos em segundos** por *registro de condução* (um registro por identificação de motorista; o mesmo motorista tem VÁRIOS no dia). Todo pilar do painel é derivado no coletor (`scripts/conducao-robot.mjs`, mapa `CAMPOS` + `derivaVF`), somando os contadores do dia **antes** de dividir — média de médias daria o mesmo peso a um trecho de 5 min e a um turno inteiro. Derivações:

| Pilar | Conta |
|---|---|
| Faixa Verde de RPM | `(rpmVerdeEconomicaTempo+rpmVerdePotenciaTempo) ÷ (rpmAbaixoVerde+rpmVerdeEconomica+rpmVerdePotencia+rpmAmarelo+rpmVermelho)` — **marcha lenta fica FORA do denominador**, porque ela é o pilar seguinte |
| Marcha Lenta | `motorOciosoTempo ÷ tempoDirecao` (sem `motorOcioso`, cai em `rpmMarchaLentaTempo`) |
| Aceleração | `aceleracoesQtd` por 100 km (a `frenagensQtd` é coletada e gravada, mas NÃO pontua) |
| Velocidade | `(via1 + 2×via2 + 3×via3) ÷ tempoMovimento` — faixa 1 = até 20% acima, 2 = 20–30%, 3 = >30%. Usa `velocidadeViaFaixa*` (limite **da via**); `velocidadeFaixa*` (limite configurado) é o fallback |
| Freio Motor & Banguela | `freioMotorTempo ÷ tempoMovimento`, **menos** `banguelaTempo ÷ tempoMovimento` (desconto 1:1, a calibrar) |
| Câmbio | `batendoTransmissaoTempo ÷ tempoMovimento` |

Outras regras do manual que viram código: **`kmCalculado=true` é obrigatório na chamada** — sem ele o registro "sem motorista" do dia repete km e a soma infla (seção *KM Inicial/Final e diferença entre KMs diários*); km vem em **metros**, como `kmInicial`/`kmFinal`. **`inicio`/`fim` nulos = período SEM motorista identificado** → a linha é descartada (não é de ninguém). **1 requisição a cada 5 minutos por token**, senão 429 — o `run` pausa 305 s entre dias (um mês ≈ 2h30, por isso `timeout-minutes: 350` no workflow). `GET /processamentos?inicio=&fim=` lista `{diaConducao, diaReprocessamento, veiculoId, veiculoUoId}` filtrando pela **data do reprocessamento** → modo `reproc` recoleta só os dias que mudaram. Chave do motorista = `cpf` → `cnh` → `documentoIdentificador`; a `uo` do motorista vem no JSON mas o **de-para UO → unidade do portal é do Renan** — o robô não inventa unidade, só lista as UOs vistas no fim do log.

**Roteiro em fases (definido pelo usuário):**
1. **Fase 1** — este painel de BI (ranking/score de condução econômica). ← em andamento
2. **Fase 2** — app do motorista: ele se cadastra e acompanha como está.
3. **Fase 3** — gamificação com dinheiro envolvido; app focado no motorista ver **quanto está deixando de ganhar**.
4. **Fase 4** — unir **condução segura + econômica** (aí entram os pilares de segurança: cinto, celular, colisão, fadiga…).
5. **Fase 5** — propor à **Ambev** usar o app e gamificar o **Brasil todo**, com piloto por **Geo**.
