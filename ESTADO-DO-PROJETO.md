# Estado do Projeto — Gestão em Movimento (retomada pós-/clear)

> Documento de handoff para continuar o trabalho depois de um `/clear`.
> Leia este arquivo primeiro. O painel **`visao-financeira/index.html` é o PADRÃO de referência**
> de layout, cores, tipografia, gráficos, tabelas e filtros. O guia detalhado de padrões está em `CLAUDE.md`.

## 1. Visão geral

- BI da Fortes Indicadores. Cada painel é um `index.html` autocontido (sem framework, sem build).
- **Homologação/Dev:** `fortesindicadores-byte/gestao-em-movimento` — GitHub Pages: `https://fortesindicadores-byte.github.io/gestao-em-movimento/`
- **Produção (destino):** `Conlog-SA/frota-gestao-em-movimento` (ainda VAZIO). Ver §6.
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

- **PR:** `mcp__github__create_pull_request` (draft:true) → `update_pull_request` draft:false → `merge_pull_request` squash.
  Carregar as tools via `ToolSearch` `select:mcp__github__create_pull_request,mcp__github__merge_pull_request,mcp__github__update_pull_request` (o MCP github cai e volta; recarregar quando preciso).
- **NUNCA** colocar o id do modelo (`claude-opus-4-8`) em commit/PR/código.
- **`.nojekyll`** na raiz é obrigatório (sem ele o Pages falha o build silenciosamente).
- Ao mudar dado/cache de um painel, **bumpar a chave de cache** (ex.: `bi_cache_vf_v3`).
- Validar JS antes de commitar: extrair `<script>` e `node --check`.

## 3. Ambiente / limitações

- **Sandbox NÃO alcança** docs.google/github.io/supabase/prologapp (HTTP 000/403). Não dá pra ler dados ao vivo daqui → mapear colunas por NOME (`idxDe`) e pedir validação no navegador (rodapé `mapFooter`).
- **Google Sheets** lido via gviz JSONP no navegador. `idxDe(cols,...nomes)` = match normalizado (sem acento) exato e depois substring.
- **Supabase:** projeto auth `lozwipoeacpvplgkrxkq` (fca_profiles, access_log, mpr_fields); projeto Conlog `ewbzeqsneeylwkxtcpme` (snapshot de Pneus/Prolog, escrito pelo loader via service key; navegador lê com anon key).
- **GitHub App** empurra como `fortesindicadores-byte`. Escopo desta sessão = só o repo de homologação.

## 4. Padrão de filtro multi-select ("Todos") — JÁ CORRIGIDO no Disponibilidade

O padrão certo (com estado "nenhum") está em `disponibilidade/index.html`. Referência da correção:
- `sel` (Set) vazio + `_none=false` ⇒ TODOS. `sel` vazio + `_none=true` ⇒ NENHUM. `sel` com itens ⇒ aqueles.
- `getMsV`: se `_none` e sel vazio → retorna sentinela `[' __NONE__']` (filtra tudo fora).
- No handler do checkbox "Todos": `sel.clear(); wrap._none = !box.checked;`
- `allChk = sel.size===0 && !wrap._none;`
- Ordenar datas cronologicamente: `dataSort(a)= dd/mm/aaaa → yyyymmdd`.

## 5. Estado dos painéis (mudanças recentes)

- **visao-financeira** — PADRÃO. PR #66: linha **EBITDA** abaixo do Total nas tabelas "Análise vs Orçado" e "vs Remunerado" (fundo = cabeçalho; condicionais como Receita, maior=melhor; dados da aba `EBITDA` da planilha `1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8`, mapeadas por nome; respeita filtros ano/vig/uni/projeto). Também alinhou cabeçalhos (`vertical-align:bottom`). Cache `bi_cache_vf_v3`.
- **disponibilidade** — PR #67: filtro Data em ordem cronológica + "Todos" desmarcável (padrão do §4).
- **manutencao** (PR #65) — VER §7 (bugs de filtro pendentes).
- **pneus/painel.html** — tolerância de pressão ±10% (era 15).
- **pneus/tipos.html** — lista tipos de pneus do snapshot Conlog.
- **mpr/index.html** — campos causa/ação/resp/prazo persistidos no Supabase (`mpr_fields`), abas "- Acum" p/ YTD, export .xls, separação por Tier.
- **termometro/index.html** — abas "- Acum" quando Vigência=Todas.
- **farol-frota** — completo; e-mail bloqueado em verificação de domínio no Resend (TI).

## 6. Migração para produção (Conlog-SA) — BLOQUEADA nesta sessão

- Push daqui dá **403** (escopo da sessão fixo no repo de homologação; NÃO muda por retry nem no meio da sessão). App do Claude já tem escrita na Conlog-SA e o usuário é **owner** da org.
- **Resolver:** (A) usuário empurra com a conta dele — `git clone https://github.com/fortesindicadores-byte/gestao-em-movimento.git && cd gestao-em-movimento && git push https://github.com/Conlog-SA/frota-gestao-em-movimento.git main:main`; OU (B) adicionar o repo `Conlog-SA/frota-gestao-em-movimento` ao ambiente do Claude Code e abrir **sessão nova** → o push funciona de lá.
- Pós-cópia: Pages (main/root, `.nojekyll`), recriar Secrets (`PROLOG_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `FAROL_FROM`), Supabase Auth → adicionar Redirect URL de produção. Trocar 2 URLs só no repo prod: `scripts/farol-mailer.mjs` (const `HUB`) e `apresentacao-projeto.html`.
- Cadastros/acessos NÃO se perdem (ficam no Supabase compartilhado). Runbook completo: `MIGRACAO-PRODUCAO.md`. PR #68 (runbook) ficou aberto/standby.

## 7. PENDÊNCIAS (retomar por aqui)

### 7.1 Manutenção — filtros quebrados (PRIORIDADE)
Arquivo `manutencao/index.html`. Reclamações do usuário:
1. **"Todos" não desmarca** → aplicar o padrão do §4 (estado `_none`) no `mkFilter` (linhas ~198-215). Hoje o handler faz só `sel.clear()`.
2. **Vigência só mostra "Todos"** e **3. Unidade só mostra "Todos"** → `uniq(ROWS.map(r=>r.vig))` / `r.uni` vêm vazios. Causa provável: `idxDe` não achou os cabeçalhos reais dessas colunas na planilha `1S7L6G3L8bboirAExGPRCITYkWsGoVpjUoXc-aVXdW6k` (gid=0), OU **Unidade deve ser derivada do "Nível 3"** como na visão-financeira (`getUniLabel`), não de uma coluna "Unidade" crua/vazia. Conferir o rodapé `mapFooter` (mostra qual header casou; se "(não achou)", pegar o nome exato com o usuário). O usuário frisou "fui bem claro em como deveria ser feito" — revisar a spec original do painel (total de NFs no topo, tabela por maior custo, toggle Fornecedor⇄Centro de Custo, tabelão detalhado, colunas ordenáveis).
- **Ação na retomada:** pedir print do `mapFooter`/planilha OU ajustar `idxDe` e a origem de Vigência/Unidade; e portar o multi-select `_none` do Disponibilidade para o `mkFilter` do Manutenção.

### 7.2 Descarte de pneus — gráficos temporais (aguardando decisão)
`pneus/descarte.html`. Usuário quer 2 gráficos de barra temporais acima da tabela (padrão visão-financeira): um de **quantidade** por mês e outro de **% mês a mês**.
- **A API v3 do Prolog NÃO expõe a data do descarte** (confirmado com 4 diagnósticos): objeto `disposal` de `/tires` só tem motivo; sem `updatedAt`; endpoints `/tires/disposals?tireId=…` rejeitam com HTTP 400 em toda variação. A data só existe no relatório "Pneus descartados" (CSV export).
- **Decisão pendente do usuário (responder 1/2/3):** (1) importar CSV e guardar **compartilhado no Supabase** [recomendado, cria tabela + roda 1 SQL]; (2) importar CSV só **local** (localStorage); (3) **não fazer** os gráficos.
- Chart.js 4.4.0 já está no painel; gancho de render = `renderDescarte()`; injetar gráficos entre o HERO (~linha 1317) e a `.adh-table-wrap` (reusar `.adh-charts` grid 1fr/1fr). CSV tem `Data e hora`, `Número de fogo`, `Unidade do descarte`, `Marca`, `Modelo`, `Motivo do descarte`.

### 7.3 Farol e-mail
Bloqueado na verificação de domínio no Resend (TI). `RESEND_API_KEY`/`FAROL_FROM` pendentes; mailer em modo teste; cron desativado.

## 8. Números úteis
- Planilhas: DRE/EBITDA `1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8`; Manutenção `1S7L6G3L8bboirAExGPRCITYkWsGoVpjUoXc-aVXdW6k` (gid=0); Disponibilidade `1oW3mss0pXVI6gaDU2z5cDAKvW40LWHCQXpanqSvb12o`.
- Branch IDs Prolog (14 unidades) e `UNIDADE_MAP` estão em `pneus/*.html` e `scripts/pneus-loader.mjs`.
- PRs recentes desta frente: #65 Manutenção, #66 EBITDA, #67 Disponibilidade, #68 runbook (aberto), #69-73 diagnósticos (removidos).
