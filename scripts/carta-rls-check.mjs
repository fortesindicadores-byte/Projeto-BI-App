// ============================================================
// Carta de Custos — check do acesso multi-unidade (só leitura).
//
// Testa com a chave ANÔNIMA + login real? Não: não temos senha de ninguém.
// O que dá para provar sem senha:
//   1) quais perfis têm mais de uma unidade (os candidatos ao bug);
//   2) se ESSES perfis têm lançamentos na carta_custos (service key ignora RLS,
//      então aqui vemos o dado real que a pessoa deveria enxergar);
//   3) se a função fca_has_unit responde certo para uma lista com vírgula —
//      chamando a RPC com a lógica equivalente via PostgREST não dá, então
//      reproduzimos a comparação das duas regras (antiga × nova) em JS e
//      mostramos o veredito para cada perfil multi-unidade.
//
// Uso: GEM_SUPABASE_SERVICE_KEY=... node scripts/carta-rls-check.mjs
// O repo é público: nomes de pessoas saem mascarados.
// ============================================================
const URL_BASE = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const mask = s => String(s || '').split(/\s+/)
  .map(p => p ? p[0] + '*'.repeat(Math.max(p.length - 1, 0)) : '').join(' ');

async function get(path) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

const perfis = await get('fca_profiles?select=user_id,nome,unidade,is_admin&order=unidade');
const multi = perfis.filter(p => String(p.unidade || '').includes(','));
console.log(`Perfis: ${perfis.length} · com MAIS DE UMA unidade: ${multi.length}\n`);

// A tabela existe? Quais unidades já têm lançamento?
// colunas variam entre ambientes: descobre pela primeira linha e só então pede o resto
let linhas = [], COLS = [];
try {
  const amostra = await get('carta_custos?select=*&limit=1');
  COLS = amostra.length ? Object.keys(amostra[0]) : [];
  const quem = ['created_by', 'user_id', 'autor', 'criado_por'].find(c => COLS.includes(c)) || null;
  console.log('Colunas da carta_custos:', COLS.join(', ') || '(tabela vazia)');
  console.log('Coluna de autor:', quem || '(nenhuma — não dá para saber quem lançou)\n');
  linhas = await get(`carta_custos?select=id,unidade,vigencia${quem ? ',' + quem : ''}&limit=10000`);
  if (quem && quem !== 'created_by') linhas.forEach(l => { l.created_by = l[quem]; });
} catch (e) { console.log('carta_custos:', e.message); }
const porUni = new Map();
linhas.forEach(l => porUni.set(l.unidade, (porUni.get(l.unidade) || 0) + 1));
console.log(`carta_custos: ${linhas.length} linha(s)`);
console.log('Lançamentos por unidade:');
[...porUni.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([u, n]) => console.log(`  ${String(u).padEnd(12)} ${n}`));

// Quem lançou (por unidade da linha) — mostra se unidade multi consegue gravar
const autores = new Set(linhas.map(l => l.created_by).filter(Boolean));
console.log(`\nAutores distintos com lançamento: ${autores.size}`);
const perfilDe = new Map(perfis.map(p => [p.user_id, p]));
const autoresMulti = [...autores].filter(id => String((perfilDe.get(id) || {}).unidade || '').includes(','));
console.log(`Desses, com perfil multi-unidade: ${autoresMulti.length}` +
  (autoresMulti.length ? '  → multi-unidade JÁ conseguiu gravar alguma vez' : '  → NENHUM multi-unidade gravou (bate com o gap relatado)'));

console.log('\n── Perfis multi-unidade: o que cada regra devolveria ──');
console.log('(regra ANTIGA = unidade da linha igual à string inteira do perfil · NOVA = pertence à lista)');
for (const p of multi) {
  const lista = String(p.unidade).split(',').map(s => s.trim());
  const alvo = lista[0];
  const antiga = alvo === String(p.unidade);          // 'MCC T1' === 'MCC T1,MCC T2' → false
  const nova = lista.includes(alvo);
  const meus = linhas.filter(l => lista.includes(l.unidade)).length;
  console.log(`${mask(p.nome).padEnd(26)} unidade='${p.unidade}' admin=${!!p.is_admin}`);
  console.log(`   lançamentos das unidades dele: ${meus} · regra antiga deixaria: ${antiga} · regra nova: ${nova}`);
}
if (!multi.length) console.log('(nenhum perfil com vírgula na unidade)');
