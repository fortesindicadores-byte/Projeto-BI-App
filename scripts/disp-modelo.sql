-- ============================================================================
-- Disponibilidade · coluna MODELO na foto diária
-- Motivo: no Resumo do app a tabela "Tipo de Veículo" tem TOGGLE para MODELO
-- (Renan, 14/08/2026), e a foto só guardava tipo_veiculo.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================================

alter table public.disp_snapshot add column if not exists modelo text;

-- a foto diária passa a quebrar também por modelo
create or replace function public.disp_snapshot_diario()
returns void language plpgsql security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- INDISPONÍVEIS do dia (inalterado)
  delete from indisp_snapshot where data = hoje and fonte = 'app';
  insert into indisp_snapshot (data, unidade, unidade_nome, projeto, placa, modelo, grupo,
                               descricao_problema, local_manutencao, rc_oc, dias_parado,
                               status, previsao_retorno, observacao, fonte)
  select hoje, i.unidade, i.unidade_nome, i.projeto, i.placa, i.modelo, i.grupo,
         i.descricao_problema, i.local_manutencao, i.rc_oc,
         greatest(0, hoje - i.data_parada), i.status, i.previsao_retorno, i.observacao, 'app'
    from indisponibilidade i
   where i.data_retorno is null;

  -- ATIVOS × INDISPONÍVEIS, agora também por MODELO
  delete from disp_snapshot where data = hoje and fonte = 'app';
  insert into disp_snapshot (data, unidade, unidade_nome, projeto, tipo_veiculo, modelo,
                             ativos, indisponiveis, fonte)
  select hoje,
         public.disp_unit_cod(a.filial, a.projeto),
         a.filial, a.projeto, a.tipo, a.modelo,
         count(distinct a.placa),
         count(distinct i.placa),
         'app'
    from (
      select upper(trim(e->>'Filial'))                     as filial,
             upper(trim(coalesce(e->>'Projeto','')))       as projeto,
             upper(trim(coalesce(e->>'Tipo Veículo','')))  as tipo,
             upper(trim(coalesce(e->>'Modelo','')))        as modelo,
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
   group by 2, 3, 4, 5, 6;
end $$;

revoke execute on function public.disp_snapshot_diario() from public, anon, authenticated;

-- (opcional) refaz a foto de hoje já com modelo
-- select public.disp_snapshot_diario();
