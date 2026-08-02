-- ============================================================================
--  Robô Ginfo (Power BI) · snapshot no Supabase
--  Projeto: mesmo do hub/auth  →  lozwipoeacpvplgkrxkq.supabase.co
--  Rodar no  Supabase Dashboard → SQL Editor  (uma vez).
--
--  O robô (GitHub Actions, scripts/ginfo-robot.mjs) exporta os visuais do
--  Power BI do Ginfo e grava aqui, 1 linha por aba/visual (chave), com as
--  linhas da tabela em JSON. Os painéis (Farol etc.) leem com o login do
--  portal; a escrita é só do service_role (o robô).
-- ============================================================================

create table if not exists public.ginfo_snapshot (
  chave      text primary key,             -- ex.: 'stress-test'
  data       jsonb not null,               -- linhas exportadas do visual
  updated_at timestamptz not null default now()
);

alter table public.ginfo_snapshot enable row level security;

-- leitura: qualquer usuário logado no portal
drop policy if exists ginfo_select on public.ginfo_snapshot;
create policy ginfo_select on public.ginfo_snapshot for select
  using (auth.uid() is not null);
-- escrita: nenhuma policy => só service_role (o robô) escreve.
