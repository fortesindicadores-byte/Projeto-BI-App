-- ============================================================
-- App do motorista (Condução Econômica) — backend no Supabase
-- Renan, 05/09/2026: "vamos começar agora o desenvolvimento do aplicativo".
--
-- O app é HTML público com a chave anon. Por isso NENHUMA tabela nova abre
-- para o anon: tudo passa por funções SECURITY DEFINER que recebem o token
-- da sessão e devolvem só o que é daquele motorista (e o ranking da
-- unidade dele, com nomes abreviados).
--
-- Peças:
--   ce_motoristas.cpf   coluna nova (privada) para o login por CPF
--   ce_app_regras       UMA linha de parâmetros: saldo inicial, mínimo de km /
--                       viagens, top N, prêmios do pódio, piso de score
--   ce_app_acesso       PIN de 4 dígitos (hash bcrypt), tentativas, bloqueio
--   ce_app_sessao       token por login (expira em 90 dias)
--   ce_app_criar_pin()  primeiro acesso: CPF que existe em ce_motoristas + PIN
--   ce_app_login()      CPF + PIN → token
--   ce_app_dados()      token → tudo que o app mostra (regras, mês vigente,
--                       perdas por pilar, elegibilidade, ranking, histórico)
--   ce_app_sair()       apaga o token
--
-- Rodar inteiro no SQL Editor do Supabase. Reexecutável.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1) CPF no de-para de motoristas (privado) ---------------------
alter table public.ce_motoristas add column if not exists cpf text;
create unique index if not exists ce_motoristas_cpf_uidx
  on public.ce_motoristas (cpf) where cpf is not null;
comment on column public.ce_motoristas.cpf is 'Só dígitos. Usado no login do app. Dado pessoal: nunca sai do banco.';

-- ---------- 2) regras do programa (uma linha) ------------------------------
create table if not exists public.ce_app_regras (
  id             int primary key default 1 check (id = 1),
  saldo_inicial  numeric not null default 200,     -- R$ que o motorista começa o mês
  km_min         numeric not null default 1000,    -- km mínimo no mês para receber (0 = não exige)
  viagens_min    int     not null default 0,       -- viagens mínimas no mês (0 = não exige)
  dias_min       int     not null default 0,       -- dias medidos mínimos (0 = não exige)
  score_min      numeric not null default 0,       -- piso de nota para receber (0 = não exige)
  top_n          int     not null default 15,      -- só os N primeiros da unidade recebem (0 = todos)
  podio          numeric[] not null default '{300,150,100}',  -- prêmio extra de 1º, 2º, 3º
  peso_rpm       numeric not null default 25,
  peso_idle      numeric not null default 20,
  peso_acel      numeric not null default 15,
  atualizado_em  timestamptz not null default now()
);
insert into public.ce_app_regras (id) values (1) on conflict (id) do nothing;
comment on table public.ce_app_regras is
  'Parâmetros do programa lidos pelo app. Ajustar aqui, sem mexer em código.';

-- ---------- 3) acesso e sessão ---------------------------------------------
create table if not exists public.ce_app_acesso (
  chave          text primary key references public.ce_motoristas (chave) on delete cascade,
  pin_hash       text not null,
  tentativas     int  not null default 0,
  bloqueado_ate  timestamptz,
  criado_em      timestamptz not null default now(),
  ultimo_acesso  timestamptz
);
create table if not exists public.ce_app_sessao (
  token       uuid primary key default gen_random_uuid(),
  chave       text not null references public.ce_motoristas (chave) on delete cascade,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null default now() + interval '90 days'
);
create index if not exists ce_app_sessao_chave_idx on public.ce_app_sessao (chave);

-- fechadas: sem policy, só as funções (definer) chegam nelas
alter table public.ce_app_regras  enable row level security;
alter table public.ce_app_acesso  enable row level security;
alter table public.ce_app_sessao  enable row level security;
drop policy if exists ce_app_regras_sel on public.ce_app_regras;
create policy ce_app_regras_sel on public.ce_app_regras for select to authenticated using (true);

-- ---------- 4) helpers -------------------------------------------------------
create or replace function public.ce_app_so_digitos(p text) returns text
language sql immutable as $$ select regexp_replace(coalesce(p,''), '\D', '', 'g') $$;

-- nome abreviado para o ranking: "Marcio Andre Silva" → "Marcio A."
create or replace function public.ce_app_abrevia(p_nome text) returns text
language sql immutable as $$
  select case when array_length(string_to_array(trim(p_nome), ' '), 1) > 1
    then split_part(trim(p_nome), ' ', 1) || ' ' || left(split_part(trim(p_nome), ' ', 2), 1) || '.'
    else trim(p_nome) end $$;

-- ---------- 5) primeiro acesso: cria o PIN ----------------------------------
-- Só cria se o CPF já está em ce_motoristas (quem entra no programa é quem a
-- Conlog cadastrou) e ainda NÃO tem PIN. Depois disso o PIN só muda por aqui,
-- apagando a linha de ce_app_acesso do motorista.
create or replace function public.ce_app_criar_pin(p_cpf text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cpf text := ce_app_so_digitos(p_cpf); v_pin text := ce_app_so_digitos(p_pin); v_chave text;
begin
  if length(v_cpf) <> 11 then return jsonb_build_object('ok', false, 'erro', 'CPF precisa ter 11 números.'); end if;
  if length(v_pin) <> 4  then return jsonb_build_object('ok', false, 'erro', 'A senha são 4 números.'); end if;
  select chave into v_chave from ce_motoristas where cpf = v_cpf and ativo;
  if v_chave is null then return jsonb_build_object('ok', false, 'erro', 'CPF não está no programa. Fale com o seu gestor.'); end if;
  if exists (select 1 from ce_app_acesso where chave = v_chave) then
    return jsonb_build_object('ok', false, 'erro', 'Este CPF já tem senha. Se esqueceu, fale com o seu gestor.');
  end if;
  insert into ce_app_acesso (chave, pin_hash) values (v_chave, crypt(v_pin, gen_salt('bf')));
  return ce_app_login(v_cpf, v_pin);
end $$;

-- ---------- 6) login: CPF + PIN → token ------------------------------------
-- 5 erros seguidos bloqueiam por 15 min (4 dígitos = 10 mil combinações).
create or replace function public.ce_app_login(p_cpf text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cpf text := ce_app_so_digitos(p_cpf); v_pin text := ce_app_so_digitos(p_pin);
        m record; a record; v_token uuid;
begin
  select * into m from ce_motoristas where cpf = v_cpf and ativo;
  if m is null then return jsonb_build_object('ok', false, 'erro', 'CPF não está no programa.'); end if;
  select * into a from ce_app_acesso where chave = m.chave;
  if a is null then return jsonb_build_object('ok', false, 'erro', 'Primeira vez? Crie sua senha.', 'primeira_vez', true); end if;
  if a.bloqueado_ate is not null and a.bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'erro', 'Muitas tentativas. Espere ' ||
      ceil(extract(epoch from (a.bloqueado_ate - now())) / 60) || ' min.');
  end if;
  if a.pin_hash <> crypt(v_pin, a.pin_hash) then
    update ce_app_acesso set tentativas = tentativas + 1,
      bloqueado_ate = case when tentativas + 1 >= 5 then now() + interval '15 minutes' else null end,
      tentativas = case when tentativas + 1 >= 5 then 0 else tentativas + 1 end
      where chave = m.chave;
    return jsonb_build_object('ok', false, 'erro', 'Senha errada.');
  end if;
  update ce_app_acesso set tentativas = 0, bloqueado_ate = null, ultimo_acesso = now() where chave = m.chave;
  delete from ce_app_sessao where chave = m.chave and expira_em < now();
  insert into ce_app_sessao (chave) values (m.chave) returning token into v_token;
  return jsonb_build_object('ok', true, 'token', v_token, 'nome', m.nome, 'unidade', m.unidade);
end $$;

create or replace function public.ce_app_sair(p_token uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.ce_app_sessao where token = p_token $$;

-- ---------- 7) tudo que o app mostra ---------------------------------------
-- Conta igual ao modo `carteira` do robô (scripts/conducao-robot.mjs):
--   nota = média ponderada de rpm/idle/acel (peso dos ausentes redistribuído)
--   saldo = saldo_inicial × nota/100
--   perda do pilar = saldo_inicial × peso_i/Σpesos × (1 − nota_i/100)
-- Elegível = bate km_min, viagens_min, dias_min, score_min e está no top_n
-- da unidade (ranking pela pontuação gravada em ce_scores_mensais).
create or replace function public.ce_app_dados(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s record; m record; R record; v_vig date := date_trunc('month', now())::date;
        v_meses jsonb; v_rank jsonb; v_pos int; v_atual jsonb;
begin
  select * into s from ce_app_sessao where token = p_token and expira_em > now();
  if s is null then return jsonb_build_object('ok', false, 'erro', 'Sessão expirada. Entre de novo.'); end if;
  select * into m from ce_motoristas where chave = s.chave;
  select * into R from ce_app_regras where id = 1;

  -- posição e ranking da unidade no mês vigente (nomes abreviados)
  with u as (
    select x.chave, x.motorista, x.pontuacao,
           row_number() over (order by x.pontuacao desc nulls last, x.km desc nulls last) as pos
    from ce_scores_mensais x
    where x.competencia = v_vig and x.unidade is not distinct from m.unidade
      and x.pontuacao is not null and x.chave not like 'semlogin:%'
  )
  select coalesce(jsonb_agg(jsonb_build_object('pos', pos, 'nome', ce_app_abrevia(motorista),
                   'pontuacao', round(pontuacao::numeric, 1), 'eu', chave = s.chave) order by pos), '[]'::jsonb),
         max(pos) filter (where chave = s.chave)
    into v_rank, v_pos from u;

  -- histórico: um item por mês com nota, elegibilidade e o que virou dinheiro
  with h as (
    select x.*,
           row_number() over (partition by x.competencia
                              order by x.pontuacao desc nulls last, x.km desc nulls last) as pos
    from ce_scores_mensais x
    where x.competencia <= v_vig and x.unidade is not distinct from m.unidade
      and x.pontuacao is not null and x.chave not like 'semlogin:%'
  ), meu as (
    select h.*,
      (coalesce(h.km,0)      >= R.km_min)      and (coalesce(h.viagens,0) >= R.viagens_min)
      and (coalesce(h.dias,0) >= R.dias_min)   and (coalesce(h.pontuacao,0) >= R.score_min)
      and (R.top_n = 0 or h.pos <= R.top_n) as elegivel
    from h where h.chave = s.chave
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'competencia', to_char(competencia, 'YYYY-MM'),
      'nota', round(pontuacao::numeric, 1), 'km', round(coalesce(km,0)::numeric), 'dias', dias, 'viagens', viagens,
      'posicao', pos, 'elegivel', elegivel,
      'carteira', case when elegivel then round(R.saldo_inicial * pontuacao / 100, 2) else 0 end,
      'podio',    case when elegivel and pos <= coalesce(array_length(R.podio,1),0) then R.podio[pos] else 0 end,
      'rpm', round(rpm_pontos::numeric,1), 'idle', round(idle_pontos::numeric,1), 'acel', round(acel_pontos::numeric,1),
      'vel', round(vel_pontos::numeric,1),
      'motivo', case when elegivel then null
                     when coalesce(km,0) < R.km_min then 'não bateu os ' || R.km_min || ' km'
                     when coalesce(viagens,0) < R.viagens_min then 'não bateu as ' || R.viagens_min || ' viagens'
                     when coalesce(dias,0) < R.dias_min then 'menos de ' || R.dias_min || ' dias medidos'
                     when coalesce(pontuacao,0) < R.score_min then 'nota abaixo de ' || R.score_min
                     else 'fora dos ' || R.top_n || ' primeiros' end
    ) order by competencia desc), '[]'::jsonb)
    into v_meses from meu;

  select v ->> 0 into v_atual from jsonb_array_elements(v_meses) v where v ->> 'competencia' = to_char(v_vig, 'YYYY-MM') limit 1;

  return jsonb_build_object(
    'ok', true,
    'nome', m.nome, 'unidade', m.unidade,
    'vigente', to_char(v_vig, 'YYYY-MM'),
    'regras', jsonb_build_object('saldo_inicial', R.saldo_inicial, 'km_min', R.km_min, 'viagens_min', R.viagens_min,
       'dias_min', R.dias_min, 'score_min', R.score_min, 'top_n', R.top_n, 'podio', to_jsonb(R.podio),
       'pesos', jsonb_build_object('rpm', R.peso_rpm, 'idle', R.peso_idle, 'acel', R.peso_acel)),
    'posicao', v_pos,
    'ranking', v_rank,
    'meses', v_meses
  );
end $$;

-- ---------- 8) quem pode chamar --------------------------------------------
revoke all on function public.ce_app_criar_pin(text, text) from public;
revoke all on function public.ce_app_login(text, text)     from public;
revoke all on function public.ce_app_dados(uuid)           from public;
revoke all on function public.ce_app_sair(uuid)            from public;
grant execute on function public.ce_app_criar_pin(text, text) to anon, authenticated;
grant execute on function public.ce_app_login(text, text)     to anon, authenticated;
grant execute on function public.ce_app_dados(uuid)           to anon, authenticated;
grant execute on function public.ce_app_sair(uuid)            to anon, authenticated;

-- ---------- 9) para testar sem esperar o cadastro dos CPFs -----------------
-- Escolha um motorista real de ce_scores_mensais e dê a ele um CPF de teste:
--   update public.ce_motoristas set cpf = '00000000191' where chave = '<chave dele>';
-- No app: CPF 000.000.001-91 → "Criar senha" → 4 números → entra.
-- Para trocar o PIN de alguém: delete from public.ce_app_acesso where chave = '<chave>';
--
-- Conferência:
--   select * from public.ce_app_regras;
--   select chave, ultimo_acesso, tentativas from public.ce_app_acesso;
--   select chave, criado_em, expira_em from public.ce_app_sessao order by criado_em desc;
