# Gestão em Movimento — Documentação Técnica (Handoff para TI)

> Portal de BI da frota (Fortes Indicadores · operação Conlog/Ambev), em substituição ao Looker Studio.
> **Última atualização:** jul/2026 · Docs complementares: `CLAUDE.md` (design system), `PAINEIS.md` (catálogo de painéis), `HANDOFF.md` (histórico).

---

## 1. Visão geral

| Item | Valor |
|---|---|
| Repositório | `fortesindicadores-byte/gestao-em-movimento` (GitHub) |
| Produção | https://fortesindicadores-byte.github.io/gestao-em-movimento/ |
| Hospedagem | **GitHub Pages** (site estático, deploy automático no push em `main`) |
| Stack | HTML + CSS + JavaScript **puro** — sem framework, sem backend próprio, sem build step |
| Bibliotecas (CDN) | Chart.js 4.4.0 · chartjs-plugin-datalabels 2.2.0 · Supabase JS v2 · Google Fonts (Montserrat) |
| Autenticação | Supabase Auth (`https://lozwipoeacpvplgkrxkq.supabase.co`) |
| Banco de dados | Supabase Postgres (tabelas `fca`, `fca_profiles`, `access_log`) + Supabase Conlog (`snapshot`, para Pneus) |
| Fontes de dados | Google Sheets (leitura via gviz JSONP **no navegador**) + Supabase |

**Princípio de arquitetura:** cada painel é **um único `index.html` autocontido** (CSS e JS inline). Cada pasta do repo = um painel = uma URL. Não há servidor de aplicação: o navegador do usuário lê as planilhas/DB diretamente.

```
Navegador ──► GitHub Pages (HTML estático)
   │
   ├──► Google Sheets (gviz JSONP, leitura)      ← indicadores, DRE, Gerot, termômetro, Farol…
   ├──► Supabase lozwipo… (auth + fca + access_log) ← login, FCA (RLS), auditoria de acessos
   └──► Supabase ewbzeq…  (tabela snapshot)      ← Pneus / Farol (dados Conlog via loader)
                    ▲
        GitHub Actions:
          • pneus-loader.mjs  (cron 2×/dia)  ── Prolog API ──► snapshot
          • farol-mailer.mjs  (cron seg 14h) ── lê Sheets/Supabase ──► Resend (e-mail aos gestores)
```

---

## 2. Estrutura do repositório

```
gestao-em-movimento/
├── index.html                  → Hub (login Supabase + cards por cluster)
├── CLAUDE.md                   → Design system + convenções (LEITURA OBRIGATÓRIA p/ manutenção)
├── PAINEIS.md / HANDOFF.md / DOCUMENTACAO-TI.md → documentação
├── _template/                  → esqueleto p/ novos painéis
├── .github/workflows/
│   ├── pneus-loader.yml        → carga Conlog→Supabase (cron 2×/dia)
│   └── farol-mailer.yml        → envio do Farol por e-mail (Resend; segunda 14h BRT)
├── scripts/
│   ├── pneus-loader.mjs        → loader Node (Prolog API → Supabase snapshot)
│   ├── farol-mailer.mjs        → envio do Farol por e-mail (Resend)
│   ├── fca-supabase.sql        → DDL/RLS das tabelas fca e fca_profiles
│   ├── acessos-supabase.sql    → DDL/RLS da tabela access_log (auditoria de acessos)
│   └── farol-acessos.sql       → coluna fca_profiles.farol_unidades (destinatários do Farol)
│
│  ── PAINÉIS (pasta = URL) ──
├── visao-financeira/           → DRE consolidado (REFERÊNCIA de layout)
├── farol-frota/                → Farol Frota (hub admin + Farol Geral + por unidade; envio por e-mail)
├── acessos/                    → Auditoria de acessos ao portal (admin)
├── painel-km/                  → Painel KM
├── rs-por-km/                  → R$/KM
├── combustivel/                → sub-hub (arvore-combustivel, eficiencia-kml, preco-litro, co2)
├── disponibilidade/            → Disponibilidade da frota
├── eficiencia-ativacao/        → Ativação de frota
├── pneus/                      → Pneus (dados Conlog)
├── termometro/                 → Termômetro (pontuação por unidade/tier)
├── mpr/                        → MPR — Monthly Performance Review
├── gerot/                      → Gerot (RPM)
├── auditorias/                 → Auditorias Demarco & DPO/VPO
├── fca/                        → FCA consolidado (visualização)
├── fca-preenchimento/          → FCA por unidade (preenchimento) + rotinas admin
├── fca-consolidado/            → FCA Admin (edição total, geração)
├── fca-gerencial/              → Aderência ao FCA
├── scorecard/ · programa-reconhecimento/ · painel-metas/ · diagnostico/ · resumo-executivo/
├── governanca/ · papeis-responsabilidades/ · missao-visao-valores/
└── financeiro-pessoal/         → pessoal (não aparece no hub; acesso direto por URL)
```

---

## 3. Deploy e operação do repositório

- `git push origin main` → GitHub Pages builda e publica automaticamente (~1 min).
- **Cuidado:** pushes em sequência rápida **cancelam** o build anterior. Confirmar a conclusão do build (aba Actions, workflow "pages build and deployment") antes de novo push.
- Testar mudanças: qualquer HTTP server local serve o repo (`python3 -m http.server`), mas leituras de Sheets/Supabase dependem de rede; o teste final é no Pages.
- Cache do navegador: após deploy, usar **Ctrl+Shift+R** para validar.

---

## 4. Autenticação e perfis

- **Supabase Auth** no hub (`index.html`): login e-mail/senha, cadastro com confirmação por e-mail (SMTP Resend), "esqueci a senha" e redefinição (`PASSWORD_RECOVERY`).
- Chave usada no client: **publishable/anon** (`sb_publishable_…`) — segura para exposição pública **desde que o RLS esteja ativo** nas tabelas.
- **`fca_profiles`**: perfil por usuário → `user_id`, `unidade` (código, ex.: CGR), `is_admin`, `farol_unidades`.
  - Usuário comum: enxerga/edita **apenas a sua unidade** (RLS).
  - Admin: todas as unidades + rotinas de geração.
  - `farol_unidades` (texto): quem recebe o Farol por e-mail — `null`=nenhuma, `TODAS`, ou lista de códigos (`CGR,BLC`). Migração: `scripts/farol-acessos.sql`.
- **`access_log`**: auditoria de acessos ao portal (1 linha por acesso: `user_id` default `auth.uid()`, `email`, `painel`, `created_at`). RLS: cada um insere o seu; **só admin lê**. Migração: `scripts/acessos-supabase.sql`. Consumido pelo painel **Acessos** (KPIs, gráfico de acessos/dia, tabelas por usuário e por painel).
- Gestão de acessos: card **Gerenciar Acessos** no hub (cluster Administração, só admin) — aprova/bloqueia, define o **Acesso FCA** (unidade/admin) e o **Recebe Farol** (unidades que o usuário recebe por e-mail) de cada usuário.

> ⚠️ **Nunca** usar/commitar `service_role` no front-end ou no repo. O loader do Pneus usa secrets do GitHub Actions.

---

## 5. Fontes de dados (Google Sheets — leitura no navegador)

Leitura via `https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?...&tqx=out:json;responseHandler:fn` (JSONP). As planilhas precisam estar com **acesso por link (leitura)**.

| Planilha | ID | Uso |
|---|---|---|
| Gerot / Consolidado ICs | `1xGl1Xrk2sPS9zWghEuecFMNBHwmeLiZ02U-QpO8cDPY` | Gerot, Scorecard, **Base RPM** e **De-Para** (FCA) |
| DRE | `1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8` | Visão Financeira, geração de Custos do FCA |
| Km/L e R$/L | `1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A` | Combustível, causas automáticas do FCA, km/dia do Pneus |
| Dispersão de km | `1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM` | Painel KM, causas automáticas do FCA |
| DPO / Demarco / Disponibilidade | `1oW3mss0pXVI6gaDU2z5cDAKvW40LWHCQXpanqSvb12o` | Auditorias, Disponibilidade, **Farol Frota** (abas `Disponibilidade` e `Indisponibilidade`) |
| Termômetro | `10LRn3jrXEemqFiFAMbO8_bOLk98xrWTVXVUNDeQqLac` | Termômetro e MPR (abas = tiers: Transportes T1/T2, WH T1/T2 + aba Regras) |
| **Farol Frota** | `1xOv7OJzErGV3vNCMOY_5O6px7vFvC990CW-1vGul5sY` | Farol Frota — 8 abas: Custos, Stress Test (cadastro), Stress Test Veículos, Stress Test Empilhadeiras, CIFV, Preventivas, Alinhamentos, OS em aberto |

**Regra de performance:** planilhas grandes (DRE ~18k linhas) devem ser filtradas **no servidor** com `&tq=` (ex.: `select * where K = 'CAMPO GRANDE'`) — sem isso o JSONP estoura no navegador.

---

## 6. Módulo FCA (Fato → Causa → Ação)

**O banco (Supabase, tabela `fca`) é a única fonte da verdade.** As planilhas entram apenas nas rotinas de **geração** dos desvios; o preenchimento e o consumo são 100% via banco.

### 6.1 Tabela `fca` (colunas principais)
`unidade` (código), `vigencia` ("mai/26"), `origem` (`Custos`|`RPM`), `fato`, `projeto`, `fato_desvio`, `causa`, `acao`, `responsavel`, `prazo`, `status` (Não iniciada/Em andamento/Concluída/Cancelada), `acompanhamento`, `locked`. DDL/RLS em `scripts/fca-supabase.sql`.

### 6.2 Rotina mensal (botões no FCA · Admin — só admin)
1. **Gerar Custos** (`fca-preenchimento/?gen=all`): lê a DRE do último mês fechado e cria os desvios de custo (gasto acima do remunerado) de **todas as unidades**, **vazios**, para as unidades preencherem. Km/L e R$/L não viram fato (são causa do Combustível). Causas automáticas pré-preenchidas (piores placas, dispersão de km).
2. **Gerar RPM** (`fca-preenchimento/?sync=rpm`): lê a aba **Base RPM** do Gerot (por **nome de coluna**) e cria os desvios de IC/IV com atingimento < 100%, **vazios**.
   - Mapeamento unidade→(código, projeto) é **fixo no código** (`RPM_UNIT_MAP` em `fca-preenchimento/index.html`) — ex.: CUIABA=CBA/Apoio, CDD CUIABA=CBA/Rota, CUIABA EMPURRADA=CBA/Empurrada.
   - **Corte de transição** `FILL_UNTIL=202604`: meses ≤ mai/26 importaram causa/ação/prazo/status já preenchidos na aba; de jun/26 em diante vem vazio (preenchimento é no painel).

**Ambas as rotinas são aditivas e idempotentes**: só inserem o que não existe (chave = vigência+origem+projeto+fato); nunca apagam nem sobrescrevem o que foi preenchido. Pode clicar mais de uma vez sem risco.

### 6.3 Preenchimento e consumo
- **`fca-preenchimento/`**: unidade loga → vê seus fatos → preenche Causa/Ação/Responsável/Prazo/Status → **precisa clicar Salvar** (grava no Supabase e **trava** a ação; só o Acompanhamento segue editável). Digitar sem salvar = perde ao sair.
- **`fca-consolidado/`** (Admin): edita tudo, +ação/+causa/excluir por linha, visão Tabela/Kanban (drag-and-drop de status).
- **`fca/`** (consolidado leitura) e **`fca-gerencial/`** (Aderência): leem a mesma base, com as mesmas regras (ocultam Km/L e R$/L, projeto "limpo").
- Performance: cache `localStorage` (`fca_cache_*`) com revalidação em segundo plano (stale-while-revalidate).

---

## 7. Termômetro e MPR

- **Termômetro** (`termometro/`): lê as 4 abas-tier da planilha do termômetro. Vigência quinzenal `M_Q`; o **filtro é por mês** e a **Q2 rege** (fallback Q1 quando o mês não fechou). Gráfico temporal mostra as 2 quinzenas (Q1 com hachura). Regras/pesos na aba `Regras`.
- **MPR** (`mpr/`): matriz mensal por indicador × GEO/unidade (GEO expande com "+"). Valor do mês = **resultado da Q2**; cores = **regras do indicador** (ex.: Preventiva ≥95 verde/≥90 amarelo; OS Vencidas <10 verde; MTTR/MTBF por pontuação). Coluna Plan = meta da regra. **Causa/Ação/Responsável/Prazo são campos livres salvos em `localStorage`** (por navegador — não são compartilhados entre máquinas; evolução natural: mover p/ Supabase como o FCA).

---

## 8. Pneus (integração Conlog via API Prolog)

Único fluxo do projeto com **carga de dados** (ETL): o painel Pneus não lê a Prolog diretamente — um loader agendado copia os dados para o Supabase, e o front lê o Supabase.

```
Prolog API ──(loader Node, 2×/dia)──► Supabase Conlog (snapshot) ──► pneus/ (navegador)
```

### 8.1 Leitura da API Prolog (`scripts/pneus-loader.mjs`)
- **Base URL:** `https://prologapp.com/prolog/api/v3` · autenticação por header **`x-prolog-api-token`** (secret `PROLOG_TOKEN`).
- **Endpoints consumidos** (por unidade/filial — `branchOfficesId`):
  - `GET /vehicles` (`includeInactive=false`) → frota ativa (placa, modelo, km…);
  - `GET /tires` → pneus (sulcos interno/central/externo, menor sulco, amplitude, pressão atual × recomendada com % de desvio, ciclo de vida/recapagens);
  - `GET /tire-inspections/vehicles` → aferições, **janela de 01/01 do ano corrente até hoje** (jsonb enxuto — evita timeout/500 no Supabase free).
- **Paginação:** `pageSize=100` + `pageNumber` incremental até vir página vazia.
- **Rate limit:** a Prolog aceita ~10 req/min → o loader espera **6,5 s entre requisições**; em HTTP `429` aguarda 61 s e repete; em erro, até **6 retries** por página antes de abortar a unidade.
- **Unidades:** 14 `BRANCH_IDS` fixos no script (1676, 1677, 37, 1906, 1907, 1878, 20, 30, 24, 2517, 26, 38, 2277, 2550). Nova filial na Prolog ⇒ incluir o id nessa lista.
- **Proteção:** se uma unidade retornar 0 veículos, o loader **pula** a unidade (mantém o snapshot anterior em vez de gravar vazio).

### 8.2 Gravação e consumo
- Upsert via REST no Supabase Conlog: `POST /rest/v1/snapshot?on_conflict=endpoint,branch_id` — 1 linha por (endpoint, filial) com payload **jsonb** já transformado (campos calculados: menor sulco, amplitude, % desvio de pressão etc.) + `updated_at`.
- **Agendamento:** GitHub Actions `pneus-loader.yml` — cron `0 9,21 * * *` (06h/18h BRT), execução manual via *Run workflow*, `concurrency` p/ não rodar 2 cargas ao mesmo tempo, timeout 350 min.
- **Secrets do Actions:** `PROLOG_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (o loader usa service key porque roda no servidor do Actions — **jamais** no front).
- Front (`pneus/`) lê a tabela `snapshot` (`https://ewbzeqsneeylwkxtcpme.supabase.co`) com chave anon.
- Pendência de segurança conhecida: **rotacionar a service_role do Conlog** que já apareceu em prints.
- Diagnóstico "Pneus sem dados/desatualizado": aba **Actions → Pneus Loader (Conlog)** — checar último run e logs (429/erros por unidade).

---

## 9. Farol Frota (retrato semanal da frota + envio por e-mail)

Painel **admin-only** que consolida os indicadores operacionais da frota numa "foto" semanal (segunda, 14h BRT) e envia por e-mail para os gestores das unidades. Os gestores **não acessam pelo portal** — recebem só o e-mail; a liberação é feita no **Gerenciar Acessos** (campo Recebe Farol).

### 9.1 Estrutura (`farol-frota/`)
- `index.html` — hub do Farol (gate de admin): card **Farol Geral** + um card por unidade.
- `geral.html` — Farol Geral (todas as unidades) com **filtro de Unidade** (multi-select padrão), **Resumo Executivo** (4 quadrantes) e **Ranking das Unidades**.
- `unidade.html?u=COD` — Farol de uma unidade (recorte por projeto/tier).
- `farol-core.js` — **núcleo compartilhado**: carga/normalização das fontes, cálculo dos indicadores e render das seções (evita duplicar código entre geral e unidade).
- `farol.css` — estilo compartilhado (segue o padrão visão-financeira).
- `abas.html` — página de diagnóstico (lê as abas ao vivo e mostra colunas + amostra) — usada para mapear/remapear colunas.

### 9.2 Fontes e seções
Mapeamento **por nome de coluna** (nunca por posição). Todas as seções são um retrato do momento da carga.

| Seção | Fonte | Indicador |
|---|---|---|
| Custos | Planilha Farol · aba `Custos` (última vigência) | Realizado × Remunerado × Orçado, Δ vs Orç/Rem, por unidade (geral) / projeto (unidade) |
| Stress Test — Veículos | aba `Stress Test Veículos` (último período) | Aderência (% com saída) vs 100%, descontos por placa |
| Stress Test — Empilhadeiras | aba `Stress Test Empilhadeiras` | Aderência 1ª/2ª quinzena (% equip. contratado sem desconto), descontos |
| CIFV | aba `CIFV` | Aderência das fotos vs 100%, descontos |
| Preventivas | aba `Preventivas` | Aderência; dias (<0 vermelho, ≤30 amarelo, >30 verde) e km (≤0/≤2000/>2000) |
| Alinhamento | aba `Alinhamentos` | % no prazo (≠ vencido) vs meta 80%, placas por próximo evento |
| Gestão de OS | aba `OS em aberto` | % no prazo (≤8 dias), OSs abertas; geral: por unidade/segmento/fornecedor |
| **Disponibilidade** | Planilha DPO/Demarco · abas `Disponibilidade` + `Indisponibilidade` | % disponível vs Meta 93% / Sonho 97% + placas indisponíveis (dias parado = hoje − data da parada) |
| **Pneus** | Supabase Conlog (`snapshot`, mesma fonte do painel Pneus) | Foto atual: aferições (30d), milimetragem OK, calibragem (±15%), pneus críticos |

- **Ranking / Resumo (geral):** média das aderências (Stress V/E, CIFV, Preventivas, Alinhamento, OS no prazo, Disponibilidade). Custos entra como informativo (Δ Real vs Orç). Pneus tem seção própria (carga sob demanda, ~13 filiais).
- **De-para de unidades:** nomes das abas (CDD/CDI, cidades, `EMPURRADA`) → códigos do portal (`FAROL2COD`); Pneus/Disponibilidade separam por **tier** (T1/T1 WH/T2) quando a unidade tem mais de uma filial.

### 9.3 Envio por e-mail (segunda, 14h BRT)
- `scripts/farol-mailer.mjs` — envia via **Resend** (API). Destinatários = usuários com `fca_profiles.farol_unidades` preenchido (`TODAS` ou lista).
- `.github/workflows/farol-mailer.yml` — agendamento (cron `0 17 * * 1` = 14h BRT) + execução manual (`workflow_dispatch`, inputs `to`/`from`).
- **Secrets do Actions:** `RESEND_API_KEY` (+ `FAROL_FROM`/`FAROL_TO` opcionais).
- **Pendência para ativar o envio real:** verificar um **domínio no Resend** (ex.: `fortesindicadores.com.br`). Sem domínio verificado, a Resend só envia para o e-mail dono da conta — por isso o envio para destinatários arbitrários está **bloqueado até a verificação do domínio**. Enquanto isso, o cadastro de destinatários e o conteúdo já estão prontos.

---

## 10. Design system (resumo — detalhes no `CLAUDE.md`)

- Paleta: fundo `#0C1017`, cards `rgba(20,27,38,.55)`, laranja `#F97316` (primária), azul `#38BDF8`, verde `#3BB33B`, vermelho `#FF6666`. Fonte **Montserrat**.
- **Visão Financeira é a referência de layout** (header sticky 2 linhas, hero fora de card, KPI-cards, tabelas clean).
- Filtros **multi-select padrão** (botão + busca + "Todos" + link "só" por opção; seleção vazia = todos). Obrigatório em todo painel novo.
- **Modo claro** = cinza translúcido (`.main #F0F0F0`, cards `rgba(128,128,128,.14)`), nunca branco puro. Header permanece escuro.
- Condicional de cor: custos → gastou mais = vermelho; receita/atingimento → abaixo = vermelho. Cor **na fonte** (não na célula), exceto pills de score.

**Novo painel:** copiar `visao-financeira/index.html` (ou `_template/`), ajustar título/fontes de dados, adicionar card no hub (`index.html` raiz), push.

---

## 11. Segurança — resumo

| Item | Estado |
|---|---|
| Chave anon/publishable no front | OK **com RLS ativo** (fca/fca_profiles/access_log) |
| service_role | **Nunca** no front/repo; só em secrets do Actions (loaders/mailer) |
| Planilhas Google | Públicas por link (leitura) — não colocar dado sensível |
| Repo público | Sim (Pages grátis + Actions ilimitado) — não commitar tokens |
| `RESEND_API_KEY` | Só em secret do Actions (farol-mailer). Enviar sem domínio verificado limita ao e-mail dono da conta |
| Pendência | Rotacionar service_role Conlog exposta em prints; verificar domínio no Resend p/ ligar o envio do Farol |

---

## 12. Rotina operacional (resumo executivo)

**Mensal (FCA):**
1. Mês fecha → planilhas de origem atualizadas (DRE, Gerot/Base RPM, termômetro).
2. Admin abre **FCA · Admin** → **Gerar Custos** e **Gerar RPM**.
3. Unidades abrem **FCA · Preenchimento** → tratam os desvios (Causa/Ação/Responsável/Prazo) → **Salvar**.
4. Gestão acompanha em **FCA** (consolidado), **Aderência ao FCA**, **Termômetro** e **MPR**.

**Semanal (Farol):** segunda 14h BRT o Actions (`farol-mailer`) monta a foto e envia por e-mail aos gestores liberados no Gerenciar Acessos (Recebe Farol). Admins consultam pelo `farol-frota/` a qualquer momento.

**Contínuo:** Pneus atualiza sozinho (Actions 2×/dia); demais painéis leem as planilhas em tempo real ao abrir; acessos são registrados em `access_log` e auditados no painel **Acessos** (admin).
