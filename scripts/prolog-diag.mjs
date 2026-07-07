// Diag v4: lê o erro COMPLETO e testa variações do parâmetro em /tires/disposals.
const TOKEN = (process.env.PROLOG_TOKEN || '').trim();
const BASE_URL = 'https://prologapp.com/prolog/api/v3';
const BRANCH = 1676;
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!TOKEN) { console.error('Falta PROLOG_TOKEN'); process.exit(1); }
const H = { 'x-prolog-api-token': TOKEN };

async function call(url) {
  let res;
  try { res = await fetch(url, { headers: H }); }
  catch (e) { console.log(`ERRO ${url} :: ${e.message}`); return; }
  if (res.status === 429) { console.log('429 — 61s'); await sleep(61000); return call(url); }
  const txt = await res.text();
  console.log(`\n>>> ${url}\nHTTP ${res.status}\n${txt.slice(0, 500)}`);
  await sleep(6500);
}

async function main() {
  const qs = new URLSearchParams({ branchOfficesId: BRANCH, pageSize: 100, pageNumber: 0 }).toString();
  const r = await fetch(`${BASE_URL}/tires?${qs}`, { headers: H });
  const j = await r.json();
  const id = (j.content || []).find(p => p.status === 'DISPOSAL')?.id;
  console.log('=== tireId DISPOSAL:', id, '===');
  await sleep(6500);
  if (!id) return;
  await call(`${BASE_URL}/tires/disposals?tireId=${id}`);
  await call(`${BASE_URL}/tires/disposals?tireIds=${id}`);
  await call(`${BASE_URL}/tires/disposals?tiresId=${id}`);
  await call(`${BASE_URL}/tires/disposals?tireId%5B%5D=${id}`);
  await call(`${BASE_URL}/tires/disposals?id=${id}`);
  await call(`${BASE_URL}/tires/disposals?tireId=${id}&branchOfficesId=${BRANCH}`);
  console.log('=== FIM ===');
}
main().catch(e => { console.error('Falha:', e); process.exit(1); });
