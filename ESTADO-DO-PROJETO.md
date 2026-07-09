# Estado do Projeto — Gestão em Movimento (retomada pós-/clear)

> Handoff para continuar depois de um `/clear` (ou em outra máquina). **Leia este arquivo primeiro.**
> O painel **`visao-financeira/index.html` é o PADRÃO de referência** de layout, cores, tipografia,
> gráficos, tabelas e filtros. Guia detalhado de padrões visuais/CSS/JS: `CLAUDE.md`.

## 1. Visão geral
- BI da Fortes Indicadores. Cada painel é um `index.html` **autocontido** (sem framework, sem backend, sem build step).
- **Homologação/Dev:** `fortesindicadores-byte/gestao-em-movimento` — Pages: `https://fortesindicadores-byte.github.io/gestao-em-movimento/`
- **Produção (destino):** `Conlog-SA/frota-gestao-em-movimento` (ainda VAZIO). Ver §7.
- Hub raiz `index.html` = auth Supabase + grid de painéis por clusters.
- Dados vêm de **Google Sheets** (lidos no navegador) e, em alguns casos, de **Supabase**.

## 2. Fluxo de publicação (SEGUIR À RISCA)
Branch de trabalho: **`claude/epic-edison-ae21sz`** (nunca commitar direto na main).
```bash
# 1) sincronizar com a main (preservando edição local se houver)
cp <arquivo_editado> /tmp/keep 2>/dev/null
git fetch origin main -q && git reset --hard origin/main -q
cp /tmp/keep <arquivo_editado> 2>/dev/null
# 2) validar JS antes de commitar (extrair <script> e node --check) — ver §3
# 3) commitar
git add <arquivos> && git commit -F - <<'EOF'
<título>

<corpo>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CoPzrx19nUHZqody5fEJUg
EOF
# 4) push com retry
for i in 1 2 3 4; do git push -u origin claude/epic-edison-ae21sz --force-with-lease && break; sleep $((2**i)); done
```
- **PR:** `mcp__github__create_pull_request` (draft:true) → `update_pull_request` draft:false → `merge_pull_request` squash. Carregar tools via `ToolSearch` `select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__merge_pull_request` (o MCP github cai/volta; recarregar quando precisar).
- Depois de cada squash-merge, a branch diverge da main → **sempre `git fetch + reset --hard origin/main` e reaplicar a edição** antes do próximo commit (senão o merge dá conflito). O padrão do passo 1 acima já faz isso.
- **NUNCA** colocar o id do modelo (`claude-opus-...`) em commit/PR/código. **`.nojekyll`** na raiz é obrigatório.
- Ao mudar dado/estrutura de um painel, **bumpar a chave de cache** (visao-financeira: `bi_cache_vf_v8`; programa-reconhecimento: `bi_cache_reconhecimento_v2`).

## 3. Ambiente / limitações  ← LEIA ANTES DE TENTAR LER DADOS
- **Sandbox NÃO alcança** docs.google / github.io / supabase / prologapp (HTTP 000/403 pelo proxy). **Não dá pra ler dados ao vivo daqui.**
- **Para LER/COMPARAR dados de planilha:** criar um **workflow temporário no GitHub Actions** (o runner alcança docs.google), rodar um `.mjs` que faz `fetch` e loga o resultado, ler via `mcp__github__get_job_logs` (`return_content:true`, `tail_lines`). Descartar depois. Foi assim que validei todas as migrações.
  - Disparar: `mcp__github__actions_run_trigger` (`run_workflow`, ref=`main` ou a branch). Status/logs: `actions_list` (`list_workflow_runs`/`list_workflow_jobs`) + `get_job_logs`.
  - `list_workflow_runs` costuma estourar o limite de tokens → salvar no arquivo e ler com `python3 -c "import json; ..."`.
- **`list_workflow_runs` com `workflow_runs_filter:{branch:...}`** deixa rodar o workflow na própria branch de trabalho (sem precisar mergear na main pra testar).
- **Leitura de Google Sheets — ARMADILHA IMPORTANTE:**
  - `gviz` (`/gviz/tq?tqx=out:csv|json`) **TRUNCA abas grandes** — detecta só o "primeiro bloco/tabela" e para na 1ª linha em branco. Ex.: a "Base RPM" tinha 6552 linhas e o gviz devolvia só 156. **Nem `range=A1:M100000` resolve.**
  - **Solução p/ grade inteira:** `/export?format=csv&gid=<GID>` devolve a planilha toda **E** manda `Access-Control-Allow-Origin: *` (funciona no navegador, cross-origin do github.io). Foi o que destravou o Programa de Reconhecimento (§6).
  - Descobrir o **GID** de uma aba: no HTML de `/<id>/htmlview` há `items.push({name:"Aba", pageUrl:"...gid=N", gid:"N", ...})` (chaves **sem aspas**). A 1ª aba é sempre `gid=0`.
  - Abas pequenas (Frota, Receita, EBITDA, Consolidado ICs) o gviz JSON lê inteiras — o visao-financeira usa gviz JSON e funciona.
- **Match de colunas:** `idxDe/ebIdx/normKey_(cols,...nomes)` = normaliza (sem acento, minúsculo, **colapsa espaços duplos**) e casa exato depois substring. A Base RPM tem espaço duplo em alguns KPIs ("Aderência  às Preventivas").
- **Validar JS antes de commitar:**
  ```bash
  python3 - <<'EOF'
  import re; html=open('<painel>/index.html',encoding='utf-8').read()
  open('/tmp/chk.js','w').write(max(re.findall(r'<script>(.*?)</script>',html,re.S),key=len))
  EOF
  node --check /tmp/chk.js
  ```
- **Supabase:** auth `lozwipoeacpvplgkrxkq` (fca_profiles, access_log, mpr_fields); Conlog `ewbzeqsneeylwkxtcpme` (snapshot Pneus/Prolog).
- **GitHub App** empurra como `fortesindicadores-byte`; escopo desta sessão = **só o repo de homologação**.

## 4. Padrão de filtro multi-select ("Todos")
Duas variantes convivem no repo:
- **`disponibilidade`/`manutencao`:** `sel` (Set) vazio + `_none=false` ⇒ TODOS; vazio + `_none=true` ⇒ NENHUM; com itens ⇒ aqueles. `getMsV`: se `_none` e sel vazio → sentinela `[' __NONE__']`. Handler "Todos": `sel.clear(); wrap._none=!box.checked;` · `allChk = sel.size===0 && !wrap._none`.
- **`visao-financeira`/`programa-reconhecimento`:** array `selVig`; vazio = "Todas". `getMsValues` devolve os selecionados.
- Ordenar datas: `dd/mm/aaaa → aaaammdd`; vigência `mm/aaaa → aaaamm` (ou usar `vigKey` = `aaaa-mm`).

## 5. visao-financeira — COMO FUNCIONA HOJE  (referência p/ YTG)
- **Fonte: lê direto de 3 abas** da planilha `1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8` (NÃO usa mais "Consolidado DRE"; o Apps Script pode ser aposentado):
  - `Frota` → custos (conta = coluna **CONTA GERENCIAL**)
  - `Receita Líquida` → receita (conta **forçada** = 'Receita Líquida')
  - `EBITDA` → linha própria (`aggEbitda`)
  - Layout comum das 3: `VIGÊNCIA | Δ ORÇ (BRL) | Δ REM (BRL) | Unidade | NÍVEL 3 | CONTA GERENCIAL | MÊS | ANO | ORÇADO | REMUNERADO | REALIZADO`.
  - **Anos disponíveis (conferido):** Frota/Receita têm **2025 e 2026** completos; EBITDA tem **2024, 2025 e 2026**. (Logo o YoY tem base de comparação.)
- `fetchTab()` lê a aba (gviz JSON); `tabToRows()` converte pro formato interno (`C={orc:0,rem:1,real:2,vig:9,nv3:11,cta:12}`), mapeando por nome (`mapTab`), vigência derivada de **MÊS+ANO** (fallback VIGÊNCIA), números pt-BR via `_numBR`. Só `orc/rem/real/vig/nv3/cta` são usados.
- Unidade/Projeto derivados do **NÍVEL 3**: `getUniLabel` (à direita do "-") e `getNv3Prefix` (à esquerda).
- **Migração multi-aba validada**: Consolidado × (Frota+Receita) deu diferença ZERO em receita, custos e todas as 14 contas.
- **Acumulado**: `ateUltimoReal(rows)` recorta até o último mês com realizado/remunerado (`temReal`); meses futuros só-orçado **não entram** nos acumulados. Aplica-se só quando **NÃO** há vigência específica selecionada.
- **Filtro Vigência abre no último mês com realizado** (`lastRealVigKey`), não em "mês atual-1".
- **Gráficos**: linha do **Orçado vai até dezembro** sempre (vigência selecionada só destaca o mês); Realizado/Remunerado param no último mês com dado. Azul do Orçado = `#3B82F6` (dark) / `#1D4ED8` (light); legenda `.chart-leg .leg-orc-dash{border-top-color:...}`.
- **HERO**: Receita Líquida à esquerda + **EBITDA no canto direito** (`.hero-ebitda`, `margin-left:auto; text-align:right`), ambos com valor + Δ Orç. %, Δ Rem. %, YoY %. `renderEbitdaHero(cur,prev)` usa `aggEbitda`. No mobile o EBITDA empilha à esquerda.
- **YoY do período anterior — REGRA (corrigido nesta sessão):** ao selecionar **vigências específicas**, o período anterior mapeia as vigências pro ano-1 (`2026-03 → 2025-03`) e **NÃO mantém a trava de ANO** (senão vira "ano atual + vigência do ano anterior" = vazio, zerava o YoY). Vale p/ Receita/cards e p/ o EBITDA hero. No modo por ANO (sem vigência), compara o mesmo período (só meses fechados).
- **Tabelas de análise** (`renderAnalise`): ORÇ/REM | REAL | Δ BRL | Δ% | AV Orç/Rem | AV Real | Δ pp | **IMPACTO (BRL)**. Impacto por conta = `Δpp × Receita Líquida Realizada`. Linha **EBITDA** abaixo do Total (condicionais como Receita, maior=melhor).
- `CONTAS` / `CONTAS_ALIAS` / `PACOTES_MAP` mapeiam os nomes crus de CONTA GERENCIAL p/ as contas canônicas.

## 6. programa-reconhecimento — migrado p/ ler a Base RPM direto (nesta sessão)
- **Antes:** lia a aba `Consolidado ICs` (gerada pelo Apps Script `consolidarICs_RPM`). **Agora:** lê a aba **`Base RPM` direto** (`export?format=csv&gid=0`) e **recalcula os ICs e a Pontuação no navegador** — dispensa a aba consolidada e o script.
- Planilha: `1xGl1Xrk2sPS9zWghEuecFMNBHwmeLiZ02U-QpO8cDPY`. **Base RPM = gid `0`**.
- `pivotBaseRPM(grid)`: uma linha por **(vigência, unidade)** com os 11 ICs (coluna "% de Ating.") e `pont` via `calcScore_`. Só considera unidades do mapa `NOMES` (13 unidades). Vigência "jan./2026" → "2026/01/01" via `vigToYMD`.
- **Pontuação** (`calcScore_`, réplica do Apps Script): média ponderada 0-100 com `CAP_AT_100=true`, `MISSING_AS_ZERO=false` (redistribui o peso dos ICs ausentes). Pesos em `SCORE_WEIGHTS_PCT` (somam 100%): Disponibilidade 20, Preventivas 15, Consumo Km/l 10, Aferições 10, Checklist T1/T2 10, Checklist Apoio 10, Conformidade Frota 5, Stress Caminhões 5, Stress Empilhadeiras 5, SLA 5, Aderência à Conformidade 5.
- **Validação (Actions):** recompute × Consolidado ICs = **65/65 Pontuações batem, 0 divergem**; só 2 células de IC diferem por arredondamento de exibição (95,7% vs 95,65%, sem afetar a Pontuação); +13 linhas novas (junho/2026 = dado mais fresco que o script ainda não consolidou). Verificação end-to-end com a **lógica exata do painel** também bateu 65/65.
- **Filtro de vigência:** mostra **todas as vigências com dados** e abre já no estado **"Todas"** selecionado.
- **PENDÊNCIA conhecida (não é da migração):** os rótulos **CIVF × SLA parecem trocados** no painel (coluna "SLA de atendimento" é exibida como CIVF e vice-versa). Mantido idêntico ao comportamento antigo p/ a migração não mudar nada visível; **não afeta a Pontuação** (ambos pesam 5%). Corrigir só se o usuário pedir.
- Cache: `bi_cache_reconhecimento_v2`.

## 7. Migração para produção (Conlog-SA) — BLOQUEADA nesta sessão
- Push daqui dá **403** (escopo da sessão fixo no repo de homologação; não muda no meio da sessão). App do Claude já tem escrita na Conlog-SA e o usuário é **owner** da org.
- **Resolver:** (A) usuário empurra com a conta dele — `git clone https://github.com/fortesindicadores-byte/gestao-em-movimento.git && cd gestao-em-movimento && git push https://github.com/Conlog-SA/frota-gestao-em-movimento.git main:main`; OU (B) adicionar o repo Conlog ao ambiente do Claude Code e abrir **sessão nova**.
- Pós-cópia: Pages (main/root, `.nojekyll`), Secrets (`PROLOG_TOKEN`,`SUPABASE_URL`,`SUPABASE_SERVICE_KEY`,`RESEND_API_KEY`,`FAROL_FROM`), Supabase Auth → Redirect URL de prod. Trocar 2 URLs só no prod: `scripts/farol-mailer.mjs` (const `HUB`) e `apresentacao-projeto.html`. **Cadastros/acessos NÃO se perdem** (Supabase compartilhado). Runbook: `MIGRACAO-PRODUCAO.md`.

## 8. PRÓXIMO: painel YTG (Year To Go) — reorçamento por AVO  ← TAREFA PAUSADA
Coletando regras com o usuário. **NÃO gerar até ele dizer "gera".** Provável pasta nova `ytg/` (já existe a pasta), seguindo o layout do visao-financeira. Regras até agora:
1. Base: no **acumulado ano**, a tabela **Análise vs Orçado** já dá o **impacto em R$ vs orçamento** — coluna **IMPACTO (BRL)** = `Δpp × Receita Líquida Realizada` por conta; Total exemplo = **-369,78k**.
2. Esse **impacto acumulado (desfavorável)** é o **alvo a economizar até o fim do ano**.
3. Visão com **acumulado ano** + **projeção do novo orçamento por conta**, distribuindo o alvo:
   - **por mês**, pelo **peso do orçamento do mês** (orçado do mês ÷ total),
   - **por conta**, pelo **peso da conta** (orçado da conta ÷ total das contas).
- **Fórmula (a confirmar):** economia(conta,mês) = alvo × pesoConta × pesoMês; novo_orçamento = orçado_original − economia. Soma das economias fecha o alvo.
- **DÚVIDAS EM ABERTO (travar antes de gerar):** (a) base do peso do mês = meses que faltam (jun→dez) ou ano todo? (provável: só os que faltam); (b) distribuir o **impacto total** por conta×mês pelos dois pesos, OU o **impacto de cada conta** (coluna IMPACTO) só pelos meses?

## 9. Outras pendências
- **Descarte de pneus** (`pneus/descarte.html`): 2 gráficos de barra temporais (quantidade + % mês a mês). A API v3 do Prolog **não expõe a data do descarte** (confirmado em 4 diagnósticos); só existe no relatório "Pneus descartados" (CSV). **Decisão do usuário pendente:** (1) importar CSV compartilhado no Supabase [recomendado], (2) CSV local, (3) não fazer.
- **Farol e-mail**: bloqueado na verificação de domínio no Resend (TI).
- **Manutenção** (`manutencao/index.html`): CONCLUÍDO — filtros Vigência(=mês/ano da Data), Unidade/Projeto(=Nível 3, direita/esquerda do "-"), Centro de Custo, Fornecedor, Conta, Documento; "Todos" desmarcável. Base = Sheets `1S7L6G3L8bboirAExGPRCITYkWsGoVpjUoXc-aVXdW6k` (gid=0), NÃO no GitHub.

## 10. Números úteis
- **DRE/Frota/Receita/EBITDA:** `1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8` (abas Frota, Receita Líquida, EBITDA).
- **Programa Reconhecimento (Base RPM):** `1xGl1Xrk2sPS9zWghEuecFMNBHwmeLiZ02U-QpO8cDPY` (Base RPM = gid 0; Consolidado ICs = gid 569562926).
- **Manutenção:** `1S7L6G3L8bboirAExGPRCITYkWsGoVpjUoXc-aVXdW6k` (gid=0). **Disponibilidade:** `1oW3mss0pXVI6gaDU2z5cDAKvW40LWHCQXpanqSvb12o`.
- **PRs recentes (desta sessão):** #77 acumulado cutoff · #80 multi-aba+diag · #81 default/gráfico · #84 legenda azul · #85 ESTADO doc · #86-94 diag Base RPM (gviz trunca → export CSV) · **#95 Programa Reconhecimento lê Base RPM** · #96 filtro "Todas" · **#97 EBITDA no hero** · **#98 fix YoY ao filtrar vigências** · #99 cleanup diag.

## 11. Painéis ATIVOS (resumo)
- `visao-financeira/` — DRE Consolidado Frota (PADRÃO de referência).
- `painel-km/` — Painel KM.
- `combustivel/arvore-combustivel/` — Árvore de Combustível.
- `programa-reconhecimento/` — Pódio/ranking de unidades (lê Base RPM).
- `manutencao/` — custos de manutenção (Sheets).
- `disponibilidade/` — disponibilidade de frota.
- `financeiro-pessoal/` — controle Renan & Tati (acesso direto, fora do hub).
- Vários outros em desenvolvimento (fca*, pneus, farol-frota, forecast, mpr, termometro, scorecard, etc.) — ver pastas na raiz.

---
_Para retomar: leia este arquivo → `CLAUDE.md` (padrões visuais) → abra o `visao-financeira/index.html` como referência._
