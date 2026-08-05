-- ============================================================================
--  Robô Frota de Elite (Ginfo/Power BI) · snapshot por vigência no Supabase
--  Projeto: mesmo do hub/auth  →  lozwipoeacpvplgkrxkq.supabase.co
--  Rodar no  Supabase Dashboard → SQL Editor  (uma vez).
--
--  Diferença para o ginfo_snapshot (robô do Farol): lá é 1 linha por base, sempre
--  sobrescrita com a foto de hoje. Aqui é 1 linha por INDICADOR × VIGÊNCIA × ESCOPO,
--  porque o Frota de Elite precisa de histórico mês a mês E do acumulado do ano.
--
--    escopo = 'mes' → só o mês da vigência
--    escopo = 'ano' → acumulado de janeiro até o mês da vigência (ponderado pelo BI,
--                     não é média das médias mensais)
--
--  Ex.: rodando em agosto (dia ≤ 15), o robô grava
--    ('disponibilidade','07/2026','mes')  e  ('disponibilidade','07/2026','ano').
-- ============================================================================

create table if not exists public.elite_snapshot (
  indicador  text not null,                 -- 'disponibilidade', 'preventivas', 'pneus'…
  vigencia   text not null,                 -- 'MM/AAAA' (mês de referência)
  escopo     text not null default 'mes',   -- 'mes' | 'ano'
  data       jsonb not null,                -- linhas exportadas do visual
  updated_at timestamptz not null default now(),
  primary key (indicador, vigencia, escopo),
  constraint elite_escopo_ck check (escopo in ('mes','ano'))
);

create index if not exists elite_snapshot_vig_idx on public.elite_snapshot (vigencia, escopo);

alter table public.elite_snapshot enable row level security;

-- leitura: qualquer usuário logado no portal
drop policy if exists elite_select on public.elite_snapshot;
create policy elite_select on public.elite_snapshot for select
  using (auth.uid() is not null);
-- escrita: nenhuma policy => só service_role (o robô) escreve.
