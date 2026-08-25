// ============================================================
// Condução Econômica — coletor de telemetria (vFleets · Geotab)
//
// Fase 1 do roteiro (Renan): tirar o painel /combustivel/conducao-economica/
// dos dados de exemplo e passar a ler telemetria de verdade.
//
// MODOS (env CE_MODE)
//   sonda    baixa UM dia de cada fonte e imprime a ESTRUTURA da resposta —
//            nomes de campos, tipos e faixas de valor. É com esse retrato que
//            o mapa de campos abaixo é fechado; nada é gravado.
//   run      coleta o período, grava o bruto em ce_diario e recalcula o mês
//            em ce_scores_mensais (o que o painel lê).
//   recalc   não chama API nenhuma: só refaz o mensal a partir do ce_diario
//            (usar quando a régua de pontos mudar).
//   reproc   pergunta em /processamentos quais dias a vFleets reprocessou no
//            período e recoleta SÓ esses dias (o dado antigo fica errado).
//
// PERÍODO: CE_DE / CE_ATE (YYYY-MM-DD). Sem eles, roda o dia anterior.
//
// LIMITE DA API (manual DaaS, "Controle de requisição"): UMA requisição a cada
// 5 minutos por token — abaixo disso vem 429. Por isso o run pausa CE_PAUSA
// segundos (padrão 305) entre um dia e o outro; um mês inteiro leva ~2h30.
//
// SEGREDOS
//   GEM_SUPABASE_SERVICE_KEY   escrita no Supabase
//   VFLEETS_TOKEN              header Authorization da API vFleets
//   GEOTAB_USER/GEOTAB_PASS/GEOTAB_DB   credenciais MyGeotab
//   GEOTAB_SERVER              opcional (padrão my.geotab.com)
//
// PRIVACIDADE: o repositório é público. Nome, CPF e CNH NÃO são impressos —
// o log usa a chave mascarada. O dado pessoal fica só no Supabase.
// ============================================================
const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
const MODE   = process.env.CE_MODE || 'sonda';

const VF_TOKEN  = process.env.VFLEETS_TOKEN;
const VF_BASE   = process.env.VFLEETS_URL || 'https://api.vfleets.com.br/integrationcore-conducao';
const VF_URL    = `${VF_BASE}/conducoes/detalhada`;
const VF_PROC   = `${VF_BASE}/processamentos`;
const PAUSA     = (+process.env.CE_PAUSA || 305) * 1000;   // 1 req / 5 min (manual DaaS)
const GT_USER   = process.env.GEOTAB_USER, GT_PASS = process.env.GEOTAB_PASS, GT_DB = process.env.GEOTAB_DB;
const GT_SERVER = process.env.GEOTAB_SERVER || 'my.geotab.com';

// ── régua de pontos: a MESMA que o painel já usa (o `fmt` de cada pilar é o
// caminho inverso desta conta). Os limites são o valor da métrica que zera o
// pilar — é aqui que se calibra quando o Renan fechar a régua com dados reais.
const REGUA = {
  rpm:    { direto: true },                    // % na faixa verde já é a nota
  freio:  { direto: true },                    // % de uso de freio motor idem
  idle:   { zeraEm: 25 },                      // 25% do tempo em marcha lenta → 0
  acel:   { zeraEm: 100 / 6 },                 // ~16,7 acelerações bruscas/100km → 0
  frea:   { zeraEm: 100 / 6 },
  vel:    { zeraEm: 20 },                      // 20% do tempo acima do limite → 0
  cambio: { zeraEm: 100 / 6 },                 // ~16,7% do tempo com marcha ruim → 0
};
const PESOS = { rpm: 25, idle: 20, acel: 15, frea: 10, vel: 15, freio: 10, cambio: 5 };

const nota = (pilar, valor) => {
  if (valor == null || !isFinite(valor)) return null;
  const r = REGUA[pilar];
  const n = r.direto ? valor : 100 - (valor / r.zeraEm) * 100;
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
};
const score = notas => {
  let num = 0, den = 0;
  for (const [k, w] of Object.entries(PESOS)) {
    const v = notas[k]; if (v == null) continue;
    num += v * w; den += w;
  }
  return den ? Math.round((num / den) * 10) / 10 : null;
};

// ── campos da API (manual "Consulta de Condução Detalhada – DaaS" v1.8) ──────
// A API NÃO entrega percentual nenhum: entrega CONTADORES e TEMPOS EM SEGUNDOS
// por registro de condução. Cada pilar do painel é derivado deles aqui embaixo.
// Os nomes são exatos — vieram da tabela "Descrição dos campos do JSON".
const CAMPOS = {
  // tempos-base (segundos)
  tempoDirecao: 'tempoDirecao',            // motorista vigente
  tempoMovimento: 'tempoMovimento',
  tempoParado: 'tempoParado',
  // hodômetro (metros) — `km` só vem com kmCalculado=true na consulta
  km: 'km', kmInicial: 'kmInicial', kmFinal: 'kmFinal',
  // faixas de RPM (segundos)
  rpmMarchaLentaTempo: 'rpmMarchaLentaTempo',
  rpmAbaixoVerdeTempo: 'rpmAbaixoVerdeTempo',
  rpmVerdeEconomicaTempo: 'rpmVerdeEconomicaTempo',
  rpmVerdePotenciaTempo: 'rpmVerdePotenciaTempo',
  rpmAmareloTempo: 'rpmAmareloTempo',
  rpmVermelhoTempo: 'rpmVermelhoTempo',
  // marcha lenta
  motorOciosoTempo: 'motorOciosoTempo',
  // eventos
  aceleracoesQtd: 'aceleracoesQtd',
  frenagensQtd: 'frenagensQtd',
  // velocidade: preferimos o limite DA VIA; caímos no limite configurado
  velocidadeViaFaixa1Tempo: 'velocidadeViaFaixa1Tempo',
  velocidadeViaFaixa2Tempo: 'velocidadeViaFaixa2Tempo',
  velocidadeViaFaixa3Tempo: 'velocidadeViaFaixa3Tempo',
  velocidadeFaixa1Tempo: 'velocidadeFaixa1Tempo',
  velocidadeFaixa2Tempo: 'velocidadeFaixa2Tempo',
  velocidadeFaixa3Tempo: 'velocidadeFaixa3Tempo',
  // freio motor / banguela / câmbio
  freioMotorTempo: 'freioMotorTempo',
  banguelaTempo: 'banguelaTempo',
  batendoTransmissaoTempo: 'batendoTransmissaoTempo',
};
// motorista: o exemplo do manual traz o objeto singular `motorista`; a tabela
// de campos descreve `motoristas` (lista que, nesta rota, volta com um só).
const MOT_OBJ = ['motorista', 'motoristas'];

const H_SB = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
const mask = s => { const t = String(s || ''); return t.length <= 4 ? '****' : t.slice(0, 2) + '***' + t.slice(-2); };
const iso = d => d.toISOString().slice(0, 10);
const num = v => { if (v == null) return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : null; };
const pega = (obj, nomes) => {
  const chaves = Object.keys(obj || {});
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  for (const n of nomes) { const i = chaves.findIndex(k => norm(k) === norm(n)); if (i >= 0) return obj[chaves[i]]; }
  for (const n of nomes) { const i = chaves.findIndex(k => norm(k).includes(norm(n))); if (i >= 0) return obj[chaves[i]]; }
  return null;
};

// ── vFleets: um GET por dia (a API é agregada por dia; 1 req a cada 5 min) ──
// `kmCalculado=true` faz a API devolver o campo `km` já resolvido — sem ele o
// registro "sem motorista" do dia distorce a conta de km (seção "KM Inicial/
// Final e diferença entre KMs diários" do manual).
async function vfleetsDia(dia) {
  if (!VF_TOKEN) return { erro: 'VFLEETS_TOKEN ausente' };
  const r = await fetch(`${VF_URL}?dia=${dia}&kmCalculado=true`, { headers: { Authorization: VF_TOKEN } });
  if (r.status === 429) return { erro: '429 too many requests — a API aceita 1 chamada a cada 5 min' };
  if (!r.ok) return { erro: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const js = await r.json();
  const lista = Array.isArray(js) ? js : (js.dados || js.data || js.conducoes || []);
  return { lista };
}

// dias que a vFleets reprocessou no intervalo — o que já gravamos deles é velho
async function vfleetsReprocessados(de, ate) {
  if (!VF_TOKEN) return { erro: 'VFLEETS_TOKEN ausente' };
  const r = await fetch(`${VF_PROC}?inicio=${de}&fim=${ate}`, { headers: { Authorization: VF_TOKEN } });
  if (!r.ok) return { erro: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const js = await r.json();
  const lista = Array.isArray(js) ? js : (js.dados || js.data || []);
  const dias = [...new Set(lista.map(x => String(x.diaConducao || '').slice(0, 10)).filter(Boolean))].sort();
  return { dias };
}

// ── Geotab: JSON-RPC. Authenticate devolve credenciais válidas por ~2 semanas ─
async function geotabRpc(metodo, params, cred) {
  const r = await fetch(`https://${cred?.path && cred.path !== 'ThisServer' ? cred.path : GT_SERVER}/apiv1`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: metodo, params: cred ? { ...params, credentials: cred } : params }),
  });
  const js = await r.json();
  if (js.error) throw new Error(`${metodo}: ${js.error.message || JSON.stringify(js.error).slice(0, 200)}`);
  return js.result;
}
async function geotabLogin() {
  if (!GT_USER || !GT_PASS || !GT_DB) return null;
  const res = await geotabRpc('Authenticate', { userName: GT_USER, password: GT_PASS, database: GT_DB });
  return { ...res.credentials, path: res.path };
}

// ── sonda: mostra o que cada API entrega, sem gravar nada ───────────────────
function retrato(rot, lista) {
  console.log(`\n── ${rot}: ${lista.length} registro(s) ──`);
  if (!lista.length) return;
  const amostra = lista[0];
  const chaves = Object.keys(amostra);
  console.log(`campos (${chaves.length}):`);
  chaves.forEach(k => {
    const v = amostra[k];
    const tipo = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    // valor só para número/booleano — texto pode ser nome/CPF
    const mostra = (tipo === 'number' || tipo === 'boolean') ? ` = ${v}`
                 : (tipo === 'string') ? ` = «${String(v).length} chars»` : '';
    console.log(`   ${k.padEnd(34)} ${tipo}${mostra}`);
  });
  const faltando = Object.values(CAMPOS).filter(c => !(c in amostra));
  console.log(`\ncampos do manual ausentes na resposta (${faltando.length}): ${faltando.join(', ') || '—'}`);
  const ident = lista.filter(r => r.inicio && r.fim).length;
  console.log(`registros com motorista identificado: ${ident}/${lista.length}`);
  const d = derivaVF(lista.filter(r => r.inicio && r.fim));
  console.log('\npilares derivados (dia inteiro, todos os motoristas somados):');
  for (const [k, v] of Object.entries(d)) if (!k.startsWith('_')) console.log(`   ${k.padEnd(18)} ${v == null ? '—' : Math.round(v * 100) / 100}`);
}

// ── normalização ────────────────────────────────────────────────────────────
// A API devolve VÁRIOS registros por motorista no dia (um por identificação).
// Somamos os contadores e só então derivamos os percentuais — média de médias
// aqui daria peso igual a um trecho de 5 min e a um turno inteiro.
const S = (regs, campo) => regs.reduce((s, r) => s + (num(r[campo]) || 0), 0);
const div = (a, b) => (b > 0 ? (a / b) * 100 : null);

function derivaVF(regs) {
  const C = CAMPOS;
  // km: `km` vem em metros (mesma unidade de kmInicial/kmFinal); sem ele, a
  // diferença do hodômetro do próprio registro.
  const kmM = regs.reduce((s, r) => {
    const k = num(r[C.km]);
    if (k != null) return s + k;
    const a = num(r[C.kmInicial]), b = num(r[C.kmFinal]);
    return s + (a != null && b != null && b >= a ? b - a : 0);
  }, 0);
  const km = kmM / 1000;

  const tDir = S(regs, C.tempoDirecao), tMov = S(regs, C.tempoMovimento), tPar = S(regs, C.tempoParado);
  const ml = S(regs, C.rpmMarchaLentaTempo), av = S(regs, C.rpmAbaixoVerdeTempo);
  const ve = S(regs, C.rpmVerdeEconomicaTempo), vp = S(regs, C.rpmVerdePotenciaTempo);
  const am = S(regs, C.rpmAmareloTempo), vm = S(regs, C.rpmVermelhoTempo);
  const rpmRodando = av + ve + vp + am + vm;          // marcha lenta fica de fora: é o pilar idle

  const ocioso = S(regs, C.motorOciosoTempo) || ml;   // sem motorOcioso, a faixa de marcha lenta serve
  const baseIdle = tDir || (tMov + tPar);

  // velocidade: faixa 1 = até 20% acima, 2 = 20–30%, 3 = >30% → excesso maior pesa mais
  const via = [C.velocidadeViaFaixa1Tempo, C.velocidadeViaFaixa2Tempo, C.velocidadeViaFaixa3Tempo].map(c => S(regs, c));
  const cfg = [C.velocidadeFaixa1Tempo, C.velocidadeFaixa2Tempo, C.velocidadeFaixa3Tempo].map(c => S(regs, c));
  const f = via.some(v => v > 0) ? via : cfg;
  const velPond = f[0] + 2 * f[1] + 3 * f[2];

  return {
    km: km || null,
    h_motor: baseIdle ? baseIdle / 3600 : null,
    rpm_verde_pct:   div(ve + vp, rpmRodando),
    idle_pct:        div(ocioso, baseIdle),
    acel_100km:      km > 0 ? (S(regs, C.aceleracoesQtd) / km) * 100 : null,
    frea_100km:      km > 0 ? (S(regs, C.frenagensQtd) / km) * 100 : null,
    vel_excesso_pct: div(velPond, tMov),
    freio_motor_pct: div(S(regs, C.freioMotorTempo), tMov),
    banguela_pct:    div(S(regs, C.banguelaTempo), tMov),
    cambio_ruim_pct: div(S(regs, C.batendoTransmissaoTempo), tMov),
    registros: regs.length,
  };
}

// agrupa os registros do dia por motorista e devolve uma linha por pessoa
function normalizaVF(lista, dia) {
  const porMot = new Map();
  for (const reg of lista) {
    // inicio/fim nulos = período SEM motorista identificado (manual): não é de ninguém
    if (!reg.inicio || !reg.fim) continue;
    const mo = pega(reg, MOT_OBJ);
    const m = Array.isArray(mo) ? mo[0] : mo;
    if (!m) continue;
    const chave = String(m.cpf || m.cnh || m.documentoIdentificador || '').replace(/\D/g, '');
    if (!chave) continue;
    if (!porMot.has(chave)) porMot.set(chave, { nome: String(m.nome || '').trim(), uo: m.uo?.nome || null, regs: [] });
    porMot.get(chave).regs.push(reg);
  }
  return [...porMot.entries()].map(([chave, g]) => {
    // guarda os SOMATÓRIOS crus (segundos e contagens) para auditoria — dá para
    // refazer qualquer conta sem voltar à API, e ocupa uma fração do JSON inteiro
    const soma = {};
    for (const c of Object.values(CAMPOS)) { const v = S(g.regs, c); if (v) soma[c] = v; }
    return {
      dia, chave, fonte: 'vFleets', ...derivaVF(g.regs),
      bruto: { uo: g.uo, soma },
      _nome: g.nome || chave, _uo: g.uo,
    };
  });
}

async function gravaDiario(linhas) {
  if (!linhas.length) return 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500).map(({ _nome, _uo, ...l }) => l);
    const r = await fetch(`${SB_URL}/rest/v1/ce_diario?on_conflict=dia,chave`, {
      method: 'POST', headers: { ...H_SB, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(lote),
    });
    if (!r.ok) throw new Error(`ce_diario: ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
  return linhas.length;
}

async function garanteMotoristas(linhas) {
  const vistos = new Map();
  linhas.forEach(l => { if (l.chave && !vistos.has(l.chave)) vistos.set(l.chave, { chave: l.chave, nome: l._nome || l.chave, fonte: l.fonte }); });
  // unidade fica NULA de propósito: o de-para UO → unidade do portal é do Renan.
  // O robô não inventa unidade — quem entra sem unidade aparece no resumo abaixo.
  if (!vistos.size) return;
  const r = await fetch(`${SB_URL}/rest/v1/ce_motoristas?on_conflict=chave`, {
    method: 'POST', headers: { ...H_SB, Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify([...vistos.values()]),
  });
  if (!r.ok) console.log('ce_motoristas:', r.status, (await r.text()).slice(0, 200));
}

// mensal = média dos dias ponderada por km (quem rodou mais pesa mais)
async function recalculaMes(de, ate) {
  const q = `${SB_URL}/rest/v1/ce_diario?select=*&dia=gte.${de}&dia=lte.${ate}`;
  const r = await fetch(q, { headers: H_SB });
  if (!r.ok) throw new Error(`ce_diario select: ${r.status}`);
  const dias = await r.json();

  const rm = await fetch(`${SB_URL}/rest/v1/ce_motoristas?select=chave,nome,unidade,fonte`, { headers: H_SB });
  const cad = new Map((await rm.json() || []).map(m => [m.chave, m]));

  const grupos = new Map();
  dias.forEach(d => {
    const comp = d.dia.slice(0, 8) + '01';
    const k = comp + '|' + d.chave;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(d);
  });

  const linhas = [];
  for (const [k, ds] of grupos) {
    const [competencia, chave] = k.split('|');
    const m = cad.get(chave) || {};
    const pond = campo => {
      let n = 0, p = 0;
      ds.forEach(d => { const v = d[campo]; if (v == null) return; const w = (+d.km > 0 ? +d.km : 1); n += v * w; p += w; });
      return p ? n / p : null;
    };
    const notas = {
      rpm:    nota('rpm',    pond('rpm_verde_pct')),
      idle:   nota('idle',   pond('idle_pct')),
      acel:   nota('acel',   pond('acel_100km')),
      frea:   nota('frea',   pond('frea_100km')),
      vel:    nota('vel',    pond('vel_excesso_pct')),
      // o painel descreve este pilar como "% de uso de freio motor nas
      // desacelerações, PENALIZADO por tempo de banguela" — desconto 1:1,
      // calibrável quando o Renan olhar a distribuição real.
      freio:  (() => {
        const fm = pond('freio_motor_pct'); if (fm == null) return null;
        return nota('freio', Math.max(0, fm - (pond('banguela_pct') || 0)));
      })(),
      cambio: nota('cambio', pond('cambio_ruim_pct')),
    };
    linhas.push({
      competencia, chave, motorista: m.nome || chave, unidade: m.unidade || null,
      fonte: m.fonte || ds[0].fonte, km: ds.reduce((s, d) => s + (+d.km || 0), 0), dias: ds.length,
      rpm_pontos: notas.rpm, idle_pontos: notas.idle, acel_pontos: notas.acel, frea_pontos: notas.frea,
      vel_pontos: notas.vel, freio_pontos: notas.freio, cambio_pontos: notas.cambio,
      pontuacao: score(notas), atualizado_em: new Date().toISOString(),
    });
  }
  if (linhas.length) {
    const r2 = await fetch(`${SB_URL}/rest/v1/ce_scores_mensais?on_conflict=competencia,chave`, {
      method: 'POST', headers: { ...H_SB, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(linhas),
    });
    if (!r2.ok) throw new Error(`ce_scores_mensais: ${r2.status} ${(await r2.text()).slice(0, 300)}`);
  }
  return linhas.length;
}

// ── main ────────────────────────────────────────────────────────────────────
const hoje = new Date();
const ontem = new Date(hoje.getTime() - 864e5);
const DE  = process.env.CE_DE  || iso(ontem);
const ATE = process.env.CE_ATE || DE;

console.log(`modo=${MODE} · período ${DE} → ${ATE}`);
console.log(`fontes: vFleets=${VF_TOKEN ? 'com token' : 'SEM TOKEN'} · Geotab=${GT_USER ? 'com usuário' : 'SEM CREDENCIAL'}`);

if (MODE === 'sonda') {
  const { lista, erro } = await vfleetsDia(DE);
  if (erro) console.log('vFleets:', erro);
  else retrato('vFleets · ' + DE, lista);

  try {
    const cred = await geotabLogin();
    if (!cred) console.log('\nGeotab: sem credencial (GEOTAB_USER/PASS/DB)');
    else {
      const drv = await geotabRpc('Get', { typeName: 'User', search: { isDriver: true }, resultsLimit: 5 }, cred);
      console.log(`\n── Geotab: login OK · ${drv.length} motorista(s) na amostra ──`);
      const ex = await geotabRpc('Get', { typeName: 'ExceptionEvent',
        search: { fromDate: `${DE}T00:00:00Z`, toDate: `${DE}T23:59:59Z` }, resultsLimit: 3 }, cred);
      console.log(`ExceptionEvent no dia: ${ex.length} (amostra)`);
      if (ex[0]) console.log('campos:', Object.keys(ex[0]).join(', '));
    }
  } catch (e) { console.log('\nGeotab:', e.message); }
  console.log('\nSonda encerrada — nada foi gravado.');
  process.exit(0);
}

if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }

if (MODE === 'recalc') {
  const n = await recalculaMes(DE, ATE);
  console.log(`recalculado: ${n} linha(s) em ce_scores_mensais`);
  process.exit(0);
}

// que dias coletar
let AGENDA = [];
if (MODE === 'reproc') {
  const { dias, erro } = await vfleetsReprocessados(DE, ATE);
  if (erro) { console.error('processamentos:', erro); process.exit(1); }
  AGENDA = dias;
  console.log(`a vFleets reprocessou ${dias.length} dia(s) no período: ${dias.join(', ') || '—'}`);
  if (!dias.length) process.exit(0);
  await new Promise(r => setTimeout(r, PAUSA));   // a consulta acima já gastou a janela
} else {
  for (let d = new Date(DE + 'T12:00:00Z'); iso(d) <= ATE; d.setDate(d.getDate() + 1)) AGENDA.push(iso(d));
}

let total = 0, falhas = 0, semUnidade = new Set();
for (let i = 0; i < AGENDA.length; i++) {
  const dia = AGENDA[i];
  try {
    const { lista, erro } = await vfleetsDia(dia);
    if (erro) { console.log(`${dia} vFleets: ${erro}`); falhas++; }
    else {
      const linhas = normalizaVF(lista, dia);
      await garanteMotoristas(linhas);
      total += await gravaDiario(linhas);
      const km = Math.round(linhas.reduce((s, l) => s + (+l.km || 0), 0));
      console.log(`${dia}: ${lista.length} registro(s) → ${linhas.length} motorista(s) · ${km} km`
        + (linhas[0] ? ` · ex.: ${mask(linhas[0].chave)}` : ''));
      linhas.forEach(l => { if (l._uo) semUnidade.add(l._uo); });
    }
  } catch (e) { console.log(`${dia}: ${e.message}`); falhas++; }
  if (i < AGENDA.length - 1) await new Promise(r => setTimeout(r, PAUSA));   // 1 req / 5 min
}
const n = await recalculaMes(DE.slice(0, 8) + '01', ATE);
console.log(`\ngravado: ${total} linha(s) diárias · mensal: ${n} linha(s)` + (falhas ? ` · ${falhas} dia(s) com falha` : ''));
if (semUnidade.size) console.log(`UOs vistas na vFleets (falta o de-para p/ unidade do portal): ${[...semUnidade].join(' · ')}`);
if (falhas && !total) process.exit(1);
