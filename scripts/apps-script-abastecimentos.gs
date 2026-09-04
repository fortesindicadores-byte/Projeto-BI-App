/**
 * ============================================================
 * Query Banco — puxa os abastecimentos do ERP direto para a aba
 * (Renan, 04/09/2026)
 *
 * Substitui a colagem manual: roda a query no ERP por JDBC e escreve o
 * resultado na aba "Query Banco" da planilha Contratos Man. O robô do portal
 * lê essa aba e leva para o Supabase — nada mais muda.
 *
 * A CONDIÇÃO É DE REDE, não de código: o Apps Script roda nos servidores do
 * Google, então o banco do ERP precisa aceitar conexão de fora. Se ele só
 * existe na rede interna, isto falha na conexão — a mesma pedra que parou o
 * robô do Qlik. A própria execução é o teste.
 *
 * COMO USAR: preencher as três variáveis abaixo, salvar e rodar
 * `atualizarQueryBanco`. Funcionando, criar o acionador diário entre 6h e 7h
 * (antes do robô das 08h15).
 *
 * CREDENCIAL NO TOPO, E NÃO NAS PROPRIEDADES DO SCRIPT (Renan, 04/09/2026):
 * a versão anterior lia de PropertiesService, que é mais seguro, mas exigia
 * um passeio pelas Definições do projeto antes de o script rodar. Ele pediu
 * tudo num arquivo só. A planilha é interna e o script é vinculado a ela.
 * ============================================================
 */

var ERP_URL  = 'jdbc:sqlserver://SERVIDOR:1433;databaseName=BANCO';
var ERP_USER = 'usuario';
var ERP_PASS = 'senha';

// Se o ERP for Oracle:
// var ERP_URL = 'jdbc:oracle:thin:@//SERVIDOR:1521/SERVICO';

var ABA = 'Query Banco';
var DESDE = '2026-09-01';        // só deste mês em diante — a consulta inteira
                                 // passa de um milhão de linhas
var LOTE = 2000;                 // linhas por escrita na planilha

function SQL_() {
  // mesma query de scripts/erp-abastecimentos-query.sql
  return [
    "WITH base AS (",
    "  SELECT",
    "      mf.HANDLE            AS ORDEM_SERVICO,",
    "      fi.HANDLE            AS CODIGO_FILIAL,",
    "      fi.NOME              AS FILIAL,",
    "      rc.CODIGO            AS PLACA,",
    "      vm.NOME              AS MODELO,",
    "      rc.UNIDADEPRODUCAO   AS UNIDADE,",
    "      pj.NOME              AS PROJETO_OS,",
    "      pv.NOME              AS PROJETO_VEICULO,",
    "      os.DESGASTEREAL      AS HODOMETRO,",
    "      mf.DESGASTE          AS KM_RODADO,",
    "      mf.QUANTIDADE        AS LITROS,",
    "      mf.MEDIA             AS MEDIA_KM_L,",
    "      mf.VALORTOTAL        AS VALOR,",
    "      mf.DATA              AS DATA",
    "  FROM MF_ORDEMSERVICOCOMBUSTIVEIS mf",
    "  INNER JOIN MF_ORDEMSERVICOS   os ON os.HANDLE = mf.ORDEMSERVICO",
    "  LEFT  JOIN FILIAIS            fi ON fi.HANDLE = os.FILIAL",
    "  LEFT  JOIN MA_RECURSOS        rc ON rc.HANDLE = os.VEICULO",
    "  LEFT  JOIN MF_VEICULOMODELOS  vm ON vm.HANDLE = rc.MODELOVEICULO",
    "  LEFT  JOIN GN_PROJETOS        pj ON pj.HANDLE = os.PROJETO",
    "  LEFT  JOIN GN_PROJETOS        pv ON pv.HANDLE = rc.PROJETO",
    "  WHERE os.EMPRESA = 12",
    "),",
    "anterior AS (",
    "  SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b.PLACA ORDER BY b.DATA DESC) AS RN",
    "  FROM base b",
    "  WHERE b.DATA < '2026-09-01'",
    ")",
    "SELECT ORDEM_SERVICO, CODIGO_FILIAL, FILIAL, PLACA, MODELO, UNIDADE,",
    "       PROJETO_OS, PROJETO_VEICULO, HODOMETRO, KM_RODADO, LITROS,",
    "       MEDIA_KM_L, VALOR, DATA",
    "  FROM base",
    " WHERE DATA >= '2026-09-01'",
    "UNION ALL",
    "SELECT ORDEM_SERVICO, CODIGO_FILIAL, FILIAL, PLACA, MODELO, UNIDADE,",
    "       PROJETO_OS, PROJETO_VEICULO, HODOMETRO, KM_RODADO, LITROS,",
    "       MEDIA_KM_L, VALOR, DATA",
    "  FROM anterior",
    " WHERE RN = 1",
    "ORDER BY PLACA, DATA",
  ].join(' ');
}

function atualizarQueryBanco() {
  if (ERP_URL.indexOf('SERVIDOR') >= 0) {
    throw new Error('Preencha ERP_URL, ERP_USER e ERP_PASS no topo do script.');
  }

  var conn = Jdbc.getConnection(ERP_URL, ERP_USER, ERP_PASS);
  var st = conn.createStatement();
  st.setQueryTimeout(120);
  var rs = st.executeQuery(SQL_());

  var meta = rs.getMetaData(), n = meta.getColumnCount();
  var cab = [];
  for (var c = 1; c <= n; c++) cab.push(meta.getColumnLabel(c));

  var aba = SpreadsheetApp.getActive().getSheetByName(ABA);
  if (!aba) throw new Error('A aba "' + ABA + '" não existe nesta planilha.');
  aba.clearContents();
  aba.getRange(1, 1, 1, n).setValues([cab]);

  var linhas = [], total = 0;
  var escreve = function () {
    if (!linhas.length) return;
    aba.getRange(total + 2, 1, linhas.length, n).setValues(linhas);
    total += linhas.length;
    linhas = [];
  };

  while (rs.next()) {
    var linha = [];
    for (var i = 1; i <= n; i++) {
      // DATA vai como texto ISO de propósito: assim o robô lê igual em
      // qualquer fuso e o Sheets não reinterpreta dd/mm como mm/dd
      var tipo = meta.getColumnTypeName(i).toUpperCase();
      if (tipo.indexOf('DATE') >= 0 || tipo.indexOf('TIME') >= 0) {
        var d = rs.getString(i);
        linha.push(d ? String(d).slice(0, 10) : '');
      } else {
        linha.push(rs.getString(i));
      }
    }
    linhas.push(linha);
    // escrita em lote: o Apps Script corta em 6 minutos e uma chamada por
    // linha estoura muito antes disso
    if (linhas.length >= LOTE) escreve();
  }
  escreve();

  rs.close(); st.close(); conn.close();
  Logger.log('Query Banco: %s linha(s) gravada(s) · desde %s', total, DESDE);
  return total;
}
