# Projeto BI App

Painéis de BI corporativo em HTML puro, hospedados via GitHub Pages.

**Acesso:** `https://fortesindicadores-byte.github.io/Projeto-BI-App/`

---

## Painéis ativos

| Painel | URL |
|---|---|
| Visão Financeira (DRE) | `/visao-financeira/` |
| Árvore de Combustível | `/combustivel/arvore-combustivel/` |

---

## Padrão técnico

- HTML + CSS + JavaScript puro (sem framework)
- Chart.js 4.4.0 para gráficos
- Dados via Google Sheets (público) ou embutidos no HTML
- Responsivo: desktop e mobile
- Fundo escuro `#0C1017`, laranja `#F97316` como cor primária

---

## Como adicionar um novo painel

1. Criar pasta no local correto (ex: `combustivel/eficiencia-kml/`)
2. Copiar `_template/index.html` e adaptar
3. Commit e push para `main`
4. Aguardar ~2 min para o GitHub Pages publicar

---

## Roadmap

- [ ] Painel Km
- [ ] Eficiência Km/L
- [ ] Preço R$/L
- [ ] Consumo CO²
- [ ] R$ por km
- [ ] Disponibilidade
- [ ] Reunião Mensal
- [ ] Auditorias
- [ ] FCA
- [ ] Painel de Metas
- [ ] Controle de acesso via Supabase
