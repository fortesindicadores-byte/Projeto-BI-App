-- ============================================================
-- Conferência de Locação — observações por ATIVO
-- (Renan, 18/08/2026: campo editável na Visão Quantitativa, nível ativo)
--
-- Fica numa tabela própria, e NÃO dentro de locacao_conferencia.linhas:
-- reimportar um mês reescreve as linhas daquele mês, e a observação do
-- ativo não pode sumir junto.
-- ============================================================

create table if not exists public.locacao_obs (
  ativo       text primary key,          -- placa Mercosul ou chassi (a mesma chave do painel)
  obs         text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.locacao_obs enable row level security;

-- leitura: qualquer usuário logado do portal
drop policy if exists locacao_obs_select on public.locacao_obs;
create policy locacao_obs_select on public.locacao_obs
  for select to authenticated using (true);

-- escrita: só administradores (o painel é do cluster Administração)
drop policy if exists locacao_obs_admin on public.locacao_obs;
create policy locacao_obs_admin on public.locacao_obs
  for all to authenticated
  using (public.fca_is_admin()) with check (public.fca_is_admin());

grant select on public.locacao_obs to authenticated;
grant insert, update, delete on public.locacao_obs to authenticated;
