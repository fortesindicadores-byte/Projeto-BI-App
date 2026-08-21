// Lista colunas (via amostra de 1 linha) e contagem das tabelas conhecidas do
// projeto Supabase antigo (pneus/femsa) — o índice OpenAPI dele responde 401,
// então inspecionamos tabela a tabela com a chave anon pública.
const URL = 'https://ewbzeqsneeylwkxtcpme.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3YnplcXNuZWV5bHdreHRjcG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzY2MTcsImV4cCI6MjA5NzQ1MjYxN30.W8W6Yunt6Z8NB73qpOD8eqYlrsgMRgEG-siYsJFwDwE';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

const TABELAS = ['snapshot', 'historico_mensal', 'ce_scores_mensais', 'ce_leituras_diarias'];

const tipoDe = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

for (const t of TABELAS) {
  const r = await fetch(`${URL}/rest/v1/${t}?select=*&limit=1`, { headers: H });
  if (!r.ok) { console.log(`\n== ${t} ==  HTTP ${r.status} ${(await r.text()).slice(0, 120)}`); continue; }
  const rows = await r.json();
  const c = await fetch(`${URL}/rest/v1/${t}?select=*`, { method: 'HEAD', headers: { ...H, Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' } });
  console.log(`\n== ${t} ==  linhas: ${(c.headers.get('content-range') || '?').split('/')[1]}`);
  if (!rows.length) { console.log('  (vazia)'); continue; }
  for (const [col, v] of Object.entries(rows[0])) {
    const amostra = JSON.stringify(v);
    console.log(`  ${col}: ${tipoDe(v)}  ex=${amostra && amostra.length > 60 ? amostra.slice(0, 60) + '…' : amostra}`);
  }
}

// tamanho total aproximado do snapshot (soma dos jsonb por linha)
const s = await fetch(`${URL}/rest/v1/snapshot?select=endpoint,branch_id,updated_at`, { headers: H });
if (s.ok) {
  const rows = await s.json();
  console.log(`\nsnapshot: ${rows.length} linhas — endpoints: ${[...new Set(rows.map(r => r.endpoint))].join(', ')}`);
  console.log('updated_at mais recente:', rows.map(r => r.updated_at).sort().slice(-1)[0]);
}
