# Estado do Projeto — Gestão em Movimento (retomada pós-/clear)

> Handoff para continuar depois de um `/clear`. Leia este arquivo primeiro.
> O painel **`visao-financeira/index.html` é o PADRÃO de referência** de layout, cores, tipografia,
> gráficos, tabelas e filtros. Guia detalhado de padrões: `CLAUDE.md`.

## 1. Visão geral
- BI da Fortes Indicadores. Cada painel é um `index.html` autocontido (sem framework, sem build).
- **Homologação/Dev:** `fortesindicadores-byte/gestao-em-movimento` — Pages: `https://fortesindicadores-byte.github.io/gestao-em-movimento/`
- **Produção (destino):** `Conlog-SA/frota-gestao-em-movimento` (VAZIO ainda). Ver §6.
- Hub raiz `index.html` = auth Supabase + grid de painéis por clusters.

## 2. Fluxo de publicação (SEGUIR À RISCA)
Branch de trabalho: **`claude/epic-edison-ae21sz`** (nunca commitar direto na main).
```bash
git stash -q 2>/dev/null; git fetch origin main -q && git reset --hard origin/main -q; git stash pop 2>&1 | tail -1
# ... editar ...
git add <arquivos> && git commit -F - <<'EOF'
<título>

<corpo>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CoPzrx19nUHZqody5fEJUg
EOF
for i in 1 2 3 4; do git push -u origin claude/epic-edison-ae21sz --force-with-lease && break; sleep $((2**i)); done
```
- **PR:** `mcp__github__create_pull_request` (draft:true) → `update_pull_request` draft:false → `merge_pull_request` squash. Carregar tools via `ToolSearch` `select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__merge_pull_request` (o MCP github cai/volta; recarregar quando preciso).
- **NUNCA** colocar o id do modelo em commit/PR/código. **`.nojekyll`** na raiz é obrigatório.
- Ao mudar dado/estrutura de um painel, **bumpar a chave de cache** (visao-financeira está em `bi_cache_vf_v8`).
- Validar JS antes de commitar: extrair `<script>` e `node --check`.

## 3. Ambiente / limitações
- **Sandbox NÃO alcança** docs.google/github.io/supabase/prologapp (HTTP 000/403 pelo proxy). Não dá pra ler dados ao vivo daqui.
- **Para LER/COMPARAR dados da planilha**: criar um **workflow temporário no GitHub Actions** (o runner alcança docs.google) que faz `fetch` do gviz e loga o resultado; depois ler o log via `mcp__github__get_job_logs`. Foi assim que validei a migração (ver `scripts/dre-diag.mjs` no histórico, removido). Mesma técnica do Prolog.
- **Google Sheets** lido via gviz JSONP no navegador. `idxDe/ebIdx(cols,...nomes)` = match normalizado (sem acento) exato e depois substring.
- **Supabase:** auth `lozwipoeacpvplgkrxkq` (fca_profiles, access_log, mpr_fields); Conlog `ewbzeqsneeylwkxtcpme` (snapshot Pneus/Prolog).
- **GitHub App** empurra como `fortesindicadores-byte`; escopo desta sessão = só o repo de homologação.

## 4. Padrão de filtro multi-select ("Todos") — referência: `disponibilidade/index.html` e `manutencao/index.html`
- `sel` (Set) vazio + `_none=false` ⇒ TODOS; vazio + `_none=true` ⇒ NENHUM; com itens ⇒ aqueles.
- `getMsV`: se `_none` e sel vazio → retorna sentinela `[' __NONE__']`.
- Handler "Todos": `sel.clear(); wrap._none=!box.checked;`  ·  `allChk = sel.size===0 && !wrap._none`.
- Ordenar datas: `dd/mm/aaaa → aaaammdd`; vigência `mm/aaaa → aaaamm`.

## 5. visao-financeira — COMO FUNCIONA HOJE (importante p/ YTG)
- **Fonte: lê direto das 3 abas** da planilha `1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8` (NÃO usa mais "Consolidado DRE"; Apps Script aposentável):
  - `Frota` → custos (conta = coluna CONTA GERENCIAL)
  - `Receita Líquida` → receita (conta **forçada** = 'Receita Líquida')
  - `EBITDA` → linha própria (aggEbitda)
  - As 3 abas têm o mesmo layout: `VIGÊNCIA | Δ ORÇ (BRL) | Δ REM (BRL) | Unidade | NÍVEL 3 | CONTA GERENCIAL | MÊS | ANO | ORÇADO | REMUNERADO | REALIZADO`.
- `fetchTab()` lê a aba; `tabToRows()` converte pro formato interno (`C={orc:0,rem:1,real:2,vig:9,nv3:11,cta:12}`), mapeando por nome (`mapTab`), vigência derivada de **MÊS+ANO** (fallback VIGÊNCIA), números pt-BR via `_numBR`. Só `orc/rem/real/vig/nv3/cta` são usados.
- Unidade/Projeto derivados do **NÍVEL 3**: `getUniLabel` (à direita do "-") e `getNv3Prefix` (à esquerda).
- **Migração validada**: comparação Consolidado × (Frota+Receita) deu diferença ZERO em receita, custos e todas as 14 contas.
- **Acumulado**: `ateUltimoReal(rows)` recorta até o último mês com realizado/remunerado (`temReal`); meses futuros só-orçado **não entram** nos acumulados (hero, cards, tabelas vs Orçado/Remunerado, pacote, EBITDA). YoY compara o mesmo período. Aplica-se só quando NÃO há vigência específica selecionada.
- **Filtro Vigência abre no último mês com realizado** (`lastRealVigKey`), não em "mês atual-1".
- **Gráficos**: linha do **Orçado vai até dezembro** sempre (mesmo com vigência selecionada — a seleção só destaca o mês); Realizado/Remunerado param no último mês com dado. Azul do Orçado = `#3B82F6` (dark) / `#1D4ED8` (light); legenda usa `border-top-color` com especificidade `.chart-leg .leg-orc-dash`.
- **Tabelas de análise** (`renderAnalise`): colunas ORÇ/REM | REAL | Δ BRL | Δ% | AV Orç/Rem | AV Real | Δ pp | **IMPACTO (BRL)**. Impacto por conta = `Δpp × Receita Líquida Realizada`. Linha **EBITDA** abaixo do Total (condicionais como Receita, maior=melhor).
- `CONTAS` / `CONTAS_ALIAS` / `PACOTES_MAP` mapeiam os nomes crus de CONTA GERENCIAL p/ as contas canônicas.

## 6. Migração para produção (Conlog-SA) — BLOQUEADA nesta sessão
- Push daqui dá **403** (escopo da sessão fixo no repo de homologação; não muda no meio da sessão). App do Claude já tem escrita na Conlog-SA e o usuário é **owner** da org.
- **Resolver:** (A) usuário empurra com a conta dele: `git clone https://github.com/fortesindicadores-byte/gestao-em-movimento.git && cd gestao-em-movimento && git push https://github.com/Conlog-SA/frota-gestao-em-movimento.git main:main`; OU (B) adicionar o repo Conlog ao ambiente do Claude Code e abrir **sessão nova**.
- Pós-cópia: Pages (main/root, `.nojekyll`), Secrets (`PROLOG_TOKEN`,`SUPABASE_URL`,`SUPABASE_SERVICE_KEY`,`RESEND_API_KEY`,`FAROL_FROM`), Supabase Auth → Redirect URL de prod. Trocar 2 URLs só no prod: `scripts/farol-mailer.mjs` (const `HUB`) e `apresentacao-projeto.html`. Cadastros/acessos NÃO se perdem (Supabase compartilhado). Runbook: `MIGRACAO-PRODUCAO.md`.

## 7. PRÓXIMO: painel YTG (Year To Go) — reorçamento por AVO  ← TAREFA ATUAL
Coletando regras com o usuário. **NÃO gerar até ele dizer "gera".** Regras até agora:

1. Base: no **acumulado ano**, a tabela **Análise vs Orçado** já dá o **impacto em R$ vs orçamento** — coluna **IMPACTO (BRL)** = `Δpp × Receita Líquida Realizada` por conta; Total exemplo = **-369,78k**.
2. Esse **impacto acumulado (desfavorável)** é o **alvo a economizar até o fim do ano** (recuperar nos meses que faltam).
3. Quer uma visão com o **acumulado ano** + a **projeção do novo orçamento por conta**, distribuindo esse valor:
   - **por mês**, pelo **peso do orçamento do mês** (orçado do mês ÷ total dos meses),
   - **por conta**, pelo **peso da conta** (orçado da conta ÷ total das contas).

**Fórmula entendida (a confirmar):** economia(conta,mês) = alvo × pesoConta × pesoMês; novo_orçamento(conta,mês) = orçado_original − economia. A soma das economias fecha o alvo.

**DÚVIDAS EM ABERTO (travar antes de gerar):**
- (a) base do **peso do mês** = meses que faltam (jun→dez) ou ano todo (jan→dez)? (provável: só os que faltam)
- (b) valor distribuído = **impacto total** (um número) espalhado por conta×mês pelos dois pesos, OU **impacto de cada conta** (coluna IMPACTO) espalhado só pelos meses? (frase do usuário soa como o total pelos dois pesos)

Provável fonte de dados: mesma planilha/abas do visao-financeira. Novo painel provável em `rs-por-km/`? não — criar pasta nova tipo `ytg/`. Seguir layout visao-financeira.

## 8. Outras pendências
- **Descarte de pneus** (`pneus/descarte.html`): 2 gráficos de barra temporais (quantidade + % mês a mês). A API v3 do Prolog **não expõe a data do descarte** (confirmado com 4 diagnósticos); só existe no relatório "Pneus descartados" (CSV). **Decisão do usuário pendente (1/2/3):** (1) importar CSV compartilhado no Supabase [recomendado], (2) CSV local, (3) não fazer.
- **Farol e-mail**: bloqueado na verificação de domínio no Resend (TI).
- **Manutenção** (`manutencao/index.html`): CONCLUÍDO — filtros Vigência(=mês/ano da Data), Unidade/Projeto(=Nível 3, direita/esquerda do "-"), Centro de Custo, Fornecedor, Conta, Documento; "Todos" desmarcável. Base = Google Sheets `1S7L6G3L8bboirAExGPRCITYkWsGoVpjUoXc-aVXdW6k` (gid=0), NÃO no GitHub.

## 9. Números úteis
- Planilha DRE/Frota/Receita/EBITDA: `1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8` (abas Frota, Receita Líquida, EBITDA).
- Manutenção: `1S7L6G3L8bboirAExGPRCITYkWsGoVpjUoXc-aVXdW6k` (gid=0). Disponibilidade: `1oW3mss0pXVI6gaDU2z5cDAKvW40LWHCQXpanqSvb12o`.
- PRs recentes: #75-76 Manutenção filtros, #77 acumulado cutoff, #78 multi-aba (revertido #79), #80 multi-aba+diag, #81 default/gráfico, #83 remove diag (migração validada), #84 legenda azul.
