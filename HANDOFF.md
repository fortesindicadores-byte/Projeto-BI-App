# Projeto BI App V3 — Handoff (Gestão em Movimento)

> Documento para continuar o projeto em outra máquina / nova sessão do Claude. Cole/abra este arquivo no novo Claude para retomar com contexto total. Última atualização: jun/2026.

---

## 1. O que é
Repositório central de **painéis de BI** da Fortes Indicadores (operação de frota Conlog/Ambev), substituindo o Looker. Cada painel é um **`index.html` autocontido** (sem framework/backend/build) — HTML + CSS + JS + Chart.js + Montserrat.

- **Repo GitHub:** `fortesindicadores-byte/gestao-em-movimento` (a "nuvem" do projeto)
- **No ar (GitHub Pages):** https://fortesindicadores-byte.github.io/gestao-em-movimento/
- **Hub + login:** `index.html` na raiz (auth Supabase)
- **Push:** `git push origin main` (funciona; nas notas antigas havia ressalva de nome renomeado — hoje o push direto está OK)

## 2. Stack e fontes de dados
- **Google Sheets via gviz JSONP** (a maioria dos painéis). Planilhas pesadas (DRE 18k linhas) devem ser filtradas no servidor com `&tq=` (ex.: `select * where K = 'CAMPO GRANDE'`) — senão o JSONP falha no navegador.
- **Conlog via Supabase** (painel Pneus): `https://ewbzeqsneeylwkxtcpme.supabase.co`, tabela `snapshot` (PK endpoint+branch_id, jsonb `data`), alimentada por `scripts/pneus-loader.mjs` (Node, GitHub Actions, lê Prolog API). Endpoints: `vehicles`, `tires`, `inspections`.
- **Auth do hub:** Supabase `https://lozwipoeacpvplgkrxkq.supabase.co`.

### IDs das planilhas principais
- Consolidado ICs (scorecard): `1xGl1Xrk2sPS9zWghEuecFMNBHwmeLiZ02U-QpO8cDPY`
- DRE (Visão Financeira): `1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8` (aba "Consolidado DRE": col9 vig, col10 unidade=cidade, col1 remunerado, col2 realizado, col11 nível3=projeto, col12 conta)
- R$/L e Km/L: `1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A` (aba "Km/L": col0 vig, col15 unidade, col16 placa, col19 modelo, col22 km, col23 litros)
- Dispersão de km: `1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM`
- DPO/FCA/Disponibilidade: `1oW3mss0pXVI6gaDU2z5cDAKvW40LWHCQXpanqSvb12o` (FCA gid=216663799; abas DPO, Demarco, Disponibilidade, Indisponibilidade)

## 3. Padrão visual (obrigatório)
- Laranja `#F97316`, Montserrat, fundo escuro `#0C1017`.
- **Modo claro PADRÃO = cinza translúcido** (referência: Visão Financeira): `body.light-mode .main{background:#F0F0F0}` e cards `background:rgba(128,128,128,.14)!important;border:none!important;box-shadow:none!important`. (NÃO usar branco — já padronizado em todos os painéis.)
- Hero (número grande) fora de card; KPIs em cards; tabelas clean.
- Filtros multi-select com "Todos" (sel vazio = todos). Importante: no estado "Todos", desmarcar um item deve preencher o set com todos-menos-1 (senão não desmarca) — padrão já corrigido em todos.
- Convenção de ranking: melhor→pior = título "Ranking"; pior→melhor = "Bottom" (sem escrever a direção).

## 4. Painéis (status)
**Ativos/maduros:** Visão Financeira (referência de layout), Painel KM, Combustível (Árvore, CO²), Disponibilidade, FCA, FCA Gerencial, Auditorias (Demarco & DPO/VPO), Painel Metas, Programa Reconhecimento, Diagnóstico, Resumo Executivo, Scorecard, **Pneus** (Conlog), Financeiro Pessoal (acesso direto).
**Teste:** `fca-teste/` (ver §6).

## 5. Trabalho recente desta sessão (jun/2026)
- **Light mode** padronizado (cinza) em todos os painéis.
- **Disponibilidade:** fontes +2px (CSS e Chart.js), tabelas 520px, cor de "Dias Ind." por faixa (≤5 verde/6–10 amarelo/>10 vermelho), **de-para da aba Indisponibilidade** (`mapUniInd` por cidade+projeto → código), Dias Ind. calculado pela Data Parada, títulos alinhados à esquerda, filtros desmarcáveis.
- **Scorecard:** **20 indicadores por unidade** (respondem ao filtro) + **tabela de ranking ponderado**. Ver memória `scorecard_ranking.md` (fontes/colunas/de-paras/pesos). Score pintado, DPO cai p/ 2H25 se sem 1H26 (escala N4=100…N0=0), cards em 2 linhas de 10.
- **Pneus:** km/dia da Previsão de Troca agora vem do **combustível** (Km/L: km÷25, média das vigências; empilhadeira=250; fallback modelo→unidade→odômetro) — alimenta Km/dia, Data Prevista, "Recape em" e previsão orçamentária; gráfico estendido p/ 12 meses. Ver `pneus_km_combustivel.md`.
- Removida toda menção "FEMSA" do repo.

## 6. FCA de teste (`fca-teste/index.html`) — em desenvolvimento
Página de preenchimento de FCA por unidade. URL: `/gestao-em-movimento/fca-teste/` (unidade de teste **CGR**).
- **Fatos** (indicadores com desvio) vêm de: ICs do Gerot + Disponibilidade (planilha ICs, abaixo da meta 90%), **Consumo Km/L** (nominal, da planilha Km/L: km÷litros real vs rem), e **desvios financeiros** da DRE. **IMPORTANTE: custos na DRE são NEGATIVOS**; desvio (gasto acima do orçado) = `remunerado − realizado > 0`; magnitude = esse valor, % = mag/|rem|. Excluídos sempre: Receita Líquida, ICMS Crédito Presumido, IPVA e Licenciamento, Estorno ICMS.
- DRE filtrada **no servidor** (`&tq=select * where K = 'CAMPO GRANDE'`) — senão o JSONP de 18k linhas falha no navegador.
- **Cabeçalho do fato (ordem):** Unidade·Vigência (11px) → Indicador → rótulo **"Fato:"** (12px) → **Desvio** (o desvio É o fato). Formato do desvio (todos): **"Desvio: ▲ nominal · ▲ %"**.
- **Barra de título** em 2 níveis (eyebrow "Gestão em Movimento · BI Frota" + h1 "FCA · Preenchimento") + **filtros de Projeto e Indicador** (`<select>` `aplicar()`; sem projeto = "Geral") + badge da unidade (CGR).
- Layout **tabela**, unidade por **código** (sem coluna Projeto; financeiro **não agrupa** — mostra o projeto/nível3 na linha de meta), **por ação** ("+ adicionar ação", cada ação com Causa/Ação/Responsável/Prazo/Status), Causa/Ação `<textarea rows=1>` auto-expansível, campos com altura inicial igual (38px), **Status** colorido (Concluída verde, Em andamento âmbar, Não iniciada vermelho, **Cancelada cinza escuro/branco**). Card com borda uniforme (sem barra lateral colorida).
- **Filtros (Projeto, Indicador):** no **padrão multi-select do Gestão em Movimento** (botão "Todos" + busca + desmarcar item no estado Todos). **REGRA: todo filtro daqui pra frente segue esse padrão** (não usar `<select>` simples). "Geral" = fatos sem projeto.
- **Campo Acompanhamento** por ação (textarea de follow-up/progresso, salvo junto na ação).
- **Edição/lock:** hoje **SEM trava** — Salvar só persiste, segue 100% editável. No real (Supabase), decisão a tomar: manter a ação editável e usar o **Acompanhamento** para registrar progresso ao longo do tempo; opcionalmente **travar Causa/Ação/Responsável/Prazo quando Status=Concluída** (deixando Acompanhamento sempre aberto).
- **Persistência: SÓ localStorage (por navegador/dispositivo).** Ao clicar Salvar hoje: grava só naquele navegador — NÃO vai pro BI, NÃO é compartilhado, some se limpar cache/trocar de aparelho. É só teste de UX.
- **PRÓXIMO PASSO (a fazer):** ligar no **Supabase** — tabela `fca` (unidade, vigência, fato/indicador, projeto, ações…), RLS por unidade (link por token ou login), cliente usa **só chave anon + RLS** (nunca service_role). Aí grava na nuvem, consolida e alimenta o BI.

## 6.1 FCA — Roadmap definido p/ próxima sessão (ordem do usuário)
1. **Consolidar os FCAs que já existem no Sheet** na MESMA base do novo formato (Supabase `fca`), **sem perder histórico**, e **continuar alimentando** os painéis **FCA** e **Aderência FCA**. → Migrar as linhas da planilha FCA (gid=216663799: origem, vigência, unidade=código, projeto, prazo, status) para a tabela `fca`; decidir se os painéis FCA/Aderência passam a ler do Supabase ou se mantém a planilha sincronizada. Não quebrar o histórico.
2. **Aplicar o novo formato a TODAS as unidades** (hoje só CGR). → Parametrizar `fca-teste` (UNIDADE_IC/UNIDADE_DRE/UNIDADE_COD viram variáveis por unidade; de-paras por unidade já estão nas memórias). A unidade virá do link/login.
3. **Hub para liberar acesso por unidade.** → Link por unidade (token) ou auth Supabase + **RLS** (cada unidade só a sua); o hub já tem auth Supabase para reusar.
4. **Visão consolidada das ações (admin).** → Página que lê todas as linhas de `fca` e permite o **admin editar** (RLS de admin); para o usuário acompanhar/ajustar tudo.

## 7. Pendências / próximos passos
1. **Ligar o FCA no Supabase** (gravar de verdade por unidade, link por unidade, depois alimentar o BI). Plano: tabela `fca` + RLS por unidade + página de preenchimento por token/login. (Hoje só localStorage.)
2. **Validar no navegador** (o preview local não carrega DRE/Conlog): números do Scorecard por unidade e do km do combustível no Pneus (matching de placa/modelo/cidade).
3. **SEGURANÇA (pendente):** rotacionar a **service_role do Conlog** que apareceu em prints; nunca commitar token/service_role no repo público; loader usa env vars no GitHub Actions.
4. Não tocar no projeto **FEMSA** (repo separado).

## 8. Memórias do projeto (contexto detalhado)
Em `~/.claude/.../memory/` (resumos no `MEMORY.md`):
- `scorecard_ranking.md` — spec dos 20 indicadores + pesos + de-paras.
- `pneus_km_combustivel.md` — regra do km pelo combustível.
- `pneus_regras_algoritmo.md` — motor de laudo por eixo (regras de engenharia validadas).
- `depara_unidades.md` / `depara_unidades_conlog.md` — de-paras de unidade entre painéis.
- `projeto_pneus_conlog.md`, `design_system.md`, `gestao_em_movimento.md`.

## 9. Como continuar em outra máquina
1. `git clone https://github.com/fortesindicadores-byte/gestao-em-movimento.git`
2. Servir localmente (qualquer http server) ou editar e `git push` (deploy automático no GitHub Pages).
3. Abrir este `HANDOFF.md` + as memórias no novo Claude para contexto.
4. (O histórico DESTE chat não migra — use este doc como ponto de partida.)
