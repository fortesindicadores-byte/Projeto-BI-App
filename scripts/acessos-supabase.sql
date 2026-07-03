-- ═══════════════════════════════════════════════════════════════════
-- Painel de Acessos — tabela de log (rodar UMA vez no SQL Editor do
-- Supabase do hub: https://lozwipoeacpvplgkrxkq.supabase.co)
-- O hub grava 1 linha por entrada e por clique em painel; o painel
-- /acessos/ (só admin) lê e agrega.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.access_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email      text,
  painel     text not null default 'hub',
  created_at timestamptz not null default now()
);

create index if not exists access_log_created_idx on public.access_log (created_at desc);
create index if not exists access_log_email_idx   on public.access_log (email);

alter table public.access_log enable row level security;

-- qualquer usuário logado registra o PRÓPRIO acesso (insert-only)
drop policy if exists "insere proprio acesso" on public.access_log;
create policy "insere proprio acesso" on public.access_log
  for insert to authenticated
  with check (user_id = auth.uid());

-- só admin (fca_profiles.is_admin) lê o log
drop policy if exists "admin le tudo" on public.access_log;
create policy "admin le tudo" on public.access_log
  for select to authenticated
  using (exists (select 1 from public.fca_profiles p
                 where p.user_id = auth.uid() and p.is_admin));
