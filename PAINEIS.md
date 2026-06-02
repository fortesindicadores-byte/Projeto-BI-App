# Gestão em Movimento — Documentação dos Painéis

**Repositório:** `fortesindicadores-byte/gestao-em-movimento`  
**GitHub Pages:** `https://fortesindicadores-byte.github.io/gestao-em-movimento/`  
**Atualizado em:** 2026-06-02

---

## Hub Principal (`/`)

**URL:** `https://fortesindicadores-byte.github.io/gestao-em-movimento/`  
**Arquivo:** `index.html` (raiz)

Ponto de entrada único do sistema. Exige autenticação via Supabase antes de exibir os painéis.

### Funcionalidades
- Login com e-mail + senha
- Cadastro com confirmação por e-mail (via Resend/SMTP)
- Recuperação de senha ("Esqueci minha senha") → link enviado por e-mail
- Redefinição de senha (evento `PASSWORD_RECOVERY`)
- Toggle mostrar/ocultar senha
- Logout

### Layout do Hub (após login)
Grid de cards organizado em 4 clusters:

| Cluster | Painel | Status | URL |
|---|---|---|---|
| FINANCEIRO | Visão Financeira | ✅ Ativo | `/visao-financeira/` |
| FINANCEIRO | Painel KM | ✅ Ativo | `/painel-km/` |
| FINANCEIRO | R$/KM | 🔜 Em breve | `/rs-por-km/` |
| OPERACIONAL | Ativação de Frota | 🔜 Em breve | `/eficiencia-ativacao/` |
| OPERACIONAL | Disponibilidade | 🔜 Em breve | `/disponibilidade/` |
| OPERACIONAL | Combustível | ✅ Ativo | `/combustivel/arvore-combustivel/` |
| PROCESSOS | Gerot | 🔜 Em breve | — |
| PROCESSOS | Auditorias | 🔜 Em breve | `/auditorias/` |
| PROCESSOS | FCA | 🔜 Em breve | `/fca/` |
| RESULTADOS | Prog. Reconhecimento | 🔜 Em breve | — |
| RESULTADOS | Aderência ao FCA | 🔜 Em breve | — |
| RESULTADOS | Painel de Metas | 🔜 Em breve | `/painel-metas/` |

> **Financeiro Pessoal** (`/financeiro-pessoal/`) existe mas **não aparece no Hub** — acesso direto pela URL.

### Tecnologias
- Supabase Auth (JS SDK v2 via CDN)
- HTML/CSS/JS puro — sem framework

---

## Visão Financeira (`/visao-financeira/`)

**URL:** `https://fortesindicadores-byte.github.io/gestao-em-movimento/visao-financeira/`  
**Arquivo:** `visao-financeira/index.html`  
**Fonte de dados:** Google Sheets `1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8` — aba `Consolidado DRE`

### O que mostra
DRE (Demonstração do Resultado do Exercício) consolidado da frota, com:

- **Hero KPI:** Receita Líquida do período com Δ vs Orçado, Δ vs Remunerado e YoY
- **Cards (linha 1):** Orçado / Remunerado / Realizado / Δ Orçado / Δ Remunerado — com YoY
- **Cards (linha 2):** AV Orçado / AV Remunerado / AV Realizado / Δ AVO / Δ AVR — com impacto em BRL
- **Gráfico:** Custo Nominal Mensal (BRL) — barras Realizado + linhas Remunerado e Orçado
- **Gráfico:** AV Custo Mensal (%) — mesmo padrão
- **Tabela Pacote Frota:** custo por conta com Δ BRL, Δ%, Δ YTD
- **Tabela Análise vs Orçado:** Custo DRE × AV% × impacto em pp e BRL
- **Tabela Análise vs Remunerado:** mesmo padrão vs Remunerado

### Filtros
| Filtro | Opções |
|---|---|
| Ano | Anos disponíveis na planilha |
| Vigência | Meses disponíveis, pré-selecionado no M-1 mais recente |
| Unidade | Unidades de negócio |
| Projeto | Prefixo do Nível 3 |
| Pacotes | Combustíveis / Manutenções / Pneus / Seguros e licenças |
| Conta | Conta contábil individual |

### Comportamento especial
- **M-1 auto-seleção:** ao abrir, seleciona automaticamente o mês anterior. Se o dado do mês anterior não existir na planilha, seleciona a vigência mais recente disponível.
- Atualização automática a cada 30 minutos.
- Modo claro/escuro com persistência no `localStorage`.

---

## Painel KM (`/painel-km/`)

**URL:** `https://fortesindicadores-byte.github.io/gestao-em-movimento/painel-km/`  
**Arquivo:** `painel-km/index.html`  
**Fonte de dados:** Google Sheets `1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM` — aba `Dispersão de km`

### O que mostra
Dispersão de quilometragem realizado vs remunerado por unidade e projeto:

- **Hero KPI:** KM Realizado total + KM/Frota Ativa + KM/Viagem
- **Hero deltas:** Δ Rem (abs e %), Impacto R$, Δ YTD (abs e %), Impacto YTD
- **Gráfico Evolução KM:** barras Realizado + linha Remunerado por mês
- **Gráfico Impacto Financeiro:** barras de impacto acumulado por mês
- **Gráfico Km/Frota Ativa:** linha mensal
- **Gráfico Km/Viagem:** linha mensal
- **Gráfico Δ KM por Projeto:** ranqueado pelo desvio absoluto
- **Gráfico Δ% por Projeto:** ranqueado pelo desvio percentual
- **Tabela:** Dispersão por Unidade ou por Projeto (toggle) com Rem, Real, Δ, Δ%, Impacto, Δ YTD, Δ YTD%, Impacto YTD

### Filtros
| Filtro | Opções |
|---|---|
| Ano | Anos disponíveis na planilha |
| Vigência | Meses disponíveis, pré-selecionado no M-1 mais recente |
| Unidade | Unidades de negócio |
| Projeto | Projetos disponíveis |

### Comportamento especial
- **M-1 auto-seleção:** mesmo comportamento da Visão Financeira.
- Toggle de drill-down Unidade / Projeto na tabela.
- Atualização automática a cada 30 minutos.

---

## Árvore de Combustível (`/combustivel/arvore-combustivel/`)

**URL:** `https://fortesindicadores-byte.github.io/gestao-em-movimento/combustivel/arvore-combustivel/`  
**Arquivo:** `combustivel/arvore-combustivel/index.html`  
**Status:** ✅ Ativo

Painel de análise de consumo e custo de combustível da frota, organizado em formato de árvore hierárquica.

---

## Financeiro Pessoal (`/financeiro-pessoal/`)

**URL:** `https://fortesindicadores-byte.github.io/gestao-em-movimento/financeiro-pessoal/`  
**Arquivo:** `financeiro-pessoal/index.html`  
**Status:** ✅ Ativo (acesso direto — não aparece no Hub)

Controle financeiro pessoal (Renan & Tati).

---

## Painéis em breve

| Pasta | Painel |
|---|---|
| `/combustivel/eficiencia-kml/` | Eficiência Km/L |
| `/combustivel/preco-litro/` | Preço R$/L |
| `/combustivel/consumo-co2/` | Consumo CO² |
| `/rs-por-km/` | R$/KM |
| `/eficiencia-ativacao/` | Ativação de Frota |
| `/disponibilidade/` | Disponibilidade |
| `/auditorias/` | Auditorias |
| `/fca/` | FCA |
| `/painel-metas/` | Painel de Metas |

---

## Padrões técnicos comuns

### Stack
- HTML5 + CSS3 + JavaScript ES6+ (sem framework, sem build step)
- Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0
- Montserrat (Google Fonts)
- Dados: Google Sheets via API GVIZ

### Comportamentos padrão
- Modo escuro por padrão, toggle para modo claro
- Header sticky com blur
- Filtros multi-select com busca, opção "only" e badge de contagem
- Atualização automática a cada 30 minutos
- Badge de último acesso (localStorage)
- Responsivo para mobile

### Paleta de cores
| Variável | Valor | Uso |
|---|---|---|
| `--bg` | `#0C1017` | Fundo principal |
| `--orange` | `#F97316` | Cor primária / destaques |
| `--blue` | `#38BDF8` | Cor secundária / linhas |
| `--green` | `#3BB33B` | Positivo / favorável |
| `--red` | `#FF6666` | Negativo / desfavorável |
