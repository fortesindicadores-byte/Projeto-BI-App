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

-- ── 5) custo por VIGÊNCIA (Renan, 04/09/2026) ─────────────────────────────
-- "Eu preciso entender o custo, então preciso do km da vigência." A view da
-- seção 3 mede do último "Km Informado" da planilha até hoje — bom para
-- faturar (não deixa km escapar), ruim para entender o mês: medido contra o
-- hodômetro de 31/08, aquele informado estava ~1.500 km atrás em 102 das 107
-- placas conferidas, então o delta carrega meses anteriores junto.
--
-- O km do mês sai por DOIS caminhos independentes, de propósito. Um número
-- sozinho não dá para validar; dois que se conferem, sim:
--   A) hodômetro do último abastecimento do mês − o do último do mês anterior
--   B) soma do km_rodado (DESGASTE) que o próprio ERP grava em cada linha
-- Divergência grande = hodômetro digitado errado, e aí a placa aparece para
-- conferência em vez de virar custo calado.
--
-- Duas limitações conhecidas, para ninguém ler o histórico errado:
--   · o PRIMEIRO mês carregado não tem `km_hodometro` (falta a leitura do mês
--     anterior) — fica só com o km do ERP;
--   · `contratos_placa` é uma foto do contrato de HOJE, sem data de início, então
--     o custo fixo aparece igual em toda vigência, inclusive antes de o contrato
--     existir.
create or replace view public.km_vigencia as
with mes as (
  select placa,
         to_char(data, 'YYYY-MM')            as vig,
         max(hodometro)                      as hodo_fim,
         min(hodometro)                      as hodo_min,
         sum(km_rodado)                      as km_somado,
         sum(litros)                         as litros,
         sum(valor)                          as valor_diesel,
         count(*)                            as abastecimentos,
         max(data)                           as ultimo_abast
    from public.erp_abastecimentos
   where data is not null
     and data <= current_date          -- ERP tem lançamento com ano 2222
     and hodometro is not null
   group by 1, 2
),
seq as (
  select m.*,
         lag(hodo_fim) over (partition by placa order by vig) as hodo_ini,
         lag(vig)      over (partition by placa order by vig) as vig_ant
    from mes m
)
select placa, vig, vig_ant,
       hodo_ini, hodo_fim, ultimo_abast, abastecimentos, litros, valor_diesel,
       case when hodo_ini is not null
            then greatest(hodo_fim - hodo_ini, 0) end        as km_hodometro,
       km_somado                                             as km_erp,
       case when hodo_ini is not null and km_somado > 0
            then round(abs(greatest(hodo_fim - hodo_ini, 0) - km_somado)
                       / km_somado * 100, 1) end             as divergencia_pct
  from seq;

create or replace view public.custo_vigencia as
select k.vig,
       c.placa, c.placa_origem, c.unidade, c.projeto, c.tipo,
       c.taxa_km, c.valor_fixo,
       k.km_hodometro, k.km_erp, k.divergencia_pct,
       coalesce(k.km_hodometro, k.km_erp) as km_vig,
       case when c.tipo = 'fixo' then c.valor_fixo
            else coalesce(k.km_hodometro, k.km_erp, 0) * coalesce(c.taxa_km, 0)
       end                                as custo_vig,
       k.litros, k.valor_diesel, k.abastecimentos, k.ultimo_abast
  from public.km_vigencia k
  join public.contratos_placa c on c.placa = k.placa;
