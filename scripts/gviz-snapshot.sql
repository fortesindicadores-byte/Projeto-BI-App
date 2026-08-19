-- ============================================================
-- Snapshot do gviz (Google Sheets) no Supabase — abre painel rápido
-- (Renan, 19/08/2026: "pode fazer todos")
--
-- O robô (gviz-robot.yml, de hora em hora) baixa as abas que os painéis
-- usam e grava o TEXTO CRU da resposta gviz aqui. O assets/gviz-cache.js
-- intercepta os pedidos ao docs.google.com na abertura da página e
-- responde com este snapshot (~200ms) em vez do gviz (1–4s por aba).
-- Pedido fora do snapshot, snapshot velho ou Supabase fora do ar:
-- o painel segue para o Google como sempre — nada quebra.
--
-- key = "<sheet_id>|s=<aba>|g=<gid>|q=<tq>|h=<headers>"
-- ============================================================

create table if not exists public.gviz_snapshot (
  key         text primary key,
  body        text not null,          -- resposta gviz crua (setResponse(...))
  bytes       integer,
  updated_at  timestamptz not null default now()
);

alter table public.gviz_snapshot enable row level security;

-- leitura: aberta (anon + logados) — é o MESMO dado que o gviz já serve
-- publicamente; o painel busca antes de ter sessão pronta.
drop policy if exists gviz_snapshot_select on public.gviz_snapshot;
create policy gviz_snapshot_select on public.gviz_snapshot
  for select to anon, authenticated using (true);

-- escrita: só o robô (service_role ignora RLS; sem policy de escrita,
-- anon/authenticated não gravam).

grant select on public.gviz_snapshot to anon, authenticated;
