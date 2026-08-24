// ============================================================
// Planner — variantes do mesmo nome no campo Responsável (só leitura).
//
// Renan (24/08/2026): "Porque aparece Renan e Renan Fortes?". O Planner grava
// o responsável como TEXTO. A lista do seletor vem de `fca_profiles.nome` dos
// admins, mas o nome do próprio usuário logado entra pelo metadata do login —
// se as duas fontes divergirem (perfil 'Renan' × login 'Renan Fortes'), a mesma
// pessoa vira duas opções e as ações ficam divididas entre as duas grafias.
//
// Este script lista as grafias em uso e agrupa as que têm o MESMO primeiro
// nome, que é o sinal do problema. Sobrenomes saem mascarados (repo público).
//
// Uso: GEM_SUPABASE_SERVICE_KEY=... node scripts/planner-nomes-check.mjs
// ============================================================
const URL_BASE = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// primeiro nome inteiro + iniciais do resto: "Renan Fortes" → "Renan F."
const mask = s => {
  const p = String(s || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '(vazio)';
  return [p[0], ...p.slice(1).map(x => x[0].toUpperCase() + '.')].join(' ');
};
const primeiro = s => String(s || '').trim().split(/\s+/)[0].toLocaleLowerCase('pt-BR');

async function get(p) {
  const r = await fetch(`${URL_BASE}/rest/v1/${p}`, { headers: H });
  if (!r.ok) throw new Error(`${p} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const linhas = await get('planner?select=id,responsavel,status');
const perfis = await get('fca_profiles?select=user_id,nome,is_admin&is_admin=eq.true');

const cont = new Map();
linhas.forEach(l => {
  const v = String(l.responsavel || '').trim();
  cont.set(v, (cont.get(v) || 0) + 1);
});

console.log(`planner: ${linhas.length} ação(ões) · ${cont.size} grafia(s) de responsável\n`);
console.log('grafias em uso (ações):');
[...cont.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([n, q]) => console.log(`  ${mask(n).padEnd(24)} ${String(q).padStart(4)}`));

console.log('\nnomes no perfil dos admins (o que o seletor oferece):');
perfis.map(p => String(p.nome || '').trim()).filter(Boolean).sort()
  .forEach(n => console.log(`  ${mask(n)}`));

// mesmo primeiro nome com grafias diferentes = a mesma pessoa dividida
const grupos = new Map();
[...cont.keys()].filter(Boolean).forEach(n => {
  const k = primeiro(n);
  (grupos.get(k) || grupos.set(k, []).get(k)).push(n);
});
const dup = [...grupos.entries()].filter(([, v]) => v.length > 1);
console.log('\n── mesmo primeiro nome, grafias diferentes ──');
if (!dup.length) console.log('  (nenhum)');
dup.forEach(([k, v]) => {
  console.log(`  ${k}:`);
  v.forEach(n => console.log(`     "${mask(n)}"  → ${cont.get(n)} ação(ões)`));
  const cheio = v.slice().sort((a, b) => b.trim().split(/\s+/).length - a.trim().split(/\s+/).length)[0];
  console.log(`     sugestão: unificar em "${mask(cheio)}"`);
});
