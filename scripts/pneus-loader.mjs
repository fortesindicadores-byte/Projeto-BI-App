// ============================================================
// BI Pneus CONLOG — Loader Prolog -> Supabase (GitHub Actions)
// Roda sem o limite de 30 min do Apps Script. 1 run = todas as 14 unidades.
// Segredos vêm de env: PROLOG_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY
// ============================================================

// .trim() defende contra espaço/quebra-de-linha colado junto no GitHub Secret
const TOKEN       = (process.env.PROLOG_TOKEN || '').trim();
const SUPABASE    = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

const BASE_URL   = 'https://prologapp.com/prolog/api/v3';
const BRANCH_IDS = [1676, 1677, 37, 1906, 1907, 1878, 20, 30, 24, 2517, 26, 38, 2277, 2550];
const PAGE_SIZE  = 100;
const DELAY_MS   = 6500;   // respeita rate limit 10 req/min

const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!TOKEN || !SUPABASE || !SERVICE_KEY) {
  console.error('Faltam env vars: PROLOG_TOKEN / SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// ── PROLOG ──
async function fetchPaginated(path, params) {
  const all = []; let page = 0;
  while (true) {
    const qs = new URLSearchParams({ ...params, pageSize: PAGE_SIZE, pageNumber: page }).toString();
    let res;
    try { res = await fetch(`${BASE_URL}${path}?${qs}`, { headers: { 'x-prolog-api-token': TOKEN } }); }
    catch (e) { console.log(`fetch falhou (${e.message}) — retry em 10s`); await sleep(10000); continue; }
    if (res.status === 429) { console.log('429 (rate limit) — esperando 61s'); await sleep(61000); continue; }
    if (res.status >= 300) { console.log(`Prolog ${res.status} em ${path} — parando paginação`); break; }
    const json = await res.json();
    if (!json.content || json.content.length === 0) break;
    all.push(...json.content);
    if (json.lastPage) break;
    page++;
    await sleep(DELAY_MS);
  }
  return all;
}

function fetchAllVehicles(branchId) {
  return fetchPaginated('/vehicles', { branchOfficesId: branchId, includeInactive: false }).then(rows => rows.map(v => ({
    id: v.id, placa: v.licensePlate, frota: v.fleetId || '', tipo: v.type?.name || '',
    marca: v.make?.name || '', modelo: v.model?.name || '', odometro: v.currentOdometer || 0,
    pneusInstalados: v.totalInstalledTires || 0, pneusEsperados: v.expectedInstalledTires || 0,
    atualizadoEm: v.updatedAt || ''
  })));
}

function fetchAllTires(branchId) {
  return fetchPaginated('/tires', { branchOfficesId: branchId }).then(rows => rows.map(p => {
    const mm1 = p.innerTreadDepth || 0, mm2 = p.middleInnerTreadDepth || 0,
          mm3 = p.middleOuterTreadDepth || 0, mm4 = p.outerTreadDepth || 0;
    const menor = p.smallestTreadDepth || Math.min(mm1, mm2, mm3, mm4);
    const amplitude = parseFloat((Math.max(mm1, mm2, mm3, mm4) - menor).toFixed(2));
    let statusMM = 'Bom Estado';
    if (menor < 2) statusMM = 'Bloquear'; else if (menor <= 3) statusMM = 'Recapar'; else if (menor <= 6) statusMM = 'Regular';
    const pIdeal = p.recommendedPressure || 0, pAtual = p.currentPressure || 0;
    const desvioPct = pIdeal > 0 ? parseFloat((((pAtual - pIdeal) / pIdeal) * 100).toFixed(2)) : 0;
    const lc = p.tireLifecycles?.[0] || {};
    return {
      id: p.id, serial: p.serialNumber || '', status: p.status || '',
      marca: p.make?.name?.trim() || '', modelo: p.model?.name || '', sulcos: p.model?.groovesQuantity || 0,
      cicloVida: p.currentLifeCycle || 1, maxCiclos: p.maxLifeCycles || 5,
      banda: p.currentRetread?.model?.name || '', bandaMarca: p.currentRetread?.make?.name || '',
      dot: p.dot || '', mm1, mm2, mm3, mm4, menorMM: menor, amplitude, statusMM,
      pressaoIdeal: pIdeal, pressaoAtual: pAtual, desvioPressao: desvioPct, pressaoNOK: Math.abs(desvioPct) > 15,
      cpk: lc.cpk || 0, kmRodados: lc.totalDistanceDriven || 0, custo: p.purchaseCost || 0,
      veiculoId: p.installed?.vehicleId || null, placa: p.installed?.licensePlate || '',
      frota: p.installed?.fleetId || '', posicao: p.installed?.installedPosition || null,
      nomePosicao: p.installed?.installedPositionName || '', direcional: p.installed?.isOnSteeringAxle || false,
      criadoEm: p.createdAt || ''
    };
  }));
}

async function fetchAllInspections(branchId) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear() - 1, 0, 1); // 01/01 do ano anterior — ~2 anos (YoY)
  const raw = await fetchPaginated('/tire-inspections/vehicles', {
    branchOfficesId: branchId,
    startDate: inicio.toISOString().split('.')[0] + 'Z',
    endDate: hoje.toISOString().split('.')[0] + 'Z',
    includeMeasures: true
  });
  const result = [];
  raw.forEach(insp => {
    const dias = Math.floor((hoje - new Date(insp.submittedAt)) / 86400000);
    (insp.inspectionMeasures || []).forEach(m => {
      const mm1 = m.measuredInnerTreadDepth || 0, mm2 = m.measuredMiddleInnerTreadDepth || 0,
            mm3 = m.measuredMiddleOuterTreadDepth || 0, mm4 = m.measuredOuterTreadDepth || 0;
      const menor = parseFloat(Math.min(mm1, mm2, mm3, mm4).toFixed(2));
      const amplitude = parseFloat((Math.max(mm1, mm2, mm3, mm4) - menor).toFixed(2));
      const pIdeal = m.recommendedPressure || 0, pMedida = m.measuredPressure || 0;
      const desvioPct = pIdeal > 0 ? parseFloat((((pMedida - pIdeal) / pIdeal) * 100).toFixed(2)) : 0;
      result.push({
        inspecaoId: insp.id, veiculoId: insp.vehicle?.id || null, placa: insp.vehicle?.licensePlate || '',
        frota: insp.vehicle?.fleetId || '', dataInspecao: insp.submittedAt, dias,
        aderencia: dias <= 20 ? 'No Prazo' : dias <= 30 ? 'Em Atenção' : 'Vencida',
        odometro: insp.odometerReading || 0, inspetor: insp.submittedBy?.name || '',
        tireId: m.tireId, serial: m.tireSerialNumber || '', posicao: m.tirePositionAtInspection,
        mm1, mm2, mm3, mm4, menorMM: menor, amplitude,
        pressaoIdeal: pIdeal, pressaoMedida: pMedida, desvioPressao: desvioPct, pressaoNOK: Math.abs(desvioPct) > 15
      });
    });
  });
  return result;
}

// ── SUPABASE ──
async function upsertSnapshot(endpoint, branchId, data) {
  const res = await fetch(`${SUPABASE}/rest/v1/snapshot?on_conflict=endpoint,branch_id`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify([{ endpoint, branch_id: branchId, data, updated_at: new Date().toISOString() }])
  });
  if (res.status >= 300) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// ── MAIN ──
async function main() {
  console.log(`Iniciando carga de ${BRANCH_IDS.length} unidades (janela 2 anos)`);
  for (const b of BRANCH_IDS) {
    try {
      const vehicles    = await fetchAllVehicles(b);
      const tires       = await fetchAllTires(b);
      const inspections = await fetchAllInspections(b);
      // Trava: se não veio nenhum veículo, o fetch falhou — NÃO sobrescreve (mantém dado anterior)
      if (!vehicles.length) { console.error(`unidade ${b}: 0 veículos — fetch suspeito, pulando (mantém dado anterior)`); continue; }
      await upsertSnapshot('vehicles', b, vehicles);
      await upsertSnapshot('tires', b, tires);
      await upsertSnapshot('inspections', b, inspections);
      console.log(`unidade ${b}: ${vehicles.length}v ${tires.length}p ${inspections.length}i`);
    } catch (e) {
      console.error(`ERRO unidade ${b}: ${e.message}`);
    }
  }
  console.log('=== ciclo completo (14 unidades) ===');
}

main().catch(e => { console.error('Falha geral:', e); process.exit(1); });
