// Diag v3: os endpoints de descarte são POR pneu (exigem tireId).
// Pega ids de pneus DISPOSAL e testa formatos + batch, procurando a data.
const TOKEN = (process.env.PROLOG_TOKEN || '').trim();
const BASE_URL = 'https://prologapp.com/prolog/api/v3';
const BRANCH = 1676;
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!TOKEN) { console.error('Falta PROLOG_TOKEN'); process.exit(1); }
const H = { 'x-prolog-api-token': TOKEN };

function keysDeep(obj, prefix = '', out = new Set(), depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3) return out;
  for (const k of Object.keys(obj)) {
    out.add(prefix + k);
    const v = obj[k];
    if (v && typeof v === 'object') keysDeep(Array.isArray(v) ? v[0] : v, prefix + k + '.', out, depth + 1);
  }
  return out;
}

async function call(url) {
  let res;
  try { res = await fetch(url, { headers: H }); }
  catch (e) { console.log(`ERRO fetch ${url} :: ${e.message}`); return; }
  if (res.status === 429) { console.log('429 — 61s'); await sleep(61000); return call(url); }
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = null; }
  console.log(`\n>>> ${url}`);
  console.log(`HTTP ${res.status}`);
  if (res.status < 300 && json) {
    const arr = json.content || (Array.isArray(json) ? json : [json]);
    console.log('itens:', Array.isArray(arr) ? arr.length : '?');
    console.log('chaves:', [...keysDeep(arr[0])].join(', '));
    console.log('amostra:', JSON.stringify(arr[0]).slice(0, 800));
  } else {
    console.log(txt.slice(0, 200).replace(/\n/g, ' '));
  }
  await sleep(6500);
}

async function main() {
  // 1) ids de pneus DISPOSAL
  const qs = new URLSearchParams({ branchOfficesId: BRANCH, pageSize: 100, pageNumber: 0 }).toString();
  const r = await fetch(`${BASE_URL}/tires?${qs}`, { headers: H });
  const j = await r.json();
  const disp = (j.content || []).filter(p => p.status === 'DISPOSAL');
  const ids = disp.slice(0, 5).map(p => p.id);
  console.log('=== ids DISPOSAL (amostra):', ids.join(', '), '===');
  await sleep(6500);
  if (!ids.length) { console.log('sem DISPOSAL na página'); return; }
  const id = ids[0], idsCsv = ids.join(',');

  // 2) formatos por-pneu (1 id)
  await call(`${BASE_URL}/tires/disposals?tireId=${id}`);
  await call(`${BASE_URL}/tires/disposal?tireId=${id}`);
  await call(`${BASE_URL}/tires/${id}/disposal`);
  await call(`${BASE_URL}/tires/${id}/disposals`);
  // 3) batch (vários ids)
  await call(`${BASE_URL}/tires/disposals?tireId=${idsCsv}`);
  await call(`${BASE_URL}/tires/disposals?tiresId=${idsCsv}`);
  console.log('=== FIM ===');
}
main().catch(e => { console.error('Falha:', e); process.exit(1); });
