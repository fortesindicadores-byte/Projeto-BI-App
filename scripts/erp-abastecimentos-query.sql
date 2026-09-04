-- ============================================================
-- Query dos ABASTECIMENTOS no ERP — a TI passou esta consulta ao Renan
-- para ele ler o banco. (03/09/2026; corte de data revisto em 04/09/2026)
--
-- É daqui que sai o km real da frota: cada abastecimento registra o hodômetro
-- do veículo no momento (os.DESGASTEREAL). O hodômetro mais alto de uma placa
-- é o km atual dela, e é dele que a Carta de Custos tira o deslocamento do mês
-- em andamento (hodômetro atual − último "Km Informado" da planilha).
--
-- POR QUE NÃO É SÓ "DE SETEMBRO EM DIANTE" (Renan, 04/09/2026): a placa que
-- NÃO abasteceu no mês sumiria do resultado, e é justamente ela que precisa do
-- último hodômetro conhecido — senão o deslocamento dela zera e o custo do
-- contrato some da conta. Então a consulta traz o mês em andamento MAIS a
-- última leitura anterior de cada placa (uma linha extra por veículo, o que
-- não pesa no Sheets). A consulta inteira, sem corte, passa de um milhão de
-- linhas e não cabe na planilha.
--
-- ONDE VAI O RESULTADO: aba "Query Banco" da planilha Contratos Man.
-- (1FOIUgEKtOdTrNUyOYd8wk5Cyur6cFIf7-COr_l4hEsI), a partir de A1 COM a linha
-- de cabeçalho — o robô acha as colunas pelo NOME, nunca pela posição.
-- Obrigatórias: PLACA · HODOMETRO · DATA. O resto é opcional.
-- ============================================================

WITH base AS (
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
),
anterior AS (
  SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b.PLACA ORDER BY b.DATA DESC) AS RN
  FROM base b
  WHERE b.DATA < '2026-09-01'
)
SELECT ORDEM_SERVICO, CODIGO_FILIAL, FILIAL, PLACA, MODELO, UNIDADE,
       PROJETO_OS, PROJETO_VEICULO, HODOMETRO, KM_RODADO, LITROS,
       MEDIA_KM_L, VALOR, DATA
  FROM base
 WHERE DATA >= '2026-09-01'
UNION ALL
SELECT ORDEM_SERVICO, CODIGO_FILIAL, FILIAL, PLACA, MODELO, UNIDADE,
       PROJETO_OS, PROJETO_VEICULO, HODOMETRO, KM_RODADO, LITROS,
       MEDIA_KM_L, VALOR, DATA
  FROM anterior
 WHERE RN = 1
ORDER BY PLACA, DATA;


-- Se o banco recusar a data como texto, troque as duas comparações por:
--   b.DATA <  TO_DATE('01/09/2026','DD/MM/YYYY')
--   DATA   >= TO_DATE('01/09/2026','DD/MM/YYYY')
