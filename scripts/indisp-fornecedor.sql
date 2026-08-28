-- ============================================================
-- Indisponibilidade — coluna Fornecedor (Renan, 27/08/2026)
--
-- Quem faz o serviço, quando a manutenção é EXTERNA. Regra da tela:
--   Local = INTERNO  → grava 'N/A' e o campo fica travado (é a própria
--                      oficina; não há fornecedor a informar)
--   Local = EXTERNO  → campo livre para a unidade preencher
--
-- As policies NÃO mudam: já cobrem a linha inteira (fca_is_admin() OR
-- fca_has_unit(unidade)), então a coluna nova entra nelas sozinha.
-- ============================================================

alter table public.indisponibilidade
  add column if not exists fornecedor text;

comment on column public.indisponibilidade.fornecedor is
  'Oficina/fornecedor do serviço. N/A quando local_manutencao = INTERNO.';

-- ---------- Conferência ----------------------------------------------------
-- select local_manutencao, coalesce(fornecedor,'(vazio)') as fornecedor, count(*)
--   from public.indisponibilidade group by 1,2 order by 1,2;
