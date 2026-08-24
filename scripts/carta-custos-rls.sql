-- ============================================================
-- Carta de Custos — RLS multi-unidade (22/08/2026)
--
-- Sintoma: quem tem UMA unidade no perfil lança normalmente; quem tem MAIS DE
-- UMA (ex.: 'MCC T1,MCC T2') não consegue. É a assinatura de policy escrita com
-- a regra antiga de unidade única — `unidade = fca_my_unit()` compara a unidade
-- da linha com a STRING INTEIRA do perfil ('MCC T1' = 'MCC T1,MCC T2' → false),
-- então todo insert/update é barrado (e, se o SELECT também for assim, a pessoa
-- nem enxerga os próprios lançamentos).
--
-- O split-cba-mcc.sql já trocava as policies de ESCRITA por fca_has_unit, mas
-- só se a carta_custos existisse naquele momento — e deixava o SELECT como
-- estava. Este script fecha os dois furos e é idempotente: pode rodar sempre.
--
-- DIAGNÓSTICO (rode antes e depois para ver a diferença):
--   select policyname, cmd, qual, with_check
--     from pg_policies where schemaname='public' and tablename='carta_custos'
--    order by cmd, policyname;
-- ============================================================

-- 1) helper de pertencimento à lista do perfil (mesma função do FCA)
create or replace function public.fca_has_unit(u text) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(u = any (
           select trim(x) from unnest(string_to_array(
             (select unidade from public.fca_profiles where user_id = auth.uid()), ',')) as x
         ), false);
$$;

-- 2) policies da carta_custos: TODAS (inclusive SELECT) pela regra multi-unidade
do $$
declare p record;
begin
  if not exists (select from information_schema.tables
                 where table_schema='public' and table_name='carta_custos') then
    raise notice 'carta_custos não existe — nada a fazer';
    return;
  end if;

  alter table public.carta_custos enable row level security;

  for p in select policyname from pg_policies
           where schemaname='public' and tablename='carta_custos' loop
    execute format('drop policy %I on public.carta_custos', p.policyname);
  end loop;

  -- ler: admin vê tudo; a unidade vê o que é dela (qualquer uma da sua lista)
  execute 'create policy carta_select on public.carta_custos for select
     to authenticated
     using (public.fca_is_admin() or public.fca_has_unit(unidade))';

  execute 'create policy carta_insert on public.carta_custos for insert
     to authenticated
     with check (public.fca_is_admin() or public.fca_has_unit(unidade))';

  execute 'create policy carta_update on public.carta_custos for update
     to authenticated
     using (public.fca_is_admin() or public.fca_has_unit(unidade))
     with check (public.fca_is_admin() or public.fca_has_unit(unidade))';

  execute 'create policy carta_delete on public.carta_custos for delete
     to authenticated
     using (public.fca_is_admin() or public.fca_has_unit(unidade))';
end $$;

-- 3) Conferência — deve listar 4 policies, todas com fca_has_unit
-- select policyname, cmd, qual, with_check
--   from pg_policies where schemaname='public' and tablename='carta_custos'
--  order by cmd, policyname;
--
-- Quem tem várias unidades (deve listar cada token separado):
-- select unidade from public.fca_profiles where unidade like '%,%';
