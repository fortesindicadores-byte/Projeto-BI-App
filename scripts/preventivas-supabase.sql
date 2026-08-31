-- ============================================================
-- Preventivas da Anhanguera — hodômetro (Pró-Frotas) + lançamentos
-- (Renan, 31/08/2026)
--
-- Duas peças:
--   hodometro_leitura  — o que a API Pró-Frotas devolve: o hodômetro
--                        informado em cada abastecimento. Guardar o
--                        HISTÓRICO (e não só o último) é o que permite
--                        saber o km do veículo NA DATA da preventiva —
--                        a unidade preenche só a data, como o Renan pediu.
--   preventiva_lanc    — o lançamento da unidade: placa, escopo, tipo e data.
--
-- Escopo 'montadora' (VW): 365 dias ou 30.000 km · L → MP1 → L → MP2,
--   com "+ ODOT" nos múltiplos de 60.000 do hodômetro.
-- Escopo 'frio' (baús): 90 em 90 dias · alterna Básica → Completa.
-- ============================================================

-- ---------- hodômetro vindo da API ----------------------------------------
create table if not exists public.hodometro_leitura (
  placa      text        not null,
  data       timestamptz not null,      -- data do abastecimento
  km         integer     not null,
  unidade    text,                      -- nome da unidade na aba Base CNPJ
  fonte      text        not null default 'profrotas',
  created_at timestamptz not null default now(),
  primary key (placa, data)
);

comment on table public.hodometro_leitura is
  'Hodômetro por abastecimento (API Pró-Frotas). Histórico, para achar o km na data de uma preventiva.';

create index if not exists hodometro_leitura_placa_idx
  on public.hodometro_leitura (placa, data desc);

alter table public.hodometro_leitura enable row level security;

drop policy if exists hodometro_leitura_sel on public.hodometro_leitura;
create policy hodometro_leitura_sel on public.hodometro_leitura
  for select to authenticated using (true);
-- escrita só pelo robô (service_role ignora RLS)

-- último hodômetro de cada placa
create or replace view public.hodometro_atual as
select distinct on (placa)
       placa, km, data, unidade, fonte
  from public.hodometro_leitura
 order by placa, data desc;

-- ---------- lançamentos da unidade ----------------------------------------
create table if not exists public.preventiva_lanc (
  id         uuid primary key default gen_random_uuid(),
  unidade    text not null,
  placa      text not null,
  escopo     text not null check (escopo in ('montadora','frio')),
  tipo       text,                      -- L · MP1 · MP2 (montadora) · Básica · Completa (frio)
  data       date not null,             -- data da preventiva realizada
  km         integer,                   -- km na realização (montadora); nulo = derivar do hodômetro
  obs        text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

comment on table public.preventiva_lanc is
  'Preventivas realizadas, lançadas pela unidade no painel. Uma linha por realização.';

create index if not exists preventiva_lanc_busca_idx
  on public.preventiva_lanc (unidade, escopo, placa, data desc);

alter table public.preventiva_lanc enable row level security;

-- Leitura para logados; escrita pela unidade dona ou admin.
-- fca_has_unit() e NUNCA "= fca_my_unit()": o perfil pode ter várias unidades
-- separadas por vírgula, e a comparação direta compara com a string inteira.
drop policy if exists preventiva_lanc_sel on public.preventiva_lanc;
create policy preventiva_lanc_sel on public.preventiva_lanc
  for select to authenticated using (true);

drop policy if exists preventiva_lanc_ins on public.preventiva_lanc;
create policy preventiva_lanc_ins on public.preventiva_lanc
  for insert to authenticated
  with check (public.fca_is_admin() or public.fca_has_unit(unidade));

drop policy if exists preventiva_lanc_upd on public.preventiva_lanc;
create policy preventiva_lanc_upd on public.preventiva_lanc
  for update to authenticated
  using      (public.fca_is_admin() or public.fca_has_unit(unidade))
  with check (public.fca_is_admin() or public.fca_has_unit(unidade));

drop policy if exists preventiva_lanc_del on public.preventiva_lanc;
create policy preventiva_lanc_del on public.preventiva_lanc
  for delete to authenticated
  using (public.fca_is_admin() or public.fca_has_unit(unidade));

-- ---------- Conferência ----------------------------------------------------
-- select unidade, count(*) leituras, count(distinct placa) placas,
--        max(data) ultima from public.hodometro_leitura group by 1 order by 1;
-- select escopo, count(*) from public.preventiva_lanc group by 1;
