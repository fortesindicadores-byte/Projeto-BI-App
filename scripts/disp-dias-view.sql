-- ============================================================================
--  Disponibilidade · view com os DIAS do histórico  (Renan, 15/08/2026)
--  Rodar no Supabase Dashboard → SQL Editor.
--
--  O filtro "Data" do app passou a ser o dia do HISTÓRICO (a foto daquele dia),
--  não mais a data de parada do evento. Para listar os dias sem baixar as ~30
--  mil linhas das duas fotos, o app lê esta view — uma linha por dia.
--
--  security_invoker: a view respeita a RLS das tabelas de baixo (leitura para
--  logados), em vez de rodar como dona e furar a regra.
-- ============================================================================
create or replace view public.disp_dias
  with (security_invoker = on) as
select data from public.disp_snapshot
union
select data from public.indisp_snapshot;

grant select on public.disp_dias to authenticated;

-- conferência: quantos dias e qual a janela
select count(*) as dias, min(data) as de, max(data) as ate from public.disp_dias;
