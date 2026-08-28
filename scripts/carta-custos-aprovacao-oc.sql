-- ============================================================
-- Carta de Custos — 2ª aprovação, a da OC (Renan, 27/08/2026)
--
-- O fluxo passa a ter DUAS etapas, uma por documento:
--   RC → farol 1 (aprovado)    → libera a OC
--   OC → farol 2 (aprovado_oc) → libera a NF
--
-- Quem aprova as duas é o coordenador (fca_is_admin), como já era na 1ª.
-- Reprovar a RC derruba a aprovação da OC junto — isso é feito na tela.
--
-- As policies NÃO mudam: já cobrem a linha inteira (fca_is_admin() OR
-- fca_has_unit(unidade)), então a coluna nova entra nelas sozinha.
-- ============================================================

alter table public.carta_custos
  add column if not exists aprovado_oc boolean not null default false;

comment on column public.carta_custos.aprovado_oc is
  '2ª aprovação do coordenador: libera o preenchimento da NF. Só faz sentido com aprovado = true.';

-- ---------- Conferência ----------------------------------------------------
-- select aprovado, aprovado_oc, count(*)
--   from public.carta_custos group by 1,2 order by 1,2;
