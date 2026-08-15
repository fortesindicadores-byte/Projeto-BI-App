-- ============================================================================
--  Disponibilidade · tapar os BURACOS da foto diária  (Renan, 15/08/2026)
--  Rodar no Supabase Dashboard → SQL Editor.
--
--  DIAGNÓSTICO (workflow "Disp Buracos Inspect", 15/08/2026):
--    · a série começa em 19/02/2026 — antes disso não havia medição, então
--      01 a 18/02 ficam vazios de propósito e NÃO são preenchidos aqui;
--    · entre 19/02 e 14/08 faltam 47 dias, espalhados por TODOS os dias da
--      semana (sáb 7 · dom 7 · seg 7 · qui 10 · sex 6 · ter 5 · qua 5) —
--      ou seja, não é domingo nem feriado: é dia em que a rotina antiga
--      (Apps Script → planilha) simplesmente não rodou;
--    · há também dias PARCIAIS, com uma unidade a menos que o normal.
--
--  O QUE ESTE SCRIPT FAZ:
--    1. PARA TRÁS  — todo par (unidade, dia) que falta, dentro da janela da
--       própria unidade, recebe a cópia do último dia que ela teve, com
--       fonte='backfill'. Cobre dia inteiro faltando e unidade faltando no dia.
--    2. PARA FRENTE — a foto diária das 09h BRT passa a tapar sozinha qualquer
--       dia que tenha ficado para trás desde a última foto, com a mesma regra.
--
--  Reversível:  delete from public.disp_snapshot where fonte = 'backfill';
--  ATENÇÃO: se um dia reimportar o histórico em /disponibilidade-migracao/,
--  apagar antes as linhas 'backfill' — a reimportação só apaga as 'sheet'.
-- ============================================================================

-- ---------- 1) BACKFILL DO QUE JÁ PASSOU -------------------------------------
with lim as (
  select max(data) as fim from public.disp_snapshot
),
uni as (
  select unidade, min(data) as ini
    from public.disp_snapshot
   group by unidade
),
cal as (
  select u.unidade, g.d::date as data
    from uni u
    cross join lim l
    cross join lateral generate_series(u.ini, l.fim, interval '1 day') g(d)
),
falta as (
  select c.unidade, c.data
    from cal c
   where not exists (
     select 1 from public.disp_snapshot s
      where s.unidade = c.unidade and s.data = c.data)
),
origem as (
  select f.unidade, f.data,
         (select max(s.data) from public.disp_snapshot s
           where s.unidade = f.unidade and s.data < f.data) as de
    from falta f
)
insert into public.disp_snapshot
  (data, unidade, unidade_nome, projeto, tipo_veiculo, ativos, indisponiveis, fonte)
select o.data, s.unidade, s.unidade_nome, s.projeto, s.tipo_veiculo,
       s.ativos, s.indisponiveis, 'backfill'
  from origem o
  join public.disp_snapshot s
    on s.unidade = o.unidade and s.data = o.de;

-- ---------- 2) A FOTO DIÁRIA PASSA A TAPAR BURACO SOZINHA --------------------
-- Mesma função de antes; ganhou no fim o passo 3, que repete o último dia
-- conhecido em cada dia que ficou sem foto desde então. Continua idempotente:
-- refaz só o dia de hoje (fonte='app') e nunca toca em linha 'sheet'.
create or replace function public.disp_snapshot_diario()
returns void language plpgsql security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- 1) foto dos indisponíveis abertos
  delete from indisp_snapshot where data = hoje and fonte = 'app';
  insert into indisp_snapshot (data, unidade, unidade_nome, projeto, placa, modelo, grupo,
                               descricao_problema, local_manutencao, rc_oc, dias_parado,
                               status, previsao_retorno, observacao, fonte)
  select hoje, i.unidade, i.unidade_nome, i.projeto, i.placa, i.modelo, i.grupo,
         i.descricao_problema, i.local_manutencao, i.rc_oc,
         greatest(hoje - i.data_parada, 0),
         i.status, i.previsao_retorno, i.observacao, 'app'
    from indisponibilidade i
   where i.data_retorno is null;

  -- 2) agregado Unidade×Projeto×Tipo: ativos (robô Ginfo) × indisponíveis abertos
  delete from disp_snapshot where data = hoje and fonte = 'app';
  insert into disp_snapshot (data, unidade, unidade_nome, projeto, tipo_veiculo,
                             ativos, indisponiveis, fonte)
  select hoje,
         public.disp_unit_cod(a.filial, a.projeto),
         a.filial, a.projeto, a.tipo,
         count(distinct a.placa),
         count(distinct i.placa),
         'app'
    from (
      select upper(trim(e->>'Filial'))                       as filial,
             upper(trim(coalesce(e->>'Projeto','')))         as projeto,
             upper(trim(coalesce(e->>'Tipo Veículo','')))    as tipo,
             upper(replace(coalesce(e->>'Placa',''),' ','')) as placa
        from ginfo_snapshot g, jsonb_array_elements(g.data) e
       where g.chave = 'ativos'
         and upper(coalesce(e->>'Projeto','')) not like '%FRETEIRO%'
    ) a
    left join (
      select distinct upper(replace(placa,' ','')) as placa
        from indisponibilidade
       where data_retorno is null
    ) i on i.placa = a.placa
   where a.placa <> ''
   group by 2, 3, 4, 5;

  -- 3) dia que ficou sem foto (robô caiu, banco fora, feriado de deploy…):
  --    repete o último dia conhecido de cada unidade. Nunca sobrescreve nada.
  insert into disp_snapshot (data, unidade, unidade_nome, projeto, tipo_veiculo,
                             ativos, indisponiveis, fonte)
  with uni as (
    select unidade, min(data) as ini from disp_snapshot group by unidade
  ),
  cal as (
    select u.unidade, g.d::date as data
      from uni u
      cross join lateral generate_series(u.ini, hoje, interval '1 day') g(d)
  ),
  falta as (
    select c.unidade, c.data
      from cal c
     where not exists (
       select 1 from disp_snapshot s
        where s.unidade = c.unidade and s.data = c.data)
  ),
  origem as (
    select f.unidade, f.data,
           (select max(s.data) from disp_snapshot s
             where s.unidade = f.unidade and s.data < f.data) as de
      from falta f
  )
  select o.data, s.unidade, s.unidade_nome, s.projeto, s.tipo_veiculo,
         s.ativos, s.indisponiveis, 'backfill'
    from origem o
    join disp_snapshot s on s.unidade = o.unidade and s.data = o.de;
end $$;

revoke execute on function public.disp_snapshot_diario() from public, anon, authenticated;

-- ---------- 3) GARANTE O CRON DAS 09h BRT (12h UTC) --------------------------
create extension if not exists pg_cron;
do $cron$ begin
  perform cron.unschedule('disp-snapshot-diario');
exception when others then null; end $cron$;
select cron.schedule('disp-snapshot-diario', '0 12 * * *',
                     $$select public.disp_snapshot_diario()$$);

-- ---------- CONFERÊNCIA -------------------------------------------------------
-- quantas linhas de cada fonte, e a janela de cada uma:
select fonte, count(*) linhas, min(data) de, max(data) ate
  from public.disp_snapshot group by fonte order by 1;

-- sobrou algum dia sem foto entre o primeiro e o último? (esperado: 0 linhas)
with lim as (select min(data) ini, max(data) fim from public.disp_snapshot)
select g.d::date as dia_sem_foto
  from lim l, generate_series(l.ini, l.fim, interval '1 day') g(d)
 where not exists (select 1 from public.disp_snapshot s where s.data = g.d::date)
 order by 1;
