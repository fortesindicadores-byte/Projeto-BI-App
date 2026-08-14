-- ============================================================================
--  Ativos manuais (ANG/Anhanguera) + view de resumo da disponibilidade
--  Projeto: mesmo do hub/auth  →  lozwipoeacpvplgkrxkq.supabase.co
--  Rodar no  Supabase Dashboard → SQL Editor  (uma vez).
--
--  A Anhanguera (ANG) não existe no Ginfo — os veículos dela são cadastrados
--  à mão, no MESMO template da tabela ativos do Ginfo (Filial | Projeto |
--  Placa | Marca | Modelo | Tipo Veículo | Estado | Ano Fabricação).
--  O app só mostra o cadastro para quem tem acesso à ANG (RLS garante).
--  Seed: 51 veículos do xlsx do Renan (14/08/2026, Filial SEARA · ROTA).
-- ============================================================================

create table if not exists public.ativos_manual (
  placa          text primary key,          -- normalizada (sem espaços, caixa alta)
  unidade        text not null,             -- código do portal (ANG)
  filial         text,                      -- como no template Ginfo
  projeto        text,
  marca          text,
  modelo         text,
  tipo_veiculo   text,
  estado         text,
  ano_fabricacao int,
  created_by     uuid references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id) default auth.uid(),
  updated_at     timestamptz not null default now()
);

create or replace function public.ativos_manual_touch() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
drop trigger if exists ativos_manual_touch on public.ativos_manual;
create trigger ativos_manual_touch before update on public.ativos_manual
  for each row execute function public.ativos_manual_touch();

alter table public.ativos_manual enable row level security;
drop policy if exists ativos_manual_select on public.ativos_manual;
create policy ativos_manual_select on public.ativos_manual for select
  using (auth.uid() is not null);
drop policy if exists ativos_manual_insert on public.ativos_manual;
create policy ativos_manual_insert on public.ativos_manual for insert
  with check (public.fca_is_admin() or public.fca_has_unit(unidade));
drop policy if exists ativos_manual_update on public.ativos_manual;
create policy ativos_manual_update on public.ativos_manual for update
  using (public.fca_is_admin() or public.fca_has_unit(unidade))
  with check (public.fca_is_admin() or public.fca_has_unit(unidade));
drop policy if exists ativos_manual_delete on public.ativos_manual;
create policy ativos_manual_delete on public.ativos_manual for delete
  using (public.fca_is_admin() or public.fca_has_unit(unidade));

-- SEARA também cai na ANG no de-para
insert into public.unidade_depara (nome, cod) values ('SEARA','ANG')
on conflict (nome) do update set cod = excluded.cod;

-- ---------- SEED: 51 veículos da Anhanguera (xlsx 14/08/2026) ----------------
insert into public.ativos_manual (placa, unidade, filial, projeto, marca, modelo, tipo_veiculo, estado) values
  ('BKG6B91','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','VUC','SÃO PAULO'),
  ('CKU7C15','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','TOCO','SÃO PAULO'),
  ('CNT2D51','ANG','SEARA','ROTA','Volkswagen','17.190 CRM 4X2','TOCO','SÃO PAULO'),
  ('DNR4C84','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('DOE2J14','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('DWQ6D45','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('DWY7A25','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('EVV2A72','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','VUC','SÃO PAULO'),
  ('EWY0J65','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','VUC','SÃO PAULO'),
  ('EWZ4I53','ANG','SEARA','ROTA','Volkswagen','17.190 CRM 4X2','TOCO','SÃO PAULO'),
  ('EXY4G82','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('EYY0A65','ANG','SEARA','ROTA','Volkswagen','17.190 CRM 4X2','TOCO','SÃO PAULO'),
  ('FCC9A15','ANG','SEARA','ROTA','Volkswagen','17.190 CRM 4X2','TOCO','SÃO PAULO'),
  ('FEJ3G82','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FIN6I77','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FIW2B57','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FJN3B97','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FJT7H24','ANG','SEARA','ROTA','Volkswagen','17.190 CRM 4X2','TOCO','SÃO PAULO'),
  ('FLR5C32','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','VUC','SÃO PAULO'),
  ('FNV7E52','ANG','SEARA','ROTA','Volkswagen','17.190 CRM 4X2','TOCO','SÃO PAULO'),
  ('FNW7H25','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FOF9E14','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FPK4F12','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FQI9C63','ANG','SEARA','ROTA','Volkswagen','17.190 CRM 4X2','TOCO','SÃO PAULO'),
  ('FQT4E96','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','VUC','SÃO PAULO'),
  ('FQT4F96','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','TOCO','SÃO PAULO'),
  ('FQU2E57','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FSE7B13','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FWB6D72','ANG','SEARA','ROTA','Volkswagen','17.190 CRM 4X2','TOCO','SÃO PAULO'),
  ('FXA4G16','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FXL7F42','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FXS4I52','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('FYF6D94','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('GAU6B24','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','VUC','SÃO PAULO'),
  ('GBE1D74','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('GBU8J26','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('GDC4I84','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('GDD3C43','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('GDP6H93','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('GET3F84','ANG','SEARA','ROTA','Volkswagen','17.190 CRM 4X2','TOCO','SÃO PAULO'),
  ('GEU7H35','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','VUC','SÃO PAULO'),
  ('GFO1E81','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('GFQ4B35','ANG','SEARA','ROTA','Volkswagen','17.190 CRM 4X2','TOCO','SÃO PAULO'),
  ('GFY1H73','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('GGA6G16','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('GHY9C71','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','VUC','SÃO PAULO'),
  ('GJF2F55','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('GJG9B11','ANG','SEARA','ROTA','Volkswagen','VW 9.170 DRC 4X2','VUC','SÃO PAULO'),
  ('STR4G70','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','VUC','SÃO PAULO'),
  ('SVT4D79','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','VUC','SÃO PAULO'),
  ('SWF3D53','ANG','SEARA','ROTA','Volkswagen','VW/11.180 DRC 4X2','VUC','SÃO PAULO')
on conflict (placa) do update set
  unidade=excluded.unidade, filial=excluded.filial, projeto=excluded.projeto,
  marca=excluded.marca, modelo=excluded.modelo, tipo_veiculo=excluded.tipo_veiculo,
  estado=excluded.estado;

-- ---------- FOTO DIÁRIA passa a somar os ativos manuais ----------------------
-- (manual tem prioridade: placa que estiver nas duas bases conta uma vez)
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

  -- 2) agregado Unidade×Projeto×Tipo: ativos (Ginfo + manuais) × indisponíveis
  delete from disp_snapshot where data = hoje and fonte = 'app';
  insert into disp_snapshot (data, unidade, unidade_nome, projeto, tipo_veiculo,
                             ativos, indisponiveis, fonte)
  select hoje, a.cod, a.filial, a.projeto, a.tipo,
         count(distinct a.placa),
         count(distinct i.placa),
         'app'
    from (
      select public.disp_unit_cod(upper(trim(e->>'Filial')), e->>'Projeto') as cod,
             upper(trim(e->>'Filial'))                       as filial,
             upper(trim(coalesce(e->>'Projeto','')))         as projeto,
             upper(trim(coalesce(e->>'Tipo Veículo','')))    as tipo,
             upper(replace(coalesce(e->>'Placa',''),' ','')) as placa
        from ginfo_snapshot g, jsonb_array_elements(g.data) e
       where g.chave = 'ativos'
         and upper(coalesce(e->>'Projeto','')) not like '%FRETEIRO%'
         and upper(replace(coalesce(e->>'Placa',''),' ','')) not in (select placa from ativos_manual)
      union all
      select m.unidade, upper(coalesce(m.filial,'')), upper(coalesce(m.projeto,'')),
             upper(coalesce(m.tipo_veiculo,'')), m.placa
        from ativos_manual m
    ) a
    left join (
      select distinct upper(replace(placa,' ','')) as placa
        from indisponibilidade
       where data_retorno is null
    ) i on i.placa = a.placa
   where a.placa <> ''
   group by 1, 2, 3, 4;
end $$;
revoke execute on function public.disp_snapshot_diario() from public, anon, authenticated;

-- ---------- VIEW p/ a visão Resumo do app (agregado por dia × unidade) -------
create or replace view public.disp_resumo
  with (security_invoker = true) as
  select data, unidade,
         sum(ativos)::int        as ativos,
         sum(indisponiveis)::int as indisponiveis
    from public.disp_snapshot
   group by 1, 2;

-- refaz a foto de hoje já com os manuais
select public.disp_snapshot_diario();
