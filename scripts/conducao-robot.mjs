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
//   ident    relatório de IDENTIFICAÇÃO de motorista por unidade e por placa
//            (quem rodou identificado e quem não), sem gravar nada. Período:
//            CE_DE/CE_ATE; sem eles, os últimos 7 dias.
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
const GT_USER   = process.env.GEOTAB_USER, GT_PASS = process.env.GEOTAB_PASS;
// database do MyGeotab. O acesso é pela conta Argus/Ambev (Renan, 26/08/2026):
// a credencial é o próprio login do MyGeotab, sem token à parte.
const GT_DB     = process.env.GEOTAB_DB || 'ambev';
const GT_SERVER = process.env.GEOTAB_SERVER || 'my.geotab.com';

// ── régua de pontos: a MESMA que o painel já usa (o `fmt` de cada pilar é o
// caminho inverso desta conta). Os limites são o valor da métrica que zera o
// pilar — é aqui que se calibra quando o Renan fechar a régua com dados reais.
const REGUA = {
  rpm:    { direto: true },                    // % na faixa verde já é a nota
  freio:  { direto: true },                    // % de uso de freio motor idem
  idle:   { zeraEm: 25 },                      // 25% do tempo em marcha lenta → 0
  acel:   { zeraEm: 100 / 6 },                 // ~16,7 acelerações bruscas/100km → 0
  vel:    { zeraEm: 20 },                      // 20% do tempo acima do limite → 0
  cambio: { zeraEm: 100 / 6 },                 // ~16,7% do tempo com marcha ruim → 0
};
// Freada brusca NÃO pontua (Renan, 26/08/2026): mede condução SEGURA, não
// econômica — fica para a Fase 4. `frea_100km` continua sendo calculado e
// gravado no ce_diario, para o dado não se perder; ele só não entra no score.
// Os pesos somam 90 e o score normaliza pela soma dos presentes (escala 0-100).
// Freio Motor também saiu do score (Renan, 01/09/2026): não existe no
// Geotab (varredura completa dos diagnósticos) — o freio_pontos continua
// sendo calculado e gravado quando a vFleets entrar, só não pontua.
const PESOS = { rpm: 25, idle: 20, acel: 15, vel: 15, cambio: 5 };

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

/* ── Geotab: o que dá para extrair ──────────────────────────────────────────
   `Trip` já vem agregado por viagem e traz quase tudo de que precisamos:
     distance (km) · drivingDuration · idlingDuration · speedRange1/2/3Duration
   Aceleração e freada bruscas NÃO são propriedade da viagem: são regras, e
   chegam como `ExceptionEvent`. Isso significa que **se a regra estiver
   desligada na conta, o evento não existe** — e o pilar fica vazio sem erro
   nenhum. A sonda lista as regras da conta justamente para conferir isso.
   RPM em faixa verde não existe pronto no Geotab (precisaria varrer StatusData
   do diagnóstico de rotação, amostra a amostra); fica nulo, e o painel
   redistribui o peso do pilar ausente — mesmo caminho de freio motor e câmbio,
   que também não existem lá.                                                */

// timespan do Geotab: "HH:MM:SS.fff" ou "d.HH:MM:SS" → segundos
function gtSeg(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const t = String(v); let dias = 0, resto = t;
  const p = t.split('.');
  if (p.length > 1 && p[0].indexOf(':') < 0) { dias = +p[0] || 0; resto = p.slice(1).join('.'); }
  const [h = 0, m = 0, s = 0] = resto.split(':').map(Number);
  return dias * 86400 + (+h || 0) * 3600 + (+m || 0) * 60 + Math.floor(+s || 0);
}
// as regras de aceleração/freada/velocidade: id de sistema ou nome da regra
const GT_REGRA = {
  acel: { ids: ['RuleHarshAccelerationId'], nome: /harsh.?accel|acelera/i },
  frea: { ids: ['RuleHarshBrakingId'],      nome: /harsh.?brak|frena|freada/i },
  vel:  { ids: ['RuleSpeedingId'],          nome: /speeding|velocidade/i },
};
const gtQualRegra = (ruleId, ruleNome) => {
  for (const [k, r] of Object.entries(GT_REGRA)) {
    if (r.ids.includes(ruleId)) return k;
    if (ruleNome && r.nome.test(ruleNome)) return k;
  }
  return null;
};
// chave do motorista: o CPF/CNH do cadastro, quando houver — é o que permite
// casar a mesma pessoa entre Geotab e vFleets. Sem isso, o id do Geotab.
function gtChave(u) {
  const doc = String(u?.licenseNumber || u?.employeeNo || '').replace(/\D/g, '');
  return doc.length >= 9 ? doc : 'gt:' + (u?.id || '');
}
// unidade do motorista = grupo UNI_* do cadastro dele no Geotab (a sonda de
// 01/09/2026 mediu: 1308/1308 têm, via companyGroups) — dado real, não de-para
let GT_GNOME = new Map();   // id do grupo → nome (preenchido no login do run)
function gtUni(u) {
  for (const campo of ['companyGroups', 'driverGroups']) {
    const hit = (u?.[campo] || []).map(g => GT_GNOME.get(g.id) || '').find(n => /^UNI_/.test(n));
    if (hit) return hit.replace(/^UNI_/, '');
  }
  return null;
}

/* ── RPM · faixa verde reconstruída das amostras cruas do Geotab ────────────
   Régua baseada nas fichas técnicas dos motores da frota e na literatura de
   direção econômica (pesquisa de 01/09/2026, fontes no PR):
   · VW Delivery 9.170/11.180 (Cummins ISF 3.8): platô de 600 Nm em
     1.100–1.700 rpm — é a região de consumo específico (BSFC) mínimo
   · VW Constellation 17.190 (Cummins ISB): 700 Nm em 1.100–1.600 rpm
   · consultores/manuais de condução econômica: rodar em marcha alta entre
     ~1.100 e 1.700 rpm; marcha lenta de diesel pesado fica em ~700–800 rpm
   FAIXA VERDE ÚNICA da frota: 1.100–1.700 rpm. Marcha lenta (≤ 900) fica
   FORA do denominador — a MESMA régua da vFleets, para os dois lados serem
   comparáveis quando a Trimble entrar. Calibragem por env:
   CE_RPM_VERDE="1100-1700" · CE_RPM_LENTA=900 · CE_RPM=0 desliga a coleta. */
const RPM_LENTA = +process.env.CE_RPM_LENTA || 900;
const [RPM_V_MIN, RPM_V_MAX] = String(process.env.CE_RPM_VERDE || '1100-1700').split('-').map(Number);
const RPM_GAP_MS = 120 * 1000;   // buraco entre amostras > 2 min não conta tempo

// baixa TODAS as amostras de rotação do dia, paginando pela data da última
async function geotabRpmDia(dia, cred) {
  const de0 = `${dia}T03:00:00.000Z`;
  const fim = new Date(new Date(de0).getTime() + 864e5 - 1).toISOString();
  const porDev = new Map();
  let from = de0, paginas = 0, total = 0;
  while (paginas < 40) {                       // teto de segurança: 2 mi de amostras
    const lote = await geotabRpc('Get', { typeName: 'StatusData',
      search: { diagnosticSearch: { id: 'DiagnosticEngineSpeedId' }, fromDate: from, toDate: fim },
      resultsLimit: 50000 }, cred);
    paginas++; total += lote.length;
    for (const r of lote) {
      const id = r.device && r.device.id; if (!id) continue;
      let a = porDev.get(id); if (!a) { a = []; porDev.set(id, a); }
      a.push({ t: new Date(r.dateTime).getTime(), rpm: +r.data });
    }
    if (lote.length < 50000) break;
    from = new Date(new Date(lote[lote.length - 1].dateTime).getTime() + 1).toISOString();
  }
  porDev.forEach(a => a.sort((x, y) => x.t - y.t));
  return { porDev, total, paginas };
}
// tempo na faixa verde e tempo rodando (rpm > marcha lenta) numa janela.
// Cada amostra vale até a próxima (com teto de RPM_GAP_MS, p/ buraco de sinal).
function rpmJanela(amostras, ini, fim) {
  let verde = 0, rodando = 0;
  for (let i = 0; i < amostras.length; i++) {
    const a = amostras[i];
    if (a.t > fim) break;
    const prox = i + 1 < amostras.length ? amostras[i + 1].t : a.t + 1000;
    const t0 = Math.max(a.t, ini), t1 = Math.min(prox, fim, a.t + RPM_GAP_MS);
    if (t1 <= t0) continue;
    if (!isFinite(a.rpm) || a.rpm <= RPM_LENTA) continue;   // marcha lenta fora do denominador
    const dt = (t1 - t0) / 1000;
    rodando += dt;
    if (a.rpm >= RPM_V_MIN && a.rpm <= RPM_V_MAX) verde += dt;
  }
  return { verde, rodando };
}

async function geotabDia(dia, cred, cacheUsuarios, regras, uniPorDev, rpmPorDev) {
  // a janela é o dia em BRT (UTC-3), não em UTC
  const de = `${dia}T03:00:00.000Z`;
  const ate = new Date(new Date(de).getTime() + 864e5 - 1).toISOString();
  const [trips, excs] = await Promise.all([
    geotabRpc('Get', { typeName: 'Trip', search: { fromDate: de, toDate: ate } }, cred),
    geotabRpc('Get', { typeName: 'ExceptionEvent', search: { fromDate: de, toDate: ate } }, cred),
  ]);

  // eventos por motorista; quando o evento não traz motorista, cai no device
  const nomeRegra = id => (regras.get(id) || '');
  const porDrv = new Map(), porDev = [];
  for (const e of excs) {
    const qual = gtQualRegra(e.rule?.id, nomeRegra(e.rule?.id));
    if (!qual) continue;
    const d = e.driver?.id;
    if (d && d !== 'NoDriverId' && d !== 'UnknownDriverId') {
      const m = porDrv.get(d) || { acel: 0, frea: 0, vel: 0 };
      m[qual]++; porDrv.set(d, m);
    } else if (e.device?.id) {
      porDev.push({ dev: e.device.id, t: new Date(e.activeFrom).getTime(), qual });
    }
  }

  const porMot = new Map(), semLogin = new Map();
  for (const t of trips) {
    const d = t.driver?.id;
    if (!d || d === 'NoDriverId' || d === 'UnknownDriverId') {
      // viagem sem identificação vira a linha "Sem Login" da UNIDADE do
      // veículo (Renan, 31/08/2026) — o km não some, aparece cobrado no ranking
      const uni = uniPorDev && uniPorDev.get(t.device?.id);
      if (uni) {
        const g = semLogin.get(uni) || { km: 0, dir: 0, idle: 0, v1: 0, v2: 0, v3: 0, n: 0, rpmV: 0, rpmR: 0 };
        g.km += +t.distance || 0; g.dir += gtSeg(t.drivingDuration); g.idle += gtSeg(t.idlingDuration);
        g.v1 += gtSeg(t.speedRange1Duration); g.v2 += gtSeg(t.speedRange2Duration); g.v3 += gtSeg(t.speedRange3Duration);
        g.n++;
        const am = rpmPorDev && rpmPorDev.get(t.device?.id);
        if (am) { const j = rpmJanela(am, new Date(t.start).getTime(), new Date(t.stop).getTime());
                  g.rpmV += j.verde; g.rpmR += j.rodando; }
        semLogin.set(uni, g);
      }
      continue;
    }
    const g = porMot.get(d) || { km: 0, dir: 0, idle: 0, v1: 0, v2: 0, v3: 0, acel: 0, frea: 0, vel: 0, n: 0 };
    g.km   += +t.distance || 0;
    g.dir  += gtSeg(t.drivingDuration);
    g.idle += gtSeg(t.idlingDuration);
    g.v1   += gtSeg(t.speedRange1Duration);
    g.v2   += gtSeg(t.speedRange2Duration);
    g.v3   += gtSeg(t.speedRange3Duration);
    g.n++;
    // eventos órfãos do mesmo veículo dentro da janela da viagem
    const ini = new Date(t.start).getTime(), fim = new Date(t.stop).getTime();
    porDev.forEach(x => { if (x.dev === t.device?.id && x.t >= ini && x.t <= fim && !x.usado) { g[x.qual]++; x.usado = true; } });
    const am = rpmPorDev && rpmPorDev.get(t.device?.id);
    if (am) { const j = rpmJanela(am, ini, fim); g.rpmV = (g.rpmV || 0) + j.verde; g.rpmR = (g.rpmR || 0) + j.rodando; }
    porMot.set(d, g);
  }
  for (const [d, m] of porDrv) {
    const g = porMot.get(d); if (!g) continue;
    g.acel += m.acel; g.frea += m.frea; g.vel += m.vel;
  }

  // nome e chave dos motoristas que apareceram
  const faltam = [...porMot.keys()].filter(id => !cacheUsuarios.has(id));
  if (faltam.length) {
    const us = await geotabRpc('Get', { typeName: 'User', search: { isDriver: true } }, cred);
    us.forEach(u => cacheUsuarios.set(u.id, u));
  }

  const linhas = [...porMot.entries()].map(([id, g]) => {
    const u = cacheUsuarios.get(id) || { id };
    const tMov = g.dir || null;
    return {
      dia, chave: gtChave(u), fonte: 'Geotab',
      km: g.km || null,
      h_motor: (g.dir + g.idle) ? (g.dir + g.idle) / 3600 : null,
      // reconstruída das amostras cruas; menos de 1 min rodando não vale nota
      rpm_verde_pct: (g.rpmR || 0) > 60 ? g.rpmV / g.rpmR * 100 : null,
      idle_pct: (g.dir + g.idle) ? g.idle / (g.dir + g.idle) * 100 : null,
      acel_100km: g.km > 0 ? g.acel / g.km * 100 : null,
      frea_100km: g.km > 0 ? g.frea / g.km * 100 : null,
      vel_excesso_pct: tMov ? (g.v1 + 2 * g.v2 + 3 * g.v3) / tMov * 100 : null,
      freio_motor_pct: null, banguela_pct: null, cambio_ruim_pct: null,   // não existem no Geotab
      registros: g.n,
      bruto: { viagens: g.n, seg: { dir: g.dir, idle: g.idle, v1: g.v1, v2: g.v2, v3: g.v3 },
               rpm: { verde: Math.round(g.rpmV || 0), rodando: Math.round(g.rpmR || 0) },
               eventos: { acel: g.acel, frea: g.frea, vel: g.vel } },
      _nome: (u.firstName || u.lastName) ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : (u.name || id),
      _uo: null, _uni: gtUni(u),
    };
  });
  // a linha "Sem Login" de cada unidade: km/idle/velocidade saem das próprias
  // viagens; eventos de aceleração não são atribuídos (não há a quem)
  for (const [uni, g] of semLogin) {
    const tMov = g.dir || null;
    linhas.push({
      dia, chave: 'semlogin:' + uni, fonte: 'Geotab',
      km: g.km || null,
      h_motor: (g.dir + g.idle) ? (g.dir + g.idle) / 3600 : null,
      rpm_verde_pct: (g.rpmR || 0) > 60 ? g.rpmV / g.rpmR * 100 : null,
      idle_pct: (g.dir + g.idle) ? g.idle / (g.dir + g.idle) * 100 : null,
      acel_100km: null, frea_100km: null,
      vel_excesso_pct: tMov ? (g.v1 + 2 * g.v2 + 3 * g.v3) / tMov * 100 : null,
      freio_motor_pct: null, banguela_pct: null, cambio_ruim_pct: null,
      registros: g.n,
      bruto: { semLogin: true, viagens: g.n, seg: { dir: g.dir, idle: g.idle, v1: g.v1, v2: g.v2, v3: g.v3 },
               rpm: { verde: Math.round(g.rpmV || 0), rodando: Math.round(g.rpmR || 0) } },
      _nome: 'Sem Login · ' + uni, _uo: null, _uni: uni,
    });
  }
  return linhas;
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
    // os campos _* são metadados do robô (nome, uo, unidade do Sem Login) e
    // NÃO são colunas — uma chave a mais num lote misto derruba o upsert
    // inteiro com PGRST102 "All object keys must match" (bug real, 31/08/2026)
    const lote = linhas.slice(i, i + 500).map(({ _nome, _uo, _uni, ...l }) => l);
    const r = await fetch(`${SB_URL}/rest/v1/ce_diario?on_conflict=dia,chave`, {
      method: 'POST', headers: { ...H_SB, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(lote),
    });
    if (!r.ok) throw new Error(`ce_diario: ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
  return linhas.length;
}

async function garanteMotoristas(linhas) {
  const vistos = new Map();
  // a unidade vem do PRÓPRIO Geotab: motorista pelo grupo UNI_* do cadastro
  // dele (1308/1308 têm — sonda 01/09/2026), Sem Login pelo grupo do veículo.
  // merge-duplicates ATUALIZA quem já existia com unidade nula.
  linhas.forEach(l => { if (l.chave && !vistos.has(l.chave))
    vistos.set(l.chave, { chave: l.chave, nome: l._nome || l.chave, fonte: l.fonte, unidade: l._uni || null }); });
  if (!vistos.size) return;
  const r = await fetch(`${SB_URL}/rest/v1/ce_motoristas?on_conflict=chave`, {
    method: 'POST', headers: { ...H_SB, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([...vistos.values()]),
  });
  if (!r.ok) console.log('ce_motoristas:', r.status, (await r.text()).slice(0, 200));
}

// PostgREST devolve no máximo 1.000 linhas por chamada. Com o ano inteiro em
// ce_diario (237 dias × N motoristas) isso corta o mensal em silêncio — daí a
// paginação por Range.
async function sbTodos(caminho) {
  const out = []; const PASSO = 1000;
  for (let de = 0; ; de += PASSO) {
    const r = await fetch(`${SB_URL}/rest/v1/${caminho}`, {
      headers: { ...H_SB, Range: `${de}-${de + PASSO - 1}` } });
    if (!r.ok) throw new Error(`${caminho}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const lote = await r.json();
    out.push(...lote);
    if (lote.length < PASSO) return out;
  }
}
// dias JÁ gravados no intervalo — é o que permite retomar um backfill.
// O dia só conta como pronto quando TODAS as fontes ligadas já gravaram nele:
// senão, ligar o Geotab depois de um backfill de vFleets nunca coletaria nada,
// porque os dias "já existiriam".
async function diasGravados(de, ate, fontes) {
  const linhas = await sbTodos(`ce_diario?select=dia,fonte&dia=gte.${de}&dia=lte.${ate}`);
  const por = new Map();
  linhas.forEach(l => {
    const d = String(l.dia).slice(0, 10);
    (por.get(d) || por.set(d, new Set()).get(d)).add(l.fonte);
  });
  return new Set([...por].filter(([, fs]) => fontes.every(f => fs.has(f))).map(([d]) => d));
}

// mensal = média dos dias ponderada por km (quem rodou mais pesa mais)
async function recalculaMes(de, ate) {
  const dias = await sbTodos(`ce_diario?select=*&dia=gte.${de}&dia=lte.${ate}`);
  const cad = new Map((await sbTodos('ce_motoristas?select=chave,nome,unidade,fonte')).map(m => [m.chave, m]));

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
      rpm_pontos: notas.rpm, idle_pontos: notas.idle, acel_pontos: notas.acel, frea_pontos: null,
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
// modo `ano`: 1º de janeiro do ano corrente até ontem — é o recorte que o
// painel usa (Renan, 25/08/2026: "janeiro até hoje sempre").
const ANO = MODE === 'ano';
const DE  = process.env.CE_DE  || (ANO ? iso(ontem).slice(0, 4) + '-01-01' : iso(ontem));
const ATE = process.env.CE_ATE || iso(ontem);
// teto de execução: o job do Actions morre em 6h. O robô para antes, avisa
// quantos dias faltam e o próximo disparo continua de onde parou (os dias já
// gravados são pulados). 237 dias × 5 min = ~20h, então o ano leva 4 rodadas.
const LIMITE_MS = (+process.env.CE_LIMITE_MIN || 300) * 60 * 1000;
const T0 = Date.now();

console.log(`modo=${MODE} · período ${DE} → ${ATE}`);
console.log(`fontes: vFleets=${VF_TOKEN ? 'com token' : 'SEM TOKEN'} · Geotab=${GT_USER ? 'com usuário' : 'SEM CREDENCIAL'}`);

if (MODE === 'sonda') {
  const { lista, erro } = await vfleetsDia(DE);
  if (erro) console.log('vFleets:', erro);
  else retrato('vFleets · ' + DE, lista);

  try {
    const cred = await geotabLogin();
    if (!cred) console.log(`\nGeotab: sem credencial (GEOTAB_USER/PASS — database=${GT_DB})`);
    else {
      const drv = await geotabRpc('Get', { typeName: 'User', search: { isDriver: true } }, cred);
      console.log(`\n── Geotab (db=${GT_DB}): login OK · ${drv.length} motorista(s) cadastrado(s) ──`);
      const comDoc = drv.filter(u => !gtChave(u).startsWith('gt:')).length;
      console.log(`com CPF/CNH no cadastro (dá para casar com a vFleets): ${comDoc}/${drv.length}`);

      // o motorista pertence a grupos UNI_* como os veículos? Se sim, a
      // unidade do painel sai daqui, sem de-para manual. Só contagens.
      try {
        const gs2 = await geotabRpc('Get', { typeName: 'Group' }, cred);
        const gn = new Map(gs2.map(g => [g.id, g.name || '']));
        const uniDe = u => {
          for (const campo of ['companyGroups', 'driverGroups', 'securityGroups']) {
            const hit = (u[campo] || []).map(g => gn.get(g.id) || '').find(n => /^UNI_/.test(n));
            if (hit) return { campo, uni: hit };
          }
          return null;
        };
        const porUni = new Map(); let semUni = 0; const campos = new Map();
        drv.forEach(u => { const r = uniDe(u);
          if (!r) { semUni++; return; }
          porUni.set(r.uni, (porUni.get(r.uni) || 0) + 1);
          campos.set(r.campo, (campos.get(r.campo) || 0) + 1); });
        console.log(`motoristas com grupo UNI_*: ${drv.length - semUni}/${drv.length}`
          + (campos.size ? ` (campo: ${[...campos].map(([c, n]) => c + '=' + n).join(', ')})` : ''));
        [...porUni.entries()].sort((a, b) => b[1] - a[1])
          .forEach(([u, n]) => console.log(`   ${u.padEnd(24)} ${n} motorista(s)`));
      } catch (e) { console.log('grupos dos motoristas:', e.message.slice(0, 160)); }

      // Câmbio e freio motor existem em algum diagnóstico? (Renan, 01/09/2026)
      // Varre o catálogo de Diagnostic por retarder/freio/transmissão/marcha e
      // conta StatusData de um dia nos candidatos — só nomes e contagens.
      try {
        const diags = await geotabRpc('Get', { typeName: 'Diagnostic' }, cred);
        const alvo = diags.filter(d => /retarder|freio|brake|transmiss|gear|marcha|clutch|embreag|shift/i.test(d.name || ''));
        console.log(`diagnósticos no catálogo: ${diags.length} · candidatos a câmbio/freio motor: ${alvo.length}`);
        const de4 = `${DE}T03:00:00.000Z`, ate4 = new Date(new Date(de4).getTime() + 864e5 - 1).toISOString();
        // CE_DIAG_LIM=99999 varre TODOS os candidatos (~3.500 ≈ 15 min);
        // sem env, testa só os 25 primeiros para a sonda continuar rápida
        const lim = +process.env.CE_DIAG_LIM || 25;
        let vistos = 0, hits = 0;
        for (const d of alvo.slice(0, lim)) {
          try {
            const am = await geotabRpc('Get', { typeName: 'StatusData',
              search: { diagnosticSearch: { id: d.id }, fromDate: de4, toDate: ate4 }, resultsLimit: 2000 }, cred);
            if (am.length) { hits++;
              console.log(`   ✓ ${String(d.name).slice(0, 70).padEnd(70)} ${am.length}${am.length >= 2000 ? '+' : ''} amostra(s) no dia`); }
          } catch (e) { /* diagnóstico sem dado não interessa */ }
          if (++vistos % 500 === 0) console.log(`   … ${vistos}/${Math.min(alvo.length, lim)} candidatos varridos`);
        }
        console.log(`   varridos ${vistos} candidato(s) · ${hits} com amostra no dia`);
      } catch (e) { console.log('catálogo de diagnósticos:', e.message.slice(0, 160)); }

      // RPM: o Geotab guarda o giro como StatusData do diagnóstico de rotação.
      // Medir o VOLUME de um dia diz se dá para reconstruir a faixa verde.
      try {
        const de3 = `${DE}T03:00:00.000Z`, ate3 = new Date(new Date(de3).getTime() + 864e5 - 1).toISOString();
        const rpm = await geotabRpc('Get', { typeName: 'StatusData',
          search: { diagnosticSearch: { id: 'DiagnosticEngineSpeedId' }, fromDate: de3, toDate: ate3 },
          resultsLimit: 50000 }, cred);
        const devsRpm = new Set(rpm.map(r => r.device && r.device.id).filter(Boolean));
        const vals = rpm.map(r => +r.data).filter(v => isFinite(v) && v > 0);
        console.log(`RPM (StatusData DiagnosticEngineSpeedId, ${DE}): ${rpm.length} amostra(s)`
          + (rpm.length >= 50000 ? ' [CORTOU no limite de 50k — o dia inteiro tem mais]' : '')
          + ` · ${devsRpm.size} veículo(s)`
          + (vals.length ? ` · faixa ${Math.round(Math.min(...vals))}–${Math.round(Math.max(...vals))} rpm` : ''));
      } catch (e) { console.log('RPM StatusData:', e.message.slice(0, 200)); }

      // as regras da conta decidem se aceleração/freada existem
      const regras = await geotabRpc('Get', { typeName: 'Rule' }, cred);
      const achadas = { acel: [], frea: [], vel: [] };
      regras.forEach(r => { const q = gtQualRegra(r.id, r.name); if (q) achadas[q].push(`${r.name}${r.activeFrom ? '' : ''}`); });
      console.log(`regras na conta: ${regras.length}`);
      for (const [k, v] of Object.entries(achadas))
        console.log(`   ${k.padEnd(5)} ${v.length ? '✓ ' + v.join(' · ') : '· NENHUMA regra casou — o pilar ficará vazio'}`);

      // ── diagnóstico: de onde vem (ou não vem) o dado ──────────────────
      // Só CONTAGENS e nomes de GRUPO — o repositório é público, nada de
      // nome de pessoa.
      console.log('servidor em uso:', cred.path || GT_SERVER);
      try {
        const v = await geotabRpc('GetVersion', {}, cred);
        console.log('versão do MyGeotab:', v);
      } catch (e) { console.log('GetVersion:', e.message); }

      // o usuário tem acesso a mais de um database? Authenticate SEM database
      // devolve a lista na mensagem de erro — é a forma de descobrir.
      try {
        const r = await geotabRpc('Authenticate', { userName: GT_USER, password: GT_PASS });
        console.log('databases disponíveis:', JSON.stringify(r).slice(0, 300));
      } catch (e) { console.log('databases (via erro do Authenticate):', e.message.slice(0, 300)); }

      // escopo do próprio usuário: é ele que filtra veículo, viagem e evento
      try {
        const [eu] = await geotabRpc('Get', { typeName: 'User', search: { name: GT_USER } }, cred);
        if (eu) {
          const nomes = async ids => {
            if (!ids || !ids.length) return '(nenhum)';
            const gs = await geotabRpc('Get', { typeName: 'Group', search: { id: ids[0].id } }, cred).catch(() => []);
            return ids.map(g => g.id).join(', ') + (gs[0] ? ` [${gs[0].name}]` : '');
          };
          console.log('grupos de DADOS do usuário:', await nomes(eu.companyGroups));
          console.log('grupos de segurança:', (eu.securityGroups || []).map(g => g.id).join(', ') || '(nenhum)');
        }
      } catch (e) { console.log('escopo do usuário:', e.message.slice(0, 200)); }

      const grupos = await geotabRpc('Get', { typeName: 'Group' }, cred).catch(() => []);
      console.log(`grupos visíveis: ${grupos.length}` + (grupos.length ? ' · ex.: ' + grupos.slice(0,8).map(g=>g.name).filter(Boolean).join(' · ') : ''));

      const todos = await geotabRpc('Get', { typeName: 'User' }, cred);
      const devs  = await geotabRpc('Get', { typeName: 'Device' }, cred);
      console.log(`usuários no total: ${todos.length} · veículos: ${devs.length}`);

      // Escopo de dados OK mas Device vazio aponta para CLEARANCE (permissão de
      // funcionalidade), não para grupo. Aqui separamos uma coisa da outra.
      try {
        const [eu2] = await geotabRpc('Get', { typeName: 'User', search: { name: GT_USER } }, cred);
        for (const sg of (eu2?.securityGroups || [])) {
          const [g] = await geotabRpc('Get', { typeName: 'Group', search: { id: sg.id } }, cred).catch(() => []);
          console.log(`clearance: ${sg.id}${g ? ' — ' + (g.name || g.comments || '') : ''}`);
        }
        // buscar Device DENTRO de cada grupo de dados, um a um
        for (const g of (eu2?.companyGroups || []).slice(0, 4)) {
          const d = await geotabRpc('Get', { typeName: 'Device', search: { groups: [{ id: g.id }] } }, cred).catch(e => ({ erro: e.message }));
          console.log(`   Device no grupo ${g.id}: ${Array.isArray(d) ? d.length : d.erro}`);
        }
      } catch (e) { console.log('clearance:', e.message.slice(0, 200)); }

      // A conta RECEBE por e-mail o relatório diário "Speeding Violations"
      // (my.geotab.com/ambev/#myReports) — ou seja, o dado existe e chega até
      // ela. Se os relatórios respondem pela API, há caminho mesmo sem o
      // clearance de leitura de Device/Trip.
      for (const tipo of ['ReportTemplate', 'Report']) {
        try {
          const r = await geotabRpc('Get', { typeName: tipo }, cred);
          console.log(`   ${tipo.padEnd(15)} ${r.length}` +
            (r.length ? ' · ex.: ' + r.slice(0, 6).map(x => x.name || x.id).join(' · ').slice(0, 200) : ''));
        } catch (e) { console.log(`   ${tipo.padEnd(15)} ERRO: ${e.message.slice(0, 110)}`); }
      }

      // o dado bruto pode estar acessível mesmo com Device vazio
      for (const tipo of ['LogRecord', 'StatusData', 'FaultData', 'Trip', 'ExceptionEvent', 'DriverChange']) {
        const de2 = `${DE}T03:00:00.000Z`, ate2 = new Date(new Date(de2).getTime() + 864e5 - 1).toISOString();
        try {
          const r = await geotabRpc('Get', { typeName: tipo, search: { fromDate: de2, toDate: ate2 }, resultsLimit: 5 }, cred);
          console.log(`   ${tipo.padEnd(15)} ${r.length} registro(s) na amostra`);
        } catch (e) { console.log(`   ${tipo.padEnd(15)} ERRO: ${e.message.slice(0, 90)}`); }
      }
      // um veículo pode existir sem viagem; DeviceStatusInfo mostra os que reportam
      try {
        const st = await geotabRpc('Get', { typeName: 'DeviceStatusInfo' }, cred);
        console.log(`veículos reportando posição agora: ${st.length}`);
      } catch (e) { console.log('DeviceStatusInfo:', e.message.slice(0, 160)); }
      const comChave = todos.filter(u => !gtChave(u).startsWith('gt:')).length;
      console.log(`usuários com CPF/CNH preenchido: ${comChave}`);

      for (const d of [DE, iso(new Date(Date.now() - 3 * 864e5)), iso(new Date(Date.now() - 8 * 864e5))]) {
        const de = `${d}T03:00:00.000Z`, ate = new Date(new Date(de).getTime() + 864e5 - 1).toISOString();
        const [tr, ex] = await Promise.all([
          geotabRpc('Get', { typeName: 'Trip', search: { fromDate: de, toDate: ate }, resultsLimit: 5000 }, cred),
          geotabRpc('Get', { typeName: 'ExceptionEvent', search: { fromDate: de, toDate: ate }, resultsLimit: 5000 }, cred),
        ]);
        const semDrv = tr.filter(t => !t.driver?.id || /NoDriver|UnknownDriver/.test(t.driver.id)).length;
        const km = Math.round(tr.reduce((a, t) => a + (+t.distance || 0), 0));
        console.log(`   ${d}: ${tr.length} viagem(ns) (${semDrv} sem motorista) · ${km} km · ${ex.length} evento(s)`);
        if (tr[0] && d === DE) console.log('   campos da Trip:', Object.keys(tr[0]).join(', ').slice(0, 300));
      }

      const mapa = new Map(regras.map(r => [r.id, r.name]));
      const linhas = await geotabDia(DE, cred, new Map(drv.map(u => [u.id, u])), mapa);
      console.log(`\n${DE}: ${linhas.length} motorista(s) com viagem`);
      linhas.slice(0, 3).forEach(l => console.log('   ' + JSON.stringify({
        chave: mask(l.chave), km: Math.round(l.km || 0), idle: l.idle_pct?.toFixed(1),
        acel: l.acel_100km?.toFixed(1), frea: l.frea_100km?.toFixed(1),
        vel: l.vel_excesso_pct?.toFixed(1), viagens: l.registros })));
    }
  } catch (e) { console.log('\nGeotab:', e.message); }
  console.log('\nSonda encerrada — nada foi gravado.');
  process.exit(0);
}

if (MODE === 'marcha') {
  // SONDA DO PILAR "USO DE MARCHAS" (Renan, 01/09/2026) — só leitura, não
  // grava nada. A varredura de diagnósticos achou "Posição da marcha" com
  // volume alto; antes de derivar qualquer régua é preciso saber COMO ele
  // codifica os valores (neutro/ré costumam vir como 0/126/127 em J1939) e
  // se todos os modelos reportam. Aqui a sonda: distribuição dos valores
  // crus, cobertura por veículo e o cruzamento marcha × RPM que viraria o
  // pilar (esticando = RPM alto com marcha acima disponível; forçando =
  // RPM baixo em marcha alta). Nada de nome de pessoa no log (repo público).
  const cred = await geotabLogin();
  if (!cred) { console.error('Geotab: sem credencial'); process.exit(1); }
  const DIA = process.env.CE_DE || iso(ontem);
  const ALTO = +process.env.CE_MARCHA_ALTO || 1900;   // acima disso: esticando
  const BAIXO = +process.env.CE_MARCHA_BAIXO || 1000; // abaixo disso: forçando
  console.log(`sonda de marcha · dia ${DIA} · limiares esticando>${ALTO} rpm · forçando<${BAIXO} rpm`);

  const diags = await geotabRpc('Get', { typeName: 'Diagnostic' }, cred);
  const cand = diags.filter(d => /posi(ç|c)(ã|a)o da marcha|gear position|marcha atual|current gear/i.test(d.name || ''));
  console.log(`\ncandidatos de posição de marcha no catálogo: ${cand.length}`);
  cand.forEach(d => console.log(`   ${d.id}  ${d.name}`));
  if (!cand.length) { console.log('Nenhum diagnóstico de marcha — sonda encerrada.'); process.exit(0); }

  const de0 = `${DIA}T03:00:00.000Z`;
  const fim = new Date(new Date(de0).getTime() + 864e5 - 1).toISOString();

  // baixa as amostras de marcha do dia, paginando como o RPM já faz
  async function baixaMarcha(id) {
    const porDev = new Map(); let from = de0, pag = 0, total = 0;
    while (pag < 40) {
      const lote = await geotabRpc('Get', { typeName: 'StatusData',
        search: { diagnosticSearch: { id }, fromDate: from, toDate: fim }, resultsLimit: 50000 }, cred);
      pag++; total += lote.length;
      for (const r of lote) {
        const dv = r.device && r.device.id; if (!dv) continue;
        let a = porDev.get(dv); if (!a) { a = []; porDev.set(dv, a); }
        a.push({ t: new Date(r.dateTime).getTime(), g: +r.data });
      }
      if (lote.length < 50000) break;
      from = new Date(new Date(lote[lote.length - 1].dateTime).getTime() + 1).toISOString();
    }
    porDev.forEach(a => a.sort((x, y) => x.t - y.t));
    return { porDev, total, pag };
  }

  const devs = await geotabRpc('Get', { typeName: 'Device' }, cred);
  const devNome = new Map(devs.map(d => [d.id, String(d.licensePlate || d.name || d.id).toUpperCase().trim()]));

  for (const d of cand) {
    const { porDev, total, pag } = await baixaMarcha(d.id);
    console.log(`\n── ${d.name} ── ${total} amostra(s) em ${pag} página(s) · ${porDev.size} veículo(s)`);
    if (!total) { console.log('   sem amostra no dia.'); continue; }

    // 1) distribuição dos valores crus: é aqui que neutro/ré se revelam
    const hist = new Map();
    porDev.forEach(a => a.forEach(x => hist.set(x.g, (hist.get(x.g) || 0) + 1)));
    console.log('   valores crus (valor × amostras):');
    [...hist.entries()].sort((a, b) => a[0] - b[0])
      .forEach(([v, n]) => console.log(`      ${String(v).padStart(6)}  ${String(n).padStart(7)}  ${(n / total * 100).toFixed(1)}%`));

    // 2) cobertura: quantos veículos reportam, e com que densidade
    const porVeic = [...porDev.entries()].map(([id, a]) => ({ placa: devNome.get(id) || id, n: a.length,
      max: Math.max(...a.map(x => x.g).filter(isFinite)) }));
    const densa = porVeic.filter(v => v.n >= 100).length;
    console.log(`   veículos com ≥100 amostras no dia: ${densa}/${porVeic.length}`);
    console.log('   maior marcha vista por veículo (amostra dos 10 primeiros):');
    porVeic.sort((a, b) => b.n - a.n).slice(0, 10)
      .forEach(v => console.log(`      ${v.placa.padEnd(10)} ${String(v.n).padStart(6)} amostra(s) · maior valor ${v.max}`));

    // 3) cruzamento marcha × RPM — a conta que viraria o pilar
    const { porDev: rpmDev } = await geotabRpmDia(DIA, cred);
    let tMarcha = 0, tEstica = 0, tForca = 0, veicCruz = 0;
    for (const [id, ga] of porDev) {
      const ra = rpmDev.get(id); if (!ra || ra.length < 10) continue;
      veicCruz++;
      const maxG = Math.max(...ga.map(x => x.g).filter(v => isFinite(v) && v < 100));  // ignora códigos 126/127
      let j = 0;
      for (let i = 0; i < ga.length; i++) {
        const g = ga[i].g;
        if (!isFinite(g) || g <= 0 || g >= 100) continue;          // neutro/ré/código fora da conta
        const prox = i + 1 < ga.length ? ga[i + 1].t : ga[i].t + 1000;
        const dt = Math.min(prox - ga[i].t, RPM_GAP_MS) / 1000;
        if (dt <= 0) continue;
        while (j + 1 < ra.length && ra[j + 1].t <= ga[i].t) j++;   // RPM vigente na hora da amostra
        const rpm = ra[j] && Math.abs(ra[j].t - ga[i].t) <= RPM_GAP_MS ? ra[j].rpm : null;
        if (!isFinite(rpm) || rpm <= RPM_LENTA) continue;          // parado não conta
        tMarcha += dt;
        if (rpm > ALTO && g < maxG) tEstica += dt;                 // dava para subir a marcha
        else if (rpm < BAIXO && g >= maxG - 1) tForca += dt;       // afogando em marcha alta
      }
    }
    const p = v => tMarcha ? (v / tMarcha * 100).toFixed(1) + '%' : '—';
    console.log(`   cruzamento marcha × RPM em ${veicCruz} veículo(s) com as duas séries:`);
    console.log(`      tempo rodando com marcha engatada: ${Math.round(tMarcha / 60)} min`);
    console.log(`      esticando (rpm>${ALTO} com marcha acima disponível): ${Math.round(tEstica / 60)} min (${p(tEstica)})`);
    console.log(`      forçando  (rpm<${BAIXO} em marcha alta):            ${Math.round(tForca / 60)} min (${p(tForca)})`);
    console.log(`      → pilar Uso de Marchas ficaria em ${p(tEstica + tForca)} do tempo em marcha errada`);
  }
  console.log('\nSonda de marcha encerrada — nada foi gravado.');
  process.exit(0);
}

if (MODE === 'ident') {
  // A operação exige identificação para rodar, mas a sonda viu ~70% das
  // viagens sem motorista (31/08/2026). Este modo mostra ONDE: viagens e km
  // com/sem identificação, por unidade e por placa. Só placa, unidade e
  // contagem no log — nunca nome de pessoa (repo público).
  const cred = await geotabLogin();
  if (!cred) { console.error('Geotab: sem credencial'); process.exit(1); }
  const IDE = process.env.CE_DE || iso(new Date(ontem.getTime() - 6 * 864e5));
  const IATE = process.env.CE_ATE || iso(ontem);
  console.log(`identificação de motorista · ${IDE} → ${IATE}`);

  const [devs, grupos] = await Promise.all([
    geotabRpc('Get', { typeName: 'Device' }, cred),
    geotabRpc('Get', { typeName: 'Group' }, cred),
  ]);
  const gNome = new Map(grupos.map(g => [g.id, g.name || '']));
  const dev = new Map(devs.map(d => {
    const uni = (d.groups || []).map(g => gNome.get(g.id) || '').find(n => /^UNI_/.test(n));
    return [d.id, { placa: String(d.licensePlate || d.name || d.id).toUpperCase().trim(),
                    uni: uni ? uni.replace(/^UNI_/, '') : '(sem grupo UNI)' }];
  }));

  const porDev = new Map();   // devId → {com, sem, kmCom, kmSem}
  for (let d = new Date(IDE + 'T12:00:00Z'); iso(d) <= IATE; d = new Date(d.getTime() + 864e5)) {
    const de = `${iso(d)}T03:00:00.000Z`;
    const ate = new Date(new Date(de).getTime() + 864e5 - 1).toISOString();
    const trips = await geotabRpc('Get', { typeName: 'Trip', search: { fromDate: de, toDate: ate }, resultsLimit: 50000 }, cred);
    for (const t of trips) {
      const id = t.device && t.device.id; if (!id) continue;
      const sem = !t.driver?.id || /NoDriver|UnknownDriver/.test(t.driver.id);
      const km = +t.distance || 0;
      const st = porDev.get(id) || { com: 0, sem: 0, kmCom: 0, kmSem: 0 };
      if (sem) { st.sem++; st.kmSem += km; } else { st.com++; st.kmCom += km; }
      porDev.set(id, st);
    }
  }

  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const kmR = v => Math.round(v).toLocaleString('pt-BR');

  // por unidade
  const porUni = new Map();
  for (const [id, st] of porDev) {
    const u = (dev.get(id) || { uni: '(dispositivo fora do cadastro)' }).uni;
    const t = porUni.get(u) || { com: 0, sem: 0, kmCom: 0, kmSem: 0, placas: 0, placasSo: 0 };
    t.com += st.com; t.sem += st.sem; t.kmCom += st.kmCom; t.kmSem += st.kmSem;
    t.placas++; if (!st.com) t.placasSo++;
    porUni.set(u, t);
  }
  console.log('\n── POR UNIDADE (viagens identificadas / total · km identificado / total) ──');
  [...porUni.entries()].sort((a, b) => (a[1].com / (a[1].com + a[1].sem || 1)) - (b[1].com / (b[1].com + b[1].sem || 1)))
    .forEach(([u, t]) => {
      const v = t.com + t.sem, k = t.kmCom + t.kmSem;
      console.log(`${u.padEnd(22)} viagens ${String(t.com).padStart(5)}/${String(v).padEnd(5)} (${pct(t.com, v).padStart(4)}) · km ${kmR(t.kmCom).padStart(8)}/${kmR(k).padEnd(8)} (${pct(t.kmCom, k).padStart(4)}) · ${t.placas} placa(s), ${t.placasSo} sem NENHUMA identificação`);
    });

  // por placa — da pior identificação para a melhor
  console.log('\n── POR PLACA (pior identificação primeiro) ──');
  console.log('placa      unidade                 viagens id/total   km id/total');
  [...porDev.entries()].map(([id, st]) => ({ ...(dev.get(id) || { placa: id, uni: '(fora do cadastro)' }), ...st }))
    .sort((a, b) => (a.com / (a.com + a.sem || 1)) - (b.com / (b.com + b.sem || 1)) || (b.kmSem - a.kmSem))
    .forEach(r => {
      const v = r.com + r.sem, k = r.kmCom + r.kmSem;
      console.log(`${r.placa.padEnd(10)} ${r.uni.padEnd(22)} ${String(r.com).padStart(4)}/${String(v).padEnd(4)} (${pct(r.com, v).padStart(4)})   ${kmR(r.kmCom).padStart(7)}/${kmR(k).padEnd(7)} (${pct(r.kmCom, k).padStart(4)})`);
    });

  const tot = [...porDev.values()].reduce((a, s) => ({ com: a.com + s.com, sem: a.sem + s.sem,
    kmCom: a.kmCom + s.kmCom, kmSem: a.kmSem + s.kmSem }), { com: 0, sem: 0, kmCom: 0, kmSem: 0 });
  console.log(`\nTOTAL: ${tot.com}/${tot.com + tot.sem} viagens identificadas (${pct(tot.com, tot.com + tot.sem)}) · ${kmR(tot.kmCom)}/${kmR(tot.kmCom + tot.kmSem)} km (${pct(tot.kmCom, tot.kmCom + tot.kmSem)})`);
  console.log('Relatório encerrado — nada foi gravado.');
  process.exit(0);
}

if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }

if (MODE === 'recalc') {
  const n = await recalculaMes(DE, ATE);
  console.log(`recalculado: ${n} linha(s) em ce_scores_mensais`);
  process.exit(0);
}

// Geotab: login uma vez só (a sessão vale ~2 semanas) e caches reaproveitados
let GT = null, GT_USERS = new Map(), GT_RULES = new Map(), GT_UNIDEV = new Map();
try {
  GT = await geotabLogin();
  if (GT) {
    const [us, rs, devs, gs] = await Promise.all([
      geotabRpc('Get', { typeName: 'User', search: { isDriver: true } }, GT),
      geotabRpc('Get', { typeName: 'Rule' }, GT),
      geotabRpc('Get', { typeName: 'Device' }, GT),
      geotabRpc('Get', { typeName: 'Group' }, GT),
    ]);
    GT_USERS = new Map(us.map(u => [u.id, u]));
    GT_RULES = new Map(rs.map(r => [r.id, r.name]));
    const gNome = new Map(gs.map(g => [g.id, g.name || '']));
    GT_GNOME = gNome;
    devs.forEach(d => {
      const uni = (d.groups || []).map(g => gNome.get(g.id) || '').find(n => /^UNI_/.test(n));
      if (uni) GT_UNIDEV.set(d.id, uni.replace(/^UNI_/, ''));
    });
    // sincroniza o cadastro INTEIRO de uma vez: quem já está no banco com
    // unidade nula (das coletas antigas) ganha a unidade do grupo agora
    if (SB_KEY) {
      const todos = us.map(u => ({ chave: gtChave(u), fonte: 'Geotab', unidade: gtUni(u),
        nome: (u.firstName || u.lastName) ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : (u.name || u.id) }));
      for (let i = 0; i < todos.length; i += 500) {
        const r = await fetch(`${SB_URL}/rest/v1/ce_motoristas?on_conflict=chave`, {
          method: 'POST', headers: { ...H_SB, Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(todos.slice(i, i + 500)) });
        if (!r.ok) { console.log('sync cadastro:', r.status, (await r.text()).slice(0, 200)); break; }
      }
      console.log(`cadastro sincronizado: ${todos.length} motorista(s) com unidade do grupo UNI_*`);
    }
    const faltando = Object.entries(GT_REGRA)
      .filter(([, r]) => ![...GT_RULES].some(([id, n]) => r.ids.includes(id) || r.nome.test(n || '')))
      .map(([k]) => k);
    console.log(`Geotab (db=${GT_DB}): ${GT_USERS.size} motorista(s), ${GT_RULES.size} regra(s)`
      + (faltando.length ? ` · SEM regra para: ${faltando.join(', ')} (esse(s) pilar(es) ficam vazios)` : ''));
  }
} catch (e) { console.log('Geotab: login falhou —', e.message); GT = null; }

if (!VF_TOKEN && !GT) {
  console.error('Nenhuma fonte disponível: sem VFLEETS_TOKEN e sem login no Geotab. Nada a fazer.');
  process.exit(1);
}

// que dias coletar
let AGENDA = [];
if (MODE === 'reproc') {
  if (!VF_TOKEN) { console.error('reproc é da vFleets — sem VFLEETS_TOKEN não há o que reprocessar.'); process.exit(1); }
  const { dias, erro } = await vfleetsReprocessados(DE, ATE);
  if (erro) { console.error('processamentos:', erro); process.exit(1); }
  AGENDA = dias;
  console.log(`a vFleets reprocessou ${dias.length} dia(s) no período: ${dias.join(', ') || '—'}`);
  if (!dias.length) process.exit(0);
  await new Promise(r => setTimeout(r, PAUSA));   // a consulta acima já gastou a janela
} else {
  for (let d = new Date(DE + 'T12:00:00Z'); iso(d) <= ATE; d.setDate(d.getDate() + 1)) AGENDA.push(iso(d));
  // retomada: dia que já está no ce_diario não é recoletado. Sem isto, o
  // backfill do ano recomeçaria do zero a cada disparo e nunca terminaria.
  // CE_REFAZER=1 ignora e recoleta tudo.
  if (AGENDA.length > 1 && process.env.CE_REFAZER !== '1') {
    const FONTES = [VF_TOKEN && 'vFleets', GT && 'Geotab'].filter(Boolean);
    const jaTem = await diasGravados(DE, ATE, FONTES);
    const antes = AGENDA.length;
    AGENDA = AGENDA.filter(d => !jaTem.has(d));
    if (antes !== AGENDA.length) console.log(`${antes - AGENDA.length} dia(s) já gravado(s) — pulando`);
  }
}
if (!AGENDA.length) {
  const n = await recalculaMes(DE.slice(0, 8) + '01', ATE);
  console.log(`nada a coletar — período completo. mensal: ${n} linha(s)`);
  process.exit(0);
}
const RITMO = VF_TOKEN ? PAUSA : 400;
console.log(`${AGENDA.length} dia(s) a coletar · ~${Math.max(1, Math.round(AGENDA.length * RITMO / 6e4))} min`
  + (VF_TOKEN ? ' (1 chamada/5 min — limite da vFleets)' : ' (só Geotab: sem o limite de 5 min da vFleets)'));

let total = 0, falhas = 0, semUnidade = new Set(), parou = 0;
for (let i = 0; i < AGENDA.length; i++) {
  if (Date.now() - T0 > LIMITE_MS) { parou = AGENDA.length - i; break; }
  const dia = AGENDA[i];
  if (VF_TOKEN) try {
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
  // Geotab no mesmo dia — a pausa de 5 min é limite da vFleets, não dele
  if (GT) {
    try {
      // amostras de rotação do dia inteiro; falha aqui NÃO derruba a coleta —
      // o pilar RPM só fica vazio no dia
      let rpmDev = null, rpmRot = '';
      if (process.env.CE_RPM !== '0') {
        try {
          const r = await geotabRpmDia(dia, GT);
          rpmDev = r.porDev;
          rpmRot = ` · rpm: ${r.total} amostra(s)/${r.paginas} pág.`;
        } catch (e) { rpmRot = ` · rpm FALHOU (${e.message.slice(0, 80)})`; }
      }
      const lg = await geotabDia(dia, GT, GT_USERS, GT_RULES, GT_UNIDEV, rpmDev);
      await garanteMotoristas(lg);
      total += await gravaDiario(lg);
      const comRpm = lg.filter(l => l.rpm_verde_pct != null).length;
      console.log(`${dia}: Geotab → ${lg.length} motorista(s) · ${Math.round(lg.reduce((s, l) => s + (+l.km || 0), 0))} km`
        + rpmRot + (rpmDev ? ` · faixa verde em ${comRpm} linha(s)` : ''));
    } catch (e) { console.log(`${dia} Geotab: ${e.message}`); falhas++; }
  }
  // a pausa longa é o limite da vFleets (1 req/5 min); o Geotab não tem isso
  if (i < AGENDA.length - 1) await new Promise(r => setTimeout(r, VF_TOKEN ? PAUSA : 400));
}
const n = await recalculaMes(DE.slice(0, 8) + '01', ATE);
console.log(`\ngravado: ${total} linha(s) diárias · mensal: ${n} linha(s)` + (falhas ? ` · ${falhas} dia(s) com falha` : ''));
if (parou) console.log(`\n⏱  teto de ${LIMITE_MS / 6e4} min atingido — faltam ${parou} dia(s).`
  + `\n   Redispare o MESMO período: os dias já gravados são pulados e a coleta continua de onde parou.`);
if (semUnidade.size) console.log(`UOs vistas na vFleets (falta o de-para p/ unidade do portal): ${[...semUnidade].join(' · ')}`);
if (falhas && !total) process.exit(1);
