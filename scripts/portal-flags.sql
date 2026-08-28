-- ============================================================
-- portal_flags — chaves de liga/desliga do portal (Renan, 28/08/2026)
--
-- Primeira: 'frota_elite_visivel'. Enquanto está DESLIGADA, o painel
-- Frota de Elite mostra o aviso de período de apuração para todo mundo
-- (o suspense antes da divulgação); só o admin continua enxergando os
-- números e é ele quem liga e desliga, pelo botão no topo do painel.
--
-- Leitura é ABERTA de propósito: o painel monta a tela antes de saber
-- quem está olhando, e a flag em si não é dado sensível.
-- Escrita só para admin (fca_is_admin), como no Gerenciar Acessos.
-- ============================================================

create table if not exists public.portal_flags (
  chave       text primary key,
  ligado      boolean     not null default true,
  mensagem    text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

comment on table public.portal_flags is
  'Chaves de liga/desliga do portal. ligado=false esconde o conteúdo e mostra a mensagem.';

alter table public.portal_flags enable row level security;

drop policy if exists portal_flags_sel on public.portal_flags;
create policy portal_flags_sel on public.portal_flags
  for select using (true);

drop policy if exists portal_flags_ins on public.portal_flags;
create policy portal_flags_ins on public.portal_flags
  for insert to authenticated with check (public.fca_is_admin());

drop policy if exists portal_flags_upd on public.portal_flags;
create policy portal_flags_upd on public.portal_flags
  for update to authenticated
  using (public.fca_is_admin()) with check (public.fca_is_admin());

-- nasce LIGADA: quem já usa o painel hoje não perde o acesso na virada
insert into public.portal_flags (chave, ligado)
values ('frota_elite_visivel', true)
on conflict (chave) do nothing;

-- ---------- Conferência ----------------------------------------------------
-- select chave, ligado, mensagem, updated_at from public.portal_flags;
