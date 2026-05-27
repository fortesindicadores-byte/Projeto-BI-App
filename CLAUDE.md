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
