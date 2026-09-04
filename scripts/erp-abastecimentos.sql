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
   -- DATA NO FUTURO É DIGITAÇÃO ERRADA DO ERP (bug real, 04/09/2026): a
   -- primeira carga trouxe lançamento com ano 2222. Sem este corte ele entra
   -- como km do mês em andamento e infla o custo de uma placa sem aviso.
   where data is not null
     and data <= current_date
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

-- ── 5) km e custo por VIGÊNCIA (Renan, 04/09/2026) ────────────────────────
-- "Eu preciso entender o custo, então preciso do km da vigência."
--
-- DUAS REGRAS DE NEGÓCIO QUE MANDAM AQUI:
--   1. A cobrança é DEFASADA em um mês: "o km considerado em agosto é o de
--      julho, o de setembro o de agosto e assim sucessivamente". Por isso a
--      view expõe `vig_km` (mês em que rodou) E `vig_cobranca` (mês em que
--      vira fatura) — misturar as duas põe o custo no mês errado.
--   2. Quando o hodômetro não fecha o mês, APROXIMA em vez de deixar vazio.
--
-- COMO O KM DO MÊS É CALCULADO: cada intervalo entre dois abastecimentos tem
-- uma distância conhecida (hodômetro de um menos o do outro) e um número de
-- dias. Essa distância é RATEADA por dia e somada por mês. Duas consequências
-- boas, e é por isso que o rateio é a conta principal:
--   · placa que passou o mês sem abastecer continua tendo km no mês, tirado do
--     intervalo que atravessa aquele mês — antes ela simplesmente sumia;
--   · abastecimento que cai no dia 2 não joga no mês novo o km rodado no fim
--     do mês anterior.
-- `km_hodometro` (a conta simples: última leitura do mês menos a do mês
-- anterior) fica ao lado como conferência, e `km_erp` (soma do DESGASTE) como
-- terceira opinião.
--
-- O DESGASTE DO ERP NÃO SERVE DE FONTE, só de conferência: em parte das linhas
-- ele traz leitura de hodômetro em vez de distância (uma placa apareceu com
-- 1.002.338 km num mês). Usá-lo como reserva injetaria lixo no custo sem aviso.
--
-- GUARDA CONTRA HODÔMETRO DIGITADO ERRADO: intervalo que dá mais de 2.000
-- km/dia é descartado do rateio — não existe caminhão que rode isso, é erro de
-- digitação, e sem o corte um zero a mais viraria dezenas de milhares de reais.
create or replace view public.km_vigencia as
with leitura as (
  -- uma leitura por placa/dia: dois abastecimentos no mesmo dia não viram
  -- intervalo de zero dia (divisão por zero no rateio)
  select placa, data, max(hodometro) as hodo
    from public.erp_abastecimentos
   where data is not null
     and data <= current_date          -- ERP tem lançamento com ano 2222
     and hodometro is not null and hodometro > 0
   group by placa, data
),
par as (
  select placa,
         lag(data) over (partition by placa order by data) as d0,
         lag(hodo) over (partition by placa order by data) as h0,
         data as d1, hodo as h1
    from leitura
),
intervalo as (
  select placa, d0, d1, (h1 - h0) as km, (d1 - d0) as dias
    from par
   where d0 is not null
     and h1 >= h0                      -- hodômetro para trás = erro, não crédito
     and d1 > d0
     and (h1 - h0) / (d1 - d0) <= 2000
),
por_dia as (
  select i.placa,
         to_char(g.dia, 'YYYY-MM')       as vig,
         i.km::numeric / i.dias          as km_dia
    from intervalo i,
         generate_series(i.d0 + 1, i.d1, interval '1 day') g(dia)
),
rateio as (
  select placa, vig, sum(km_dia) as km_rateio, count(*) as dias_com_km
    from por_dia group by placa, vig
),
mes as (
  select placa,
         to_char(data, 'YYYY-MM')            as vig,
         max(hodometro)                      as hodo_fim,
         sum(km_rodado)                      as km_erp,
         sum(litros)                         as litros,
         sum(valor)                          as valor_diesel,
         count(*)                            as abastecimentos,
         max(data)                           as ultimo_abast
    from public.erp_abastecimentos
   where data is not null and data <= current_date and hodometro is not null
   group by placa, to_char(data, 'YYYY-MM')
),
simples as (
  select placa, vig, hodo_fim, km_erp, litros, valor_diesel, abastecimentos,
         ultimo_abast,
         hodo_fim - lag(hodo_fim) over (partition by placa order by vig) as km_hodometro
    from mes
)
select coalesce(r.placa, s.placa)                       as placa,
       coalesce(r.vig, s.vig)                           as vig_km,
       to_char(to_date(coalesce(r.vig, s.vig), 'YYYY-MM')
               + interval '1 month', 'YYYY-MM')         as vig_cobranca,
       round(r.km_rateio, 1)                            as km_vig,
       case when s.km_hodometro >= 0 then s.km_hodometro end as km_hodometro,
       s.km_erp, s.hodo_fim, s.litros, s.valor_diesel,
       s.abastecimentos, s.ultimo_abast, r.dias_com_km,
       case when r.km_rateio is null                    then 'sem leitura'
            when s.abastecimentos is null               then 'rateio (mês sem abastecer)'
            else 'rateio' end                           as origem_km,
       case when s.km_erp > 0 and r.km_rateio is not null
            then round(abs(r.km_rateio - s.km_erp) / s.km_erp * 100, 1)
       end                                              as divergencia_pct
  from rateio r
  full outer join simples s on s.placa = r.placa and s.vig = r.vig;

create or replace view public.custo_vigencia as
select k.vig_cobranca, k.vig_km,
       c.placa, c.placa_origem, c.unidade, c.projeto, c.tipo,
       c.taxa_km, c.valor_fixo,
       k.km_vig, k.km_hodometro, k.km_erp, k.divergencia_pct, k.origem_km,
       case when c.tipo = 'fixo' then c.valor_fixo
            else coalesce(k.km_vig, 0) * coalesce(c.taxa_km, 0)
       end                                as custo_vig,
       k.litros, k.valor_diesel, k.abastecimentos, k.ultimo_abast
  from public.km_vigencia k
  join public.contratos_placa c on c.placa = k.placa;
