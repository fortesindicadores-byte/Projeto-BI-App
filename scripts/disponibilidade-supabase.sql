-- ============================================================================
--  Disponibilidade · Schema + RLS + snapshot diário (Supabase)
--  Projeto: mesmo do hub/auth  →  lozwipoeacpvplgkrxkq.supabase.co
--  Rodar no  Supabase Dashboard → SQL Editor  (uma vez).
--
--  Substitui o Apps Script do "Consolidado Geral" (unificarIndisponibilidades +
--  atualizarDisponibilidade). Modelo:
--
--   - indisponibilidade : EVENTOS vivos — 1 linha por parada de veículo.
--         A unidade abre o registro quando o veículo para e fecha (data_retorno)
--         quando volta. Veículo sem evento aberto = disponível.
--         SEM fluxo de validação de admin (decisão do Renan, 14/08/2026).
--   - disp_checkins     : "Confirmar frota do dia" — auditoria de quem atualizou.
--   - indisp_snapshot   : foto diária dos indisponíveis (histórico da aba
--         Indisponibilidade migra pra cá com fonte='sheet'; o pg_cron fotografa
--         os eventos abertos todo dia com fonte='app').
--   - disp_snapshot     : agregado diário Unidade×Projeto×Tipo (histórico da aba
--         Disponibilidade migra pra cá; pg_cron gera o dia a partir do
--         ginfo_snapshot['ativos'] × eventos abertos).
--   - unidade_depara    : nome da filial (Ginfo/planilhas) → código do portal.
--
--  Ativos: já chegam diariamente via robô Ginfo (ginfo_snapshot, chave 'ativos').
--  Perfis/acesso: reusa fca_profiles + fca_is_admin() + fca_has_unit().
-- ============================================================================

-- ---------- DE-PARA DE UNIDADES ---------------------------------------------
create table if not exists public.unidade_depara (
  nome text primary key,     -- como vem do Ginfo / planilhas (sem acento, caixa alta)
  cod  text not null         -- código do portal (fca_profiles.unidade)
);

insert into public.unidade_depara (nome, cod) values
  ('CDD CAMBORIU','BLC'), ('BALNEARIO CAMBORIU','BLC'), ('CAMBORIU','BLC'),
  ('CDD CUIABA','CBA T2'), ('CUIABA','CBA T1 WH'), ('CUIABA EMPURRADA','CBA T1'),
  ('CDD RIO DE JANEIRO','CGR'), ('CAMPO GRANDE','CGR'), ('RIO DE JANEIRO','CGR'),
  ('CDD FLORIANOPOLIS','FLP'), ('FLORIANOPOLIS','FLP'),
  ('CDD GUARULHOS','GRL'), ('GUARULHOS','GRL'),
  ('ANHANGUERA','ANG'),
  ('CDI MACACU','MCC T2'), ('MACACU EMPURRADA','MCC T1'),
  ('CACHOEIRAS DE MACACU','MCC T2'), ('MACACU','MCC T2'),
  ('CDD NOVA FRIBURGO','NFR'), ('NOVA FRIBURGO','NFR'),
  ('PIRAI EMPURRADA','PIR'), ('PIRAI','PIR'),
  ('CDD PELOTAS','PLT'), ('PELOTAS','PLT'),
  ('CDD RONDONOPOLIS','RON'), ('RONDONOPOLIS','RON')
on conflict (nome) do update set cod = excluded.cod;

-- nome+projeto → código, refinando o tier de CBA/MCC pelo projeto
-- (mesma regra do refineCod do farol/gerot-base)
create or replace function public.disp_unit_cod(nome text, projeto text)
returns text language plpgsql stable as $$
declare
  n   text := upper(trim(coalesce(nome,'')));
  p   text := upper(coalesce(projeto,''));
  cod text;
begin
  if n = '' then return null; end if;
  select d.cod into cod from public.unidade_depara d where d.nome = n;
  if cod is null then return n; end if;   -- desconhecido: mantém o nome (aparece p/ ajuste)
  if cod like 'CBA%' then
    if p like '%EMPURRAD%' then return 'CBA T1';
    elsif p ~ '(APOIO|EMPILHADEIRA|ARMAZEM|\yWH\y)' then return 'CBA T1 WH';
    elsif p ~ '(ROTA|CDD|AUTO SERVICO|VAN)' then return 'CBA T2';
    end if;
  elsif cod like 'MCC%' then
    if p like '%EMPURRAD%' then return 'MCC T1';
    elsif p ~ '(ROTA|CDI|CDD|AUTO SERVICO|VAN)' then return 'MCC T2';
    end if;
  end if;
  return cod;
end $$;

-- ---------- INDISPONIBILIDADE (eventos vivos) --------------------------------
create table if not exists public.indisponibilidade (
  id                 uuid primary key default gen_random_uuid(),
  unidade            text not null,           -- código (CGR, CBA T2, ANG…)
  unidade_nome       text,                    -- nome da filial (exibição/histórico)
  projeto            text,
  placa              text not null,
  modelo             text,
  tipo_veiculo       text,
  grupo              text,                    -- CORRETIVA / PREVENTIVA / SINISTRO…
  descricao_problema text,
  local_manutencao   text,                    -- INTERNO / EXTERNO
  rc_oc              text,
  data_parada        date not null,
  previsao_retorno   date,
  data_retorno       date,                    -- null = ainda indisponível
  status             text,                    -- livre (Em orçamento / Em execução / Aguardando peça…)
  observacao         text,
  created_by         uuid references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) default auth.uid(),
  updated_at         timestamptz not null default now()
);
create index if not exists indisp_abertas_idx on public.indisponibilidade (unidade) where data_retorno is null;
create index if not exists indisp_placa_idx   on public.indisponibilidade (placa);

create or replace function public.indisp_touch() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
drop trigger if exists indisp_touch on public.indisponibilidade;
create trigger indisp_touch before update on public.indisponibilidade
  for each row execute function public.indisp_touch();

-- ---------- CHECK-INS ("Confirmar frota do dia") -----------------------------
create table if not exists public.disp_checkins (
  id              uuid primary key default gen_random_uuid(),
  unidade         text not null,              -- código
  data            date not null,              -- dia confirmado (BRT)
  user_id         uuid references auth.users(id) default auth.uid(),
  nome            text,                       -- nome de exibição de quem confirmou
  n_indisponiveis int,
  created_at      timestamptz not null default now()
);
create index if not exists disp_checkins_dia_idx on public.disp_checkins (data, unidade);

-- ---------- FOTOS DIÁRIAS (histórico + série dos painéis) --------------------
create table if not exists public.indisp_snapshot (
  id                 bigint generated always as identity primary key,
  data               date not null,
  unidade            text,                    -- código
  unidade_nome       text,                    -- nome como veio da origem
  projeto            text,
  placa              text,
  modelo             text,
  grupo              text,
  descricao_problema text,
  local_manutencao   text,
  rc_oc              text,
  dias_parado        int,
  status             text,
  previsao_retorno   date,
  observacao         text,
  fonte              text not null default 'app'   -- 'sheet' = migrado da planilha
);
create index if not exists indisp_snap_data_idx on public.indisp_snapshot (data);
create index if not exists indisp_snap_uni_idx  on public.indisp_snapshot (unidade, data);

create table if not exists public.disp_snapshot (
  id            bigint generated always as identity primary key,
  data          date not null,
  unidade       text,                         -- código
  unidade_nome  text,                         -- nome como veio da origem
  projeto       text,
  tipo_veiculo  text,
  ativos        int not null default 0,
  indisponiveis int not null default 0,
  fonte         text not null default 'app'   -- 'sheet' = migrado da planilha
);
create index if not exists disp_snap_data_idx on public.disp_snapshot (data);
create index if not exists disp_snap_uni_idx  on public.disp_snapshot (unidade, data);

-- ---------- SNAPSHOT DIÁRIO (substitui o Apps Script) ------------------------
-- Fotografa os eventos abertos e agrega Ativos × Indisponíveis do dia.
-- Idempotente: pode rodar mais de uma vez no dia (refaz só o dia, fonte='app').
-- APPEND-ONLY no histórico: dias anteriores nunca são tocados.
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

  -- 2) agregado Unidade×Projeto×Tipo: ativos (robô Ginfo) × indisponíveis abertos
  --    (indisponível casa com o ativo pela PLACA, como no Apps Script antigo)
  delete from disp_snapshot where data = hoje and fonte = 'app';
  insert into disp_snapshot (data, unidade, unidade_nome, projeto, tipo_veiculo,
                             ativos, indisponiveis, fonte)
  select hoje,
         public.disp_unit_cod(a.filial, a.projeto),
         a.filial, a.projeto, a.tipo,
         count(distinct a.placa),
         count(distinct i.placa),
         'app'
    from (
      select upper(trim(e->>'Filial'))                     as filial,
             upper(trim(coalesce(e->>'Projeto','')))       as projeto,
             upper(trim(coalesce(e->>'Tipo Veículo','')))  as tipo,
             upper(replace(coalesce(e->>'Placa',''),' ','')) as placa
        from ginfo_snapshot g, jsonb_array_elements(g.data) e
       where g.chave = 'ativos'
         and upper(coalesce(e->>'Projeto','')) not like '%FRETEIRO%'  -- FRETEIRO fora (Renan, 14/08/2026)
         -- e upper(coalesce(e->>'Estado','')) like 'ATIV%'  -- ligar se quiser só ativos
    ) a
    left join (
      select distinct upper(replace(placa,' ','')) as placa
        from indisponibilidade
       where data_retorno is null
    ) i on i.placa = a.placa
   where a.placa <> ''
   group by 2, 3, 4, 5;
end $$;

-- só o cron/admin roda — não expor via PostgREST
revoke execute on function public.disp_snapshot_diario() from public, anon, authenticated;

-- ---------- RLS --------------------------------------------------------------
alter table public.unidade_depara    enable row level security;
alter table public.indisponibilidade enable row level security;
alter table public.disp_checkins     enable row level security;
alter table public.indisp_snapshot   enable row level security;
alter table public.disp_snapshot     enable row level security;

-- de-para: leitura p/ logados; escrita admin
drop policy if exists depara_select on public.unidade_depara;
create policy depara_select on public.unidade_depara for select using (auth.uid() is not null);
drop policy if exists depara_admin on public.unidade_depara;
create policy depara_admin on public.unidade_depara for all
  using (public.fca_is_admin()) with check (public.fca_is_admin());

-- indisponibilidade: leitura p/ logados (painéis são visão geral);
-- escrita: admin qualquer; usuário só na(s) sua(s) unidade(s). SEM validação.
drop policy if exists indisp_select on public.indisponibilidade;
create policy indisp_select on public.indisponibilidade for select using (auth.uid() is not null);
drop policy if exists indisp_insert on public.indisponibilidade;
create policy indisp_insert on public.indisponibilidade for insert
  with check (public.fca_is_admin() or public.fca_has_unit(unidade));
drop policy if exists indisp_update on public.indisponibilidade;
create policy indisp_update on public.indisponibilidade for update
  using (public.fca_is_admin() or public.fca_has_unit(unidade))
  with check (public.fca_is_admin() or public.fca_has_unit(unidade));
drop policy if exists indisp_delete on public.indisponibilidade;
create policy indisp_delete on public.indisponibilidade for delete
  using (public.fca_is_admin() or public.fca_has_unit(unidade));

-- check-ins: leitura p/ logados; INSERT na própria unidade; sem update/delete
-- (trilha de auditoria — nem admin apaga pelo app)
drop policy if exists checkin_select on public.disp_checkins;
create policy checkin_select on public.disp_checkins for select using (auth.uid() is not null);
drop policy if exists checkin_insert on public.disp_checkins;
create policy checkin_insert on public.disp_checkins for insert
  with check ((public.fca_is_admin() or public.fca_has_unit(unidade)) and user_id = auth.uid());

-- fotos: leitura p/ logados; escrita admin (migração) — o cron grava via definer
drop policy if exists indisp_snap_select on public.indisp_snapshot;
create policy indisp_snap_select on public.indisp_snapshot for select using (auth.uid() is not null);
drop policy if exists indisp_snap_admin on public.indisp_snapshot;
create policy indisp_snap_admin on public.indisp_snapshot for all
  using (public.fca_is_admin()) with check (public.fca_is_admin());

drop policy if exists disp_snap_select on public.disp_snapshot;
create policy disp_snap_select on public.disp_snapshot for select using (auth.uid() is not null);
drop policy if exists disp_snap_admin on public.disp_snapshot;
create policy disp_snap_admin on public.disp_snapshot for all
  using (public.fca_is_admin()) with check (public.fca_is_admin());

-- ---------- PG_CRON — foto diária às 09h BRT (12h UTC) -----------------------
-- Se der erro de permissão aqui, habilitar a extensão pg_cron primeiro em
-- Database → Extensions no dashboard e rodar de novo este bloco.
create extension if not exists pg_cron;
do $cron$ begin
  perform cron.unschedule('disp-snapshot-diario');
exception when others then null; end $cron$;
select cron.schedule('disp-snapshot-diario', '0 12 * * *',
                     $$select public.disp_snapshot_diario()$$);

-- ============================================================================
--  PÓS-SETUP:
--   · Rodar a 1ª foto manualmente:  select public.disp_snapshot_diario();
--   · Migrar o histórico da planilha:  /disponibilidade-migracao/  (admin)
--   · Conferir:  select fonte, count(*), min(data), max(data)
--                  from disp_snapshot group by fonte;
-- ============================================================================
