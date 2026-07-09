-- ============================================================
-- Forecast Editável — cenários salvos (painel forecast/)
-- Rodar no SQL Editor do Supabase de AUTENTICAÇÃO (lozwipoeacpvplgkrxkq).
-- Guarda os overrides do forecast (edições do usuário) por cenário nomeado.
-- ============================================================

create table if not exists public.forecast_scenarios (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  autor_email   text not null,
  ano           int,
  filtros       jsonb not null default '{}'::jsonb,   -- {uni:[], nv3:[]}
  overrides     jsonb not null default '{}'::jsonb,   -- {OV:{cta:{mo:valor}}, recOV:{mo:valor}}
  notas         text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.forecast_scenarios enable row level security;

-- Leitura: qualquer usuário autenticado enxerga todos os cenários
drop policy if exists fc_select on public.forecast_scenarios;
create policy fc_select on public.forecast_scenarios
  for select to authenticated using (true);

-- Inserir: autenticado, salvando como você mesmo
drop policy if exists fc_insert on public.forecast_scenarios;
create policy fc_insert on public.forecast_scenarios
  for insert to authenticated
  with check (autor_email = (auth.jwt() ->> 'email'));

-- Atualizar: só o dono ou um admin (fca_profiles.is_admin)
drop policy if exists fc_update on public.forecast_scenarios;
create policy fc_update on public.forecast_scenarios
  for update to authenticated
  using (autor_email = (auth.jwt() ->> 'email')
         or exists (select 1 from public.fca_profiles p where p.user_id = auth.uid() and p.is_admin));

-- Excluir: só o dono ou um admin
drop policy if exists fc_delete on public.forecast_scenarios;
create policy fc_delete on public.forecast_scenarios
  for delete to authenticated
  using (autor_email = (auth.jwt() ->> 'email')
         or exists (select 1 from public.fca_profiles p where p.user_id = auth.uid() and p.is_admin));
