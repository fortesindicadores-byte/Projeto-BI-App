-- ============================================================================
--  MPR · campos livres COMPARTILHADOS (Causa / Ação / Responsável / Prazo)
--  Projeto: mesmo do hub/auth  →  lozwipoeacpvplgkrxkq.supabase.co
--  Rodar no  Supabase Dashboard → SQL Editor  (uma vez).
--
--  Antes: os campos ficavam só no localStorage (por navegador) — o coordenador
--  em outra máquina não via. Agora ficam nesta tabela, visíveis e editáveis por
--  qualquer usuário logado (gestor e coordenador).
--
--  Chave = (ind, uni):
--   - ind  : indicador (ex.: 'ADERÊNCIA PREVENTIVA')
--   - uni  : linha do painel — "UNIDADE|TIER" (ex.: 'CDD CUIABA|WH T2') ou 'GEO:CO'
-- ============================================================================

create table if not exists public.mpr_fields (
  ind        text not null,
  uni        text not null,
  causa      text,
  acao       text,
  resp       text,
  prazo      text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),
  primary key (ind, uni)
);

alter table public.mpr_fields enable row level security;

-- Qualquer usuário logado lê tudo (o MPR é uma visão de gestão compartilhada)
drop policy if exists mpr_fields_select on public.mpr_fields;
create policy mpr_fields_select on public.mpr_fields for select
  using (auth.uid() is not null);

-- Qualquer usuário logado grava/edita (gestor preenche, coordenador ajusta)
drop policy if exists mpr_fields_write on public.mpr_fields;
create policy mpr_fields_write on public.mpr_fields for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
