// Diagnóstico: descobre o endpoint/campo da DATA do descarte de pneus.
// O objeto disposal de /tires não tem data — procuramos em endpoints dedicados.
const TOKEN = (process.env.PROLOG_TOKEN || '').trim();
const BASE_URL = 'https://prologapp.com/prolog/api/v3';
const BRANCH = 1676;
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!TOKEN) { console.error('Falta PROLOG_TOKEN'); process.exit(1); }

const H = { 'x-prolog-api-token': TOKEN };
const hoje = new Date();
const inicio = new Date(hoje.getFullYear() - 1, 0, 1);
const sd = inicio.toISOString().split('.')[0] + 'Z';
const ed = hoje.toISOString().split('.')[0] + 'Z';

// combinações de querystring a tentar por endpoint
const qsVariants = [
  { branchOfficesId: BRANCH, pageSize: 5, pageNumber: 0 },
  { branchOfficesId: BRANCH, pageSize: 5, pageNumber: 0, startDate: sd, endDate: ed },
  { branchOfficesId: BRANCH, startDate: sd, endDate: ed },
];

const endpoints = [
  '/tire-disposals',
  '/tires/disposals',
  '/tire-disposals/tires',
  '/tires/disposal',
  '/tires/discarded',
  '/tire-disposal',
  '/tires/disposed',
  '/reports/tire-disposals',
  '/tire-disposals/branch',
  '/tires/disposals/branch-offices',
];

function keysDeep(obj, prefix = '', out = new Set(), depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 2) return out;
  for (const k of Object.keys(obj)) {
    out.add(prefix + k);
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) keysDeep(v, prefix + k + '.', out, depth + 1);
  }
  return out;
}

async function probe(path) {
  for (const qsObj of qsVariants) {
    const qs = new URLSearchParams(qsObj).toString();
    let res;
    try { res = await fetch(`${BASE_URL}${path}?${qs}`, { headers: H }); }
    catch (e) { console.log(`${path} [${qs}] -> ERRO fetch ${e.message}`); continue; }
    if (res.status === 429) { console.log('429 — aguardando 61s'); await sleep(61000); }
    let bodyText = '';
    try { bodyText = await res.text(); } catch {}
    if (res.status < 300) {
      let json; try { json = JSON.parse(bodyText); } catch { json = null; }
      const content = json && (json.content || (Array.isArray(json) ? json : null));
      const first = content && content.length ? content[0] : (json && !json.content ? json : null);
      console.log(`✅ ${path} [${qs}] -> HTTP ${res.status}, itens=${content ? content.length : '?'}`);
      if (first) console.log('   chaves:', [...keysDeep(first)].join(', '));
      if (first) console.log('   amostra:', JSON.stringify(first).slice(0, 600));
      await sleep(6500);
      return; // achou algo nesse endpoint, não testa outras variantes
    } else {
      console.log(`✗ ${path} [${qs}] -> HTTP ${res.status} ${bodyText.slice(0, 120).replace(/\n/g, ' ')}`);
    }
    await sleep(6500);
  }
}

async function dumpTireTopKeys() {
  const qs = new URLSearchParams({ branchOfficesId: BRANCH, pageSize: 100, pageNumber: 0 }).toString();
  const res = await fetch(`${BASE_URL}/tires?${qs}`, { headers: H });
  if (res.status >= 300) { console.log('tires topkeys -> HTTP', res.status); return; }
  const json = await res.json();
  const disp = (json.content || []).find(p => p.status === 'DISPOSAL');
  if (disp) {
    console.log('=== CHAVES DE TOPO de um pneu DISPOSAL ===');
    console.log(Object.keys(disp).join(', '));
    console.log('updatedAt=', disp.updatedAt, '| createdAt=', disp.createdAt);
  } else console.log('nenhum DISPOSAL na 1ª página');
}

async function main() {
  console.log('=== TESTANDO ENDPOINTS DE DESCARTE ===');
  for (const ep of endpoints) await probe(ep);
  console.log('');
  await dumpTireTopKeys();
  console.log('=== FIM ===');
}
main().catch(e => { console.error('Falha:', e); process.exit(1); });
