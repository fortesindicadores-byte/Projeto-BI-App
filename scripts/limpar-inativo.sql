-- ============================================================================
--  Limpa "(INATIVO)" dos dados do FCA e da Carta de Custos
--  Rodar no  Supabase Dashboard → SQL Editor  (uma vez; idempotente).
--  Mescla qualquer unidade/projeto "(INATIVO)" no nome base — ex.:
--  'PIR (INATIVO)' → 'PIR' · 'ROTA (INATIVO) - PIR' → 'ROTA - PIR'.
-- ============================================================================

update public.fca
   set unidade = btrim(regexp_replace(unidade, '\s*\(INATIVO\)', '', 'gi'))
 where unidade ~* '\(INATIVO\)';

update public.fca
   set projeto = nullif(btrim(regexp_replace(projeto, '\s*\(INATIVO\)', '', 'gi')), '')
 where projeto ~* '\(INATIVO\)';

do $$ begin
  if exists (select from information_schema.tables
             where table_schema='public' and table_name='carta_custos') then
    update public.carta_custos
       set unidade = btrim(regexp_replace(unidade, '\s*\(INATIVO\)', '', 'gi'))
     where unidade ~* '\(INATIVO\)';
    update public.carta_custos
       set projeto = nullif(btrim(regexp_replace(projeto, '\s*\(INATIVO\)', '', 'gi')), '')
     where projeto ~* '\(INATIVO\)';
  end if;
end $$;

-- perfis (por garantia — unidade e farol nunca deveriam ter isso)
update public.fca_profiles
   set unidade = btrim(regexp_replace(unidade, '\s*\(INATIVO\)', '', 'gi'))
 where unidade ~* '\(INATIVO\)';

-- Conferência:
-- select unidade, count(*) from public.fca group by 1 order by 1;
