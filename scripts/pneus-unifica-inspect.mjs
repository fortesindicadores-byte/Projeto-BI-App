// Lista as tabelas e colunas expostas do projeto Supabase antigo (pneus/femsa)
// via OpenAPI do PostgREST — para desenhar a unificação no projeto principal.
const URL = 'https://ewbzeqsneeylwkxtcpme.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3YnplcXNuZWV5bHdreHRjcG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzY2MTcsImV4cCI6MjA5NzQ1MjYxN30.W8W6Yunt6Z8NB73qpOD8eqYlrsgMRgEG-siYsJFwDwE';

const r = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
if (!r.ok) { console.error('OpenAPI HTTP ' + r.status); process.exit(1); }
const spec = await r.json();
const defs = spec.definitions || {};
for (const [tabela, def] of Object.entries(defs)) {
  console.log(`\n== ${tabela} ==`);
  const req = new Set(def.required || []);
  for (const [col, p] of Object.entries(def.properties || {})) {
    const pk = (p.description || '').includes('Primary Key') ? ' [PK]' : '';
    console.log(`  ${col}  ${p.format || p.type}${req.has(col) ? ' NOT NULL' : ''}${pk}  ${p.default != null ? 'default=' + p.default : ''}`);
  }
}

// tamanho aproximado de cada tabela (contagem de linhas)
for (const tabela of Object.keys(defs)) {
  const c = await fetch(`${URL}/rest/v1/${tabela}?select=*`, {
    method: 'HEAD', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'count=exact' }
  });
  console.log(`linhas ${tabela}: ${c.headers.get('content-range')}`);
}
