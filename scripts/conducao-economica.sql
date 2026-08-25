-- ============================================================
-- Condução Econômica — telemetria (vFleets · Geotab) no Supabase
-- Renan, 25/08/2026. Fase 1: o painel /combustivel/conducao-economica/
-- deixa de usar dados de exemplo e passa a ler daqui.
--
-- Três tabelas:
--   ce_motoristas      de-para pessoa → unidade → fonte (o robô não inventa
--                      unidade: se o motorista não estiver aqui, a linha entra
--                      com unidade nula e aparece no relatório do robô)
--   ce_diario          o BRUTO por dia/motorista, como a API entregou. É daqui
--                      que o mensal é recalculado quando a régua mudar — sem
--                      precisar recoletar a API.
--   ce_scores_mensais  o agregado que o PAINEL lê (uma linha por motorista/mês)
--
-- DADO PESSOAL: nome, CPF e CNH ficam SÓ aqui (banco privado). Nada disso é
-- impresso nos logs do robô — o repositório é público.
-- ============================================================

-- ---------- 1) de-para de motorista ----------------------------------------
create table if not exists public.ce_motoristas (
  id          bigserial primary key,
  chave       text not null unique,          -- id estável da fonte (CPF/CNH no vFleets, driverId no Geotab)
  nome        text not null,
  unidade     text,                          -- código do portal (CGR, BLC, CBA T1…)
  fonte       text not null check (fonte in ('vFleets','Geotab')),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);
comment on table public.ce_motoristas is
  'De-para motorista → unidade → fonte de telemetria. Cada motorista usa UMA fonte.';

-- ---------- 2) bruto diário -------------------------------------------------
create table if not exists public.ce_diario (
  id            bigserial primary key,
  dia           date not null,
  chave         text not null,               -- casa com ce_motoristas.chave
  fonte         text not null,
  km            numeric,                     -- km rodados no dia
  h_motor       numeric,                     -- horas de motor ligado
  -- métricas cruas (o que a API entrega; null = a fonte não fornece)
  rpm_verde_pct     numeric,                 -- % do tempo de RPM em movimento na faixa verde
                                             --   (rpmVerdeEconomicaTempo+rpmVerdePotenciaTempo)
                                             --   ÷ (abaixoVerde+verde*+amarelo+vermelho)
  idle_pct          numeric,                 -- motorOciosoTempo ÷ tempoDirecao
  acel_100km        numeric,                 -- aceleracoesQtd por 100 km
  frea_100km        numeric,                 -- frenagensQtd por 100 km
  vel_excesso_pct   numeric,                 -- (via1 + 2×via2 + 3×via3) ÷ tempoMovimento
  freio_motor_pct   numeric,                 -- freioMotorTempo ÷ tempoMovimento
  banguela_pct      numeric,                 -- banguelaTempo ÷ tempoMovimento (penaliza o pilar Freio)
  cambio_ruim_pct   numeric,                 -- batendoTransmissaoTempo ÷ tempoMovimento
  registros         int,                     -- nº de registros de condução somados no dia
  bruto         jsonb,                       -- resposta da API como veio (auditoria)
  coletado_em   timestamptz not null default now(),
  unique (dia, chave)
);
create index if not exists ce_diario_dia_idx on public.ce_diario (dia);
-- reexecutável: se a tabela já existia sem estas colunas
alter table public.ce_diario add column if not exists banguela_pct numeric;
alter table public.ce_diario add column if not exists registros    int;

-- ---------- 3) mensal que o painel lê --------------------------------------
create table if not exists public.ce_scores_mensais (
  id            bigserial primary key,
  competencia   date not null,               -- 1º dia do mês
  motorista     text not null,               -- nome exibido
  chave         text not null,
  unidade       text,
  fonte         text not null,
  km            numeric,
  dias          int,                         -- dias com dado no mês
  rpm_pontos    numeric,
  idle_pontos   numeric,
  acel_pontos   numeric,
  frea_pontos   numeric,
  vel_pontos    numeric,
  freio_pontos  numeric,                     -- null nos motoristas Geotab
  cambio_pontos numeric,                     -- null nos motoristas Geotab
  pontuacao     numeric,                     -- média ponderada, peso dos ausentes redistribuído
  atualizado_em timestamptz not null default now(),
  unique (competencia, chave)
);
create index if not exists ce_scores_comp_idx on public.ce_scores_mensais (competencia);

-- ---------- 4) RLS: leitura para quem está logado, escrita só do robô -------
alter table public.ce_motoristas     enable row level security;
alter table public.ce_diario         enable row level security;
alter table public.ce_scores_mensais enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ce_motoristas','ce_diario','ce_scores_mensais'] loop
    execute format('drop policy if exists %I_sel on public.%I', t, t);
    execute format('create policy %I_sel on public.%I for select to authenticated using (true)', t, t);
  end loop;
end $$;
-- (sem policy de INSERT/UPDATE: só a service_role do robô escreve)

-- ---------- 5) Conferência --------------------------------------------------
-- select fonte, count(*) from public.ce_motoristas group by 1;
-- select max(dia), count(*) from public.ce_diario;
-- select competencia, count(*) from public.ce_scores_mensais group by 1 order by 1 desc;
