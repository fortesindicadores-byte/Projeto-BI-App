# Migração para Produção — Conlog-SA/frota-gestao-em-movimento

Este repositório (`fortesindicadores-byte/gestao-em-movimento`) passa a ser
**HOMOLOGAÇÃO / DESENVOLVIMENTO**. A cópia em
`Conlog-SA/frota-gestao-em-movimento` será **PRODUÇÃO** (depois recebe o
domínio oficial da empresa).

---

## ⚠️ Os cadastros e acessos NÃO se perdem

Os usuários cadastrados e as liberações de acesso (`fca_profiles`,
`access_log`, `mpr_fields`, snapshots de Pneus etc.) ficam **no Supabase**,
não no GitHub. O repositório só contém HTML/JS estático.

**Decisão adotada:** produção usa o **MESMO projeto Supabase** da homologação
(mesma `SUPABASE_URL` e chave que já estão no código). Consequência:

- Todos os usuários já cadastrados continuam válidos em produção — ninguém
  recadastra.
- Todas as liberações de acesso continuam valendo.
- Copiar o repositório **não apaga absolutamente nada** dos dados.

> Trade-off: como o backend é compartilhado, testes feitos em homologação
> gravam no mesmo Supabase de produção. Se no futuro quiser isolar os dois
> ambientes, será necessário criar um segundo projeto Supabase e migrar os
> dados — mas isso é opcional e fica para depois.

---

## Passo 1 — Copiar o código para o repo de produção

Escolha UMA das opções. Ambas copiam o projeto inteiro. Requer conta com
permissão de **escrita** em `Conlog-SA/frota-gestao-em-movimento`.

### Opção A — Sem linha de comando (GitHub Import)

1. Como o repo de destino está vazio, apague-o primeiro:
   `Conlog-SA/frota-gestao-em-movimento` → Settings → *Delete this repository*.
2. Acesse `https://github.com/new/import`.
3. *Your old repository's clone URL*:
   `https://github.com/fortesindicadores-byte/gestao-em-movimento.git`
   (se o repositório de origem for privado, informe seu usuário + um token
   pessoal com permissão de leitura).
4. *Owner* = `Conlog-SA`, *Repository name* = `frota-gestao-em-movimento`,
   visibilidade a seu critério → **Begin import**.

### Opção B — Linha de comando (git mirror)

```bash
git clone https://github.com/fortesindicadores-byte/gestao-em-movimento.git
cd gestao-em-movimento
git push https://github.com/Conlog-SA/frota-gestao-em-movimento.git main:main
```

---

## Passo 2 — Configurar o ambiente de produção

Nas **Settings** do repo `Conlog-SA/frota-gestao-em-movimento`:

1. **GitHub Pages** → Source = branch `main`, pasta `/ (root)`.
   URL de produção: `https://conlog-sa.github.io/frota-gestao-em-movimento/`
   (o arquivo `.nojekyll` na raiz já vem na cópia — é obrigatório, sem ele o
   Pages quebra o build silenciosamente).
2. **Secrets das Actions** (Settings → Secrets and variables → Actions) —
   recriar, pois secrets NÃO são copiados:
   - `PROLOG_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `RESEND_API_KEY`
   - `FAROL_FROM`

## Passo 3 — Supabase (Auth → URL Configuration)

Como o Supabase é compartilhado, só **adicione** a URL nova (não remova a
antiga):

1. **Redirect URLs**: adicionar
   `https://conlog-sa.github.io/frota-gestao-em-movimento/**`
2. **Site URL**: manter a de homologação por enquanto. Quando o domínio
   oficial da empresa entrar, trocar o *Site URL* para o domínio de produção
   (isso afeta o link dos e-mails de confirmação/redefinição de senha).

## Passo 4 — Ajustes que diferenciam PROD de HOMOLOGAÇÃO

Trocar **apenas no repo de produção** (as demais menções à URL são só docs):

- `scripts/farol-mailer.mjs` (const `HUB`) →
  `https://conlog-sa.github.io/frota-gestao-em-movimento/farol-frota/`
- `apresentacao-projeto.html` (texto "URL pública") → URL de produção.

> Todos os painéis usam caminhos relativos + `sessionStorage`, então funcionam
> nas duas URLs sem alteração. Só esses dois pontos têm URL absoluta funcional.

---

## Fluxo de trabalho após a separação

- **Desenvolver/testar** sempre na homologação (`fortesindicadores-byte`).
- Quando validar, **promover para produção** copiando os arquivos alterados
  para o repo da Conlog (por PR ou push), sem tocar nos 2 ajustes do Passo 4.
