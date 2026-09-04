-- ============================================================
-- Query dos ABASTECIMENTOS no ERP (Renan, 03/09/2026)
--
-- É daqui que sai o km real da frota: cada abastecimento registra o hodômetro
-- do veículo no momento (os.DESGASTEREAL). O hodômetro mais alto de uma placa
-- é o km atual dela, e é dele que a Carta de Custos tira o deslocamento do mês
-- em andamento (hodômetro atual − último "Km Informado" da planilha).
--
-- ONDE VAI O RESULTADO: aba "Query Banco" da planilha Contratos Man.
-- (1FOIUgEKtOdTrNUyOYd8wk5Cyur6cFIf7-COr_l4hEsI), colado a partir de A1 COM a
-- linha de cabeçalho — o robô acha as colunas pelo NOME, nunca pela posição.
-- Obrigatórias: PLACA · HODOMETRO · DATA. O resto é opcional.
--
-- O FILTRO DE DATA é o único acréscimo à query original: só setembro/2026 em
-- diante, porque a consulta inteira passa de um milhão de linhas e o Sheets
-- não aguenta. Se o banco recusar a data como texto, use a variante do fim.
--
-- ESTE ARQUIVO EXISTE PORQUE A QUERY SE PERDEU UMA VEZ (04/09/2026): ela tinha
-- sido passada só no chat, e quando precisei dela de novo não estava em lugar
-- nenhum do repositório. Fonte de verdade fica versionada.
-- ============================================================

SELECT
    mf.HANDLE            AS ORDEM_SERVICO,
    fi.HANDLE            AS CODIGO_FILIAL,
    fi.NOME              AS FILIAL,
    rc.CODIGO            AS PLACA,
    vm.NOME              AS MODELO,
    rc.UNIDADEPRODUCAO   AS UNIDADE,
    pj.NOME              AS PROJETO_OS,
    pv.NOME              AS PROJETO_VEICULO,
    os.DESGASTEREAL      AS HODOMETRO,
    mf.DESGASTE          AS KM_RODADO,
    mf.QUANTIDADE        AS LITROS,
    mf.MEDIA             AS MEDIA_KM_L,
    mf.VALORTOTAL        AS VALOR,
    mf.DATA              AS DATA
FROM MF_ORDEMSERVICOCOMBUSTIVEIS mf
INNER JOIN MF_ORDEMSERVICOS   os ON os.HANDLE = mf.ORDEMSERVICO
LEFT  JOIN FILIAIS            fi ON fi.HANDLE = os.FILIAL
LEFT  JOIN MA_RECURSOS        rc ON rc.HANDLE = os.VEICULO
LEFT  JOIN MF_VEICULOMODELOS  vm ON vm.HANDLE = rc.MODELOVEICULO
LEFT  JOIN GN_PROJETOS        pj ON pj.HANDLE = os.PROJETO
LEFT  JOIN GN_PROJETOS        pv ON pv.HANDLE = rc.PROJETO
WHERE os.EMPRESA = 12
  AND mf.DATA >= '2026-09-01'
ORDER BY rc.CODIGO, os.DATAINICIAL;

-- Se o banco recusar a data como texto:
--   AND mf.DATA >= TO_DATE('01/09/2026','DD/MM/YYYY')
