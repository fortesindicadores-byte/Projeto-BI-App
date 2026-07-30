-- ============================================================================
-- Condução Econômica — esquema do Supabase (Postgres)
-- Estreia do modelo HÍBRIDO: Python (ETL) grava aqui; o painel LÊ daqui.
--
-- Camadas:
--   ce_motoristas       (dimensão / de-para motorista ↔ unidade ↔ fonte)
--   ce_leituras_diarias (RAW normalizado: 1 linha por motorista/veículo/dia)
--   ce_scores_mensais   (MART: 1 linha por motorista/competência — o painel lê esta)
--
-- Rode no Supabase: SQL Editor → cole → Run. (idempotente: usa IF NOT EXISTS)
-- ============================================================================

-- ── Dimensão: motoristas + de-para entre as duas telemetrias ────────────────
create table if not exists ce_motoristas (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  unidade           text,                 -- ex.: BLC, CGR, RON...
  fonte             text,                 -- 'Geotab' | 'vFleets' (cada motorista usa UMA)
  cpf               text,                 -- identificador no vFleets (DaaS)
  cnh               text,                 -- idem
  geotab_driver_id  text,                 -- identificador no Geotab (Driver/User)
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create unique index if not exists ce_motoristas_nome_uq on ce_motoristas (lower(nome));
create index if not exists ce_motoristas_cpf_idx    on ce_motoristas (cpf);
create index if not exists ce_motoristas_geotab_idx on ce_motoristas (geotab_driver_id);

-- ── RAW: leitura diária normalizada (o ETL grava 1 linha por motorista/dia) ──
-- Guarda as MÉTRICAS BRUTAS (não os pontos) + o payload original em jsonb,
-- pra nunca perder informação e poder recalcular os pontos quando a curva mudar.
create table if not exists ce_leituras_diarias (
  id                     bigint generated always as identity primary key,
  dia                    date not null,
  fonte                  text not null,          -- 'Geotab' | 'vFleets'
  motorista_id           uuid references ce_motoristas (id),  -- null até casar o de-para
  -- identificadores brutos (pra casar com ce_motoristas depois)
  cpf                    text,
  cnh                    text,
  geotab_driver_id       text,
  veiculo_placa          text,
  -- contexto
  km                     numeric,
  tempo_motor_ligado_s   numeric,
  tempo_movimento_s      numeric,
  -- métricas brutas por pilar (nomes provisórios — confirmar ao ler a telemetria)
  rpm_faixa_verde_pct    numeric,   -- % do tempo em movimento na faixa verde de RPM
  idle_pct               numeric,   -- % do tempo de motor ligado em marcha lenta
  aceleracoes            numeric,   -- nº de acelerações bruscas no dia
  frenagens              numeric,   -- nº de freadas bruscas no dia
  velocidade_excesso_pct numeric,   -- % do tempo acima do limite
  freio_motor_pct        numeric,   -- só vFleets
  banguela_pct           numeric,   -- só vFleets
  cambio_inadequado_pct  numeric,   -- só vFleets
  raw                    jsonb,     -- payload original da API (auditoria / reprocesso)
  criado_em              timestamptz not null default now()
);
-- evita duplicar a mesma leitura (refinar a chave quando soubermos os identificadores reais)
create unique index if not exists ce_leituras_uq
  on ce_leituras_diarias (dia, fonte, coalesce(veiculo_placa,''), coalesce(cpf, geotab_driver_id, ''));
create index if not exists ce_leituras_dia_idx on ce_leituras_diarias (dia);
create index if not exists ce_leituras_mot_idx on ce_leituras_diarias (motorista_id);

-- ── MART: score mensal por motorista (o PAINEL lê esta tabela) ───────────────
-- Mapeia 1:1 com o que o painel espera hoje em generateRawRows():
--   competencia → vig ('YYYY/MM/01'), motorista → unit, unidade, fonte,
--   *_pontos (0–100) por pilar (null = pilar ausente → peso redistribuído),
--   pontuacao → pont (média ponderada). *_valor guarda o RESULTADO MEDIDO real.
create table if not exists ce_scores_mensais (
  id             bigint generated always as identity primary key,
  competencia    date not null,               -- 1º dia do mês (ex.: 2026-07-01)
  motorista_id   uuid references ce_motoristas (id),
  motorista      text not null,               -- nome (desnormalizado = 'unit' no painel)
  unidade        text,
  fonte          text,
  -- pontos por pilar (0–100); null = pilar não existe nessa fonte
  rpm_pontos     numeric,
  idle_pontos    numeric,
  acel_pontos    numeric,
  frea_pontos    numeric,
  vel_pontos     numeric,
  freio_pontos   numeric,
  cambio_pontos  numeric,
  -- resultado MEDIDO por pilar (o número pequeno "termômetro" do painel)
  rpm_valor      numeric,
  idle_valor     numeric,
  acel_valor     numeric,
  frea_valor     numeric,
  vel_valor      numeric,
  freio_valor    numeric,
  cambio_valor   numeric,
  -- score final ponderado (0–100) + contexto
  pontuacao      numeric,
  km_total       numeric,
  dias_com_dado  int,
  atualizado_em  timestamptz not null default now(),
  unique (competencia, motorista)
);
create index if not exists ce_scores_comp_idx on ce_scores_mensais (competencia);
create index if not exists ce_scores_mot_idx  on ce_scores_mensais (motorista_id);

-- ── RLS: painel lê com o usuário autenticado; ETL grava com a service key ────
-- (a service_role ignora RLS, então o coletor sempre consegue escrever)
alter table ce_motoristas       enable row level security;
alter table ce_leituras_diarias enable row level security;
alter table ce_scores_mensais   enable row level security;

-- leitura para usuários logados (o painel já exige login no hub)
drop policy if exists ce_scores_sel   on ce_scores_mensais;
create policy ce_scores_sel   on ce_scores_mensais   for select to authenticated using (true);
drop policy if exists ce_mot_sel      on ce_motoristas;
create policy ce_mot_sel      on ce_motoristas       for select to authenticated using (true);
-- ce_leituras_diarias: por padrão NINGUÉM lê (só o ETL via service key). Se quiser
-- expor o RAW pra admins, criar policy específica depois.

-- ── Consulta que o painel fará (substitui generateRawRows) ───────────────────
-- select motorista as unit, to_char(competencia,'YYYY/MM/01') as vig,
--        rpm_pontos as rpm, idle_pontos as idle, acel_pontos as acel,
--        frea_pontos as frea, vel_pontos as vel, freio_pontos as freio,
--        cambio_pontos as cambio, pontuacao as pont, unidade, fonte
--   from ce_scores_mensais order by competencia;
