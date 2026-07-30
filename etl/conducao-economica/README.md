# Condução Econômica — ETL (modelo híbrido)

Estreia do **híbrido**: o Python coleta a telemetria, calcula o score e grava no
**Supabase**; o **painel** (`/combustivel/conducao-economica/`) passa a **ler** a
tabela pronta no lugar de `generateRawRows()`.

```
Geotab / vFleets ──► coletor.py (GitHub Actions, cron) ──► Supabase ──► painel
```

## Arquivos
| Arquivo | O que é |
|---|---|
| `schema.sql` | Tabelas do Supabase (`ce_motoristas`, `ce_leituras_diarias`, `ce_scores_mensais`) |
| `coletor.py` | ETL: extrai → normaliza → calcula pontos/score → upsert no Supabase |
| `requirements.txt` | Dependência (`requests`) |
| `../../.github/workflows/ce-coletor.yml` | Agenda diária (cron) no GitHub Actions |

## Como está hoje (esqueleto)
- **Pronto:** `calc_score()` (média ponderada redistribuindo pilares ausentes,
  idêntico ao painel), agregação diária→mensal e o `upsert` no Supabase.
- **TBD (só ao ler a telemetria real):**
  1. `extrai_vfleets()` / `extrai_geotab()` — parsear os campos reais das APIs.
  2. `pontos_por_pilar()` — a **curva** que converte a métrica medida em pontos (0–100).

Sem os segredos, o coletor roda em **dry-run** (não escreve) e o job passa — então
dá pra mergear já, sem quebrar nada.

## Passo a passo pra ativar (quando os acessos chegarem)
1. **Criar as tabelas:** Supabase → SQL Editor → colar `schema.sql` → Run.
2. **Configurar os GitHub Secrets** (Settings → Secrets and variables → Actions):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service_role — só nos Secrets, nunca no HTML)
   - `VFLEETS_TOKEN`, `VFLEETS_UO_IDS`
   - `GEOTAB_SERVER`, `GEOTAB_DATABASE`, `GEOTAB_USER`, `GEOTAB_PASSWORD`
3. **Fechar o TBD:** com 1 mês lido (via `scripts/vfleets-explorer.gs` e/ou o Geotab),
   preencher `extrai_*()` e a curva `pontos_por_pilar()`.
4. **Popular o de-para** em `ce_motoristas` (nome ↔ unidade ↔ fonte ↔ CPF/CNH/DriverId).
5. **Trocar a fonte do painel:** substituir `generateRawRows()` por uma leitura de
   `ce_scores_mensais` (query de exemplo no fim do `schema.sql`).

## Rodar local (teste/backfill de 1 dia)
```bash
pip install -r etl/conducao-economica/requirements.txt
# sem segredos = dry-run; com segredos exportados = escreve no Supabase
python etl/conducao-economica/coletor.py 2026-07-01
```

## Notas
- **Rate limit vFleets:** 1 req/5 min por token — a coleta diária faz poucas
  chamadas; para backfill de vários dias, espaçar as execuções.
- **service_role** só vive nos GitHub Secrets (tem poder de escrita e ignora RLS).
  O painel continua usando a chave **publishable** + login, e só **lê** via RLS.
- O RAW (`ce_leituras_diarias`) guarda o payload original em `jsonb`, então dá pra
  **recalcular** os pontos quando a curva mudar, sem reprocessar as APIs.
