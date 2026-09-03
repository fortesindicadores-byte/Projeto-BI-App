// ============================================================
// Robô Contratos → Carta de Custos (01/09/2026)
//
// Sobe o custo de CONTRATO (manutenção por km rodado) da planilha
// "Contratos Man." para a tabela `carta_custos`, uma linha por placa.
//
// REGRA DA VIGÊNCIA (Renan, 01/09/2026): o valor do bloco de um mês é o
// custo DAQUELE mês — "o que vai cair em agosto é realmente agosto". Sem
// deslocamento: bloco jul-26 → vigência 2026-07.
//
// Fonte provisória: a planilha do time. O definitivo virá do ERP (o km dos
// abastecimentos), quando a conta passa a ser hodômetro atual − km informado.
//
// ARMADILHAS da planilha (achadas na auditoria, ver contratos-man-inspect):
//  · locale INGLÊS e coluna de valor em TEXTO — "R$ 2,563.21" tem vírgula de
//    milhar; o numOf decide o decimal pelo separador do fim;
//  · o gviz tipa a coluna: rótulo de texto em coluna numérica volta nulo, então
//    o bloco do mês é lido por POSIÇÃO (km · desloc · valor · [NF] · status).
//
// IDEMPOTENTE: cada linha carrega `origem_chave` = contrato:<vig>:<placa>, e a
// gravação é upsert por essa chave — rodar de novo corrige valores em vez de
// duplicar, e não encosta em lançamento digitado à mão.
//
// Modos (env CT_MODE): previa (padrão, NÃO grava) · gravar
// Uso: node scripts/contratos-robot.mjs
// ============================================================
const SHEET = process.env.CONTRATOS_ID || '1FOIUgEKtOdTrNUyOYd8wk5Cyur6cFIf7-COr_l4hEsI';
const GID   = process.env.CONTRATOS_GID || '0';
const MODE  = (process.env.CT_MODE || 'previa').toLowerCase();
const SO_VIG = (process.env.CT_VIG || '').trim();          // ex.: 2026-08 (vazio = todas)
const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY = process.env.GEM_SUPABASE_SERVICE_KEY || '';

const PACOTE = 'Manutenção';
const CONTA  = 'Contratos de Manutenção Fabricante';   // conta do DRE p/ contrato
const GRUPO  = 'Contrato';

const parse = t => { const s = t.indexOf('{'), e = t.lastIndexOf('}'); return JSON.parse(t.slice(s, e + 1)); };
const txtOf = c => !c ? '' : (c.f != null ? String(c.f) : (c.v == null ? '' : String(c.v)));
// A célula de valor pode vir como NÚMERO (.v) ou como TEXTO já formatado —
// e a planilha está em locale INGLÊS ("R$ 2,563.21": vírgula de milhar).
// Regra: o ÚLTIMO separador que sobra é o decimal; separador seguido de
// exatamente 3 dígitos no fim é milhar. Cobre 2,563.21 e 2.563,21.
function numOf(c) {
  if (!c) return 0;
  if (typeof c.v === 'number' && isFinite(c.v)) return c.v;
  let s = String(c.v != null ? c.v : (c.f || '')).replace(/[R$\s\u00a0]/g, '');
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()\-]/g, '');
  const ult = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (ult >= 0) {
    const casas = s.length - ult - 1;
    if (casas === 3 && s.slice(0, ult).match(/[.,]/) === null && !/[.,]/.test(s.slice(ult + 1))) {
      s = s.replace(/[.,]/g, '');                    // 2,563 → milhar, sem decimal
    } else {
      s = s.slice(0, ult).replace(/[.,]/g, '') + '.' + s.slice(ult + 1);
    }
  }
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : 0;
}
const brl   = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NK = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const MES3 = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12,
               feb:2, apr:4, may:5, aug:8, sep:9, oct:10, dec:12 };
function mesDoRotulo(s) {
  const m = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .match(/([a-z]{3})[a-z.]*[\s\-\/]+(\d{2,4})/);
  if (!m || !MES3[m[1]]) return null;
  return { ano: +m[2] < 100 ? 2000 + +m[2] : +m[2], mes: MES3[m[1]] };
}
const vigDe = ({ ano, mes }) => `${ano}-${String(mes).padStart(2, '0')}-01`;
const MESLBL = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const refLbl = ({ ano, mes }) => `${MESLBL[mes - 1]}/${String(ano).slice(2)}`;

// ── A PLACA é quem decide unidade e projeto (Renan, 01/09/2026) ────────────
// A coluna "Unidade" da planilha é digitada à mão e envelhece quando o
// veículo muda de casa. A verdade da frota é a base de ativos do Ginfo
// (ginfo_snapshot['ativos'] · Filial | Projeto | Placa), que o robô do Ginfo
// atualiza todo dia — mais a ativos_manual, que cobre a ANG (fora do Ginfo).
// A coluna da planilha vira só o plano B, para placa que não está em lugar
// nenhum; o log diz quantas caíram nele.
const D2L = '0123456789';
// placa antiga LLLNNNN → Mercosul LLLNLNN (o 5º caractere vira letra). É só
// para CRUZAR as bases: cada tela mostra a placa como ela veio da origem.
function placaKey(p) {
  const s = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{3}\d{4}$/.test(s)) return s;
  return s.slice(0, 4) + 'ABCDEFGHIJ'[D2L.indexOf(s[4])] + s.slice(5);
}
const NAME2COD = {
  'CDD CAMBORIU':'BLC','BALNEARIO CAMBORIU':'BLC','CAMBORIU':'BLC',
  'CDD CUIABA':'CBA T2','CUIABA':'CBA T1 WH','CUIABA EMPURRADA':'CBA T1',
  'CDD RIO DE JANEIRO':'CGR','CAMPO GRANDE':'CGR','RIO DE JANEIRO':'CGR',
  'CDD FLORIANOPOLIS':'FLP','FLORIANOPOLIS':'FLP',
  'CDD GUARULHOS':'GRL','GUARULHOS':'GRL','ANHANGUERA':'ANG',
  'CDI MACACU':'MCC T2','MACACU EMPURRADA':'MCC T1','CACHOEIRAS DE MACACU':'MCC T2','MACACU':'MCC T2',
  'CDD NOVA FRIBURGO':'NFR','NOVA FRIBURGO':'NFR',
  'PIRAI EMPURRADA':'PIR','PIRAI':'PIR','CDD PELOTAS':'PLT','PELOTAS':'PLT',
  'CDD RONDONOPOLIS':'RON','RONDONOPOLIS':'RON'
};
// mesmo refino de tier do resto do portal: o projeto é que separa CBA/MCC
function unitCod(nome, projeto) {
  const n = NK(nome); if (!n) return null;
  let cod = NAME2COD[n]; if (!cod) return null;
  const p = NK(projeto);
  if (cod.startsWith('CBA')) {
    if (/EMPURRAD/.test(p)) cod = 'CBA T1';
    else if (/APOIO|EMPILHADEIRA|ARMAZEM|\bWH\b/.test(p)) cod = 'CBA T1 WH';
    else if (/ROTA|CDD|AUTO SERVICO|VAN/.test(p)) cod = 'CBA T2';
  } else if (cod.startsWith('MCC')) {
    if (/EMPURRAD/.test(p)) cod = 'MCC T1';
    else if (/ROTA|CDI|CDD|AUTO SERVICO|VAN/.test(p)) cod = 'MCC T2';
  }
  return cod;
}
// projeto do ativo → um dos projetos que a Carta de Custos aceita
function projPortal(p) {
  const s = NK(p);
  if (/EMPURRAD/.test(s)) return 'EMPURRADA';
  if (/APOIO|EMPILHADEIRA|ARMAZEM|\bWH\b/.test(s)) return 'APOIO';
  if (/AUTO SERVICO|\bAS\b/.test(s)) return 'AUTO SERVIÇO';
  if (/INSUMO/.test(s)) return 'INSUMOS';
  return 'ROTA';
}

// ── plano B: a coluna "Unidade" da planilha ────────────────────────────────
const BASE2COD = {
  'CAMPO GRANDE': 'CGR', 'RIO DE JANEIRO': 'CGR',
  'FLORIANOPOLIS': 'FLP', 'FLORIPA': 'FLP',
  'GUARULHOS': 'GRL',
  'BALNEARIO': 'BLC', 'BALNEARIO CAMBORIU': 'BLC', 'CAMBORIU': 'BLC',
  'PELOTAS': 'PLT',
  'PIRAI': 'PIR',
  'MACACU': 'MCC', 'CACHOEIRAS DE MACACU': 'MCC',
  'RONDONOPOLIS': 'RON',
  'CUIABA': 'CBA',
  'NOVA FRIBURGO': 'NFR', 'FRIBURGO': 'NFR',
};
function deParaUnidade(txt) {
  const s = NK(txt).replace(/\s*-\s*/g, ' ');
  if (!s) return null;
  let proj = 'ROTA';
  if (/\bEMPURRAD/.test(s)) proj = 'EMPURRADA';
  else if (/\bAS\b|AUTO SERVICO/.test(s)) proj = 'AUTO SERVIÇO';
  else if (/\bAPOIO\b|\bWH\b/.test(s)) proj = 'APOIO';
  const base = s.replace(/\b(ROTA|AS|AUTO SERVICO|EMPURRADA|APOIO|WH)\b/g, '').replace(/\s+/g, ' ').trim();
  const cod = BASE2COD[base];
  if (!cod) return null;
  let unidade = cod;
  if (cod === 'CBA') unidade = proj === 'EMPURRADA' ? 'CBA T1' : proj === 'APOIO' ? 'CBA T1 WH' : 'CBA T2';
  if (cod === 'MCC') unidade = proj === 'EMPURRADA' ? 'MCC T1' : 'MCC T2';
  return { unidade, projeto: proj };
}

// ── base de ativos: placa → unidade + projeto ──────────────────────────────
const H_SB = SB_KEY ? { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' } : null;
const FROTA = new Map();   // placaKey → {unidade, projeto, fonte}
async function carregaFrota() {
  if (!H_SB) { console.log('sem service key — a frota não pode ser lida; usando a coluna da planilha'); return; }
  const req = async q => {
    const r = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: H_SB });
    if (!r.ok) { console.log(`aviso: ${q} → ${r.status}`); return []; }
    return r.json();
  };
  const [gs] = await req('ginfo_snapshot?chave=eq.ativos&select=data,updated_at');
  const ativos = Array.isArray(gs && gs.data) ? gs.data : [];
  ativos.forEach(a => {
    const k = placaKey(a['Placa'] || a['Placa Mercosul']);
    const cod = unitCod(a['Filial'], a['Projeto']);
    if (k && cod) FROTA.set(k, { unidade: cod, projeto: projPortal(a['Projeto']), fonte: 'ginfo' });
  });
  console.log(`frota Ginfo: ${ativos.length} ativo(s)${gs && gs.updated_at ? ` · atualizado ${String(gs.updated_at).slice(0, 10)}` : ''}`
    + ` · ${FROTA.size} placa(s) com unidade`);
  // ANG e afins não existem no Ginfo — a tabela manual cobre esse buraco
  const man = await req('ativos_manual?select=placa,unidade,projeto');
  let nMan = 0;
  (Array.isArray(man) ? man : []).forEach(a => {
    const k = placaKey(a.placa); if (!k) return;
    FROTA.set(k, { unidade: a.unidade, projeto: projPortal(a.projeto), fonte: 'manual' }); nMan++;
  });
  if (nMan) console.log(`ativos manuais: ${nMan} placa(s)`);
}
await carregaFrota();

// ── leitura da planilha ────────────────────────────────────────────────────
const url = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq`
  + `?gid=${GID}&tqx=out:json&headers=0&tq=${encodeURIComponent('select *')}`;
const j = parse(await (await fetch(url)).text());
if (j.status !== 'ok') { console.error('gviz:', j.status, JSON.stringify(j.errors || {})); process.exit(1); }

const rows  = (j.table.rows || []).map(r => r.c || []);
const nCols = (j.table.cols || []).length;
const L1 = rows[0] || [];

// blocos por posição; o tamanho do bloco vem do próximo rótulo de mês.
// bloco de 5 colunas tem NF (km · desloc · valor · nf · status), o de 4 não.
const marcos = [];
for (let i = 0; i < nCols; i++) { const r = txtOf(L1[i]).trim(); if (r) marcos.push({ rot: r, ini: i }); }
const blocos = marcos.map((m, k) => {
  const fim = k + 1 < marcos.length ? marcos[k + 1].ini : nCols;
  const largura = fim - m.ini;
  return { rot: m.rot, mv: mesDoRotulo(m.rot), km: m.ini, desloc: m.ini + 1, valor: m.ini + 2,
           nf: largura >= 5 ? m.ini + 3 : null, largura };
}).filter(b => b.mv);

const dados = rows.slice(2).filter(r => txtOf(r[2]).trim());
console.log(`planilha: ${dados.length} veículo(s) · ${blocos.length} bloco(s) de mês`);
blocos.forEach(b => console.log(`   ${b.rot.padEnd(10)} ${b.largura} coluna(s)`
  + `${b.nf == null ? ' (sem NF)' : ''} → vigência ${vigDe(b.mv)}`));

// ── monta os lançamentos ───────────────────────────────────────────────────
const semDePara = new Map();      // nem a frota nem a planilha resolveram
const porFonte = { ginfo: 0, manual: 0, planilha: 0 };
const divergiu = new Map();       // placa está na frota em outra unidade que não a da planilha
const linhas = [];
for (const b of blocos) {
  const vig = vigDe(b.mv);
  if (SO_VIG && !vig.startsWith(SO_VIG)) continue;
  for (const r of dados) {
    const valor = numOf(r[b.valor]);
    if (!(valor > 0)) continue;                                  // mês sem lançamento p/ essa placa
    const placa = txtOf(r[2]).toUpperCase().trim();
    const naFrota = FROTA.get(placaKey(placa));                  // a PLACA manda
    const daPlan  = deParaUnidade(txtOf(r[1]));                  // plano B
    const uni = naFrota || daPlan;
    if (!uni) { const k = `${txtOf(r[1]).trim()} · placa fora da frota`; semDePara.set(k, (semDePara.get(k) || 0) + 1); continue; }
    porFonte[naFrota ? naFrota.fonte : 'planilha']++;
    if (naFrota && daPlan && naFrota.unidade !== daPlan.unidade) {
      const k = `${daPlan.unidade} (planilha) → ${naFrota.unidade} (frota)`;
      divergiu.set(k, (divergiu.get(k) || 0) + 1);
    }
    const contrato = txtOf(r[0]).trim();
    const nf = b.nf != null ? txtOf(r[b.nf]).trim() : '';
    // A VIGÊNCIA DA CARTA É 'AAAA-MM', NÃO A DATA (bug real, 01/09/2026):
    // a tela grava curVigs()[0] ('2026-08') e consulta com .in('vigencia',…)
    // nesse formato. Gravar '2026-08-01' não casa com NADA — as linhas ficam
    // no banco e a Carta mostra a conta zerada, sem erro nenhum. A coluna
    // `data` é que leva a data completa.
    const vigM = vig.slice(0, 7);
    linhas.push({
      origem: 'contratos-planilha',
      origem_chave: `contrato:${vigM}:${placa}`,
      unidade: uni.unidade, vigencia: vigM, pacote: PACOTE, projeto: uni.projeto,
      data: vig, equipamento: placa, fornecedor: '',
      // contrato não passa por RC/OC: é faturamento fechado por km. Entra com
      // as duas aprovações dadas e a NF da planilha; sem NF na planilha, o
      // documento é o próprio nº do contrato (senão a linha não conta no
      // realizado — `counts` exige NF + valor).
      rc: 'N/A', oc: 'N/A', nf: nf || contrato || 'CONTRATO',
      conta: CONTA, grupo: GRUPO,
      descricao: `Contrato ${contrato} · ref ${refLbl(b.mv)}`,
      valor, aprovado: true, aprovado_oc: true,
    });
  }
}

// ── resumo do que seria gravado ────────────────────────────────────────────
const porVig = new Map();
linhas.forEach(l => {
  const t = porVig.get(l.vigencia) || { n: 0, v: 0, unis: new Map() };
  t.n++; t.v += l.valor;
  t.unis.set(l.unidade, (t.unis.get(l.unidade) || 0) + l.valor);
  porVig.set(l.vigencia, t);
});
console.log(`\nLANÇAMENTOS: ${linhas.length}`);
[...porVig.entries()].sort().forEach(([v, t]) => {
  console.log(`\n   vigência ${v} · ${t.n} lançamento(s) · ${brl(t.v)}`);
  [...t.unis.entries()].sort((a, b) => b[1] - a[1])
    .forEach(([u, s]) => console.log(`      ${u.padEnd(10)} ${brl(s).padStart(16)}`));
});
console.log(`\nDE ONDE VEIO A UNIDADE: frota Ginfo ${porFonte.ginfo} · ativos manuais ${porFonte.manual}`
  + ` · coluna da planilha (plano B) ${porFonte.planilha}`);
if (divergiu.size) {
  console.log('\nPLACAS QUE MUDARAM DE CASA (vale a frota, não a planilha):');
  [...divergiu.entries()].sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`   ${k.padEnd(44)} ${n} lançamento(s)`));
}
if (semDePara.size) {
  console.log('\nLINHAS IGNORADAS (placa fora da frota e unidade sem de-para):');
  [...semDePara.entries()].forEach(([u, n]) => console.log(`   ${u} → ${n} linha(s)`));
}

if (MODE !== 'gravar') {
  console.log('\nmodo prévia — nada foi gravado. Rode com modo=gravar para subir.');
  process.exit(0);
}

/* TRAVA: LEITURA VAZIA NÃO APAGA A CARTA (bug real, 03/09/2026). A planilha
   mudou de layout e o robô passou a ler 0 lançamentos — nenhum erro, só o
   conjunto vazio. Como a faxina apaga tudo que não está no conjunto atual, o
   próximo cron teria APAGADO os 733 lançamentos que já estavam na Carta. Sem
   linha nenhuma, o robô aborta antes de tocar no banco: o silêncio de uma
   planilha reorganizada não pode virar exclusão em massa. */
if (!linhas.length) {
  console.error('\n⚠ NADA A GRAVAR: a planilha não rendeu nenhum lançamento.');
  console.error('  Isso costuma ser mudança de layout (coluna inserida/movida), não mês vazio.');
  console.error('  O robô ABORTA sem gravar e sem faxina — o que já está na Carta fica intacto.');
  console.error('  Rode o workflow "Contratos Man Inspect" para ver as colunas atuais.');
  process.exit(1);
}
if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }

// ── grava (upsert por origem_chave) ────────────────────────────────────────
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

// FAXINA DOS ÓRFÃOS: apaga o que o ROBÔ gravou e não faz mais parte do
// conjunto atual — linha de vigência que mudou de regra, placa que saiu da
// planilha, valor que foi zerado. Só roda na coleta completa (com filtro de
// vigência apagaria as outras) e só toca em origem = contratos-planilha:
// lançamento manual tem origem nula e nunca entra nesta lista.
if (!SO_VIG) {
  const atuais = new Set(linhas.map(l => l.origem_chave));
  const r = await fetch(`${SB_URL}/rest/v1/carta_custos`
    + `?origem=eq.contratos-planilha&select=origem_chave`, { headers: H });
  const jaTem = r.ok ? await r.json() : [];
  const orfas = jaTem.map(x => x.origem_chave).filter(k => k && !atuais.has(k));
  for (let i = 0; i < orfas.length; i += 200) {
    const lote = orfas.slice(i, i + 200).map(k => `"${k}"`).join(',');
    const d = await fetch(`${SB_URL}/rest/v1/carta_custos`
      + `?origem=eq.contratos-planilha&origem_chave=in.(${encodeURIComponent(lote)})`,
      { method: 'DELETE', headers: H });
    if (!d.ok) console.log('aviso: faxina →', d.status, (await d.text()).slice(0, 160));
  }
  if (orfas.length) console.log(`faxina: ${orfas.length} linha(s) antiga(s) do robô removida(s)`);
}

let gravadas = 0;
for (let i = 0; i < linhas.length; i += 500) {
  const lote = linhas.slice(i, i + 500);
  const res = await fetch(`${SB_URL}/rest/v1/carta_custos?on_conflict=origem_chave`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(lote),
  });
  if (!res.ok) {
    const t = await res.text();
    if (/origem_chave/.test(t)) {
      console.error('\nA tabela carta_custos ainda não tem a coluna origem_chave.'
        + ' Rode scripts/contratos-carta-custos.sql no SQL Editor e tente de novo.');
    }
    throw new Error(`carta_custos: ${res.status} ${t.slice(0, 300)}`);
  }
  gravadas += lote.length;
}
console.log(`\ngravado: ${gravadas} lançamento(s) em carta_custos.`);
