-- ============================================================================
--  FCA · Schema + RLS (Supabase)
--  Projeto: mesmo do hub/auth  →  lozwipoeacpvplgkrxkq.supabase.co
--  Rodar no  Supabase Dashboard → SQL Editor  (uma vez).
--
--  Modelo:
--   - fca_profiles : vincula cada usuário (auth) a uma UNIDADE + flag admin.
--   - fca          : 1 linha por AÇÃO (um fato tem N ações). origem = RPM | Custos.
--
--  Segurança (RLS):
--   - Usuário comum: vê e edita SÓ a sua unidade (LIVREMENTE — pode reeditar
--           depois de salvar; a trava por linha foi removida a pedido).
--   - Admin: vê e edita TUDO (login de qualquer unidade + consolidado).
--   - Cliente usa apenas a chave anon (publishable) + RLS. NUNCA service_role.
-- ============================================================================

-- ---------- PERFIS ----------------------------------------------------------
create table if not exists public.fca_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  unidade    text,                       -- código da unidade (ex.: 'CGR'); null p/ admin
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- FCA (1 linha por ação) ------------------------------------------
create table if not exists public.fca (
  id            uuid primary key default gen_random_uuid(),
  unidade       text not null,                                  -- código (ex.: 'CGR')
  vigencia      text not null,                                  -- ex.: 'mai/26'
  origem        text not null check (origem in ('RPM','Custos')),
  fato          text not null,                                  -- indicador / conta
  projeto       text,                                           -- nível3 / projeto (null = Geral)
  fato_desvio   text,                                           -- desvio formatado (referência)
  causa         text,
  acao          text,
  responsavel   text,
  prazo         date,
  status        text not null default 'Não iniciada',
  acompanhamento text,
  locked        boolean not null default false,
  legado        boolean not null default false,              -- true = importado do FCA antigo (planilha)
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists fca_unidade_vig_idx on public.fca (unidade, vigencia);
create index if not exists fca_origem_idx       on public.fca (origem);

-- ---------- HELPERS ---------------------------------------------------------
create or replace function public.fca_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.fca_profiles where user_id = auth.uid()), false);
$$;

create or replace function public.fca_my_unit() returns text
  language sql stable security definer set search_path = public as $$
  select unidade from public.fca_profiles where user_id = auth.uid();
$$;

-- updated_at automático
create or replace function public.fca_touch() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists fca_touch on public.fca;
create trigger fca_touch before update on public.fca
  for each row execute function public.fca_touch();

-- Trava por linha REMOVIDA: a unidade edita suas ações livremente, inclusive
-- depois de salvar. (Antes um trigger fca_lock_guard impedia editar linhas
-- locked=true — o que travava a reedição. Removido a pedido.)
drop trigger if exists fca_lock_guard on public.fca;
drop function if exists public.fca_lock_guard();
-- destrava o que ficou travado no modelo antigo:
update public.fca set locked = false where locked = true;

-- ---------- RLS -------------------------------------------------------------
alter table public.fca_profiles enable row level security;
alter table public.fca          enable row level security;

-- profiles: cada um lê o seu; admin lê/gerencia todos
drop policy if exists fca_profiles_select on public.fca_profiles;
create policy fca_profiles_select on public.fca_profiles for select
  using (user_id = auth.uid() or public.fca_is_admin());
drop policy if exists fca_profiles_admin_all on public.fca_profiles;
create policy fca_profiles_admin_all on public.fca_profiles for all
  using (public.fca_is_admin()) with check (public.fca_is_admin());

-- fca: SELECT — qualquer usuário logado lê tudo (painéis de BI FCAs/Aderência são visão geral).
-- A privacidade por unidade fica na ESCRITA (insert/update/delete abaixo). A página de
-- preenchimento já filtra pela própria unidade. Se quiser restringir a leitura por unidade,
-- troque por: using (public.fca_is_admin() or unidade = public.fca_my_unit())
drop policy if exists fca_select on public.fca;
create policy fca_select on public.fca for select
  using (auth.uid() is not null);
-- INSERT — admin qualquer; usuário só na sua unidade
drop policy if exists fca_insert on public.fca;
create policy fca_insert on public.fca for insert
  with check (public.fca_is_admin() or unidade = public.fca_my_unit());
-- UPDATE — admin qualquer; usuário só a sua unidade (lock garantido pelo trigger)
drop policy if exists fca_update on public.fca;
create policy fca_update on public.fca for update
  using (public.fca_is_admin() or unidade = public.fca_my_unit())
  with check (public.fca_is_admin() or unidade = public.fca_my_unit());
-- DELETE — admin tudo; usuário qualquer ação da SUA unidade (sem restrição de lock)
drop policy if exists fca_delete on public.fca;
create policy fca_delete on public.fca for delete
  using (public.fca_is_admin() or unidade = public.fca_my_unit());

-- ============================================================================
--  PÓS-SETUP (rodar manualmente, ajustando os valores):
--
--  1) Marcar você como admin (descubra o user_id em Authentication → Users):
--     insert into public.fca_profiles (user_id, nome, is_admin)
--     values ('<SEU_USER_ID>', 'Renan', true)
--     on conflict (user_id) do update set is_admin = true;
--
--  2) Vincular um usuário de unidade:
--     insert into public.fca_profiles (user_id, nome, unidade)
--     values ('<USER_ID>', 'Gestor CGR', 'CGR')
--     on conflict (user_id) do update set unidade = excluded.unidade;
--
--  Origens: 'RPM' (indicadores do Gerot) | 'Custos' (FCA/DRE). O FCA antigo
--  migrado entra como origem='Custos'.
-- ============================================================================
