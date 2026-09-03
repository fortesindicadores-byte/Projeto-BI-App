-- ============================================================
-- Abastecimentos do ERP (fonte do km real) + contrato por placa
-- Renan, 03/09/2026. Rode no SQL Editor do Supabase. Reexecutável.
--
-- O km real da frota vem dos ABASTECIMENTOS: cada um registra o hodômetro do
-- veículo (os.DESGASTEREAL na query do ERP). O hodômetro mais alto de uma
-- placa é o km atual dela, e é dele que sai o custo de contrato do mês em
-- andamento:
--
--     desloc. do mês = hodômetro atual − último "Km Informado" da planilha
--     custo variável = desloc. do mês × R$/km do contrato
--     custo fixo     = valor que se repete todo mês (sem km)
--
-- Escrita só pela service_role (os robôs); leitura para quem está logado no
-- portal, como o resto das bases.
-- ============================================================

-- ── 1) uma linha por abastecimento ────────────────────────────────────────
-- A chave é o HANDLE da linha de combustível do ERP: recolar o mesmo mês
-- corrige em vez de duplicar, e a planilha pode ser limpa quando o mês vira.
create table if not exists public.erp_abastecimentos (
  ordem_servico   text primary key,
  codigo_filial   text,
  filial          text,
  placa           text not null,
  modelo          text,
  unidade_prod    text,
  projeto_os      text,
  projeto_veiculo text,
  hodometro       numeric,
  km_rodado       numeric,
  litros          numeric,
  media_km_l      numeric,
  valor           numeric,
  data            date,
  atualizado_em   timestamptz not null default now()
);
create index if not exists erp_abast_placa_idx on public.erp_abastecimentos (placa);
create index if not exists erp_abast_data_idx  on public.erp_abastecimentos (data);

alter table public.erp_abastecimentos enable row level security;
drop policy if exists erp_abast_read on public.erp_abastecimentos;
create policy erp_abast_read on public.erp_abastecimentos
  for select to authenticated using (true);

-- ── 2) o contrato de cada placa (extraído da planilha Contratos Man.) ─────
-- 'variavel' cobra por km rodado (taxa_km); 'fixo' repete o mesmo valor todo
-- mês, independentemente de km.
create table if not exists public.contratos_placa (
  placa               text primary key,
  unidade             text,
  projeto             text,
  tipo                text not null check (tipo in ('variavel', 'fixo')),
  taxa_km             numeric,
  valor_fixo          numeric,
  ultimo_km_informado numeric,
  vig_referencia      text,
  atualizado_em       timestamptz not null default now()
);
alter table public.contratos_placa enable row level security;
drop policy if exists contratos_placa_read on public.contratos_placa;
create policy contratos_placa_read on public.contratos_placa
  for select to authenticated using (true);

-- ── 3) o que a Carta lê: km e custo do mês por placa ──────────────────────
-- Uma view para a tela não precisar refazer a conta em JavaScript. O mês em
-- andamento é o do hodômetro mais recente de cada placa.
create or replace view public.contrato_mes_atual as
with ult as (
  select placa,
         max(hodometro)                          as hodometro_atual,
         max(data)                               as ultimo_abastecimento,
         sum(km_rodado) filter (
           where data >= date_trunc('month', current_date)) as km_mes,
         sum(litros)    filter (
           where data >= date_trunc('month', current_date)) as litros_mes
    from public.erp_abastecimentos
   group by placa
)
select c.placa,
       c.unidade,
       c.projeto,
       c.tipo,
       c.taxa_km,
       c.valor_fixo,
       c.ultimo_km_informado,
       u.hodometro_atual,
       u.ultimo_abastecimento,
       u.km_mes,
       u.litros_mes,
       -- deslocamento a cobrar: do último km informado até o hodômetro de hoje.
       -- greatest(...,0) porque hodômetro digitado para menos não gera crédito.
       case when c.tipo = 'variavel' and u.hodometro_atual is not null
                 and c.ultimo_km_informado is not null
            then greatest(u.hodometro_atual - c.ultimo_km_informado, 0)
       end as desloc_mes,
       case when c.tipo = 'fixo' then c.valor_fixo
            when u.hodometro_atual is not null and c.ultimo_km_informado is not null
            then greatest(u.hodometro_atual - c.ultimo_km_informado, 0) * coalesce(c.taxa_km, 0)
       end as valor_mes
  from public.contratos_placa c
  left join ult u on u.placa = c.placa;

-- ── 4) placa de origem (03/09/2026) ───────────────────────────────────────
-- A coluna `placa` das duas tabelas passou a guardar a placa CANÔNICA
-- (Mercosul), que é por onde o km do ERP acha o contrato: o ERP e a planilha
-- não emplacam ao mesmo tempo, e cruzar pela placa crua faria o veículo
-- simplesmente não achar o contrato — sem erro, só sumindo da conta do mês.
-- `placa_origem` guarda a placa como ela veio, que é a que aparece na tela.
alter table public.erp_abastecimentos add column if not exists placa_origem text;
alter table public.contratos_placa   add column if not exists placa_origem text;
