// Diagnóstico rápido: descobre o nome do campo de DATA do descarte na API /tires.
// Busca 1 unidade, acha o primeiro pneu com disposal e loga as chaves. Descartável.
const TOKEN = (process.env.PROLOG_TOKEN || '').trim();
const BASE_URL = 'https://prologapp.com/prolog/api/v3';
const BRANCH = 1676; // MCC T1 (qualquer unidade com descartes serve)
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!TOKEN) { console.error('Falta PROLOG_TOKEN'); process.exit(1); }

async function main() {
  let page = 0, comDisposal = 0, amostras = [];
  const chaves = new Set();
  while (page < 6) { // no máx 6 páginas (600 pneus) — suficiente p/ achar descartes
    const qs = new URLSearchParams({ branchOfficesId: BRANCH, pageSize: 100, pageNumber: page }).toString();
    const res = await fetch(`${BASE_URL}/tires?${qs}`, { headers: { 'x-prolog-api-token': TOKEN } });
    if (res.status === 429) { console.log('429 — aguardando 61s'); await sleep(61000); continue; }
    if (res.status >= 300) { console.log(`HTTP ${res.status} — parando`); break; }
    const json = await res.json();
    const content = json.content || [];
    if (!content.length) break;
    for (const p of content) {
      if (p.disposal) {
        comDisposal++;
        Object.keys(p.disposal).forEach(k => chaves.add(k));
        if (amostras.length < 3) amostras.push({ status: p.status, disposal: p.disposal });
      }
    }
    if (json.lastPage) break;
    page++; await sleep(6500);
  }
  console.log('=== PNEUS COM disposal:', comDisposal, '===');
  console.log('=== CHAVES DO OBJETO disposal ===');
  console.log([...chaves].join(', '));
  console.log('=== AMOSTRAS (até 3) ===');
  console.log(JSON.stringify(amostras, null, 2));
}
main().catch(e => { console.error('Falha:', e); process.exit(1); });
