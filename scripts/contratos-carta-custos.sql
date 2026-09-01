-- ============================================================
-- Carta de Custos — origem dos lançamentos automáticos (01/09/2026)
--
-- O robô scripts/contratos-robot.mjs sobe o custo de CONTRATO (manutenção
-- por km) da planilha "Contratos Man." para a carta_custos, uma linha por
-- placa. Para poder rodar de novo sem duplicar — e sem encostar em nada que
-- foi digitado à mão — cada linha automática carrega uma chave própria.
--
--   origem       = quem criou a linha ('contratos-planilha'); nulo = manual
--   origem_chave = contrato:<vigência>:<placa>, única
--
-- O índice é PARCIAL (só onde origem_chave não é nula), então lançamento
-- manual continua livre para repetir o que precisar.
-- ============================================================

alter table public.carta_custos
  add column if not exists origem text,
  add column if not exists origem_chave text;

comment on column public.carta_custos.origem is
  'Robô que criou a linha (ex.: contratos-planilha). Nulo = lançamento manual.';
comment on column public.carta_custos.origem_chave is
  'Chave de idempotência do robô (contrato:<vigencia>:<placa>). Nulo = manual.';

create unique index if not exists carta_custos_origem_chave_uidx
  on public.carta_custos (origem_chave)
  where origem_chave is not null;

-- Conferência depois de rodar o robô:
--   select vigencia, unidade, count(*), sum(valor)
--     from public.carta_custos
--    where origem = 'contratos-planilha'
--    group by 1,2 order by 1,2;
