-- ============================================================
-- Preventivas Seara — anexo do comprovante (ENGATILHADO, NÃO RODAR AINDA)
--
-- Aguardando o Renan validar COMO o PDF chega na unidade (digital ou
-- escaneado) antes de ligar o upload no modal. Quando ele pedir:
--   1. rodar este script no SQL Editor;
--   2. ligar o campo de anexo no painel (upload → Storage → coluna anexo);
--   3. se o PDF for digital, ligar também o pré-preenchimento da data
--      via pdf.js (nunca gravar sozinho — a unidade confirma).
-- ============================================================

-- coluna do caminho do arquivo no Storage (um anexo por lançamento)
alter table public.preventiva_lanc
  add column if not exists anexo text;

comment on column public.preventiva_lanc.anexo is
  'Caminho no bucket preventiva-anexos (comprovante da realização). Nulo = sem anexo.';

-- bucket PRIVADO: só logados com a unidade (ou admin) leem/escrevem.
insert into storage.buckets (id, name, public)
  values ('preventiva-anexos','preventiva-anexos', false)
  on conflict (id) do nothing;

-- caminho do objeto: <unidade>/<placa>/<arquivo> — a 1ª pasta é a unidade,
-- e é ela que a policy confere com fca_has_unit().
drop policy if exists prev_anexo_sel on storage.objects;
create policy prev_anexo_sel on storage.objects
  for select to authenticated
  using (bucket_id='preventiva-anexos'
         and (public.fca_is_admin() or public.fca_has_unit((storage.foldername(name))[1])));

drop policy if exists prev_anexo_ins on storage.objects;
create policy prev_anexo_ins on storage.objects
  for insert to authenticated
  with check (bucket_id='preventiva-anexos'
              and (public.fca_is_admin() or public.fca_has_unit((storage.foldername(name))[1])));

drop policy if exists prev_anexo_del on storage.objects;
create policy prev_anexo_del on storage.objects
  for delete to authenticated
  using (bucket_id='preventiva-anexos'
         and (public.fca_is_admin() or public.fca_has_unit((storage.foldername(name))[1])));
