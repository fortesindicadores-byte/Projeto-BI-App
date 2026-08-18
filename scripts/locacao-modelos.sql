-- ============================================================
-- Conferência de Locação — modelos vindos do Freightech
-- (Renan, 18/08/2026: ativo que só existe no FT deve mostrar o modelo
--  do FT; como o arquivo só passa pelo navegador na importação, o
--  de-para chave→modelo fica guardado aqui e vale para todos os meses)
--
-- Um registro só (id = 1): modelos = { "P:<placa>": "ACELLO 1316",
--                                      "C:<chassi>": "CPD25", ... }
-- Todo arquivo do FT importado MESCLA o que achou (não substitui).
-- ============================================================

create table if not exists public.locacao_modelos (
  id          smallint primary key default 1 check (id = 1),
  modelos     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.locacao_modelos enable row level security;

drop policy if exists locacao_modelos_select on public.locacao_modelos;
create policy locacao_modelos_select on public.locacao_modelos
  for select to authenticated using (true);

drop policy if exists locacao_modelos_admin on public.locacao_modelos;
create policy locacao_modelos_admin on public.locacao_modelos
  for all to authenticated
  using (public.fca_is_admin()) with check (public.fca_is_admin());

grant select on public.locacao_modelos to authenticated;
grant insert, update, delete on public.locacao_modelos to authenticated;
