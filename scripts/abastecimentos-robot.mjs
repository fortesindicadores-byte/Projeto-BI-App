// ============================================================
// Robô Abastecimentos (ERP → Supabase) — 03/09/2026
//
// O km real da frota vem dos ABASTECIMENTOS do ERP: cada um registra o
// hodômetro do veículo naquele momento (os.DESGASTEREAL). O hodômetro mais
// alto de uma placa é o km atual dela — e é dele que sai o deslocamento do
// mês vigente na Carta de Custos:
//
//     desloc. do mês = hodômetro atual − último "Km Informado" da planilha
//     custo variável = desloc. do mês × R$/km do contrato
//
// FONTE PROVISÓRIA: a aba "Query Banco" da planilha Contratos Man., onde o
// Renan cola o resultado da query. A TI vai liberar um endpoint (previsto
// para a semana de 08/09/2026); quando isso acontecer, muda só a função
// `baixar()` — o resto do caminho (chave, upsert, tabela) continua igual.
//
// A PLANILHA É SÓ O CORREIO, O SUPABASE É O ARQUIVO: a chave é o HANDLE da
// linha de combustível (ORDEM_SERVICO), então recolar o mesmo mês corrige em
// vez de duplicar, e a planilha pode ser limpa quando o mês vira — o que já
// entrou fica guardado.
//
// TRÊS LIÇÕES QUE ESTE ROBÔ JÁ NASCE SABENDO (todas custaram caro hoje):
//  1. COLUNA POR NOME, NUNCA POR POSIÇÃO. A Contratos Man. foi reorganizada
//     no meio da tarde e o robô de contratos leu ZERO linha sem erro nenhum.
//  2. LEITURA VAZIA NÃO GRAVA NADA. Planilha em branco ou reorganizada não
//     pode virar exclusão nem gravação de lixo — aborta e explica.
//  3. NÚMERO PODE VIR COMO TEXTO em locale inglês ("R$ 2,563.21"): o numOf
//     decide o separador decimal pelo que sobra no fim.
//
// Modos (env AB_MODE): previa (padrão, NÃO grava) · gravar
// Uso: node scripts/abastecimentos-robot.mjs
// ============================================================
const SHEET = process.env.ABAST_ID  || '1FOIUgEKtOdTrNUyOYd8wk5Cyur6cFIf7-COr_l4hEsI';
const ABA   = process.env.ABAST_ABA || 'Query Banco';
const MODE  = (process.env.AB_MODE || 'previa').toLowerCase();
const DE    = (process.env.AB_DE || '').trim();            // AAAA-MM-DD (vazio = tudo o que a aba tem)
const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY = process.env.GEM_SUPABASE_SERVICE_KEY || '';
const PASSO = 5000;                                        // linhas por página do gviz

const parse = t => { const s = t.indexOf('{'), e = t.lastIndexOf('}'); return JSON.parse(t.slice(s, e + 1)); };
const txtOf = c => !c ? '' : (c.f != null ? String(c.f) : (c.v == null ? '' : String(c.v)));
const NK = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Z0-9]+/g, ' ').trim();
const brl = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* PLACA CANÔNICA — a mesma lógica Mercosul do resto do portal (Renan,
   03/09/2026). O ERP e a planilha de contratos não emplacam ao mesmo tempo:
   uma pode ter LLLNNNN e a outra já o Mercosul LLLNLNN. Cruzar pela placa
   crua faz o km do ERP simplesmente NÃO ACHAR o contrato — sem erro, só um
   veículo que some da conta. A chave converte o formato antigo trocando o 5º
   caractere pelo dígito→letra (0=A … 9=J); quem já é Mercosul fica igual.
   `placa_origem` guarda a placa como ela veio, que é a que aparece na tela. */
function placaKey(p) {
  const s = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{3}\d{4}$/.test(s)) return s;
  return s.slice(0, 4) + 'ABCDEFGHIJ'[+s[4]] + s.slice(5);
}

// número que pode vir cru (.v) ou como texto formatado em locale inglês
function numOf(c) {
  if (!c) return null;
  if (typeof c.v === 'number' && isFinite(c.v)) return c.v;
  let s = String(c.v != null ? c.v : (c.f || '')).replace(/[R$\s ]/g, '');
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()\-]/g, '');
  const ult = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (ult >= 0) {
    const casas = s.length - ult - 1;
    if (casas === 3 && !/[.,]/.test(s.slice(0, ult))) s = s.replace(/[.,]/g, '');
    else s = s.slice(0, ult).replace(/[.,]/g, '') + '.' + s.slice(ult + 1);
  }
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : null;
}

// A data do gviz vem de três jeitos: Date(2026,8,3) na célula tipada, texto
// dd/mm/aaaa quando a coluna é string, e ISO quando alguém colou como texto.
function dataOf(c) {
  if (!c) return null;
  const v = c.v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v != null ? v : (c.f || '')).trim();
  if (!s) return null;
  let m = s.match(/^Date\((\d+),(\d+),(\d+)/);            // gviz: mês 0-based
  if (m) return `${m[1]}-${String(+m[2] + 1).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); // dd/mm/aaaa
  if (m) {
    const ano = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return `${ano}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

/* AS COLUNAS SÃO ACHADAS PELO CABEÇALHO, NUNCA PELA POSIÇÃO. Cada campo lista
   os nomes que já vimos (e os prováveis, se a query mudar de apelido); o
   primeiro que casar vence. Assim, mover ou renomear coluna não quebra nada e
   o log diz exatamente o que foi encontrado. */
const CAMPOS = {
  ordem_servico:   ['ORDEM SERVICO', 'ORDEM DE SERVICO', 'OS', 'HANDLE'],
  codigo_filial:   ['CODIGO FILIAL', 'COD FILIAL'],
  filial:          ['FILIAL'],
  placa:           ['PLACA', 'CODIGO', 'VEICULO'],
  modelo:          ['MODELO'],
  unidade_prod:    ['UNIDADE', 'UNIDADE PRODUCAO', 'UNIDADEPRODUCAO'],
  projeto_os:      ['PROJETO OS'],
  projeto_veiculo: ['PROJETO VEICULO'],
  hodometro:       ['HODOMETRO', 'DESGASTE REAL', 'DESGASTEREAL'],
  km_rodado:       ['KM RODADO', 'DESGASTE'],
  litros:          ['LITROS', 'QUANTIDADE'],
  media_km_l:      ['MEDIA KM L', 'MEDIA', 'MEDIA KM/L'],
  valor:           ['VALOR', 'VALOR TOTAL', 'VALORTOTAL'],
  data:            ['DATA'],
};
const NUMERICOS = new Set(['hodometro', 'km_rodado', 'litros', 'media_km_l', 'valor']);

async function baixar() {
  const linhas = [];
  for (let off = 0; ; off += PASSO) {
    // paginado de propósito: um mês são ~16 mil abastecimentos e o gviz corta
    // resposta grande sem avisar — pedir em fatias é o que garante o total
    const tq = encodeURIComponent(`select * limit ${PASSO} offset ${off}`);
    const url = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq`
      + `?sheet=${encodeURIComponent(ABA)}&headers=1&tq=${tq}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`gviz ${r.status} — a aba "${ABA}" existe e a planilha está compartilhada?`);
    const j = parse(await r.text());
    if (j.status === 'error') {
      const msg = (j.errors || []).map(e => e.detailed_message || e.message).join(' · ');
      throw new Error(`gviz: ${msg.replace(/<[^>]+>/g, '')}`);
    }
    const cols = (j.table.cols || []).map(c => NK(c.label || c.id));
    const rows = j.table.rows || [];
    if (!off) linhas.cols = cols;
    rows.forEach(r => linhas.push(r.c || []));
    if (rows.length < PASSO) return linhas;
  }
}

console.log(`abastecimentos · planilha ${SHEET} · aba "${ABA}"${DE ? ` · de ${DE}` : ''}`);
const cel = await baixar();
const cols = cel.cols || [];
console.log(`aba: ${cel.length} linha(s) · ${cols.length} coluna(s)`);

if (!cel.length) {
  /* ABA VAZIA NÃO É ERRO (04/09/2026). Enquanto o endpoint da TI não sai, a aba
     só tem dado depois que alguém cola o resultado da query — então "vazia" é
     um estado NORMAL do dia a dia, não uma falha. Saindo com 1, o cron das
     08h15 ficaria vermelho toda manhã e o alarme perderia o sentido: quando um
     erro de verdade aparecesse, ninguém ia olhar. Sai com 0 e diz o que falta. */
  console.log('\n⚠ A aba está VAZIA — nada a fazer nesta rodada.');
  console.log('  Cole o resultado da query (com a linha de cabeçalho) e rode de novo,');
  console.log('  ou espere o endpoint da TI, que dispensa a colagem.');
  process.exit(0);
}

// de-para cabeçalho → campo
const idx = {};
for (const [campo, nomes] of Object.entries(CAMPOS)) {
  const i = cols.findIndex(c => nomes.some(n => c === NK(n)));
  if (i >= 0) idx[campo] = i;
}
console.log('colunas reconhecidas: ' + Object.keys(idx).map(k => `${k}→${String.fromCharCode(65 + idx[k])}`).join(' · '));
const faltam = ['placa', 'hodometro', 'data'].filter(k => idx[k] == null);
if (faltam.length) {
  console.error(`\n⚠ Faltam colunas essenciais: ${faltam.join(', ')}.`);
  console.error(`  Cabeçalhos encontrados: ${cols.filter(Boolean).join(' | ')}`);
  console.error('  A leitura é pelo NOME da coluna — confira a linha de cabeçalho da aba.');
  process.exit(1);
}

// ── monta as linhas ────────────────────────────────────────────────────────
const linhas = [];
let semPlaca = 0, semData = 0, foraJanela = 0;
const chaves = new Set();
for (const r of cel) {
  const placaOrig = txtOf(r[idx.placa]).toUpperCase().trim();
  if (!placaOrig) { semPlaca++; continue; }
  const placa = placaKey(placaOrig);              // é por ela que o km acha o contrato
  const data = dataOf(r[idx.data]);
  if (!data) { semData++; continue; }
  if (DE && data < DE) { foraJanela++; continue; }
  const l = { placa, placa_origem: placaOrig, data };
  for (const campo of Object.keys(idx)) {
    if (campo === 'placa' || campo === 'data') continue;
    const c = r[idx[campo]];
    l[campo] = NUMERICOS.has(campo) ? numOf(c) : (txtOf(c).trim() || null);
  }
  // sem o HANDLE do ERP, a chave é o que identifica o abastecimento sem
  // ambiguidade: a mesma placa não abastece duas vezes no mesmo hodômetro
  l.ordem_servico = String(l.ordem_servico || `${placa}|${data}|${l.hodometro ?? ''}`);
  if (chaves.has(l.ordem_servico)) continue;      // linha repetida na aba
  chaves.add(l.ordem_servico);
  linhas.push(l);
}

console.log(`\nLINHAS VÁLIDAS: ${linhas.length}`
  + (semPlaca ? ` · ${semPlaca} sem placa` : '')
  + (semData ? ` · ${semData} sem data` : '')
  + (foraJanela ? ` · ${foraJanela} antes de ${DE}` : ''));

if (!linhas.length) {
  console.error('\n⚠ NADA A GRAVAR: a aba tem linhas, mas nenhuma virou registro.');
  console.error('  Costuma ser cabeçalho diferente do esperado ou data em formato não reconhecido.');
  process.exit(1);
}

// ── o que isso vira: hodômetro atual por placa ─────────────────────────────
const porPlaca = new Map();
for (const l of linhas) {
  const p = porPlaca.get(l.placa) || { n: 0, hodo: null, ult: null, km: 0, lit: 0, vlr: 0 };
  p.n++;
  p.km  += +l.km_rodado || 0;
  p.lit += +l.litros || 0;
  p.vlr += +l.valor || 0;
  // MAX e não "o da última data": hodômetro digitado para menos num
  // abastecimento não pode fazer o km atual da placa ANDAR PARA TRÁS
  if (l.hodometro != null && (p.hodo == null || l.hodometro > p.hodo)) p.hodo = l.hodometro;
  if (!p.ult || l.data > p.ult) p.ult = l.data;
  porPlaca.set(l.placa, p);
}
const datas = linhas.map(l => l.data).sort();
console.log(`placas: ${porPlaca.size} · período ${datas[0]} → ${datas[datas.length - 1]}`);
const tot = [...porPlaca.values()].reduce((a, p) => ({ km: a.km + p.km, lit: a.lit + p.lit, vlr: a.vlr + p.vlr }),
  { km: 0, lit: 0, vlr: 0 });
console.log(`total: ${Math.round(tot.km).toLocaleString('pt-BR')} km · `
  + `${Math.round(tot.lit).toLocaleString('pt-BR')} L · ${brl(tot.vlr)}`
  + (tot.lit > 0 ? ` · ${(tot.km / tot.lit).toFixed(2)} km/L` : ''));

console.log('\nTOP 10 PLACAS POR KM RODADO:');
[...porPlaca.entries()].sort((a, b) => b[1].km - a[1].km).slice(0, 10).forEach(([placa, p]) =>
  console.log(`   ${placa.padEnd(10)} ${String(Math.round(p.km)).padStart(7)} km · hodômetro ${String(p.hodo ?? '—').padStart(9)}`
    + ` · ${p.n} abastecimento(s) · último ${p.ult}`));

/* O CRUZAMENTO COM O CONTRATO É O PONTO DE FALHA SILENCIOSA: placa que não
   casa não dá erro nenhum, só some da conta do mês. Por isso a conferência é
   parte da prévia — antes de gravar já dá para ver quantas das placas com
   contrato o ERP está alcançando, e quais ficaram de fora. */
const conv = linhas.filter(l => l.placa !== l.placa_origem);
if (conv.length) {
  const placasConv = new Set(conv.map(l => l.placa_origem));
  console.log(`\nplacas convertidas para o formato Mercosul: ${placasConv.size}`
    + ` (ex.: ${[...placasConv].slice(0, 3).map(p => `${p}→${placaKey(p)}`).join(', ')})`);
}
if (SB_KEY) {
  const rc = await fetch(`${SB_URL}/rest/v1/contratos_placa?select=placa,tipo`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (rc.ok) {
    const ct = await rc.json();
    if (ct.length) {
      const noErp = new Set(porPlaca.keys());
      const achou = ct.filter(c => noErp.has(placaKey(c.placa)));
      const perdeu = ct.filter(c => c.tipo === 'variavel' && !noErp.has(placaKey(c.placa)));
      console.log(`\nCRUZAMENTO COM O CONTRATO: ${achou.length}/${ct.length} placa(s) com contrato`
        + ' têm abastecimento no período.');
      if (perdeu.length) console.log(`   ${perdeu.length} placa(s) por km SEM abastecimento no período`
        + ` — ficam sem deslocamento no mês: ${perdeu.slice(0, 8).map(c => c.placa).join(', ')}`
        + (perdeu.length > 8 ? '…' : ''));
    } else {
      console.log('\ncontratos_placa está vazia — rode o Contratos Robot em modo gravar primeiro.');
    }
  }
}

if (MODE !== 'gravar') {
  console.log('\nmodo prévia — nada foi gravado. Rode com modo=gravar para subir.');
  process.exit(0);
}
if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }

// ── grava (upsert por ordem_servico) ───────────────────────────────────────
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
let gravadas = 0;
for (let i = 0; i < linhas.length; i += 500) {
  const lote = linhas.slice(i, i + 500);
  const res = await fetch(`${SB_URL}/rest/v1/erp_abastecimentos?on_conflict=ordem_servico`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(lote),
  });
  if (!res.ok) {
    const t = await res.text();
    if (/erp_abastecimentos/.test(t) && /does not exist|schema cache/.test(t)) {
      console.error('\nA tabela erp_abastecimentos ainda não existe.'
        + ' Rode scripts/erp-abastecimentos.sql no SQL Editor do Supabase e tente de novo.');
    }
    throw new Error(`erp_abastecimentos: ${res.status} ${t.slice(0, 300)}`);
  }
  gravadas += lote.length;
}
console.log(`\ngravado: ${gravadas} abastecimento(s) em erp_abastecimentos.`);
