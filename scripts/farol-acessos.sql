-- ============================================================================
--  Farol Frota · quem recebe por e-mail (segunda, 14h)
--  Projeto: mesmo do hub/auth  →  lozwipoeacpvplgkrxkq.supabase.co
--  Rodar no  Supabase Dashboard → SQL Editor  (uma vez).
--
--  Acrescenta a coluna farol_unidades em fca_profiles:
--   - null / vazio  → NÃO recebe o farol.
--   - 'TODAS'       → recebe o farol de TODAS as unidades (consolidado + cada unidade).
--   - 'CGR,BLC,...' → recebe apenas o farol dessas unidades (lista separada por vírgula).
--
--  A gestão é feita na tela Gerenciar Acessos (index.html), campo "Recebe Farol".
-- ============================================================================

alter table public.fca_profiles
  add column if not exists farol_unidades text;

comment on column public.fca_profiles.farol_unidades is
  'Unidades cujo Farol o usuário recebe por e-mail. null=nenhuma; TODAS=todas; ou lista de códigos separada por vírgula (ex.: CGR,BLC).';

-- Consulta usada pelo mailer (roda com service_role no GitHub Actions):
--   select p.farol_unidades, u.email, p.nome
--   from public.fca_profiles p
--   join auth.users u on u.id = p.user_id
--   where p.farol_unidades is not null and p.farol_unidades <> '';
