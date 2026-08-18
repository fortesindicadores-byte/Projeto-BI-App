-- ============================================================
-- Conferência de Locação — base de placas do ERP Benner
-- (Renan, 18/08/2026: a unidade do ativo que NÃO está no Freightech
--  vem do Nome do Projeto do Benner, via de-para no painel)
--
-- Um registro só (id = 1): o de-para inteiro em JSONB
--   depara = { "P:<placa Mercosul>": "ROTA - CBA", "C:<chassi>": "APOIO - NFR", ... }
-- Reimportar um Benner novo substitui o registro — vale para todos os
-- meses do painel até o próximo arquivo.
-- ============================================================

create table if not exists public.locacao_benner (
  id          smallint primary key default 1 check (id = 1),
  depara      jsonb not null default '{}'::jsonb,
  arquivo     text,
  n           integer,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.locacao_benner enable row level security;

-- leitura: qualquer usuário logado do portal
drop policy if exists locacao_benner_select on public.locacao_benner;
create policy locacao_benner_select on public.locacao_benner
  for select to authenticated using (true);

-- escrita: só administradores (o painel é do cluster Administração)
drop policy if exists locacao_benner_admin on public.locacao_benner;
create policy locacao_benner_admin on public.locacao_benner
  for all to authenticated
  using (public.fca_is_admin()) with check (public.fca_is_admin());

grant select on public.locacao_benner to authenticated;
grant insert, update, delete on public.locacao_benner to authenticated;
