# Painel Termômetro — especificação (o que foi pedido)

Novo painel no cluster **OPERACIONAL** do hub, chamado **Termômetro**.

## Fonte de dados
- Planilha: https://docs.google.com/spreadsheets/d/10LRn3jrXEemqFiFAMbO8_bOLk98xrWTVXVUNDeQqLac/edit
- **Cada aba é um tier específico.** As abas serão **filtros** — quero **unir** as abas (todas juntas).
- Existe uma aba **Regra** → ela é a **base dos pontos**.
- **Tier = o nome da aba, literalmente** (e vira o filtro Tier).
- Usar a aba **TRANSPORTES T1** como referência. Os indicadores são (provavelmente) os mesmos para todas as abas.

## Filtros
- Unidade
- Tier (as abas)
- Vigência
- GEO

## O que o painel deve ter

1. **Mesmo padrão do Visão Financeira.**

2. **No topo:** a **pontuação geral**.

3. **Abaixo da pontuação geral:** menores (que nem no Visão Financeira), uma **pontuação por tier**.

4. **Abaixo:** um **gráfico do ano com a pontuação**, podendo **mudar por indicador**; e **ao lado**, menor, as **regras resumidas** (tabela resumida que dê para entender os pontos por indicador — tipo a imagem de referência "Distribuição dos Pesos").

5. **Abaixo:** o **ranking das unidades** com:
   1. Unidade
   2. Tier
   3. GEO
   4. Pontuação total
   5. Resultado e pontuação por indicador
