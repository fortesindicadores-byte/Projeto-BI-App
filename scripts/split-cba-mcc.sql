-- ============================================================================
--  Split CBA / MCC por projeto (tier) + Acesso FCA multi-unidade
--  Projeto: mesmo do hub/auth  →  lozwipoeacpvplgkrxkq.supabase.co
--  Rodar no  Supabase Dashboard → SQL Editor  (uma vez), ANTES de publicar o
--  deploy que separa as unidades no portal.
--
--  O que faz:
--   1) fca: registros de CBA e MCC ganham a unidade com tier, derivada do
--      projeto:  EMPURRADA → T1 · APOIO → T1 WH (só CBA) · demais → T2.
--      Vale o mesmo para carta_custos.
--   2) fca_profiles.unidade passa a aceitar VÁRIAS unidades separadas por
--      vírgula (ex.: 'CBA T1,MCC T1'). Perfis com 'CBA'/'MCC' viram a lista
--      completa dos tiers correspondentes.
--   3) farol_unidades: troca os tokens 'CBA' e 'MCC' pelos códigos com tier.
--   4) RLS: as policies de fca e carta_custos passam a checar se a unidade da
--      linha está NA LISTA do perfil (fca_has_unit), em vez de igualdade.
-- ============================================================================

-- ---------- 1) DADOS: fca --------------------------------------------------
update public.fca set unidade = 'CBA T1'
  where unidade = 'CBA' and upper(coalesce(projeto,'')) like '%EMPURRADA%';
update public.fca set unidade = 'CBA T1 WH'
  where unidade = 'CBA' and upper(coalesce(projeto,'')) like '%APOIO%';
update public.fca set unidade = 'CBA T2'
  where unidade = 'CBA';   -- restante (ROTA, AUTO SERVIÇO, sem projeto…) = CDD

update public.fca set unidade = 'MCC T1'
  where unidade = 'MCC' and upper(coalesce(projeto,'')) like '%EMPURRADA%';
update public.fca set unidade = 'MCC T2'
  where unidade = 'MCC';   -- restante = CDI

-- ---------- 1b) DADOS: carta_custos (se a tabela existir) -------------------
do $$ begin
  if exists (select from information_schema.tables
             where table_schema='public' and table_name='carta_custos') then
    update public.carta_custos set unidade = 'CBA T1'
      where unidade = 'CBA' and upper(coalesce(projeto,'')) like '%EMPURRADA%';
    update public.carta_custos set unidade = 'CBA T1 WH'
      where unidade = 'CBA' and upper(coalesce(projeto,'')) like '%APOIO%';
    update public.carta_custos set unidade = 'CBA T2'
      where unidade = 'CBA';
    update public.carta_custos set unidade = 'MCC T1'
      where unidade = 'MCC' and upper(coalesce(projeto,'')) like '%EMPURRADA%';
    update public.carta_custos set unidade = 'MCC T2'
      where unidade = 'MCC';
  end if;
end $$;

-- ---------- 2) PERFIS: unidade vira lista (multi-acesso) --------------------
-- Quem tinha acesso a CBA/MCC passa a ver todos os tiers da unidade antiga.
update public.fca_profiles set unidade = 'CBA T1,CBA T1 WH,CBA T2' where upper(trim(unidade)) = 'CBA';
update public.fca_profiles set unidade = 'MCC T1,MCC T2'           where upper(trim(unidade)) = 'MCC';

comment on column public.fca_profiles.unidade is
  'Unidade(s) de acesso ao FCA — um ou mais códigos separados por vírgula (ex.: ''CGR'' ou ''CBA T1,MCC T1''). null = sem acesso (ou admin).';

-- ---------- 3) FAROL: farol_unidades troca CBA/MCC pelos tiers ---------------
-- (lista separada por vírgula; 'TODAS' segue valendo para todas)
update public.fca_profiles
   set farol_unidades = (
     select string_agg(novo, ',')
     from (
       select case t
                when 'CBA' then 'CBA T1,CBA T1 WH,CBA T2'
                when 'MCC' then 'MCC T1,MCC T2'
                else t
              end as novo
       from unnest(string_to_array(farol_unidades, ',')) with ordinality as u(t, ord)
       order by ord
     ) s
   )
 where farol_unidades is not null
   and farol_unidades <> ''
   and farol_unidades <> 'TODAS'
   and (string_to_array(farol_unidades, ',') && array['CBA','MCC']);

-- ---------- 4) RLS: pertencimento à lista (multi-unidade) -------------------
-- fca_my_unit() continua devolvendo o texto salvo (agora possivelmente uma
-- lista). O novo helper checa se uma unidade está na lista do perfil.
create or replace function public.fca_has_unit(u text) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(u = any (
           select trim(x) from unnest(string_to_array(
             (select unidade from public.fca_profiles where user_id = auth.uid()), ',')) as x
         ), false);
$$;

-- fca: INSERT/UPDATE/DELETE passam a usar fca_has_unit
drop policy if exists fca_insert on public.fca;
create policy fca_insert on public.fca for insert
  with check (public.fca_is_admin() or public.fca_has_unit(unidade));
drop policy if exists fca_update on public.fca;
create policy fca_update on public.fca for update
  using (public.fca_is_admin() or public.fca_has_unit(unidade))
  with check (public.fca_is_admin() or public.fca_has_unit(unidade));
drop policy if exists fca_delete on public.fca;
create policy fca_delete on public.fca for delete
  using (public.fca_is_admin() or public.fca_has_unit(unidade));

-- carta_custos: substitui as policies de ESCRITA existentes (qualquer nome)
-- pela regra "admin OU unidade na lista do perfil". A policy de SELECT fica
-- como está.
do $$
declare p record;
begin
  if exists (select from information_schema.tables
             where table_schema='public' and table_name='carta_custos') then
    for p in select policyname from pg_policies
             where schemaname='public' and tablename='carta_custos'
               and cmd in ('INSERT','UPDATE','DELETE') loop
      execute format('drop policy %I on public.carta_custos', p.policyname);
    end loop;
    execute 'create policy carta_insert on public.carta_custos for insert
       with check (public.fca_is_admin() or public.fca_has_unit(unidade))';
    execute 'create policy carta_update on public.carta_custos for update
       using (public.fca_is_admin() or public.fca_has_unit(unidade))
       with check (public.fca_is_admin() or public.fca_has_unit(unidade))';
    execute 'create policy carta_delete on public.carta_custos for delete
       using (public.fca_is_admin() or public.fca_has_unit(unidade))';
  end if;
end $$;

-- ---------- Conferência ------------------------------------------------------
-- select unidade, count(*) from public.fca group by 1 order by 1;
-- select unidade, farol_unidades, is_admin from public.fca_profiles order by 1;
-- ============================================================================
