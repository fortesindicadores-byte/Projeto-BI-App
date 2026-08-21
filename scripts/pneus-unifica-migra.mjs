// Unificação Supabase: copia as tabelas do projeto antigo de Pneus
// (ewbzeqsneeylwkxtcpme) para o projeto principal do portal.
// Lê do antigo com a chave anon (pública, só leitura) e grava no principal
// com a service key (GEM_SUPABASE_SERVICE_KEY). Idempotente: upsert por PK.
const OLD_URL = 'https://ewbzeqsneeylwkxtcpme.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3YnplcXNuZWV5bHdreHRjcG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzY2MTcsImV4cCI6MjA5NzQ1MjYxN30.W8W6Yunt6Z8NB73qpOD8eqYlrsgMRgEG-siYsJFwDwE';
const NEW_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const NEW_KEY = (process.env.GEM_SUPABASE_SERVICE_KEY || '').trim();
if (!NEW_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }

const OH = { apikey: OLD_KEY, Authorization: 'Bearer ' + OLD_KEY };
const NH = { apikey: NEW_KEY, Authorization: 'Bearer ' + NEW_KEY, 'Content-Type': 'application/json' };

let falhas = 0;

// ── snapshot: 1 linha por vez (o jsonb de inspections pode ter MBs) ──
const idx = await fetch(`${OLD_URL}/rest/v1/snapshot?select=endpoint,branch_id&order=branch_id,endpoint`, { headers: OH });
if (!idx.ok) { console.error('índice do snapshot antigo: HTTP ' + idx.status); process.exit(1); }
const chaves = await idx.json();
console.log(`snapshot antigo: ${chaves.length} linhas`);
for (const { endpoint, branch_id } of chaves) {
  try {
    const r = await fetch(`${OLD_URL}/rest/v1/snapshot?endpoint=eq.${encodeURIComponent(endpoint)}&branch_id=eq.${branch_id}&select=*`, { headers: OH });
    if (!r.ok) throw new Error('leitura HTTP ' + r.status);
    const [row] = await r.json();
    if (!row) throw new Error('linha sumiu');
    const up = await fetch(`${NEW_URL}/rest/v1/snapshot?on_conflict=endpoint,branch_id`, {
      method: 'POST', headers: { ...NH, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([row])
    });
    if (!up.ok) throw new Error('upsert HTTP ' + up.status + ' ' + (await up.text()).slice(0, 140));
    console.log(`ok  ${endpoint}/${branch_id}  ${(JSON.stringify(row.data).length / 1024).toFixed(0)}KB  (${row.updated_at})`);
  } catch (e) { falhas++; console.log(`FALHOU  ${endpoint}/${branch_id}  ${e.message}`); }
}

// ── historico_mensal (hoje vazia, mas copia o que houver) ──
const h = await fetch(`${OLD_URL}/rest/v1/historico_mensal?select=*`, { headers: OH });
if (h.ok) {
  const rows = await h.json();
  console.log(`historico_mensal antigo: ${rows.length} linhas`);
  if (rows.length) {
    const up = await fetch(`${NEW_URL}/rest/v1/historico_mensal?on_conflict=competencia`, {
      method: 'POST', headers: { ...NH, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows)
    });
    if (!up.ok) { falhas++; console.log('FALHOU historico_mensal: HTTP ' + up.status + ' ' + (await up.text()).slice(0, 140)); }
    else console.log('ok historico_mensal');
  }
} else { falhas++; console.log('leitura historico_mensal antigo: HTTP ' + h.status); }

// ── conferência: contagens no destino ──
for (const t of ['snapshot', 'historico_mensal']) {
  const c = await fetch(`${NEW_URL}/rest/v1/${t}?select=*`, { method: 'HEAD', headers: { ...NH, Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' } });
  console.log(`destino ${t}: ${(c.headers.get('content-range') || '?').split('/')[1]} linhas`);
}
console.log(falhas ? `\n${falhas} falha(s)` : '\nMIGRAÇÃO COMPLETA');
process.exit(falhas ? 1 : 0);
