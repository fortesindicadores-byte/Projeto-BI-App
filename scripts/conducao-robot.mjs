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
  // 3 acelerações bruscas/100 km → 0 (Renan, 03/09/2026). A regra padrão do
  // Geotab dispara em 0,29 G, que caminhão carregado raramente atinge: a
  // frota fica em ~1/100 km e a régua antiga (16,7) dava 99 para todos.
  acel:   { zeraEm: +process.env.CE_ACEL_ZERA || 3 },
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
/* VELOCIDADE É DEFLATOR, não pilar (Renan, 02/09/2026): excesso de
   velocidade não "compensa" bom RPM — ele derruba o conjunto. Em vez de
   entrar na média com um peso, ela multiplica a pontuação dos demais:
   quem não excede mantém 100% do que fez; quem excede perde na mesma
   proporção. Sem dado de velocidade, o deflator é 1 (não penaliza). */
/* USO DE MARCHAS TAMBÉM SAIU DO SCORE (Renan, 02/09/2026): o painel deixou de
   mostrar o pilar, mas o peso 5 continuava aqui — quem roda num dos 42
   veículos que publicam a posição da marcha era pontuado por um pilar que a
   tela não mostra, e os outros não. O cambio_ruim_pct segue sendo coletado e
   o cambio_pontos gravado; ele volta a pontuar quando a Argus habilitar a
   marcha no resto da frota. */
/* VELOCIDADE VOLTOU A SER PILAR (Renan, 03/09/2026: "inclua novamente
   velocidade na pontuação, não como deflator"). O deflator de 02/09 nunca
   mordeu: era calculado pelas faixas de velocidade das viagens, que vêm
   zeradas nesta conta. A medição do pilar é a fórmula original (tempo acima
   do limite ponderado por faixa ÷ tempo em movimento), agora com as faixas
   das regras da Argus — ver GT_REGRA. */
/* VELOCIDADE SAIU DO SCORE (Renan, 03/09/2026, "não ficou legal, tire excesso
   de velocidade"): as regras por faixa da Argus são recentes e a frota quase
   não pontua nelas. O diário continua guardando vel_excesso_pct e os eventos,
   e o mensal continua gravando vel_pontos/vel_excessos — só não entra na
   pontuação nem na tela. */
/* PESOS EM BASE 100 (Renan, 07/09/2026: "não deveria ser 100? eu também
   aumentaria o peso da faixa verde"): 50 / 30 / 20. Antes era 25/20/15 (soma
   60, resto do desenho de seis pilares). Mudou → rodar o modo `recalc` no ano
   inteiro, e os mesmos pesos ficam em ce_app_regras (app) e em PILAR (painel). */
const PESOS = { rpm: 50, idle: 30, acel: 20 };

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
  if (!den) return null;
  return Math.round(num / den * 10) / 10;
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
/* REGRAS OFICIAIS, NÃO "NOME CONTÉM VELOCIDADE" (bug real, 03/09/2026): a
   conta tem 110 regras e a maioria é teste ou piloto — prefixos TESTE,
   [Teste …], z_[PILOTO], X_, Y-, [ Demarco ]. Classificar pelo nome somava
   tudo: "TESTE - FREIO ESTACIONARIO VELOCIDADE" (2 h por evento), "X_ Excesso
   Velocidade Chuva" (um evento por segundo), três pilotos (2%/5%/8% > via)
   contando o MESMO excesso três vezes… e o ranking mostrou 1.077 "excessos"
   num mês. A velocidade passa a vir SÓ das regras da Argus por faixa acima
   do limite da via ("[Argus] Exc. Veloc. Via até 20% / entre 20% e 30% /
   acima de 30%") — as oficiais, e as mesmas faixas da vFleets, com o que o
   pilar volta à fórmula original: (t1 + 2·t2 + 3·t3) ÷ tempo em movimento.
   Aceleração/freada: regra de teste/piloto fica fora; a oficial ainda vai ser
   confirmada com o Renan (o modo velregras lista todas). */
const GT_TESTE = /^\s*(TESTE\b|\[\s*TESTE|\[\s*Teste\b|Teste\s+\w|z_\[PILOTO\]|X_|Y\s*-|\[\s*Demarco)/i;
/* ACELERAÇÃO = "Hard Acceleration", a regra padrão do Geotab (Renan,
   03/09/2026, opção 1). A varredura da frota inteira num dia mostrou que a
   regra oficial da Argus quase não dispara (2 eventos em ~100 caminhões) e
   que as que "enxergam" aceleração brusca são as de limiar baixo, todas
   marcadas como teste/piloto. A padrão de fábrica fica no meio (215/dia,
   50 placas) e não é teste — é ela, e SÓ ela, para não contar o mesmo
   evento duas vezes. */
const GT_REGRA = {
  acel: { ids: ['RuleJackrabbitStartsId'], nome: /^Hard Acceleration$/i },
  frea: { ids: ['RuleHarshBrakingId'],     nome: /harsh.?brak|frena|freada/i },
};
const GT_VEL_ARGUS = /^\[Argus\]\s*Exc\.?\s*Veloc\.?\s*Via/i;
// devolve 'vel1' | 'vel2' | 'vel3' | 'acel' | 'frea' | null
const gtQualRegra = (ruleId, ruleNome) => {
  const nome = ruleNome || '';
  if (GT_VEL_ARGUS.test(nome)) {
    if (/at[ée]\s*20/i.test(nome)) return 'vel1';
    if (/entre\s*20/i.test(nome)) return 'vel2';
    return 'vel3';
  }
  if (GT_TESTE.test(nome)) return null;             // teste/piloto não pontua
  for (const [k, r] of Object.entries(GT_REGRA)) {
    if (r.ids.includes(ruleId)) return k;
    if (nome && r.nome.test(nome)) return k;
  }
  return null;
};
const GT_VEL_PESO = { vel1: 1, vel2: 2, vel3: 3 };
// chave do motorista: o CPF/CNH do cadastro, quando houver — é o que permite
// casar a mesma pessoa entre Geotab e vFleets. Sem isso, o id do Geotab.
function gtChave(u) {
  const doc = String(u?.licenseNumber || u?.employeeNo || '').replace(/\D/g, '');
  return doc.length >= 9 ? doc : 'gt:' + (u?.id || '');
}
// CPF do motorista no Geotab (modo cpf, 05/09/2026): o LOGIN dele (`name`) é o
// próprio CPF — 1.310 de 1.313 cadastros. licenseNumber/employeeNo vêm antes,
// se um dia forem preenchidos. Só aceita CPF com os dígitos verificadores
// certos (CNH também tem 11 dígitos). A chave continua sendo `gt:<id>` — o
// histórico do diário e do mensal está amarrado nela; o CPF é só para o login.
function cpfValido(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +d[9] && dv(10) === +d[10];
}
function gtCpf(u) {
  for (const k of ['licenseNumber', 'employeeNo', 'name']) {
    const d = String(u?.[k] || '').replace(/\D/g, '');
    if (cpfValido(d)) return d;
  }
  return null;
}
// preenche ce_motoristas.cpf de quem ainda está sem — nunca sobrescreve
async function gtPreencheCpf(us) {
  const banco = await sbTodos('ce_motoristas?select=id,chave,cpf&fonte=eq.Geotab');
  const semCpf = new Map(banco.filter(m => !m.cpf).map(m => [m.chave, m.id]));
  const usados = new Set(banco.map(m => m.cpf).filter(Boolean));
  let gravados = 0, falhas = 0;
  for (const u of us) {
    const id = semCpf.get(gtChave(u)); const cpf = gtCpf(u);
    if (!id || !cpf || usados.has(cpf)) continue;
    const r = await fetch(`${SB_URL}/rest/v1/ce_motoristas?id=eq.${id}&cpf=is.null`, {
      method: 'PATCH', headers: { ...H_SB, Prefer: 'return=minimal' }, body: JSON.stringify({ cpf }) });
    if (r.ok) { gravados++; usados.add(cpf); } else falhas++;
  }
  return { gravados, falhas, semCpf: semCpf.size - gravados };
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

/* ── USO DE MARCHAS (Renan, 01/09/2026) ────────────────────────────────────
   O diagnóstico "Posição da marcha" do Geotab vem autodocumentado: número
   negativo = ré · positivo = marcha à frente · 0 = ponto morto · 126 =
   estacionamento · 127 = acionamento · 129 = intermediário. Cruzando com o
   RPM que já coletamos, o pilar mede o tempo em MARCHA ERRADA:
     · esticando  — RPM alto com marcha acima disponível (o motor "grita" em
       vez de subir a marcha; é onde o consumo mais estoura, porque sai do
       platô de torque, a mesma ciência da Faixa Verde);
     · forçando   — RPM baixo demais em marcha alta (roda afogando o motor).
   Denominador = tempo rodando com marcha engatada. Neutro/ré e os códigos
   ficam de fora, e parado também (marcha lenta é o pilar do lado).
   Calibragem por env: CE_MARCHA_ALTO=1900 · CE_MARCHA_BAIXO=1000 ·
   CE_MARCHA=0 desliga a coleta.
   Medido em 31/08/2026: 6,0% do tempo em marcha errada na frota. */
const MARCHA_ALTO  = +process.env.CE_MARCHA_ALTO  || 1900;
const MARCHA_BAIXO = +process.env.CE_MARCHA_BAIXO || 1000;
const GEAR_DIAG = 'DiagnosticGearPositionId';

async function geotabMarchaDia(dia, cred) {
  const de0 = `${dia}T03:00:00.000Z`;
  const fim = new Date(new Date(de0).getTime() + 864e5 - 1).toISOString();
  const porDev = new Map(), maxG = new Map();
  let from = de0, paginas = 0, total = 0;
  while (paginas < 40) {
    const lote = await geotabRpc('Get', { typeName: 'StatusData',
      search: { diagnosticSearch: { id: GEAR_DIAG }, fromDate: from, toDate: fim },
      resultsLimit: 50000 }, cred);
    paginas++; total += lote.length;
    for (const r of lote) {
      const id = r.device && r.device.id; if (!id) continue;
      let a = porDev.get(id); if (!a) { a = []; porDev.set(id, a); }
      const g = +r.data;
      a.push({ t: new Date(r.dateTime).getTime(), g });
      // maior marcha do veículo aprendida do próprio dado: a frota tem caixas
      // de 5, 6 e 12 marchas, então tabela por modelo seria chute
      if (isFinite(g) && g > 0 && g < 100 && g > (maxG.get(id) || 0)) maxG.set(id, g);
    }
    if (lote.length < 50000) break;
    from = new Date(new Date(lote[lote.length - 1].dateTime).getTime() + 1).toISOString();
  }
  porDev.forEach(a => a.sort((x, y) => x.t - y.t));
  return { porDev, maxG, total, paginas };
}

/* BANGUELA (Renan, 02/09/2026): o Geotab não tem um parâmetro pronto, mas
   tem os dois ingredientes — posição da marcha em PONTO MORTO (valor 0) e o
   veículo em MOVIMENTO. Rodar em neutro é banguela: o motor volta à marcha
   lenta, o freio motor some e o consumo de quem desce embalado piora, além
   do risco. O limiar de velocidade evita contar o óbvio: parado no semáforo
   com a marcha em neutro é correto, não é banguela.
   Mesma limitação de cobertura do Uso de Marchas: depende do parâmetro de
   marcha, que só 42 dos 101 veículos publicam.                            */
const BANG_VMIN = +process.env.CE_BANG_VMIN || 20;   // km/h a partir do qual neutro = banguela

function banguelaJanela(marchas, velAm, ini, fim) {
  let neutro = 0, movimento = 0;
  if (!marchas || !velAm || !velAm.length) return { neutro, movimento };
  let j = 0;
  for (let i = 0; i < marchas.length; i++) {
    const a = marchas[i];
    if (a.t > fim) break;
    const prox = i + 1 < marchas.length ? marchas[i + 1].t : a.t + 1000;
    const t0 = Math.max(a.t, ini), t1 = Math.min(prox, fim, a.t + RPM_GAP_MS);
    if (t1 <= t0) continue;
    while (j + 1 < velAm.length && velAm[j + 1].t <= a.t) j++;
    const vv = velAm[j];
    if (!vv || Math.abs(vv.t - a.t) > RPM_GAP_MS || !(vv.v >= BANG_VMIN)) continue;
    const dt = (t1 - t0) / 1000;
    movimento += dt;
    if (a.g === 0) neutro += dt;                     // ponto morto rodando = banguela
  }
  return { neutro, movimento };
}

// tempo em marcha errada e tempo total com marcha engatada numa janela.
// Cada amostra de marcha vale até a próxima (teto RPM_GAP_MS) e é cruzada
// com o RPM vigente naquele instante.
function marchaJanela(marchas, rpmAm, ini, fim, maxMarcha) {
  let ruim = 0, total = 0;
  if (!marchas || !rpmAm || !maxMarcha) return { ruim, total };
  let j = 0;
  for (let i = 0; i < marchas.length; i++) {
    const a = marchas[i];
    if (a.t > fim) break;
    const prox = i + 1 < marchas.length ? marchas[i + 1].t : a.t + 1000;
    const t0 = Math.max(a.t, ini), t1 = Math.min(prox, fim, a.t + RPM_GAP_MS);
    if (t1 <= t0) continue;
    const g = a.g;
    if (!isFinite(g) || g <= 0 || g >= 100) continue;      // neutro, ré e códigos fora
    while (j + 1 < rpmAm.length && rpmAm[j + 1].t <= a.t) j++;
    const rpm = rpmAm[j] && Math.abs(rpmAm[j].t - a.t) <= RPM_GAP_MS ? rpmAm[j].rpm : null;
    if (!isFinite(rpm) || rpm <= RPM_LENTA) continue;      // parado não conta
    const dt = (t1 - t0) / 1000;
    total += dt;
    if (rpm > MARCHA_ALTO && g < maxMarcha) ruim += dt;            // esticando
    else if (rpm < MARCHA_BAIXO && g >= maxMarcha - 1) ruim += dt; // forçando
  }
  return { ruim, total };
}

var GT_PLACA = new Map();   // device → placa, preenchido no login (ver abaixo)
async function geotabDia(dia, cred, cacheUsuarios, regras, uniPorDev, rpmPorDev, mch, velPorDev) {
  // a janela é o dia em BRT (UTC-3), não em UTC
  const de = `${dia}T03:00:00.000Z`;
  const ate = new Date(new Date(de).getTime() + 864e5 - 1).toISOString();
  /* LITROS POR VIAGEM (Renan, 07/09/2026: "você lê hoje o consumo também da
     telemetria? Legal ter também"): `FuelUsed` traz, por veículo, o combustível
     consumido em cada viagem (totalFuelUsed, em litros; dateTime = fim da
     viagem). Cada registro é casado com a viagem do mesmo veículo cuja janela
     o contém, e vai para o motorista dela (ou para o Sem Login da unidade).
     Falha aqui NÃO derruba o dia — os litros só ficam vazios. */
  let fuelErro = null;
  const [trips, excs, fuel] = await Promise.all([
    geotabRpc('Get', { typeName: 'Trip', search: { fromDate: de, toDate: ate } }, cred),
    geotabRpc('Get', { typeName: 'ExceptionEvent', search: { fromDate: de, toDate: ate } }, cred),
    geotabRpc('Get', { typeName: 'FuelUsed', search: { fromDate: de, toDate: ate } }, cred)
      .catch(e => { fuelErro = String(e.message || e); return []; }),
  ]);
  const litPorDev = new Map();
  for (const f of (fuel || [])) {
    const id = f.device && f.device.id; if (!id || !(+f.totalFuelUsed > 0)) continue;
    let a = litPorDev.get(id); if (!a) { a = []; litPorDev.set(id, a); }
    a.push({ t: new Date(f.dateTime).getTime(), l: +f.totalFuelUsed, usado: false });
  }
  // litros dos registros do veículo que caem na janela da viagem (fim da
  // viagem, com folga de 1 min antes e 3 min depois); cada registro conta uma vez
  const litrosDa = (dev, ini, fim) => {
    const a = litPorDev.get(dev); if (!a) return 0;
    let soma = 0;
    for (const x of a) if (!x.usado && x.t >= ini - 60e3 && x.t <= fim + 180e3) { soma += x.l; x.usado = true; }
    return soma;
  };
  // soma os litros da viagem no acumulador E o km dela — o km/L só pode
  // dividir km de viagem que tem litros (Renan, 07/09/2026: "médias irreais").
  // Viagem acima de 12 km/L é leitura ruim do veículo: descarta os litros dela.
  const somaLitros = (g, dev, ini, fim, km) => {
    const l = litrosDa(dev, ini, fim);
    if (!(l > 0)) return;
    if (km / l > 12) { g.litRuim = (g.litRuim || 0) + 1; return; }
    g.lit = (g.lit || 0) + l; g.kmLit = (g.kmLit || 0) + km;
  };

  // eventos por motorista; quando o evento não traz motorista, cai no device
  const nomeRegra = id => (regras.get(id) || '');
  const porDrv = new Map(), porDev = [];
  // soma um evento no acumulador: aceleração/freada contam; velocidade conta
  // E guarda os segundos por faixa (é o tempo, não a contagem, que vira o pilar)
  const soma = (m, qual, seg) => {
    if (GT_VEL_PESO[qual]) { m.vel++; m.velSeg = (m.velSeg || 0) + seg * GT_VEL_PESO[qual]; m['s' + qual] = (m['s' + qual] || 0) + seg; }
    else m[qual]++;
  };
  for (const e of excs) {
    const qual = gtQualRegra(e.rule?.id, nomeRegra(e.rule?.id));
    if (!qual) continue;
    const seg = gtSeg(e.duration);
    const d = e.driver?.id;
    if (d && d !== 'NoDriverId' && d !== 'UnknownDriverId') {
      const m = porDrv.get(d) || { acel: 0, frea: 0, vel: 0 };
      soma(m, qual, seg); porDrv.set(d, m);
    } else if (e.device?.id) {
      porDev.push({ dev: e.device.id, t: new Date(e.activeFrom).getTime(), qual, seg });
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
        const dev = t.device?.id;
        const am = rpmPorDev && rpmPorDev.get(dev);
        const ti = new Date(t.start).getTime(), tf = new Date(t.stop).getTime();
        somaLitros(g, dev, ti, tf, +t.distance || 0);
        if (am) { const j = rpmJanela(am, ti, tf); g.rpmV += j.verde; g.rpmR += j.rodando; }
        if (mch && am) { const k = marchaJanela(mch.porDev.get(dev), am, ti, tf, mch.maxG.get(dev));
                         g.mchR = (g.mchR || 0) + k.ruim; g.mchT = (g.mchT || 0) + k.total; }
        if (mch && velPorDev) { const bg = banguelaJanela(mch.porDev.get(dev), velPorDev.get(dev), ti, tf);
                                g.bgN = (g.bgN || 0) + bg.neutro; g.bgM = (g.bgM || 0) + bg.movimento; }
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
    porDev.forEach(x => { if (x.dev === t.device?.id && x.t >= ini && x.t <= fim && !x.usado) { soma(g, x.qual, x.seg); x.usado = true; } });
    somaLitros(g, t.device?.id, ini, fim, +t.distance || 0);
    const pl = GT_PLACA.get(t.device?.id);
    if (pl) { g.pla = g.pla || {}; g.pla[pl] = (g.pla[pl] || 0) + (+t.distance || 0); }
    const am = rpmPorDev && rpmPorDev.get(t.device?.id);
    if (am) { const j = rpmJanela(am, ini, fim); g.rpmV = (g.rpmV || 0) + j.verde; g.rpmR = (g.rpmR || 0) + j.rodando; }
    if (mch && am) { const k = marchaJanela(mch.porDev.get(t.device?.id), am, ini, fim, mch.maxG.get(t.device?.id));
                     g.mchR = (g.mchR || 0) + k.ruim; g.mchT = (g.mchT || 0) + k.total; }
    if (mch && velPorDev) { const bg = banguelaJanela(mch.porDev.get(t.device?.id), velPorDev.get(t.device?.id), ini, fim);
                            g.bgN = (g.bgN || 0) + bg.neutro; g.bgM = (g.bgM || 0) + bg.movimento; }
    porMot.set(d, g);
  }
  for (const [d, m] of porDrv) {
    const g = porMot.get(d); if (!g) continue;
    g.acel += m.acel; g.frea += m.frea; g.vel += m.vel;
    g.velSeg = (g.velSeg || 0) + (m.velSeg || 0);
    for (const k of ['svel1', 'svel2', 'svel3']) g[k] = (g[k] || 0) + (m[k] || 0);
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
      litros: g.lit > 0 ? +g.lit.toFixed(3) : null,       // FuelUsed casado às viagens dele
      h_motor: (g.dir + g.idle) ? (g.dir + g.idle) / 3600 : null,
      // reconstruída das amostras cruas; menos de 1 min rodando não vale nota
      rpm_verde_pct: (g.rpmR || 0) > 60 ? g.rpmV / g.rpmR * 100 : null,
      idle_pct: (g.dir + g.idle) ? g.idle / (g.dir + g.idle) * 100 : null,
      acel_100km: g.km > 0 ? g.acel / g.km * 100 : null,
      frea_100km: g.km > 0 ? g.frea / g.km * 100 : null,
      // (t1 + 2·t2 + 3·t3) ÷ tempo em movimento, com as faixas da Argus —
      // os speedRange da viagem vêm zerados nesta conta (03/09/2026)
      vel_excesso_pct: tMov ? (g.velSeg || 0) / tMov * 100 : null,
      freio_motor_pct: null,                       // freio motor não existe no Geotab
      // banguela = ponto morto com o veículo em movimento; menos de 1 min
      // em movimento com marcha lida no dia não vale nota
      banguela_pct: (g.bgM || 0) > 60 ? g.bgN / g.bgM * 100 : null,
      // marcha errada reconstruída de "Posição da marcha" × RPM; menos de
      // 1 min com marcha engatada não vale nota
      cambio_ruim_pct: (g.mchT || 0) > 60 ? g.mchR / g.mchT * 100 : null,
      registros: g.n,
      bruto: { viagens: g.n, seg: { dir: g.dir, idle: g.idle, v1: g.v1, v2: g.v2, v3: g.v3 },
               rpm: { verde: Math.round(g.rpmV || 0), rodando: Math.round(g.rpmR || 0) },
               marcha: { ruim: Math.round(g.mchR || 0), total: Math.round(g.mchT || 0) },
               banguela: { neutro: Math.round(g.bgN || 0), movimento: Math.round(g.bgM || 0) },
               // km por placa no dia — o mensal escolhe a mais rodada
               placas: g.pla ? Object.fromEntries(Object.entries(g.pla).map(([k, v]) => [k, Math.round(v)])) : undefined,
               // km SÓ das viagens com litros (é o numerador do km/L) e viagens descartadas por leitura ruim
               kmLitros: g.lit > 0 ? Math.round(g.kmLit) : undefined, litRuim: g.litRuim || undefined,
               eventos: { acel: g.acel, frea: g.frea, vel: g.vel },
               velArgus: { s1: Math.round(g.svel1 || 0), s2: Math.round(g.svel2 || 0), s3: Math.round(g.svel3 || 0) } },
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
      litros: g.lit > 0 ? +g.lit.toFixed(3) : null,
      h_motor: (g.dir + g.idle) ? (g.dir + g.idle) / 3600 : null,
      rpm_verde_pct: (g.rpmR || 0) > 60 ? g.rpmV / g.rpmR * 100 : null,
      idle_pct: (g.dir + g.idle) ? g.idle / (g.dir + g.idle) * 100 : null,
      acel_100km: null, frea_100km: null,
      vel_excesso_pct: null,                       // evento não é atribuído a quem não tem login
      freio_motor_pct: null,
      banguela_pct: (g.bgM || 0) > 60 ? g.bgN / g.bgM * 100 : null,
      cambio_ruim_pct: (g.mchT || 0) > 60 ? g.mchR / g.mchT * 100 : null,
      registros: g.n,
      bruto: { semLogin: true, viagens: g.n, seg: { dir: g.dir, idle: g.idle, v1: g.v1, v2: g.v2, v3: g.v3 },
               kmLitros: g.lit > 0 ? Math.round(g.kmLit) : undefined, litRuim: g.litRuim || undefined,
               rpm: { verde: Math.round(g.rpmV || 0), rodando: Math.round(g.rpmR || 0) },
               marcha: { ruim: Math.round(g.mchR || 0), total: Math.round(g.mchT || 0) },
               banguela: { neutro: Math.round(g.bgN || 0), movimento: Math.round(g.bgM || 0) } },
      _nome: 'Sem Login · ' + uni, _uo: null, _uni: uni,
    });
  }
  // cobertura do combustível, para o log (propriedade do array, não é linha)
  const regs = [...litPorDev.values()].flat();
  linhas._fuel = { reg: (fuel || []).length, casados: regs.filter(x => x.usado).length, erro: fuelErro };
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
/* PAGINAR SEM ORDER É PEGAR LINHA REPETIDA (bug real, 03/09/2026): o PostgREST
   corta em 1.000 linhas e a paginação por Range só é consistente se houver uma
   ordenação ESTÁVEL — sem ela o Postgres pode devolver as linhas em ordem
   diferente a cada página, e a mesma linha aparece duas vezes enquanto outra
   nunca aparece. Sintoma: um motorista com 37 "dias" num mês de 31, o km do
   mês inflado e a média ponderada puxada pelos dias contados em dobro.
   `id` é a chave primária de todas as tabelas lidas aqui, então serve de
   critério estável; a deduplicação por id fica como rede (e avisa no log). */
async function sbTodos(caminho) {
  const url = caminho.includes('order=') ? caminho
    : caminho + (caminho.includes('?') ? '&' : '?') + 'order=id.asc';
  const out = []; const PASSO = 1000; const vistos = new Set(); let repetidas = 0;
  for (let de = 0; ; de += PASSO) {
    const r = await fetch(`${SB_URL}/rest/v1/${url}`, {
      headers: { ...H_SB, Range: `${de}-${de + PASSO - 1}` } });
    if (!r.ok) throw new Error(`${caminho}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const lote = await r.json();
    for (const l of lote) {
      if (l && l.id != null) { if (vistos.has(l.id)) { repetidas++; continue; } vistos.add(l.id); }
      out.push(l);
    }
    if (lote.length < PASSO) {
      if (repetidas) console.log(`⚠ ${repetidas} linha(s) repetida(s) descartada(s) em ${caminho.split('?')[0]}`);
      return out;
    }
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

  const linhas = []; const velDist = [], acelDist = [];
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
      acel:   (() => { const v = pond('acel_100km'); if (v != null) acelDist.push(v); return nota('acel', v); })(),
      vel:    (() => { const v = pond('vel_excesso_pct'); if (v != null) velDist.push(v); return nota('vel', v); })(),
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
      // viagens do mês: o diário guarda a contagem no bruto (uma linha por
      // viagem do Geotab / registro de condução da vFleets)
      viagens: ds.reduce((s, d) => s + (+(d.bruto && d.bruto.viagens) || 0), 0),
      // excessos de velocidade = eventos da regra de speeding do Geotab no mês
      // (Renan, 03/09/2026: a coluna do painel mostra OK/NOK e a quantidade)
      vel_excessos: ds.reduce((s, d) => s + (+(d.bruto && d.bruto.eventos && d.bruto.eventos.vel) || 0), 0),
      // litros do mês = soma dos dias que tiveram FuelUsed (null se nenhum)
      litros: (() => { const v = ds.filter(d => d.litros != null); return v.length ? +v.reduce((s, d) => s + (+d.litros || 0), 0).toFixed(1) : null; })(),
      // km das viagens com litros no mês — numerador do km/L (nunca o km inteiro)
      km_litros: (() => { const v = ds.filter(d => d.litros != null); return v.length ? v.reduce((s, d) => s + (+(d.bruto && d.bruto.kmLitros) || 0), 0) : null; })(),
      // placa mais rodada no mês (Σ km por placa dos dias) — casa com a base Ativos
      placa: (() => {
        const km = {};
        ds.forEach(d => { const p = d.bruto && d.bruto.placas; if (p) Object.entries(p).forEach(([k, v]) => { km[k] = (km[k] || 0) + (+v || 0); }); });
        const top = Object.entries(km).sort((a, b) => b[1] - a[1])[0];
        return top ? top[0] : null;
      })(),
      rpm_pontos: notas.rpm, idle_pontos: notas.idle, acel_pontos: notas.acel, frea_pontos: null,
      vel_pontos: notas.vel, freio_pontos: notas.freio, cambio_pontos: notas.cambio,
      pontuacao: score(notas), atualizado_em: new Date().toISOString(),
    });
  }
  if (acelDist.length) {
    // onde a frota está em aceleração brusca — é o que calibra REGUA.acel.zeraEm
    // (Renan, 03/09/2026: "aceleração está bom demais para ser verdade")
    const v = acelDist.slice().sort((a, b) => a - b), q = p => v[Math.min(v.length - 1, Math.floor(v.length * p))];
    const notaDe = z => x => Math.max(0, 100 - x / z * 100);
    console.log(`aceleração · eventos por 100 km em ${v.length} motorista-mês: zero em ${v.filter(x => x === 0).length}`
      + ` · p25 ${q(.25).toFixed(2)} · mediana ${q(.5).toFixed(2)} · p75 ${q(.75).toFixed(2)} · p90 ${q(.9).toFixed(2)} · máx ${v[v.length - 1].toFixed(2)}`
      + ` · régua zera em ${REGUA.acel.zeraEm.toFixed(1)}`);
    for (const z of [REGUA.acel.zeraEm, 8, 5, 3, 2]) {
      const n = notaDe(z), ms = v.map(n).sort((a, b) => a - b), qq = p => ms[Math.min(ms.length - 1, Math.floor(ms.length * p))];
      console.log(`   se zerar em ${String(z.toFixed(1)).padStart(4)}/100km → nota mediana ${qq(.5).toFixed(0)} · p25 ${qq(.25).toFixed(0)} · p10 ${qq(.1).toFixed(0)}`
        + ` · abaixo de 70: ${ms.filter(x => x < 70).length} · acima de 85: ${ms.filter(x => x >= 85).length}`);
    }
  }
  if (velDist.length) {
    // onde a frota está no pilar de velocidade — é o que calibra REGUA.vel.zeraEm
    const v = velDist.slice().sort((a, b) => a - b), q = p => v[Math.min(v.length - 1, Math.floor(v.length * p))];
    console.log(`velocidade · % do tempo acima do limite (ponderado por faixa) em ${v.length} motorista-mês:`
      + ` zero em ${v.filter(x => x === 0).length} · mediana ${q(.5).toFixed(2)} · p75 ${q(.75).toFixed(2)}`
      + ` · p90 ${q(.9).toFixed(2)} · máx ${v[v.length - 1].toFixed(2)} · régua zera em ${REGUA.vel.zeraEm}%`);
  }
  if (linhas.length) {
    // coluna nova que ainda não existe no banco (PGRST204) não derruba o mensal:
    // o robô avisa e regrava sem ela — foi o que parou o cron de 02/09/2026
    // quando `viagens` entrou antes do SQL rodar
    const gravar = async ls => fetch(`${SB_URL}/rest/v1/ce_scores_mensais?on_conflict=competencia,chave`, {
      method: 'POST', headers: { ...H_SB, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(ls),
    });
    let r2 = await gravar(linhas), ls = linhas;
    // pode faltar mais de uma coluna (litros + placa entraram juntas, 07/09/2026)
    for (let tent = 0; !r2.ok && tent < 3; tent++) {
      const txt = await r2.text();
      const m = /Could not find the '([a-z_]+)' column/.exec(txt);
      if (!(r2.status === 400 && m)) { r2 = { ok: false, status: r2.status, text: async () => txt }; break; }
      console.log(`⚠ ce_scores_mensais sem a coluna '${m[1]}' — gravando sem ela (rodar o SQL em scripts/conducao-economica.sql)`);
      ls = ls.map(({ [m[1]]: _, ...l }) => l);
      r2 = await gravar(ls);
    }
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

/* ── MARCHA DERIVADA de RPM ÷ VELOCIDADE (Renan, 02/09/2026) ───────────────
   A sonda mostrou que só 42 de 101 veículos publicam "Posição da marcha":
   quem tem câmbio manual sem ECU de transmissão não coloca esse PGN no
   barramento, embora publique RPM (98 de 101). Como a relação de
   transmissão é fixa em cada marcha, `rpm ÷ velocidade` é praticamente
   constante enquanto a marcha não muda — então a marcha dá para DERIVAR de
   dois dados que quase toda a frota tem.

   O pilar não precisa do NÚMERO da marcha, e sim de duas respostas:
     · "dava para subir?"  → a razão está longe da menor razão do veículo
       (ou seja, não está na marcha mais alta) e o motor está acelerado;
     · "está afogando?"    → a razão está perto da menor (marcha alta) e o
       motor está abaixo do platô.
   A menor razão de cada veículo sai do próprio dado (percentil 5), então não
   é preciso tabela de relações por modelo — o que seria chute com 3 marcas
   e caixas de 5, 6 e 12 marchas na frota.

   Este modo NÃO grava: ele calcula e CONFERE contra os 42 que publicam a
   marcha de verdade, que é o gabarito para saber se a derivação serve.  */
const V_MIN_KMH = +process.env.CE_MARCHA_VMIN || 15;   // abaixo disso, embreagem/arranque sujam a razão
const G_SUBIR   = +process.env.CE_MARCHA_GSUBIR || 1.15; // razão 15% acima da menor = tem marcha acima
const G_ALTA    = +process.env.CE_MARCHA_GALTA  || 1.25; // até 25% acima da menor = marcha alta

// velocidade do dia por veículo: LogRecord (GPS) é a fonte mais coberta
async function geotabVelDia(dia, cred) {
  const de0 = `${dia}T03:00:00.000Z`;
  const fim = new Date(new Date(de0).getTime() + 864e5 - 1).toISOString();
  const porDev = new Map();
  let from = de0, pag = 0, total = 0;
  while (pag < 40) {
    const lote = await geotabRpc('Get', { typeName: 'LogRecord',
      search: { fromDate: from, toDate: fim }, resultsLimit: 50000 }, cred);
    pag++; total += lote.length;
    for (const r of lote) {
      const id = r.device && r.device.id; if (!id) continue;
      const v = +r.speed; if (!isFinite(v)) continue;
      let a = porDev.get(id); if (!a) { a = []; porDev.set(id, a); }
      a.push({ t: new Date(r.dateTime).getTime(), v });
    }
    if (lote.length < 50000) break;
    from = new Date(new Date(lote[lote.length - 1].dateTime).getTime() + 1).toISOString();
  }
  porDev.forEach(a => a.sort((x, y) => x.t - y.t));
  return { porDev, total, paginas: pag };
}

// casa cada amostra de RPM com a velocidade vigente e devolve as razões
function razoes(rpmAm, velAm) {
  const out = [];
  if (!rpmAm || !velAm || !velAm.length) return out;
  let j = 0;
  for (const a of rpmAm) {
    while (j + 1 < velAm.length && velAm[j + 1].t <= a.t) j++;
    const vv = velAm[j];
    if (!vv || Math.abs(vv.t - a.t) > RPM_GAP_MS) continue;
    if (!(vv.v >= V_MIN_KMH) || !isFinite(a.rpm) || a.rpm <= RPM_LENTA) continue;
    out.push({ t: a.t, rpm: a.rpm, v: vv.v, r: a.rpm / vv.v });
  }
  return out;
}
const percentil = (arr, p) => {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))];
};

/* ── COBERTURA DE RPM POR PLACA (Renan, 02/09/2026) ────────────────────────
   "Quantas placas NUNCA reportaram rpm?" — um dia só não responde: veículo
   parado no dia não prova nada. Este modo varre um período (padrão: 30
   dias), conta para cada placa em quantos dias ela RODOU e em quantos dias
   houve amostra de motor, e separa os três casos que se confundem:
     · nunca rodou           → nem entra na conta;
     · rodou e SEMPRE teve rpm → telemetria completa;
     · rodou e NUNCA teve rpm  → ou não é veículo com ECU (implemento,
       carreta, empilhadeira), ou o aparelho está sem o barramento ligado —
       e essa segunda é chamado para a Argus.
   O tipo do veículo vem da base de ativos do Ginfo, que é o que separa um
   caso do outro. Log com placa, unidade, tipo e contagem — nada de pessoa. */
/* ── BASE DE MEDIÇÃO POR MOTORISTA (Renan, 02/09/2026) ─────────────────────
   "Quais motoristas eu consigo medir num mês, para ter parâmetro de cobrança?"
   Um motorista que rodou 2 dias no mês não é comparável com quem rodou 20 —
   cobrar os dois pela mesma régua é injusto e destrói a confiança no ranking.
   Este modo mede a BASE de cada um em um mês: dias com faixa verde apurada e
   horas de motor efetivamente medidas, e mostra a DISTRIBUIÇÃO, que é o que
   permite escolher o corte com dado em vez de chute.
   Repositório público: o log traz faixas, contagens e unidade — nunca nome
   nem chave de motorista.                                                  */
/* ── SIMULAÇÃO DE PREMIAÇÃO (Renan, 02/09/2026) ────────────────────────────
   Piloto em Piraí com teto de R$ 3.000/mês. A pergunta é de DESENHO: premiar
   os 10 melhores, pagar proporcional ao score, ou premiar todo mundo que
   bater uma meta? Cada modelo tem um efeito diferente sobre quem está no
   meio da tabela — que é a maioria e é onde mora o ganho de consumo.
   Este modo NÃO grava nada: lê os scores do mês, mostra a distribuição e
   simula os modelos lado a lado, com o custo de cada um dentro do teto.
   Log com faixas, contagens e valores — nunca nome de motorista.          */
if (MODE === 'carteira') {
  /* CARTEIRA QUE ESVAZIA (Renan, 03/09/2026): em vez de disputar um prêmio no
     fim do mês, o motorista COMEÇA com um saldo e vai perdendo conforme cada
     pilar fica abaixo de 100 — é o que o app mostraria linha a linha ("você
     perdeu R$ X em faixa verde"). O saldo final é saldo × score/100, e a perda
     DECOMPÕE exatamente por pilar:
       perda do pilar i = saldo × peso_i × (1 − nota_i) × deflator
       perda de velocidade = saldo × (1 − deflator)
     A soma das perdas com o saldo final devolve o saldo inicial (conferido no
     log): não há dinheiro sumindo em arredondamento de explicação. */
  if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }
  const MES  = (process.env.CE_MES || '2026-08').slice(0, 7);
  const UNI  = (process.env.CE_UNI || 'EMP PIRAI').toUpperCase();
  const BASE_MIN = +process.env.CE_BASE_MIN || 8;
  // elegibilidade por VIAGENS no mês (Renan, 03/09/2026) — é a unidade de
  // trabalho do motorista, e não depende de o dia ter sido medido inteiro
  const VIAG_MIN = +process.env.CE_VIAG_MIN || 0;
  // piso de SCORE para receber (Renan, 03/09/2026): abaixo dele a carteira
  // zera — quem não chegou na régua não leva o que sobrou
  const SCORE_MIN = +process.env.CE_SCORE_MIN || 0;
  const SALDOS = String(process.env.CE_SALDO || '200,300').split(',')
    .map(s => +s.trim()).filter(v => v > 0);
  const brl = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  console.log(`carteira do motorista · ${UNI} · ${MES} · saldo inicial ${SALDOS.map(brl).join(' e ')}`);

  const mens = await sbTodos('ce_scores_mensais?select=chave,unidade,km,dias,viagens,'
    + `rpm_pontos,idle_pontos,acel_pontos,vel_pontos,pontuacao&competencia=eq.${MES}-01`);
  const todos = mens.filter(m => String(m.unidade || '').toUpperCase() === UNI
    && !String(m.chave || '').startsWith('semlogin:')   // não é pessoa
    && m.pontuacao != null);
  if (!todos.length) { console.log('sem gente na unidade neste mês.'); process.exit(0); }

  // pesos do score de hoje — velocidade é deflator, não entra na média
  const PES = PESOS;   // os MESMOS pesos do score (velocidade fora, 03/09/2026)
  const ROT = { rpm: 'Faixa Verde', idle: 'Motor Ocioso', acel: 'Aceleração', vel: 'Velocidade' };
  const conta = (r, S) => {
    const v = { rpm: r.rpm_pontos, idle: r.idle_pontos, acel: r.acel_pontos, vel: r.vel_pontos };
    let den = 0; for (const k in PES) if (v[k] != null) den += PES[k];
    if (!den) return null;
    const perdas = {}; let base = 0;
    for (const k in PES) {
      if (v[k] == null) continue;
      const w = PES[k] / den, n = Math.min(1, Math.max(0, v[k] / 100));
      base += w * n;
      perdas[k] = S * w * (1 - n);
    }
    return { final: S * base, perdas };
  };

  const diasMax = Math.max(...todos.map(m => +m.dias || 0));
  const vg = r => +r.viagens || 0;
  const recortes = [
    ['TODOS os que rodaram no mês', todos, r => 1],
    [`só quem tem base de ${BASE_MIN}+ dias medidos`, todos.filter(m => (+m.dias || 0) >= BASE_MIN), r => 1],
    [`base de ${BASE_MIN}+ dias, saldo PRÓ-RATA pelos dias rodados (mês cheio = ${diasMax} dias)`,
      todos.filter(m => (+m.dias || 0) >= BASE_MIN), r => Math.min(1, (+r.dias || 0) / diasMax)],
  ];
  if (VIAG_MIN > 0) {
    /* Com a régua por viagens o saldo pode ser COTA: cada bloco de VIAG_MIN
       viagens vale um saldo cheio (2 blocos = 2 saldos). É o desenho em que
       quem roda mais tem mais a ganhar e a mais a perder — e o único que
       muda o custo de verdade, porque o corte de elegibilidade sozinho não
       tira quase ninguém: quase todo mundo passa de 15 viagens no mês. */
    const elig = todos.filter(m => vg(m) >= VIAG_MIN);
    recortes.push(
      [`ELEGÍVEL: ${VIAG_MIN}+ viagens no mês · saldo cheio para cada um`, elig, r => 1],
      [`${VIAG_MIN}+ viagens · saldo PRÓ-RATA (${VIAG_MIN} viagens = saldo cheio, teto de 1 saldo)`,
        elig, r => Math.min(1, vg(r) / VIAG_MIN)],
      [`${VIAG_MIN}+ viagens · saldo POR COTA de ${VIAG_MIN} viagens (sem teto)`,
        elig, r => vg(r) / VIAG_MIN],
    );
    if (SCORE_MIN > 0) {
      const eligS = elig.filter(m => +m.pontuacao >= SCORE_MIN);
      recortes.push([`${VIAG_MIN}+ viagens E score ${SCORE_MIN}+ · saldo cheio`
        + ` (${elig.length - eligS.length} ficaram abaixo do piso e recebem zero)`, eligS, r => 1]);
    }
  }

  console.log(`\nmotoristas com nota no mês: ${todos.length}`
    + ` · com ${BASE_MIN}+ dias: ${todos.filter(m => (+m.dias || 0) >= BASE_MIN).length}`);
  const vgs = todos.map(m => +m.viagens || 0).sort((a, b) => a - b);
  console.log(`viagens no mês por motorista: mín ${vgs[0]} · mediana ${vgs[Math.floor(vgs.length / 2)]}`
    + ` · máx ${vgs[vgs.length - 1]}`);
  console.log('viagens  ' + [1, 5, 10, 20, 40].map(c =>
    `${c}+: ${todos.filter(m => (+m.viagens || 0) >= c).length}`).join(' · '));

  // Um pilar que ninguém perde ponto não está medindo nada — e sem isto a
  // diferença entre "todo mundo dirige bem" e "a fonte não entrega o dado"
  // some dentro da média.
  console.log('\n── COBERTURA DOS PILARES (nota 100 = não tira nada do saldo) ──');
  for (const [k, rot] of Object.entries(ROT)) {
    const col = k + '_pontos';
    const vs = todos.map(m => m[col]).filter(v => v != null).map(Number);
    if (!vs.length) { console.log(`   ${rot.padEnd(14)} SEM DADO em nenhum motorista`); continue; }
    const med = vs.reduce((a, b) => a + b, 0) / vs.length;
    console.log(`   ${rot.padEnd(14)} ${vs.length}/${todos.length} com nota`
      + ` · média ${med.toFixed(1)} · em 100 (nota cheia): ${vs.filter(v => v >= 99.95).length}`
      + ` · em 0: ${vs.filter(v => v <= 0.05).length}`);
  }

  for (const S of SALDOS) {
    console.log(`\n══ SALDO INICIAL ${brl(S)} ══`);
    for (const [rot, lista, prorata] of recortes) {
      let pago = 0, bolsa = 0, vals = [];
      const perdaTot = { rpm: 0, idle: 0, acel: 0, vel: 0 };
      for (const r of lista) {
        const s = S * prorata(r), c = conta(r, s);
        if (!c) continue;
        bolsa += s; pago += c.final; vals.push(c.final);
        for (const k in perdaTot) perdaTot[k] += c.perdas[k] || 0;
      }
      if (!vals.length) continue;
      vals.sort((a, b) => b - a);
      const guard = bolsa - pago - Object.values(perdaTot).reduce((a, b) => a + b, 0);
      console.log(`\n${rot} — ${vals.length} motorista(s)`);
      console.log(`   provisionado ${brl(bolsa)} · PAGO ${brl(pago)} (${(pago / bolsa * 100).toFixed(1)}%)`
        + ` · retido ${brl(bolsa - pago)}`);
      console.log(`   por motorista: maior ${brl(vals[0])} · mediana ${brl(vals[Math.floor(vals.length / 2)])}`
        + ` · menor ${brl(vals[vals.length - 1])}`);
      console.log('   o que comeu o saldo: ' + Object.keys(perdaTot)
        .sort((a, b) => perdaTot[b] - perdaTot[a])
        .map(k => `${ROT[k]} ${brl(perdaTot[k])}`).join(' · '));
      if (Math.abs(guard) > 0.01) console.log(`   ⚠ decomposição não fecha por ${brl(guard)}`);
    }
  }
  console.log('\nSimulação encerrada — nada foi gravado.');
  process.exit(0);
}

/* ── O PROGRAMA COMO O RENAN DESENHOU (03/09/2026) ─────────────────────────
   Elegível quem rodou 1.000+ km E está entre os 15 primeiros do ranking.
   Cada elegível começa o mês com R$ 200 na conta e vai perdendo conforme cada
   pilar fica abaixo de 100 — é isso que o app mostra todo dia, em dinheiro.
   No fim, o pódio leva um extra: 1º R$ 300 · 2º R$ 150 · 3º R$ 100.

   A régua de VIAGENS saiu (Renan: "tire viagens; quando conseguirmos mensurar
   fazemos"). O motivo é conhecido: hoje "viagem" no Geotab é ciclo de
   ignição, então parar para abastecer conta como viagem nova. Km rodado não
   tem essa ambiguidade — é a mesma distância pelo caminho que for.

   Não grava nada. Log com faixas, contagens e valores — nunca nome.        */
if (MODE === 'programa') {
  if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }
  /* O MÊS ACEITA FAIXA (Renan, 04/09/2026): "quanto daria mensal a Conlog
     inteira" não se responde com um mês — o custo varia com quem rodou e com
     quem foi bem. Aceita '2026-08', uma lista '2026-06,2026-07' ou a faixa
     '2026-01..2026-08', e o resumo do fim mostra o mês a mês, a média e o
     teto (todo mundo com 100). */
  const MESES = (() => {
    const cru = (process.env.CE_MES || '2026-08').trim();
    if (cru.includes('..')) {
      const [a, b] = cru.split('..').map(x => x.trim().slice(0, 7));
      const out = []; let [ay, am] = a.split('-').map(Number);
      const [by, bm] = b.split('-').map(Number);
      while (ay < by || (ay === by && am <= bm)) {
        out.push(`${ay}-${String(am).padStart(2, '0')}`);
        if (++am > 12) { am = 1; ay++; }
        if (out.length > 60) break;
      }
      return out;
    }
    return cru.split(',').map(x => x.trim().slice(0, 7)).filter(Boolean);
  })();
  const MES = MESES[MESES.length - 1];
  /* UNIDADE ACEITA LISTA (Renan, 03/09/2026): "PIR e Lata PIR juntos" é UM
     programa com UM pódio, não a soma de dois. Somar os dois totais separados
     daria 22 elegíveis e dois pódios; no pool os 15 melhores são escolhidos
     entre os dois e o pódio é um só — o custo é MENOR e a disputa é maior. */
  const UNIS = (process.env.CE_UNI || 'EMP PIRAI').toUpperCase()
    .split(/\s*[,+]\s*/).map(s => s.trim()).filter(Boolean);
  const UNI = UNIS.join(' + ');
  const KM_MIN = +process.env.CE_KM_MIN || 1000;
  const TOP_N  = +process.env.CE_TOP || 15;
  const SALDO  = +process.env.CE_SALDO_UNICO || 200;
  const PODIO  = String(process.env.CE_PODIO || '300,150,100').split(',')
    .map(s => +s.trim()).filter(v => v > 0);
  const brl = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PES = PESOS;   // os MESMOS pesos do score
  const ROT = { rpm: 'Faixa Verde', idle: 'Motor Ocioso', acel: 'Aceleração' };
  const conta = (r, S) => {
    const v = { rpm: r.rpm_pontos, idle: r.idle_pontos, acel: r.acel_pontos };
    let den = 0; for (const k in PES) if (v[k] != null) den += PES[k];
    if (!den) return null;
    const perdas = {}; let base = 0;
    for (const k in PES) {
      if (v[k] == null) continue;
      const w = PES[k] / den, n = Math.min(1, Math.max(0, v[k] / 100));
      base += w * n; perdas[k] = S * w * (1 - n);
    }
    return { final: S * base, perdas };
  };

  console.log(`PROGRAMA · ${UNI} · ${MES} · saldo ${brl(SALDO)} · elegível: ${KM_MIN}+ km`
    + ` e top ${TOP_N} · pódio ${PODIO.map(brl).join(' / ')}`);

  // uma leitura só para todos os meses pedidos; depois agrupa por competência
  const mens = await sbTodos('ce_scores_mensais?select=chave,unidade,km,dias,competencia,'
    + `rpm_pontos,idle_pontos,acel_pontos,pontuacao&competencia=gte.${MESES[0]}-01`
    + `&competencia=lte.${MES}-01`);
  const porMes = new Map();
  mens.filter(m => !String(m.chave || '').startsWith('semlogin:') && m.pontuacao != null)
    .forEach(m => {
      const k = String(m.competencia).slice(0, 7);
      if (!MESES.includes(k)) return;
      (porMes.get(k) || porMes.set(k, []).get(k)).push(m);
    });
  let validos = porMes.get(MES) || [];

  // roda a conta para uma unidade e devolve o custo — serve para o piloto e
  // para a linha de "se rodasse em todas"
  function simula(uni, verboso) {
    const alvo = Array.isArray(uni) ? uni : [uni];
    const rot = alvo.join(' + ');
    const todos = validos.filter(m => alvo.includes(String(m.unidade || '').toUpperCase()));
    if (!todos.length) return null;
    const comKm = todos.filter(m => (+m.km || 0) >= KM_MIN);
    const elig = [...comKm].sort((a, b) => b.pontuacao - a.pontuacao).slice(0, TOP_N);
    if (!elig.length) return null;

    let pago = 0; const perdaTot = { rpm: 0, idle: 0, acel: 0 }; const vals = [];
    for (const r of elig) {
      const c = conta(r, SALDO); if (!c) continue;
      pago += c.final; vals.push(c.final);
      for (const k in perdaTot) perdaTot[k] += c.perdas[k] || 0;
    }
    const extra = PODIO.slice(0, elig.length).reduce((a, b) => a + b, 0);
    const total = pago + extra;

    if (verboso) {
      const kms = todos.map(m => +m.km || 0).sort((a, b) => a - b);
      console.log(`\nmotoristas com nota em ${rot}: ${todos.length}`);
      console.log(`   km no mês: mín ${Math.round(kms[0])} · mediana`
        + ` ${Math.round(kms[Math.floor(kms.length / 2)])} · máx ${Math.round(kms[kms.length - 1])}`);
      console.log('   ' + [500, 1000, 2000, 3000, 5000].map(c =>
        `${c}+ km: ${todos.filter(m => (+m.km || 0) >= c).length}`).join(' · '));
      console.log(`\nFUNIL: ${todos.length} com nota → ${comKm.length} com ${KM_MIN}+ km`
        + ` → ${elig.length} elegíveis (top ${TOP_N})`);
      if (comKm.length <= TOP_N) console.log(`   ⚠ a régua de km já corta abaixo de ${TOP_N}:`
        + ' o "top 15" não exclui mais ninguém neste mês');
      else console.log(`   corte: o ${elig.length}º colocado tem`
        + ` ${elig[elig.length - 1].pontuacao.toFixed(1)} pontos`
        + ` · o 1º fora tem ${comKm.sort((a, b) => b.pontuacao - a.pontuacao)[TOP_N].pontuacao.toFixed(1)}`);
      const ps = elig.map(m => m.pontuacao);
      console.log(`   score dos elegíveis: ${Math.min(...ps).toFixed(1)} a ${Math.max(...ps).toFixed(1)}`
        + ` · média ${(ps.reduce((a, b) => a + b, 0) / ps.length).toFixed(1)}`);

      /* POR QUE OS SCORES FICAM TÃO COLADOS (Renan perguntou, 03/09/2026).
         O score é média ponderada: quem separa as pessoas é o pilar cuja
         CONTRIBUIÇÃO (peso × nota) mais varia. Um pilar em que todo mundo
         tira quase 100 não separa ninguém — só dilui os que separam. Este
         bloco mede isso em vez de supor: dispersão de cada pilar entre quem
         passou do km, e quanto de espalhamento sobra no score final.       */
      const dp = xs => { const m = xs.reduce((a, b) => a + b, 0) / xs.length;
        return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length); };
      const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b);
        return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
      let denPad = 0; for (const k in PES) denPad += PES[k];
      console.log('\n── O QUE SEPARA AS PESSOAS (entre os que passaram do km) ──');
      for (const k of Object.keys(PES)) {
        const xs = comKm.map(m => m[k + '_pontos']).filter(v => v != null).map(Number);
        if (!xs.length) { console.log(`   ${ROT[k].padEnd(13)} sem dado`); continue; }
        const w = PES[k] / denPad;
        console.log(`   ${ROT[k].padEnd(13)} nota ${q(xs, .05).toFixed(1)} a ${q(xs, .95).toFixed(1)}`
          + ` (mediana ${q(xs, .5).toFixed(1)}) · desvio ${dp(xs).toFixed(1)}`
          + ` · peso ${(w * 100).toFixed(0)}% → move o score em ±${(dp(xs) * w).toFixed(1)} ponto(s)`);
      }
      const pk = comKm.map(m => m.pontuacao);
      console.log(`   ${'SCORE FINAL'.padEnd(13)} ${q(pk, .05).toFixed(1)} a ${q(pk, .95).toFixed(1)}`
        + ` · desvio ${dp(pk).toFixed(1)} ponto(s)`);
      // se o ranking fosse por um pilar só, quanto o 1º se descolaria do 15º?
      console.log('   distância entre o 1º e o 15º, se o ranking fosse por:');
      for (const k of Object.keys(PES)) {
        const xs = comKm.map(m => m[k + '_pontos']).filter(v => v != null).map(Number)
          .sort((a, b) => b - a);
        if (xs.length >= TOP_N) console.log(`      ${ROT[k].padEnd(13)}`
          + ` ${(xs[0] - xs[TOP_N - 1]).toFixed(1)} ponto(s)`);
      }
      const pord = [...pk].sort((a, b) => b - a);
      if (pord.length >= TOP_N) console.log(`      ${'score de hoje'.padEnd(13)}`
        + ` ${(pord[0] - pord[TOP_N - 1]).toFixed(1)} ponto(s)`);

      vals.sort((a, b) => b - a);
      console.log(`\nCUSTO DO MÊS: ${brl(total)}`);
      console.log(`   carteiras   ${brl(pago).padStart(12)}   (provisionado ${brl(SALDO * elig.length)}`
        + ` · retido ${brl(SALDO * elig.length - pago)} = ${((1 - pago / (SALDO * elig.length)) * 100).toFixed(1)}%)`);
      console.log(`   pódio       ${brl(extra).padStart(12)}   (${PODIO.slice(0, elig.length).map(brl).join(' + ')})`);
      console.log(`\n   por motorista, só a carteira: maior ${brl(vals[0])}`
        + ` · mediana ${brl(vals[Math.floor(vals.length / 2)])} · menor ${brl(vals[vals.length - 1])}`);
      console.log(`   o 1º colocado leva ${brl(vals[0] + PODIO[0])} (carteira + pódio)`);
      console.log('\n   o que comeu o saldo: ' + Object.keys(perdaTot)
        .sort((a, b) => perdaTot[b] - perdaTot[a])
        .map(k => `${ROT[k]} ${brl(perdaTot[k])}`).join(' · '));
      console.log(`\n   teto do desenho (todo mundo com 100): ${brl(SALDO * elig.length + extra)}`);
    }
    return { uni: rot, n: elig.length, pago, extra, total };
  }

  simula(UNIS, true);

  /* A CONLOG INTEIRA = cada unidade com o seu próprio programa (o seu top 15
     e o seu pódio), somadas. Não é um ranking único nacional: o motorista de
     Piraí não disputa com o de Pelotas, porque a operação é outra. */
  function conlog(mes) {
    validos = porMes.get(mes) || [];
    const unis = [...new Set(validos.map(m => String(m.unidade || '').toUpperCase()))]
      .filter(Boolean).sort();
    const linhas = unis.map(u => simula(u, false)).filter(Boolean);
    if (!linhas.length) return null;
    return {
      mes, linhas,
      n:     linhas.reduce((a, b) => a + b.n, 0),
      pago:  linhas.reduce((a, b) => a + b.pago, 0),
      extra: linhas.reduce((a, b) => a + b.extra, 0),
      total: linhas.reduce((a, b) => a + b.total, 0),
      motoristas: validos.length,
    };
  }

  const doMes = conlog(MES);
  if (doMes && doMes.linhas.length > 1) {
    console.log(`\n── A CONLOG INTEIRA em ${MES} (cada unidade com o seu top ${TOP_N} e o seu pódio) ──`);
    doMes.linhas.sort((a, b) => b.total - a.total).forEach(l =>
      console.log(`   ${l.uni.padEnd(17)} ${String(l.n).padStart(2)} elegíveis`
        + ` · carteiras ${brl(l.pago).padStart(12)} · pódio ${brl(l.extra).padStart(11)}`
        + ` · TOTAL ${brl(l.total).padStart(12)}`));
    console.log(`   ${'SOMA'.padEnd(17)} ${String(doMes.n).padStart(2)} elegíveis`
      + ` · carteiras ${brl(doMes.pago).padStart(12)}`
      + ` · pódio ${brl(doMes.extra).padStart(11)}`
      + ` · TOTAL ${brl(doMes.total).padStart(12)}`);
    /* O PÓDIO NÃO ESCALA COM A UNIDADE PEQUENA: numa unidade com 1 ou 2
       elegíveis o R$ 300 do 1º lugar sai sem disputa nenhuma, e o pódio passa
       a pesar mais que as carteiras. Quem decide se isso é aceitável é o
       Renan — o robô só mostra quanto disso existe. */
    const magras = doMes.linhas.filter(l => l.n < PODIO.length);
    if (magras.length) console.log(`\n   ⚠ ${magras.length} unidade(s) com menos de ${PODIO.length}`
      + ` elegíveis — o pódio delas soma ${brl(magras.reduce((a, b) => a + b.extra, 0))}`
      + ' sem disputa real: ' + magras.map(l => `${l.uni} (${l.n})`).join(', '));
  }

  /* MÊS A MÊS: um mês só é uma foto. O que o Renan precisa para aprovar
     orçamento é a média e o pior mês, mais o teto de quanto poderia custar se
     todo mundo tirasse 100 — o programa é bom quando CUSTA o teto. */
  if (MESES.length > 1) {
    console.log(`\n── CUSTO MENSAL DA CONLOG INTEIRA, mês a mês ──`);
    const hist = MESES.map(conlog).filter(Boolean);
    hist.forEach(h => {
      const teto = SALDO * h.n + h.extra;
      console.log(`   ${h.mes}  ${String(h.linhas.length).padStart(2)} unidade(s)`
        + ` · ${String(h.n).padStart(3)} elegíveis · carteiras ${brl(h.pago).padStart(12)}`
        + ` · pódio ${brl(h.extra).padStart(11)} · TOTAL ${brl(h.total).padStart(12)}`
        + `   (teto ${brl(teto)})`);
    });
    const tot = hist.map(h => h.total);
    const med = tot.reduce((a, b) => a + b, 0) / tot.length;
    const tetos = hist.map(h => SALDO * h.n + h.extra);
    console.log(`\n   MÉDIA MENSAL ${brl(med)} · menor ${brl(Math.min(...tot))}`
      + ` · maior ${brl(Math.max(...tot))}`);
    console.log(`   TETO MÉDIO (todo mundo com 100) ${brl(tetos.reduce((a, b) => a + b, 0) / tetos.length)}`
      + ` · maior teto ${brl(Math.max(...tetos))}`);
    console.log(`   no ano, somando os ${hist.length} meses: ${brl(tot.reduce((a, b) => a + b, 0))}`);
    // a cobertura cresce conforme mais motoristas são identificados: um mês
    // com menos unidades custa menos porque MEDE menos, não porque foi melhor
    const uMin = Math.min(...hist.map(h => h.linhas.length));
    const uMax = Math.max(...hist.map(h => h.linhas.length));
    if (uMin !== uMax) console.log(`\n   ⚠ a cobertura varia de ${uMin} a ${uMax} unidades no período:`
      + ' mês com menos unidade custa menos porque MEDE menos, não porque foi melhor.');
  }

  console.log('\nSimulação encerrada — nada foi gravado.');
  process.exit(0);
}

if (MODE === 'premio') {
  if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }
  const MES  = (process.env.CE_MES || '2026-08').slice(0, 7);
  const UNI  = (process.env.CE_UNI || 'EMP PIRAI').toUpperCase();
  const TETO = +process.env.CE_TETO || 3000;
  const BASE_MIN = +process.env.CE_BASE_MIN || 8;      // dias medidos p/ ser elegível
  console.log(`simulação de premiação · ${UNI} · ${MES} · teto R$ ${TETO.toLocaleString('pt-BR')}`);

  const mens = await sbTodos(`ce_scores_mensais?select=chave,unidade,km,dias,pontuacao&competencia=eq.${MES}-01`);
  const elig = mens.filter(m => String(m.unidade || '').toUpperCase() === UNI
    && !String(m.chave || '').startsWith('semlogin:')     // não é pessoa
    && m.pontuacao != null);
  const comBase = elig.filter(m => (+m.dias || 0) >= BASE_MIN);
  console.log(`\nmotoristas da unidade com nota no mês: ${elig.length}`);
  console.log(`com base de ${BASE_MIN}+ dias medidos: ${comBase.length}`);
  if (!comBase.length) { console.log('sem gente para simular.'); process.exit(0); }

  const scores = comBase.map(m => +m.pontuacao).sort((a, b) => b - a);
  const pct = p => scores[Math.min(scores.length - 1, Math.floor(scores.length * p))];
  const media = scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log(`\nSCORES: melhor ${scores[0].toFixed(1)} · mediana ${pct(0.5).toFixed(1)}`
    + ` · média ${media.toFixed(1)} · pior ${scores[scores.length - 1].toFixed(1)}`);
  console.log('\n── DISTRIBUIÇÃO ──');
  const faixas = [[90,200],[85,90],[80,85],[75,80],[70,75],[60,70],[0,60]];
  faixas.forEach(([lo, hi]) => {
    const n = scores.filter(s => s >= lo && s < hi).length;
    console.log(`   ${String(lo).padStart(3)} a ${hi === 200 ? '+  ' : String(hi).padStart(3)}: ${String(n).padStart(3)}`
      + `  ${'█'.repeat(Math.round(n / scores.length * 44))}`);
  });

  // a curva inteira, sem nome: é ela que diz onde dá para cortar
  console.log('\n── A CURVA (score de cada um, do melhor ao pior) ──');
  for (let i = 0; i < scores.length; i += 10) {
    console.log('   ' + String(i + 1).padStart(3) + 'º→  '
      + scores.slice(i, i + 10).map(s => s.toFixed(1).padStart(5)).join(' '));
  }

  const brl = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  console.log('\n══ MODELOS ══');

  // A) top N em partes iguais
  for (const N of [10, 15, 20, 30]) {
    const n = Math.min(N, scores.length);
    console.log(`A) top ${String(N).padStart(2)} iguais: ${n} premiado(s) · ${brl(TETO / n)} cada`
      + ` · corte no score ${scores[n - 1].toFixed(1)} · alcança ${(n / scores.length * 100).toFixed(0)}% da unidade`);
  }

  // B) bolsa proporcional ao score, para quem passa do corte (todos ganham algo)
  console.log('');
  for (const corte of [70, 75, 80]) {
    const dentro = scores.filter(s => s >= corte);
    if (!dentro.length) { console.log(`B) corte ${corte}: ninguém se qualifica`); continue; }
    const soma = dentro.reduce((a, s) => a + s, 0);
    const maior = TETO * dentro[0] / soma, menor = TETO * dentro[dentro.length - 1] / soma;
    console.log(`B) corte ${corte} · proporcional ao score: ${dentro.length} premiado(s)`
      + ` (${(dentro.length / scores.length * 100).toFixed(0)}% da unidade) · de ${brl(menor)} a ${brl(maior)}`);
  }

  // C) valor por FAIXA (tabela fixa) — custo varia, precisa caber no teto
  console.log('');
  for (const [vElite, vBom, vOk] of [[150, 100, 60], [200, 120, 70], [250, 150, 80]]) {
    const nE = scores.filter(s => s >= 85).length;
    const nB = scores.filter(s => s >= 75 && s < 85).length;
    const nO = scores.filter(s => s >= 70 && s < 75).length;
    const custo = nE * vElite + nB * vBom + nO * vOk;
    console.log(`C) faixas ${brl(vElite)}/${brl(vBom)}/${brl(vOk)}: ${nE}+${nB}+${nO} = ${nE + nB + nO} premiado(s)`
      + ` · custo ${brl(custo)} ${custo <= TETO ? '(cabe)' : '⚠ ESTOURA o teto'}`);
  }

  // D) o desenho que eu recomendo: bolsa fixa, proporcional ao MÉRITO ACIMA
  //    do corte, com teto individual — o custo é sempre o teto e o dinheiro
  //    se espalha em vez de concentrar no primeiro colocado
  console.log('');
  for (const corte of [70, 75]) {
    for (const tetoInd of [200, 300]) {
      const dentro = scores.filter(s => s >= corte);
      if (!dentro.length) continue;
      let pts = dentro.map(s => s - corte + 10);        // +10 = piso, para o do corte não zerar
      let valores = [], sobra = TETO, restantes = pts.slice();
      // rateio com teto individual: quem bate o teto trava e o resto redivide
      for (let i = 0; i < 6; i++) {
        const somaR = restantes.reduce((a, p) => a + (p || 0), 0);
        if (!somaR) break;
        valores = pts.map((p, k) => restantes[k] ? Math.min(tetoInd, sobra * p / somaR) : valores[k]);
        const travou = valores.some((v, k) => restantes[k] && v >= tetoInd - 0.01);
        if (!travou) break;
        valores.forEach((v, k) => { if (restantes[k] && v >= tetoInd - 0.01) { restantes[k] = 0; sobra -= tetoInd; } });
      }
      const tot = valores.reduce((a, v) => a + v, 0);
      console.log(`D) corte ${corte} + teto individual ${brl(tetoInd)}: ${dentro.length} premiado(s)`
        + ` (${(dentro.length / scores.length * 100).toFixed(0)}%) · de ${brl(Math.min(...valores))} a ${brl(Math.max(...valores))}`
        + ` · custo ${brl(tot)}`);
    }
  }
  console.log('\nSimulação encerrada — nada foi gravado.');
  process.exit(0);
}

/* POR QUE UM MOTORISTA FICA SEM FAIXA VERDE (Renan perguntou, 04/09/2026:
   "é por ter rodado pouco? vi um com 185 km e mesmo assim não mediu").
   A nota de RPM só nasce quando o dia tem MAIS DE 60 SEGUNDOS de leitura de
   RPM (`rpm.rodando` no bruto) — e essa leitura vem do diagnóstico de motor
   do VEÍCULO, não da distância. Carro que não publica RPM no Geotab roda 500
   km e entrega zero segundo. Este modo separa as duas causas com o dado na
   mão: quanto km rodou quem ficou sem nota, quantos segundos de RPM o dia
   registrou, e se a mesma pessoa tem nota em outro mês (aí é o veículo).
   Também mede o efeito colateral no ranking: sem o pilar de MAIOR peso, ele
   é redistribuído e o motorista sobe — é isso que põe quem rodou 1 km no
   topo. Log com contagens e faixas; nunca nome.                            */
if (MODE === 'semrpm') {
  if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }
  /* A JANELA TEM DE SER A MESMA DA TELA (Renan, 04/09/2026): o painel abre em
     "Todos os períodos" e AGREGA — o km da linha é a soma do ano e a nota é a
     média das vigências. Medir um mês só responde outra pergunta: em agosto
     sozinho são 2 motoristas sem RPM, na tela dele são vários. Aceita
     '2026-08' ou a faixa '2026-01..2026-08'. */
  const CRU = (process.env.CE_MES || '2026-01..2026-08').trim();
  const [M1, M2] = CRU.includes('..')
    ? CRU.split('..').map(x => x.trim().slice(0, 7))
    : [CRU.slice(0, 7), CRU.slice(0, 7)];
  const MES = M2;
  const de = M1 + '-01';
  const ate = new Date(+M2.slice(0, 4), +M2.slice(5, 7), 0).toISOString().slice(0, 10);
  console.log(`sem Faixa Verde · ${de} → ${ate}`);

  const dias = await sbTodos(`ce_diario?select=dia,chave,km,rpm_verde_pct,bruto&dia=gte.${de}&dia=lte.${ate}`);
  const por = new Map();
  for (const l of dias) {
    if (String(l.chave || '').startsWith('semlogin:')) continue;
    const e = por.get(l.chave) || { dias: 0, comRpm: 0, km: 0, seg: 0, segZero: 0 };
    e.dias++; e.km += +l.km || 0;
    if (l.rpm_verde_pct != null) e.comRpm++;
    const r = (l.bruto && l.bruto.rpm) || {};
    const seg = +r.rodando || 0;
    e.seg += seg;
    if (!seg) e.segZero++;
    por.set(l.chave, e);
  }
  const todos = [...por.entries()].map(([k, e]) => ({ k, ...e }));
  const sem = todos.filter(t => !t.comRpm), com = todos.filter(t => t.comRpm);
  console.log(`\nmotoristas que rodaram no mês: ${todos.length}`
    + ` · COM faixa verde em algum dia: ${com.length} · SEM em nenhum: ${sem.length}`);

  const q = (arr, p) => { if (!arr.length) return 0;
    const v = arr.map(x => x.km).sort((a, b) => a - b);
    return Math.round(v[Math.min(v.length - 1, Math.floor(p * v.length))]); };
  console.log(`   km no mês de quem TEM nota:  mín ${q(com, 0)} · mediana ${q(com, .5)} · máx ${q(com, 1)}`);
  console.log(`   km no mês de quem NÃO tem:   mín ${q(sem, 0)} · mediana ${q(sem, .5)} · máx ${q(sem, 1)}`);
  const semRodou = sem.filter(t => t.km >= 100);
  console.log(`\n   ${semRodou.length} motorista(s) SEM nota rodaram 100+ km`
    + ` (o maior deles, ${Math.round(Math.max(0, ...semRodou.map(t => t.km)))} km).`);
  console.log('   Se rodar bastante e mesmo assim não medir, a causa não é distância.');

  // 0 segundo de RPM no mês inteiro = o veículo não publica o diagnóstico;
  // alguns segundos e abaixo do corte = medição fraca, outra conversa
  const zero = sem.filter(t => t.seg === 0), pouco = sem.filter(t => t.seg > 0);
  console.log(`\n   dos ${sem.length} sem nota: ${zero.length} tiveram ZERO segundo de RPM no mês`
    + ` · ${pouco.length} tiveram algum, mas abaixo do corte de 60s/dia`);

  // a mesma pessoa com nota em OUTRO mês prova que é o veículo, não ela
  const outros = await sbTodos('ce_scores_mensais?select=chave,competencia,rpm_pontos');
  const temEmOutroMes = new Set(outros.filter(o => o.rpm_pontos != null
    && (String(o.competencia).slice(0, 7) < M1 || String(o.competencia).slice(0, 7) > M2))
    .map(o => o.chave));
  const viraLata = sem.filter(t => temEmOutroMes.has(t.k)).length;
  console.log(`   ${viraLata} deles TÊM faixa verde em outro mês — ou seja, a pessoa mede;`
    + ' o que não mede é o veículo que ela dirigiu neste mês.');

  /* O EFEITO NO RANKING: sem o pilar de maior peso (42%), o score vira média
     de Motor Ocioso e Aceleração — dois pilares em que quase todo mundo tira
     nota alta —, então quem não tem RPM SOBE. */
  const mens = await sbTodos('ce_scores_mensais?select=chave,unidade,km,competencia,'
    + `rpm_pontos,idle_pontos,acel_pontos,pontuacao&competencia=gte.${de}&competencia=lte.${M2}-01`);
  // agrega como a TELA agrega: km somado, notas em média das vigências
  const ag = new Map();
  mens.filter(m => !String(m.chave || '').startsWith('semlogin:') && m.pontuacao != null)
    .forEach(m => {
      const e = ag.get(m.chave) || { km: 0, pont: [], rpm: [] };
      e.km += +m.km || 0; e.pont.push(m.pontuacao);
      if (m.rpm_pontos != null) e.rpm.push(m.rpm_pontos);
      ag.set(m.chave, e);
    });
  const vv = [...ag.values()].map(e => ({ km: e.km,
    pontuacao: e.pont.reduce((a, b) => a + b, 0) / e.pont.length,
    rpm_pontos: e.rpm.length ? e.rpm.reduce((a, b) => a + b, 0) / e.rpm.length : null }))
    .sort((a, b) => b.pontuacao - a.pontuacao);
  const semN = vv.filter(m => m.rpm_pontos == null);
  const md = a => a.length ? (a.reduce((x, y) => x + y.pontuacao, 0) / a.length).toFixed(1) : '—';
  console.log(`\n── EFEITO NO RANKING, agregado como na tela (${de} → ${ate}) ──`);
  console.log(`   ${vv.length} motorista(s) no ranking · ${semN.length} sem faixa verde em vigência nenhuma`);
  const kmSem = semN.map(m => m.km).sort((a, b) => a - b);
  if (kmSem.length) console.log(`   km desses, somando o período: mín ${Math.round(kmSem[0])}`
    + ` · mediana ${Math.round(kmSem[Math.floor(kmSem.length/2)])}`
    + ` · máx ${Math.round(kmSem[kmSem.length-1])}`);
  console.log(`   score médio de quem TEM faixa verde: ${md(vv.filter(m => m.rpm_pontos != null))}`
    + ` · de quem NÃO tem: ${md(semN)}`);
  [10, 15, 30].forEach(n => { const top = vv.slice(0, n);
    console.log(`   no top ${String(n).padStart(2)} geral: ${top.filter(m => m.rpm_pontos == null).length}`
      + ` sem faixa verde · km mediano do top ${n}: `
      + Math.round([...top].map(m => +m.km || 0).sort((a, b) => a - b)[Math.floor(n / 2)]));
  });
  console.log('\nAnálise encerrada — nada foi gravado.');
  process.exit(0);
}

if (MODE === 'base') {
  if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }
  const MES = (process.env.CE_MES || '2026-08').slice(0, 7);
  const de = MES + '-01';
  const ate = new Date(+MES.slice(0, 4), +MES.slice(5, 7), 0).toISOString().slice(0, 10);
  console.log(`base de medição por motorista · ${de} → ${ate}`);

  const dias = await sbTodos(`ce_diario?select=dia,chave,km,rpm_verde_pct,bruto&dia=gte.${de}&dia=lte.${ate}`);
  const cad = await sbTodos('ce_motoristas?select=chave,unidade');
  const uniDe = new Map(cad.map(c => [c.chave, c.unidade || '(sem unidade)']));

  const por = new Map();   // chave → {dias, diasRpm, km, segRpm}
  for (const l of dias) {
    if (String(l.chave || '').startsWith('semlogin:')) continue;   // não é pessoa
    const e = por.get(l.chave) || { dias: 0, diasRpm: 0, km: 0, segRpm: 0 };
    e.dias++;
    e.km += +l.km || 0;
    if (l.rpm_verde_pct != null) e.diasRpm++;
    const r = l.bruto && l.bruto.rpm;
    if (r && isFinite(+r.rodando)) e.segRpm += +r.rodando;
    por.set(l.chave, e);
  }
  const linhas = [...por.entries()].map(([k, e]) => ({ ...e, uni: uniDe.get(k) || '(fora do cadastro)',
    horas: e.segRpm / 3600 }));
  console.log(`\nmotoristas que rodaram no mês: ${linhas.length}`);

  const faixa = (arr, rot, campo, cortes) => {
    console.log(`\n── ${rot} ──`);
    let ant = 0;
    for (const c of cortes) {
      const n = arr.filter(l => l[campo] > ant && l[campo] <= c).length;
      console.log(`   ${String(ant + (campo === 'diasRpm' ? 1 : 0)).padStart(3)} a ${String(c).padStart(3)}: ${String(n).padStart(4)} motorista(s)`
        + `  ${'█'.repeat(Math.round(n / Math.max(1, arr.length) * 50))}`);
      ant = c;
    }
    const n = arr.filter(l => l[campo] > ant).length;
    console.log(`   acima de ${ant}: ${String(n).padStart(4)} motorista(s)  ${'█'.repeat(Math.round(n / Math.max(1, arr.length) * 50))}`);
  };
  faixa(linhas, 'DIAS COM FAIXA VERDE APURADA no mês', 'diasRpm', [0, 2, 4, 7, 10, 15, 20]);
  faixa(linhas, 'HORAS DE MOTOR MEDIDAS no mês', 'horas', [1, 5, 10, 20, 40, 80]);

  // quanto do KM do mês cada corte cobre — é o que diz se o corte "perde" operação
  const kmTot = linhas.reduce((a, l) => a + l.km, 0);
  console.log('\n── O QUE CADA CORTE DEIXA DE FORA ──');
  console.log('corte (dias mín.)   motoristas dentro   % do km do mês coberto');
  for (const c of [1, 3, 5, 8, 10, 12, 15]) {
    const dentro = linhas.filter(l => l.diasRpm >= c);
    const km = dentro.reduce((a, l) => a + l.km, 0);
    console.log(`   ${String(c).padStart(2)} dia(s)          ${String(dentro.length).padStart(5)}/${linhas.length}`
      + `            ${(kmTot ? km / kmTot * 100 : 0).toFixed(1)}%`);
  }

  // por unidade: onde a base é fraca (unidade pode aparecer, pessoa não)
  const porUni = new Map();
  linhas.forEach(l => {
    const t = porUni.get(l.uni) || { n: 0, ok: 0, km: 0 };
    t.n++; if (l.diasRpm >= 8) t.ok++; t.km += l.km;
    porUni.set(l.uni, t);
  });
  console.log('\n── POR UNIDADE (base ≥ 8 dias com faixa verde) ──');
  [...porUni.entries()].sort((a, b) => (a[1].ok / a[1].n) - (b[1].ok / b[1].n))
    .forEach(([u, t]) => console.log(`   ${u.padEnd(22)} ${String(t.ok).padStart(3)}/${String(t.n).padEnd(3)} motorista(s) com base`
      + `  (${(t.ok / t.n * 100).toFixed(0)}%)`));
  console.log('\nRelatório encerrado — nada foi gravado.');
  process.exit(0);
}

if (MODE === 'rpmcov') {
  const cred = await geotabLogin();
  if (!cred) { console.error('Geotab: sem credencial'); process.exit(1); }
  const RDE = process.env.CE_DE || iso(new Date(ontem.getTime() - 29 * 864e5));
  const RATE = process.env.CE_ATE || iso(ontem);
  console.log(`cobertura de RPM por placa · ${RDE} → ${RATE}`);

  const est = new Map();   // devId → {diasRodou, diasRpm, km}
  let dias = 0;
  for (let d = new Date(RDE + 'T12:00:00Z'); iso(d) <= RATE; d = new Date(d.getTime() + 864e5)) {
    const dia = iso(d); dias++;
    const de = `${dia}T03:00:00.000Z`, ate = new Date(new Date(de).getTime() + 864e5 - 1).toISOString();
    try {
      const trips = await geotabRpc('Get', { typeName: 'Trip',
        search: { fromDate: de, toDate: ate }, resultsLimit: 50000 }, cred);
      const kmDia = new Map();
      trips.forEach(t => { const id = t.device && t.device.id; if (!id) return;
        kmDia.set(id, (kmDia.get(id) || 0) + (+t.distance || 0)); });
      const { porDev: rpmD } = await geotabRpmDia(dia, cred);
      for (const [id, km] of kmDia) {
        const e = est.get(id) || { diasRodou: 0, diasRpm: 0, km: 0 };
        e.diasRodou++; e.km += km;
        if ((rpmD.get(id) || []).length) e.diasRpm++;
        est.set(id, e);
      }
    } catch (e) { console.log(`${dia}: ${e.message.slice(0, 100)}`); }
  }

  const [devs, grupos] = await Promise.all([
    geotabRpc('Get', { typeName: 'Device' }, cred),
    geotabRpc('Get', { typeName: 'Group' }, cred),
  ]);
  const gN = new Map(grupos.map(g => [g.id, g.name || '']));
  const info = new Map(devs.map(d => {
    const u = (d.groups || []).map(g => gN.get(g.id) || '').find(n => /^UNI_/.test(n));
    return [d.id, { placa: String(d.licensePlate || d.name || d.id).toUpperCase().trim(),
                    uni: u ? u.replace(/^UNI_/, '') : '(sem grupo UNI)' }];
  }));

  // tipo do veículo: é o que separa "não tem ECU" de "instalação a corrigir"
  const TIPO = new Map();
  if (SB_KEY) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/ginfo_snapshot?chave=eq.ativos&select=data`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
      const [gs] = r.ok ? await r.json() : [];
      const pk = p => { const x = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return /^[A-Z]{3}\d{4}$/.test(x) ? x.slice(0, 4) + 'ABCDEFGHIJ'['0123456789'.indexOf(x[4])] + x.slice(5) : x; };
      (Array.isArray(gs && gs.data) ? gs.data : []).forEach(a =>
        TIPO.set(pk(a['Placa']), `${a['Tipo Veículo'] || '?'} · ${a['Modelo'] || ''}`.trim()));
    } catch (e) { console.log('ativos:', e.message.slice(0, 80)); }
  }
  const pk = p => { const x = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return /^[A-Z]{3}\d{4}$/.test(x) ? x.slice(0, 4) + 'ABCDEFGHIJ'['0123456789'.indexOf(x[4])] + x.slice(5) : x; };

  const linhas = [...est.entries()].map(([id, e]) => ({ ...(info.get(id) || { placa: id, uni: '?' }), ...e }));
  const nunca = linhas.filter(l => l.diasRpm === 0);
  const sempre = linhas.filter(l => l.diasRpm === l.diasRodou);
  const asVezes = linhas.filter(l => l.diasRpm > 0 && l.diasRpm < l.diasRodou);

  console.log(`\n${dias} dia(s) varrido(s) · ${linhas.length} placa(s) rodaram no período`);
  console.log(`   SEMPRE com rpm: ${sempre.length}`);
  console.log(`   às vezes:       ${asVezes.length}`);
  console.log(`   NUNCA com rpm:  ${nunca.length}`);

  if (nunca.length) {
    console.log('\n── PLACAS QUE RODARAM E NUNCA REPORTARAM RPM ──');
    console.log('placa      unidade                dias   km      tipo do veículo (base de ativos)');
    nunca.sort((a, b) => b.km - a.km).forEach(l => console.log(
      `${l.placa.padEnd(10)} ${l.uni.padEnd(22)} ${String(l.diasRodou).padStart(4)}  `
      + `${Math.round(l.km).toLocaleString('pt-BR').padStart(7)}  ${TIPO.get(pk(l.placa)) || '(fora da base de ativos)'}`));
  }
  if (asVezes.length) {
    console.log('\n── INTERMITENTES (têm rpm em parte dos dias) ──');
    asVezes.sort((a, b) => (a.diasRpm / a.diasRodou) - (b.diasRpm / b.diasRodou)).slice(0, 25)
      .forEach(l => console.log(`${l.placa.padEnd(10)} ${l.uni.padEnd(22)} rpm em ${l.diasRpm}/${l.diasRodou} dia(s)`));
  }
  console.log('\nRelatório encerrado — nada foi gravado.');
  process.exit(0);
}

/* sonda da BANGUELA: quanto do tempo em movimento é rodado em ponto morto.
   Só leitura — mede a magnitude antes de o pilar entrar no painel. */
if (MODE === 'banguela') {
  const cred = await geotabLogin();
  if (!cred) { console.error('Geotab: sem credencial'); process.exit(1); }
  const DIA = process.env.CE_DE || iso(ontem);
  console.log(`sonda de banguela · dia ${DIA} · neutro acima de ${BANG_VMIN} km/h`);

  const mch = await geotabMarchaDia(DIA, cred);
  const { porDev: velD, total: nV } = await geotabVelDia(DIA, cred);
  console.log(`\nmarcha: ${mch.total} amostra(s) · ${mch.porDev.size} veículo(s)`);
  console.log(`velocidade: ${nV} amostra(s) · ${velD.size} veículo(s)`);

  const devs = await geotabRpc('Get', { typeName: 'Device' }, cred);
  const placa = new Map(devs.map(d => [d.id, String(d.licensePlate || d.name || d.id).toUpperCase().trim()]));

  const linhas = [];
  let totN = 0, totM = 0;
  for (const [id, ga] of mch.porDev) {
    const va = velD.get(id); if (!va || !va.length) continue;
    const ini = ga[0].t, fim = ga[ga.length - 1].t;
    const b = banguelaJanela(ga, va, ini, fim);
    if (b.movimento < 120) continue;                       // menos de 2 min rodando não diz nada
    totN += b.neutro; totM += b.movimento;
    linhas.push({ placa: placa.get(id) || id, pct: b.neutro / b.movimento * 100,
                  min: b.neutro / 60, mov: b.movimento / 60 });
  }
  linhas.sort((a, b) => b.pct - a.pct);
  console.log(`\nveículos medidos: ${linhas.length}`);
  console.log(`FROTA: ${(totM ? totN / totM * 100 : 0).toFixed(1)}% do tempo em movimento rodado em ponto morto`
    + ` (${Math.round(totN / 60)} de ${Math.round(totM / 60)} min)`);
  console.log('\n── POR VEÍCULO (pior primeiro) ──');
  console.log('placa      % em neutro   min em neutro   min em movimento');
  linhas.slice(0, 20).forEach(l => console.log(
    `${l.placa.padEnd(10)} ${l.pct.toFixed(1).padStart(8)}%   ${l.min.toFixed(0).padStart(11)}   ${l.mov.toFixed(0).padStart(14)}`));
  const zeros = linhas.filter(l => l.pct < 0.5).length;
  console.log(`\nveículos praticamente sem banguela (<0,5%): ${zeros}/${linhas.length}`);
  console.log('\nSonda encerrada — nada foi gravado.');
  process.exit(0);
}

if (MODE === 'marchacalc') {
  const cred = await geotabLogin();
  if (!cred) { console.error('Geotab: sem credencial'); process.exit(1); }
  const DIA = process.env.CE_DE || iso(ontem);
  const ALTO = +process.env.CE_MARCHA_ALTO || 1900, BAIXO = +process.env.CE_MARCHA_BAIXO || 1000;
  console.log(`marcha DERIVADA (rpm ÷ velocidade) · dia ${DIA}`);
  console.log(`   velocidade mínima ${V_MIN_KMH} km/h · "tem marcha acima" acima de ${G_SUBIR}× · "marcha alta" até ${G_ALTA}×`);

  const { porDev: rpmD, total: nR } = await geotabRpmDia(DIA, cred);
  const { porDev: velD, total: nV, paginas } = await geotabVelDia(DIA, cred);
  console.log(`\nRPM: ${nR} amostra(s) · ${rpmD.size} veículo(s)`);
  console.log(`Velocidade (LogRecord): ${nV} amostra(s) em ${paginas} pág. · ${velD.size} veículo(s)`);
  if (!velD.size) { console.log('Sem LogRecord — a derivação precisa de velocidade. Sonda encerrada.'); process.exit(0); }

  // gabarito: os veículos que publicam a marcha de verdade
  const mch = await geotabMarchaDia(DIA, cred);
  console.log(`Posição da marcha (gabarito): ${mch.total} amostra(s) · ${mch.porDev.size} veículo(s)`);

  const devs = await geotabRpc('Get', { typeName: 'Device' }, cred);
  const placa = new Map(devs.map(d => [d.id, String(d.licensePlate || d.name || d.id).toUpperCase().trim()]));

  let comRazao = 0, acertos = 0, comparadas = 0;
  const linhas = [];
  for (const [id, rpmAm] of rpmD) {
    const pares = razoes(rpmAm, velD.get(id));
    if (pares.length < 50) continue;                    // pouco dado no dia
    comRazao++;
    const rMin = percentil(pares.map(x => x.r), 0.05);  // marcha mais alta usada no dia
    if (!rMin) continue;
    // pilar derivado
    let ruim = 0, tot = 0;
    for (let i = 0; i < pares.length; i++) {
      const dt = i + 1 < pares.length ? Math.min(pares[i + 1].t - pares[i].t, RPM_GAP_MS) / 1000 : 1;
      if (dt <= 0) continue;
      const g = pares[i].r / rMin;
      tot += dt;
      if (pares[i].rpm > ALTO && g > G_SUBIR) ruim += dt;        // dava para subir
      else if (pares[i].rpm < BAIXO && g < G_ALTA) ruim += dt;   // afogando em marcha alta
    }
    const pctDer = tot ? ruim / tot * 100 : null;

    // confere com o gabarito, quando o veículo publica a marcha
    const ga = mch.porDev.get(id), maxG = mch.maxG.get(id);
    let pctReal = null, acc = null;
    if (ga && maxG) {
      const jj = marchaJanela(ga, rpmAm, pares[0].t, pares[pares.length - 1].t, maxG);
      pctReal = jj.total ? jj.ruim / jj.total * 100 : null;
      // acurácia da pergunta que importa: "está na marcha mais alta?"
      let ok = 0, n = 0, k = 0;
      for (const p of pares) {
        while (k + 1 < ga.length && ga[k + 1].t <= p.t) k++;
        const gv = ga[k] && Math.abs(ga[k].t - p.t) <= RPM_GAP_MS ? ga[k].g : null;
        if (!isFinite(gv) || gv <= 0 || gv >= 100) continue;
        const naMaisAltaReal = gv >= maxG;
        const naMaisAltaDer  = (p.r / rMin) <= G_SUBIR;
        n++; if (naMaisAltaReal === naMaisAltaDer) ok++;
      }
      if (n >= 30) { acc = ok / n * 100; acertos += ok; comparadas += n; }
    }
    linhas.push({ placa: placa.get(id) || id, n: pares.length, rMin, pctDer, pctReal, acc });
  }

  console.log(`\nveículos com razão calculável: ${comRazao}`);
  const comGab = linhas.filter(l => l.acc != null);
  if (comGab.length) {
    console.log(`\n── CONFERÊNCIA contra os que publicam a marcha (${comGab.length} veículo(s)) ──`);
    console.log('placa      amostras  razão mín  pilar derivado  pilar real   acerto "marcha mais alta"');
    comGab.sort((a, b) => b.acc - a.acc).forEach(l => console.log(
      `${l.placa.padEnd(10)} ${String(l.n).padStart(7)}  ${l.rMin.toFixed(1).padStart(8)}`
      + `  ${(l.pctDer == null ? '—' : l.pctDer.toFixed(1) + '%').padStart(13)}`
      + `  ${(l.pctReal == null ? '—' : l.pctReal.toFixed(1) + '%').padStart(10)}`
      + `   ${l.acc.toFixed(1)}%`));
    const erroPilar = comGab.filter(l => l.pctDer != null && l.pctReal != null)
      .map(l => Math.abs(l.pctDer - l.pctReal));
    console.log(`\nacerto GLOBAL de "está na marcha mais alta": ${(acertos / comparadas * 100).toFixed(1)}%`
      + ` (${comparadas} amostra(s) comparadas)`);
    if (erroPilar.length) {
      const med = erroPilar.reduce((a, b) => a + b, 0) / erroPilar.length;
      console.log(`erro médio do PILAR (derivado × real): ${med.toFixed(1)} ponto(s) percentual(is)`);
    }
  } else console.log('nenhum veículo com gabarito e razão ao mesmo tempo — não dá para validar hoje');

  const semGab = linhas.filter(l => l.acc == null && l.pctDer != null);
  console.log(`\nveículos que GANHARIAM o pilar pela derivação (não publicam marcha): ${semGab.length}`);
  console.log('   ' + semGab.slice(0, 12).map(l => `${l.placa}=${l.pctDer.toFixed(1)}%`).join(' · '));
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

  // POR QUE SÓ ~30% DOS MOTORISTAS TÊM O PILAR? (Renan, 01/09/2026)
  // Telemetria devia ler em todo mundo, então antes de aceitar a cobertura
  // baixa é preciso saber ONDE ela se perde: veículo que não reporta o
  // parâmetro, ou outro diagnóstico (cada fabricante expõe o seu) que a
  // gente não está lendo. Compara, no MESMO dia: veículos que rodaram ×
  // veículos com RPM × veículos com marcha, e varre TODOS os diagnósticos
  // de transmissão do catálogo contando veículos distintos em cada um.
  {
    const deD = `${DIA}T03:00:00.000Z`, ateD = new Date(new Date(deD).getTime() + 864e5 - 1).toISOString();
    const trips = await geotabRpc('Get', { typeName: 'Trip',
      search: { fromDate: deD, toDate: ateD }, resultsLimit: 50000 }, cred);
    const devRod = new Set(trips.map(t => t.device && t.device.id).filter(Boolean));
    const { porDev: rpmD } = await geotabRpmDia(DIA, cred);
    console.log(`\n── COBERTURA em ${DIA} ──`);
    console.log(`   veículos que rodaram (com viagem): ${devRod.size}`);
    console.log(`   veículos com amostra de RPM:       ${rpmD.size}`);

    // todo diagnóstico que cheire a transmissão/marcha, não só o que já usamos
    const trans = diags.filter(d => /marcha|gear|transmiss|c[aâ]mbio|shift/i.test(d.name || ''));
    console.log(`\n   diagnósticos de transmissão no catálogo: ${trans.length} — veículos distintos no dia:`);
    const uniao = new Set();
    for (const d of trans) {
      try {
        const am = await geotabRpc('Get', { typeName: 'StatusData',
          search: { diagnosticSearch: { id: d.id }, fromDate: deD, toDate: ateD }, resultsLimit: 50000 }, cred);
        if (!am.length) continue;
        const devs = new Set(am.map(r => r.device && r.device.id).filter(Boolean));
        devs.forEach(x => uniao.add(x));
        console.log(`      ${String(am.length).padStart(6)} amostra(s) · ${String(devs.size).padStart(4)} veículo(s) · ${String(d.name).slice(0, 60)}`);
      } catch (e) { /* diagnóstico sem dado não interessa */ }
    }
    console.log(`   veículos cobertos por ALGUM diagnóstico de transmissão: ${uniao.size}`);
    const semMarcha = [...devRod].filter(id => !uniao.has(id));
    console.log(`   rodaram mas NÃO reportam marcha em nenhum: ${semMarcha.length}`);
    if (semMarcha.length) {
      // placa e unidade, para cobrar a habilitação de quem falta (sem nome de pessoa)
      const [devs2, grupos] = await Promise.all([
        geotabRpc('Get', { typeName: 'Device' }, cred),
        geotabRpc('Get', { typeName: 'Group' }, cred),
      ]);
      const gN = new Map(grupos.map(g => [g.id, g.name || '']));
      const info = new Map(devs2.map(d => {
        const u = (d.groups || []).map(g => gN.get(g.id) || '').find(n => /^UNI_/.test(n));
        return [d.id, { placa: String(d.licensePlate || d.name || d.id).toUpperCase().trim(),
                        uni: u ? u.replace(/^UNI_/, '') : '(sem grupo UNI)' }];
      }));
      const porUni = new Map();
      semMarcha.forEach(id => { const u = (info.get(id) || {}).uni || '(fora do cadastro)';
        porUni.set(u, (porUni.get(u) || 0) + 1); });
      console.log('   por unidade:');
      [...porUni.entries()].sort((a, b) => b[1] - a[1])
        .forEach(([u, n]) => console.log(`      ${u.padEnd(22)} ${n} veículo(s)`));
      console.log('   placas (para pedir a habilitação do parâmetro):');
      console.log('      ' + semMarcha.map(id => (info.get(id) || { placa: id }).placa).sort().join(' · '));
    }
  }

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

if (MODE === 'trechos') {
  /* O QUE É UMA "VIAGEM" DO GEOTAB (Renan, 03/09/2026: "tem motorista com 242
     trechos num mês, não faz sentido"). A Trip do Geotab termina em toda
     parada mais longa que o limite de parada — numa empurrada, cada cliente
     encerra uma. Este modo lista, para um dia e uma unidade, os trechos das
     placas que mais tiveram trecho: hora que saiu, hora que parou, km e quanto
     tempo ficou parada antes do próximo — é para reconhecer a rota no log.
     Só placa, horário e km; nunca nome de pessoa (repo público). */
  const cred = await geotabLogin();
  if (!cred) { console.error('Geotab: sem credencial'); process.exit(1); }
  const DIA = process.env.CE_DE || '2026-08-20';
  const UNI = (process.env.CE_UNI || 'EMP PIRAI').toUpperCase();
  const QTD = +process.env.CE_QTD || 3;
  console.log(`trechos do Geotab · ${UNI} · ${DIA}`);

  const [devs, grupos] = await Promise.all([
    geotabRpc('Get', { typeName: 'Device' }, cred),
    geotabRpc('Get', { typeName: 'Group' }, cred),
  ]);
  const gNome = new Map(grupos.map(g => [g.id, g.name || '']));
  const dev = new Map(devs.map(d => {
    const uni = (d.groups || []).map(g => gNome.get(g.id) || '').find(n => /^UNI_/.test(n));
    return [d.id, { placa: String(d.licensePlate || d.name || d.id).toUpperCase().trim(),
                    uni: uni ? uni.replace(/^UNI_/, '').toUpperCase() : '' }];
  }));
  const de = `${DIA}T03:00:00.000Z`, ate = new Date(new Date(de).getTime() + 864e5 - 1).toISOString();
  const trips = await geotabRpc('Get', { typeName: 'Trip', search: { fromDate: de, toDate: ate }, resultsLimit: 50000 }, cred);
  if (trips[0]) console.log('campos da Trip:', Object.keys(trips[0]).join(', '));

  const porDev = new Map();
  for (const t of trips) {
    const id = t.device && t.device.id; const d = id && dev.get(id);
    if (!d || d.uni !== UNI) continue;
    (porDev.get(id) || porDev.set(id, []).get(id)).push(t);
  }
  const placas = [...porDev.entries()].sort((a, b) => b[1].length - a[1].length);
  const ns = placas.map(([, ts]) => ts.length).sort((a, b) => a - b);
  console.log(`\n${placas.length} placa(s) da unidade rodaram no dia · trechos por placa:`
    + ` mín ${ns[0]} · mediana ${ns[Math.floor(ns.length / 2)]} · máx ${ns[ns.length - 1]}`);

  const hh = s => new Date(s).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const min = s => Math.round(+s / 60);
  for (const [id, ts] of placas.slice(0, QTD)) {
    ts.sort((a, b) => new Date(a.start) - new Date(b.start));
    console.log(`\n── ${dev.get(id).placa} · ${ts.length} trecho(s) · ${Math.round(ts.reduce((a, t) => a + (+t.distance || 0), 0))} km ──`);
    console.log('   saiu   parou   km    dirigiu   parada depois');
    ts.forEach((t, i) => {
      const prox = ts[i + 1];
      const parada = t.stopDuration != null ? min(gtSeg(t.stopDuration))
        : (prox ? Math.round((new Date(prox.start) - new Date(t.stop)) / 60000) : null);
      console.log(`   ${hh(t.start)}  ${hh(t.stop)}  ${String((+t.distance || 0).toFixed(1)).padStart(5)}`
        + `  ${String(min(gtSeg(t.drivingDuration))).padStart(4)} min`
        + `   ${parada == null ? '—' : parada + ' min'}`);
    });
  }
  process.exit(0);
}

if (MODE === 'nos') {
  /* A VIAGEM É O TRECHO ENTRE NÓS DA MALHA (Renan, 03/09/2026): fábrica → CD,
     CD → fábrica, e pode atravessar dias. O Geotab não tem "viagem", mas tem
     ZONAS (cercas) — se a Ambev cadastrou as fábricas e os CDs, o ponto de
     parada de cada Trip diz se o caminhão parou num nó, e a viagem fecha ali.
     Este modo: (1) lista as zonas da conta; (2) para as placas da unidade,
     reconstrói as viagens nó→nó num período e mostra cada uma (de onde, para
     onde, km, quantos ciclos de ignição ela engoliu); (3) se não houver zona,
     agrupa as paradas longas da frota inteira para PROPOR os nós, com
     coordenada e contagem, para o Renan nomear. Só placa, zona, horário e km. */
  const cred = await geotabLogin();
  if (!cred) { console.error('Geotab: sem credencial'); process.exit(1); }
  const DE = process.env.CE_DE || '2026-08-18', ATE = process.env.CE_ATE || '2026-08-22';
  const UNI = (process.env.CE_UNI || 'EMP PIRAI').toUpperCase();
  const QTD = +process.env.CE_QTD || 3;
  console.log(`nós da malha · ${UNI} · ${DE} → ${ATE}`);

  // (1) zonas
  let zonas = [];
  try { zonas = await geotabRpc('Get', { typeName: 'Zone', resultsLimit: 5000 }, cred); }
  catch (e) { console.log('Zone: ' + String(e.message || e).slice(0, 160)); }
  console.log(`\nzonas cadastradas na conta: ${zonas.length}`);
  const tipos = new Map();
  zonas.forEach(z => { const t = (z.zoneTypes || []).map(x => x.id || x).join('+') || '(sem tipo)'; tipos.set(t, (tipos.get(t) || 0) + 1); });
  [...tipos].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([t, n]) => console.log(`   tipo ${t}: ${n}`));
  zonas.slice(0, 60).forEach(z => console.log(`   · ${String(z.name || '').slice(0, 60)} (${(z.points || []).length} pts)`));
  if (zonas.length > 60) console.log(`   … +${zonas.length - 60}`);

  // ponto dentro de polígono (ray casting); Geotab: points[{x:lon,y:lat}]
  const dentro = (lon, lat, pts) => {
    let ok = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ok = !ok;
    }
    return ok;
  };
  const zonaDe = (lon, lat) => {
    for (const z of zonas) if ((z.points || []).length >= 3 && dentro(lon, lat, z.points)) return z.name || z.id;
    return null;
  };

  // (2) placas da unidade
  const [devs, grupos] = await Promise.all([
    geotabRpc('Get', { typeName: 'Device' }, cred),
    geotabRpc('Get', { typeName: 'Group' }, cred),
  ]);
  const gNome = new Map(grupos.map(g => [g.id, g.name || '']));
  const dev = new Map(devs.map(d => {
    const uni = (d.groups || []).map(g => gNome.get(g.id) || '').find(n => /^UNI_/.test(n));
    return [d.id, { placa: String(d.licensePlate || d.name || d.id).toUpperCase().trim(),
                    uni: uni ? uni.replace(/^UNI_/, '').toUpperCase() : '' }];
  }));
  const de = `${DE}T03:00:00.000Z`;
  const ate = new Date(new Date(`${ATE}T03:00:00.000Z`).getTime() + 864e5 - 1).toISOString();
  const trips = await geotabRpc('Get', { typeName: 'Trip', search: { fromDate: de, toDate: ate }, resultsLimit: 50000 }, cred);
  const porDev = new Map();
  const paradasLongas = new Map();   // grade ~300 m → {n, devs:Set, seg}
  for (const t of trips) {
    const id = t.device && t.device.id; const d = id && dev.get(id); if (!d) continue;
    const sp = t.stopPoint || {};
    const segParada = gtSeg(t.stopDuration);
    if (sp.x != null && segParada >= 3600) {
      const k = `${sp.y.toFixed(3)},${sp.x.toFixed(3)}`;
      const e = paradasLongas.get(k) || { n: 0, devs: new Set(), seg: 0, lat: sp.y, lon: sp.x, zona: zonaDe(sp.x, sp.y) };
      e.n++; e.devs.add(id); e.seg += segParada; paradasLongas.set(k, e);
    }
    if (d.uni !== UNI) continue;
    (porDev.get(id) || porDev.set(id, []).get(id)).push(t);
  }

  const hh = s => new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const placas = [...porDev.entries()].sort((a, b) => b[1].reduce((s, t) => s + (+t.distance || 0), 0) - a[1].reduce((s, t) => s + (+t.distance || 0), 0));
  if (zonas.length) {
    console.log(`\n── VIAGENS NÓ→NÓ (${placas.length} placas da unidade; mostrando ${Math.min(QTD, placas.length)}) ──`);
    for (const [id, ts] of placas.slice(0, QTD)) {
      ts.sort((a, b) => new Date(a.start) - new Date(b.start));
      const viagens = []; let cur = null, origem = '(início do período)';
      for (const t of ts) {
        if (!cur) cur = { de: origem, saiu: t.start, km: 0, ciclos: 0 };
        cur.km += +t.distance || 0; cur.ciclos++;
        const sp = t.stopPoint || {};
        const z = sp.x != null ? zonaDe(sp.x, sp.y) : null;
        if (z) { viagens.push({ ...cur, para: z, chegou: t.stop }); origem = z; cur = null; }
      }
      if (cur) viagens.push({ ...cur, para: '(ainda em viagem)', chegou: null });
      const reais = viagens.filter(v => v.km >= 5);
      console.log(`\n${dev.get(id).placa} · ${ts.length} ciclos de ignição → ${viagens.length} paradas em nó (${reais.length} com 5+ km)`);
      viagens.forEach(v => console.log(`   ${hh(v.saiu)} → ${v.chegou ? hh(v.chegou) : '…'}  ${String(v.km.toFixed(0)).padStart(4)} km  ${String(v.ciclos).padStart(3)} ciclos   ${v.de} → ${v.para}`));
    }
  }

  // (3) paradas longas da frota inteira (proposta de nós)
  const top = [...paradasLongas.values()].sort((a, b) => b.devs.size - a.devs.size).slice(0, 20);
  console.log(`\n── ONDE A FROTA PARA 1h+ (frota inteira, ${DE}→${ATE}; top 20 por nº de placas) ──`);
  console.log('   lat,lon              placas  paradas  horas   zona do Geotab');
  top.forEach(e => console.log(`   ${e.lat.toFixed(4)},${e.lon.toFixed(4)}   ${String(e.devs.size).padStart(4)}   ${String(e.n).padStart(6)}   ${String(Math.round(e.seg / 3600)).padStart(5)}   ${e.zona || '—'}`));
  process.exit(0);
}

if (MODE === 'velregras') {
  /* 1.077 "EXCESSOS" NUM MÊS (Renan, 03/09/2026): um a cada 2,5 km não é
     excesso de velocidade — é regra disparando o tempo todo. Este modo abre a
     caixa: para um dia e uma unidade, agrupa os ExceptionEvent por REGRA
     (quantos, em quantas placas, duração média, km médio) e mostra a sequência
     de eventos da placa com mais eventos. Nome de regra e placa no log; nunca
     nome de pessoa. */
  const cred = await geotabLogin();
  if (!cred) { console.error('Geotab: sem credencial'); process.exit(1); }
  const DIA = process.env.CE_DE || '2026-08-20';
  const UNI = (process.env.CE_UNI || 'CDD PELOTAS').toUpperCase();
  console.log(`regras de velocidade · ${UNI} · ${DIA}`);
  const [devs, grupos, regras] = await Promise.all([
    geotabRpc('Get', { typeName: 'Device' }, cred),
    geotabRpc('Get', { typeName: 'Group' }, cred),
    geotabRpc('Get', { typeName: 'Rule' }, cred),
  ]);
  const gNome = new Map(grupos.map(g => [g.id, g.name || '']));
  const dev = new Map(devs.map(d => {
    const uni = (d.groups || []).map(g => gNome.get(g.id) || '').find(n => /^UNI_/.test(n));
    return [d.id, { placa: String(d.licensePlate || d.name || d.id).toUpperCase().trim(),
                    uni: uni ? uni.replace(/^UNI_/, '').toUpperCase() : '' }];
  }));
  const rNome = new Map(regras.map(r => [r.id, r.name || r.id]));
  console.log(`\nTODAS as regras da conta (${regras.length}) e como o robô classifica cada uma (— = não pontua):`);
  regras.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt')).forEach(r =>
    console.log(`   ${String(gtQualRegra(r.id, r.name) || '—').padEnd(5)} ${r.name} [${r.id}]${r.baseType ? ' base=' + r.baseType : ''}`));

  const de = `${DIA}T03:00:00.000Z`, ate = new Date(new Date(de).getTime() + 864e5 - 1).toISOString();
  const excs = await geotabRpc('Get', { typeName: 'ExceptionEvent', search: { fromDate: de, toDate: ate }, resultsLimit: 50000 }, cred);
  if (excs[0]) console.log('\ncampos do ExceptionEvent:', Object.keys(excs[0]).join(', '));
  // CE_UNI=* varre a frota inteira — é o que diz se uma regra oficial está viva
  const daUni = excs.filter(e => { const d = dev.get(e.device && e.device.id); return d && (UNI === '*' || d.uni === UNI); });
  console.log(`\n${excs.length} evento(s) na frota no dia · ${daUni.length} na unidade`);

  const porRegra = new Map();
  for (const e of daUni) {
    const rid = e.rule && e.rule.id, nome = rNome.get(rid) || rid;
    const q = gtQualRegra(rid, nome);
    const k = `${q || '—'} | ${nome}`;
    const g = porRegra.get(k) || { n: 0, devs: new Set(), seg: 0, km: 0 };
    g.n++; g.devs.add(e.device.id);
    g.seg += gtSeg(e.duration); g.km += +e.distance || 0;
    porRegra.set(k, g);
  }
  console.log('\n── POR REGRA (unidade, no dia) ──');
  console.log('   classe | regra                                              eventos  placas  dur.média  km médio');
  [...porRegra.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([k, g]) =>
    console.log(`   ${k.slice(0, 58).padEnd(58)} ${String(g.n).padStart(7)}  ${String(g.devs.size).padStart(6)}  ${String(Math.round(g.seg / g.n)).padStart(6)} s  ${(g.km / g.n).toFixed(2).padStart(7)}`));

  // sequência da placa com mais eventos de velocidade
  const porDev = new Map();
  daUni.forEach(e => { if (!/^vel/.test(gtQualRegra(e.rule && e.rule.id, rNome.get(e.rule && e.rule.id)) || '')) return;
    (porDev.get(e.device.id) || porDev.set(e.device.id, []).get(e.device.id)).push(e); });
  const top = [...porDev.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (top) {
    const [id, es] = top; es.sort((a, b) => new Date(a.activeFrom) - new Date(b.activeFrom));
    const hh = s => new Date(s).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`\n── ${dev.get(id).placa} · ${es.length} evento(s) de velocidade no dia (primeiros 40) ──`);
    console.log('   início     fim        dur    km     regra');
    es.slice(0, 40).forEach(e => console.log(`   ${hh(e.activeFrom)}  ${hh(e.activeTo)}  ${String(gtSeg(e.duration)).padStart(4)}s  ${(+e.distance || 0).toFixed(2).padStart(5)}  ${String(rNome.get(e.rule && e.rule.id) || '').slice(0, 50)}`));
  }
  process.exit(0);
}

if (MODE === 'regracond') {
  /* QUAL É O PARÂMETRO DA REGRA? (Renan, 03/09/2026). A nota de aceleração
     fica alta porque a regra dispara pouco, e ela dispara pouco por causa do
     limiar. O limiar mora na árvore de condições da Rule no Geotab — este
     modo imprime essa árvore, achatada, para as regras de aceleração e
     velocidade (padrão, Argus, ENG e pilotos). Só nome de regra, diagnóstico
     e valores; nada de pessoa. CE_REGRA filtra por trecho do nome. */
  const cred = await geotabLogin();
  if (!cred) { console.error('Geotab: sem credencial'); process.exit(1); }
  const FILTRO = new RegExp(process.env.CE_REGRA || 'accel|acelera|exc\\. veloc\\. via|speeding', 'i');
  const [regras, diags] = await Promise.all([
    geotabRpc('Get', { typeName: 'Rule' }, cred),
    geotabRpc('Get', { typeName: 'Diagnostic', resultsLimit: 5000 }, cred).catch(() => []),
  ]);
  const dNome = new Map(diags.map(d => [d.id, d.name || d.id]));
  const linha = (c, nivel) => {
    const pad = '   ' + '  '.repeat(nivel);
    const partes = [c.conditionType || '?'];
    if (c.value != null) partes.push(`valor=${c.value}`);
    if (c.diagnostic) partes.push(`diag=${dNome.get(c.diagnostic.id) || c.diagnostic.id}`);
    if (c.unit) partes.push(`unid=${c.unit}`);
    if (c.driver) partes.push('driver');
    if (c.device) partes.push('device');
    if (c.zone) partes.push(`zone=${c.zone.id}`);
    if (c.workTime) partes.push(`workTime=${c.workTime.id}`);
    console.log(pad + partes.join(' · '));
    (c.children || []).forEach(k => linha(k, nivel + 1));
  };
  const alvo = regras.filter(r => FILTRO.test(r.name || '')).sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt'));
  console.log(`${alvo.length} regra(s) casando com /${FILTRO.source}/i:`);
  for (const r of alvo) {
    console.log(`\n── ${r.name} [${r.id}] base=${r.baseType || '?'}${r.comment ? ' · ' + String(r.comment).slice(0, 120) : ''}`);
    if (r.condition) linha(r.condition, 0); else console.log('   (sem árvore de condição visível)');
  }
  process.exit(0);
}

if (MODE === 'cpf') {
  // "Impossível não ter isso" (Renan, 05/09/2026): o robô só lia licenseNumber
  // e employeeNo. Este modo varre TODOS os campos do cadastro de motorista do
  // Geotab procurando um CPF válido (11 dígitos com os dois verificadores
  // certos — CNH também tem 11 dígitos, por isso a conta) e grava em
  // ce_motoristas.cpf onde ainda está vazio. No log só nome de campo, formato
  // (dígito→9, letra→A) e contagens — nunca o número nem o nome da pessoa.
  const cred = await geotabLogin();
  if (!cred) { console.error('Geotab: sem credencial'); process.exit(1); }
  const [us, grupos] = await Promise.all([
    geotabRpc('Get', { typeName: 'User', search: { isDriver: true } }, cred),
    geotabRpc('Get', { typeName: 'Group' }, cred),
  ]);
  GT_GNOME = new Map(grupos.map(g => [g.id, g.name || '']));
  console.log(`Geotab (db=${GT_DB}): ${us.length} motorista(s) cadastrado(s)`);

  // CPFs dentro de um texto qualquer ("CPF: 123.456.789-09", "12345678909")
  const cpfsEm = s => {
    const out = new Set();
    for (const m of String(s).match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) || []) {
      const d = m.replace(/\D/g, ''); if (cpfValido(d)) out.add(d);
    }
    return [...out];
  };
  const forma = s => String(s).replace(/\d/g, '9').replace(/[A-Za-zÀ-ÿ]/g, 'A').slice(0, 24);

  // 1) esquema do cadastro: todo campo (inclusive aninhado), preenchimento e formato
  const campos = new Map();   // caminho → {n, formas:Map, cpf, d11, d9}
  const anota = (path, v) => {
    const c = campos.get(path) || { n: 0, formas: new Map(), cpf: 0, d11: 0, d9: 0 };
    c.n++;
    if (typeof v === 'string' || typeof v === 'number') {
      const f = forma(v); c.formas.set(f, (c.formas.get(f) || 0) + 1);
      const dig = String(v).replace(/\D/g, '');
      if (cpfsEm(v).length) c.cpf++;
      else if (dig.length === 11) c.d11++;
      else if (dig.length >= 9) c.d9++;
    }
    campos.set(path, c);
  };
  const walk = (v, path, prof) => {
    if (v == null || v === '' || prof > 3) return;
    if (Array.isArray(v)) { if (!v.length) return; v.forEach(x => walk(x, path + '[]', prof + 1)); return; }
    if (typeof v === 'object') { for (const [k, x] of Object.entries(v)) walk(x, path ? path + '.' + k : k, prof + 1); return; }
    anota(path, v);
  };
  us.forEach(u => walk(u, '', 0));
  console.log('\n── CAMPOS DO CADASTRO (preenchidos / total · formato mais comum · CPF válido · 11 dígitos sem ser CPF · ≥9 dígitos) ──');
  [...campos.entries()].sort((a, b) => b[1].cpf - a[1].cpf || b[1].d11 - a[1].d11 || b[1].n - a[1].n)
    .forEach(([k, c]) => {
      const top = [...c.formas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f, n]) => `"${f}"×${n}`).join(' ');
      console.log(`${k.padEnd(34)} ${String(c.n).padStart(5)}/${us.length}  ${top.padEnd(40)} cpf=${c.cpf} d11=${c.d11} d9=${c.d9}`);
    });

  // 2) um CPF por motorista: licenseNumber → employeeNo → name (login) → qualquer
  //    outro campo (o serial da chave física às vezes contém 11 dígitos que
  //    "validam" por acaso — por isso os campos de cadastro vêm primeiro)
  const achado = new Map(); let ambiguos = 0; const porCampo = new Map();
  for (const u of us) {
    const cands = new Map();   // cpf → campo onde apareceu
    const olha = (v, path) => {
      if (v == null) return;
      if (Array.isArray(v)) { v.forEach(x => olha(x, path)); return; }
      if (typeof v === 'object') { for (const [k, x] of Object.entries(v)) olha(x, path ? path + '.' + k : k); return; }
      for (const c of cpfsEm(v)) if (!cands.has(c)) cands.set(c, path);
    };
    for (const k of ['licenseNumber', 'employeeNo', 'name']) { olha(u[k], k); if (cands.size) break; }
    if (!cands.size) olha(u, '');
    if (cands.size > 1) { ambiguos++; continue; }
    if (cands.size === 1) {
      const [[cpf, campo]] = cands;
      achado.set(u.id, cpf); porCampo.set(campo, (porCampo.get(campo) || 0) + 1);
    }
  }
  const repet = new Map(); achado.forEach(c => repet.set(c, (repet.get(c) || 0) + 1));
  const duplicados = [...repet.values()].filter(n => n > 1).length;
  console.log(`\nmotoristas com CPF válido em algum campo: ${achado.size}/${us.length}`
    + (porCampo.size ? ` (${[...porCampo].map(([c, n]) => (c || '(raiz)') + '=' + n).join(', ')})` : '')
    + (ambiguos ? ` · ${ambiguos} com mais de um CPF no cadastro (ignorados)` : '')
    + (duplicados ? ` · ${duplicados} CPF(s) em mais de um cadastro (ignorados)` : ''));
  const porUni = new Map();
  us.forEach(u => { const k = gtUni(u) || '(sem grupo UNI)'; const t = porUni.get(k) || { n: 0, cpf: 0 }; t.n++; if (achado.has(u.id)) t.cpf++; porUni.set(k, t); });
  [...porUni.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([k, t]) => console.log(`   ${k.padEnd(24)} ${String(t.cpf).padStart(4)}/${t.n} com CPF`));

  // 3) grava onde ainda está vazio — nunca sobrescreve
  if (!SB_KEY) { console.log('\nGEM_SUPABASE_SERVICE_KEY ausente — nada gravado.'); process.exit(0); }
  const banco = new Map((await sbTodos('ce_motoristas?select=id,chave,cpf')).map(m => [m.chave, m]));
  const usados = new Set([...banco.values()].map(m => m.cpf).filter(Boolean));
  let gravados = 0, jaTinha = 0, diverge = 0, foraDoBanco = 0, emOutro = 0, falhas = 0;
  for (const u of us) {
    const cpf = achado.get(u.id); if (!cpf || repet.get(cpf) > 1) continue;
    const m = banco.get(gtChave(u));
    if (!m) { foraDoBanco++; continue; }
    if (m.cpf) { if (m.cpf === cpf) jaTinha++; else diverge++; continue; }
    if (usados.has(cpf)) { emOutro++; continue; }
    const r = await fetch(`${SB_URL}/rest/v1/ce_motoristas?id=eq.${m.id}&cpf=is.null`, {
      method: 'PATCH', headers: { ...H_SB, Prefer: 'return=minimal' }, body: JSON.stringify({ cpf }) });
    if (r.ok) { gravados++; usados.add(cpf); } else { falhas++; if (falhas <= 3) console.log('   gravar:', r.status, (await r.text()).slice(0, 120)); }
  }
  console.log(`\nce_motoristas: ${gravados} CPF(s) gravado(s) · ${jaTinha} já batiam · ${diverge} divergem do que está no banco (mantido o do banco)`
    + ` · ${emOutro} CPF já usado por outra chave · ${foraDoBanco} motorista(s) ainda sem linha no banco` + (falhas ? ` · ${falhas} falha(s)` : ''));
  const semCpf = [...banco.values()].filter(m => !m.cpf && String(m.chave).startsWith('gt:')).length - gravados;
  console.log(`ainda sem CPF no banco (chave gt:…): ${semCpf} — cadastros antigos que já não são motorista no Geotab, ou os ${ambiguos + duplicados + diverge} acima`);
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
// device → placa (Renan, 07/09/2026: o ranking de consumo mostra o MODELO mais
// dirigido — a placa mais rodada do mês casa com a base Ativos do Ginfo)
GT_PLACA = new Map();
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
      GT_PLACA.set(d.id, String(d.licensePlate || d.name || d.id).toUpperCase().replace(/[^A-Z0-9]/g, ''));
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
      // motorista novo no Geotab ganha o CPF (login do app) no mesmo dia
      try {
        const c = await gtPreencheCpf(us);
        if (c.gravados || c.falhas) console.log(`CPF preenchido em ${c.gravados} motorista(s) novo(s)` + (c.falhas ? ` · ${c.falhas} falha(s)` : ''));
      } catch (e) { console.log('preencher CPF:', e.message.slice(0, 160)); }
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
if (MODE === 'eventos') {
  /* REDERIVA SÓ O QUE VEM DE EVENTO (03/09/2026): depois de trocar a
     classificação das regras, o diário inteiro estava com aceleração e
     velocidade contaminadas por regra de teste. Recoletar tudo levaria horas
     por causa das amostras de RPM; este modo baixa só viagens + eventos do
     dia (segundos) e regrava, nas linhas que JÁ existem, apenas acel_100km,
     frea_100km, vel_excesso_pct e o bruto.eventos/velArgus — RPM, marcha e
     banguela ficam intactos. Depois, rodar o recalc. */
  if (!GT) { console.error('Geotab: sem credencial'); process.exit(1); }
  if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }
  console.log(`rederivando eventos · ${DE} → ${ATE}`);
  let dias = 0, linhasOk = 0, semLinha = 0;
  for (let d = new Date(DE + 'T12:00:00Z'); iso(d) <= ATE; d = new Date(d.getTime() + 864e5)) {
    const dia = iso(d);
    try {
      const novas = await geotabDia(dia, GT, GT_USERS, GT_RULES, GT_UNIDEV, null, null, null);
      const atuais = await sbTodos(`ce_diario?select=id,chave,bruto&dia=eq.${dia}&fonte=eq.Geotab`);
      const porChave = new Map(atuais.map(a => [a.chave, a]));
      const patch = [];
      for (const l of novas) {
        const a = porChave.get(l.chave);
        if (!a) { semLinha++; continue; }
        const bruto = { ...(a.bruto || {}), eventos: l.bruto.eventos, velArgus: l.bruto.velArgus };
        // `fonte` é NOT NULL e o Postgres valida NOT NULL ANTES de resolver o
        // ON CONFLICT — sem ela o upsert parcial cai com 23502 mesmo quando a
        // linha existe (bug real, 03/09/2026: 31 dias falharam)
        patch.push({ dia, chave: l.chave, fonte: 'Geotab', acel_100km: l.acel_100km, frea_100km: l.frea_100km,
                     vel_excesso_pct: l.vel_excesso_pct, bruto });
      }
      for (let i = 0; i < patch.length; i += 500) {
        const r = await fetch(`${SB_URL}/rest/v1/ce_diario?on_conflict=dia,chave`, {
          method: 'POST', headers: { ...H_SB, Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(patch.slice(i, i + 500)) });
        if (!r.ok) throw new Error(`ce_diario: ${r.status} ${(await r.text()).slice(0, 200)}`);
      }
      const comVel = patch.filter(x => x.vel_excesso_pct != null && x.vel_excesso_pct > 0).length;
      const ex = novas.reduce((s, l) => s + ((l.bruto.eventos && l.bruto.eventos.vel) || 0), 0);
      console.log(`${dia}: ${patch.length} linha(s) regravada(s) · ${ex} excesso(s) da Argus · ${comVel} motorista(s) com tempo acima do limite`);
      dias++; linhasOk += patch.length;
    } catch (e) { console.log(`${dia}: FALHOU (${String(e.message || e).slice(0, 120)})`); }
  }
  console.log(`\n${dias} dia(s) · ${linhasOk} linha(s) regravada(s) · ${semLinha} motorista-dia sem linha no banco (ignorados)`);
  if (dias) { const n = await recalculaMes(DE, ATE); console.log(`recalculado: ${n} linha(s) em ce_scores_mensais`); }
  process.exit(0);
}

if (MODE === 'litros') {
  /* HISTÓRICO DOS LITROS (07/09/2026): a coleta diária passou a gravar
     ce_diario.litros (FuelUsed casado às viagens). Este modo preenche os dias
     já coletados: baixa só viagens + FuelUsed do dia e grava `litros` nas
     linhas que JÁ existem — RPM, marcha, banguela e eventos ficam intactos.
     Sem a coluna no banco, só mede a cobertura e avisa. Depois, recalcula o mês. */
  if (!GT) { console.error('Geotab: sem credencial'); process.exit(1); }
  if (!SB_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }
  console.log(`litros por viagem · ${DE} → ${ATE}`);
  let dias = 0, linhasOk = 0, semLinha = 0, semColuna = false, regTot = 0, casTot = 0, litTot = 0, kmLit = 0, kmTot = 0;
  for (let d = new Date(DE + 'T12:00:00Z'); iso(d) <= ATE; d = new Date(d.getTime() + 864e5)) {
    const dia = iso(d);
    try {
      const novas = await geotabDia(dia, GT, GT_USERS, GT_RULES, GT_UNIDEV, null, null, null);
      const f = novas._fuel || {}; regTot += f.reg || 0; casTot += f.casados || 0;
      const atuais = await sbTodos(`ce_diario?select=id,chave,bruto&dia=eq.${dia}&fonte=eq.Geotab`);
      const porChave = new Map(atuais.map(a => [a.chave, a]));
      const patch = [];
      for (const l of novas) {
        const a = porChave.get(l.chave);
        if (!a) { semLinha++; continue; }
        // `fonte` é NOT NULL e é validada antes do ON CONFLICT (ver modo eventos);
        // o bruto leva também o km por placa (modelo mais dirigido no painel)
        const bruto = { ...(a.bruto || {}), placas: l.bruto && l.bruto.placas, kmLitros: l.bruto && l.bruto.kmLitros, litRuim: l.bruto && l.bruto.litRuim };
        patch.push({ dia, chave: l.chave, fonte: 'Geotab', litros: l.litros, bruto });
      }
      let gravadas = 0;
      if (!semColuna) for (let i = 0; i < patch.length; i += 500) {
        const r = await fetch(`${SB_URL}/rest/v1/ce_diario?on_conflict=dia,chave`, {
          method: 'POST', headers: { ...H_SB, Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(patch.slice(i, i + 500)) });
        if (!r.ok) {
          const txt = await r.text();
          if (r.status === 400 && /'litros' column/.test(txt)) {
            semColuna = true;
            console.log('⚠ ce_diario ainda não tem a coluna `litros` — rodar o SQL de scripts/conducao-economica.sql; seguindo só para medir a cobertura');
            break;
          }
          throw new Error(`ce_diario: ${r.status} ${txt.slice(0, 200)}`);
        }
        gravadas += Math.min(500, patch.length - i);
      }
      const comLit = novas.filter(l => l.litros != null);
      const km = novas.reduce((s, l) => s + (+l.km || 0), 0);
      const lit = comLit.reduce((s, l) => s + l.litros, 0), kmL = comLit.reduce((s, l) => s + (+(l.bruto && l.bruto.kmLitros) || 0), 0);
      const ruim = novas.reduce((s, l) => s + (+(l.bruto && l.bruto.litRuim) || 0), 0);
      litTot += lit; kmLit += kmL; kmTot += km;
      console.log(`${dia}: FuelUsed ${f.reg || 0} registro(s), ${f.casados || 0} casado(s) com viagem`
        + ` · litros em ${comLit.length}/${novas.length} motorista(s) · ${Math.round(lit)} L`
        + ` · ${lit ? (kmL / lit).toFixed(2) : '—'} km/L (${Math.round(kmL)} de ${Math.round(km)} km com combustível)`
        + (ruim ? ` · ${ruim} viagem(ns) com leitura ruim descartada(s)` : '')
        + (f.erro ? ` · FuelUsed FALHOU (${f.erro.slice(0, 80)})` : '')
        + (semColuna ? '' : ` · ${gravadas} gravada(s)`));
      dias++; linhasOk += gravadas;
    } catch (e) { console.log(`${dia}: FALHOU (${String(e.message || e).slice(0, 120)})`); }
  }
  console.log(`\n${dias} dia(s) · ${linhasOk} linha(s) com litros gravados · ${semLinha} motorista-dia sem linha no banco (ignorados)`
    + ` · FuelUsed: ${casTot}/${regTot} registro(s) casados com viagem`
    + ` · ${Math.round(litTot)} L em ${Math.round(kmLit)} km (${kmTot ? Math.round(kmLit / kmTot * 100) : 0}% do km) → ${litTot ? (kmLit / litTot).toFixed(2) : '—'} km/L`);
  if (dias && !semColuna) { const n = await recalculaMes(DE.slice(0, 8) + '01', ATE); console.log(`recalculado: ${n} linha(s) em ce_scores_mensais`); }
  process.exit(0);
}

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
      // marcha do dia: só faz sentido com o RPM na mão (o pilar é o cruzamento
      // dos dois). Falha aqui também não derruba o dia.
      let mchDia = null, mchRot = '';
      if (rpmDev && process.env.CE_MARCHA !== '0') {
        try {
          const m = await geotabMarchaDia(dia, GT);
          mchDia = m;
          mchRot = ` · marcha: ${m.total} amostra(s)`;
        } catch (e) { mchRot = ` · marcha FALHOU (${e.message.slice(0, 80)})`; }
      }
      // velocidade do dia: só é preciso quando há marcha (banguela = neutro
      // em movimento). Falha aqui não derruba o dia.
      let velDia = null, bgRot = '';
      if (mchDia && process.env.CE_BANGUELA !== '0') {
        try { const v = await geotabVelDia(dia, GT); velDia = v.porDev; }
        catch (e) { bgRot = ` · banguela FALHOU (${e.message.slice(0, 60)})`; }
      }
      const lg = await geotabDia(dia, GT, GT_USERS, GT_RULES, GT_UNIDEV, rpmDev, mchDia, velDia);
      await garanteMotoristas(lg);
      total += await gravaDiario(lg);
      const comRpm = lg.filter(l => l.rpm_verde_pct != null).length;
      const comMch = lg.filter(l => l.cambio_ruim_pct != null).length;
      console.log(`${dia}: Geotab → ${lg.length} motorista(s) · ${Math.round(lg.reduce((s, l) => s + (+l.km || 0), 0))} km`
        + rpmRot + (rpmDev ? ` · faixa verde em ${comRpm} linha(s)` : '')
        + mchRot + (mchDia ? ` · marchas em ${comMch} linha(s)` : '')
        + bgRot + (velDia ? ` · banguela em ${lg.filter(l => l.banguela_pct != null).length} linha(s)` : '')
        + ` · litros em ${lg.filter(l => l.litros != null).length} linha(s)`
        + (lg._fuel && lg._fuel.erro ? ` · FuelUsed FALHOU (${lg._fuel.erro.slice(0, 80)})` : ''));
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
