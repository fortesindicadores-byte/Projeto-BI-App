// Carga/mescla do de-para chave→modelo do Freightech (locacao_modelos).
// Uso: workflow Locacao Modelos Backfill, input `mapa` = JSON {"P:PLACA":"MODELO",...}
// Mescla SEM sobrescrever o que já existe — a mesma regra do painel.
const URL = process.env.GEM_SUPABASE_URL || 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.log('SEM GEM_SUPABASE_SERVICE_KEY'); process.exit(1); }
const novo = JSON.parse(process.env.MAPA_JSON || '{}');
if (!Object.keys(novo).length) { console.log('input mapa vazio'); process.exit(1); }

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const r = await fetch(`${URL}/rest/v1/locacao_modelos?id=eq.1&select=modelos`, { headers: H });
if (!r.ok) { console.log('leitura falhou:', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
const atual = ((await r.json())[0] || {}).modelos || {};
let add = 0;
for (const [k, v] of Object.entries(novo)) if (!(k in atual)) { atual[k] = v; add++; }
const up = await fetch(`${URL}/rest/v1/locacao_modelos?on_conflict=id`, {
  method: 'POST',
  headers: { ...H, Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify({ id: 1, modelos: atual, updated_at: new Date().toISOString(), updated_by: 'backfill' }),
});
if (!up.ok) { console.log('gravação falhou:', up.status, (await up.text()).slice(0, 300)); process.exit(1); }
console.log(`ok — ${add} chave(s) nova(s), ${Object.keys(atual).length} no total`);
