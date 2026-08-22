// ============================================================
// FCA Gantt Inspect — só leitura.
// Bug reportado (22/08/2026): filtrando uma vigência ANTERIOR à última no
// Gantt do fca-consolidado, a escala de meses explode (ex.: ago/25 → set/26)
// e todas as barras viram pontinhos amontoados. A escala nasce do menor
// created_at/prazo das linhas visíveis — então alguma linha da vigência tem
// data fora da janela (prazo digitado no ano errado, etc.).
//
// Este script lista, por vigência, o min/max de created_at e prazo e imprime
// as linhas cuja data cai longe do mês da vigência (janela: 60 dias antes do
// mês até 240 dias depois). Não imprime responsável (nome de pessoa) — o
// repo é público e o log do Actions fica visível.
//
// Uso: GEM_SUPABASE_SERVICE_KEY=... node scripts/fca-gantt-inspect.mjs
// ============================================================
const URL_BASE = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function vigDate(v) {                       // 'jun/26' → Date(2026-06-01)
  const m = String(v || '').match(/^([a-zç]{3})\/(\d{2})$/i);
  if (!m) return null;
  const i = MESES.indexOf(m[1].toLowerCase());
  return i < 0 ? null : new Date(2000 + +m[2], i, 1);
}
const d10 = v => (v ? String(v).slice(0, 10) : null);
const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

async function fetchAll() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/fca?select=id,unidade,vigencia,fato,prazo,created_at,status&order=created_at.asc`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) throw new Error(`REST ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const page = await r.json();
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

const rows = await fetchAll();
console.log(`Total de linhas no fca: ${rows.length}\n`);

const porVig = new Map();
rows.forEach(r => {
  const k = r.vigencia || '(sem vigência)';
  if (!porVig.has(k)) porVig.set(k, []);
  porVig.get(k).push(r);
});

const vigs = [...porVig.keys()].sort((a, b) => (vigDate(a) || 0) - (vigDate(b) || 0));
console.log('── Janela de datas por vigência (o que estica a escala do Gantt) ──');
for (const v of vigs) {
  const rs = porVig.get(v);
  const cr = rs.map(r => d10(r.created_at)).filter(Boolean).sort();
  const pz = rs.map(r => d10(r.prazo)).filter(Boolean).sort();
  console.log(`${v.padEnd(14)} ${String(rs.length).padStart(4)} linhas · created ${cr[0] || '—'} → ${cr[cr.length - 1] || '—'} · prazo ${pz[0] || '—'} → ${pz[pz.length - 1] || '—'}`);
}

console.log('\n── Linhas com data FORA da janela da vigência (60d antes → 240d depois do mês) ──');
let n = 0;
for (const v of vigs) {
  const base = vigDate(v);
  if (!base) continue;
  const lo = new Date(base); lo.setDate(lo.getDate() - 60);
  const hi = new Date(base); hi.setDate(hi.getDate() + 240);
  for (const r of porVig.get(v)) {
    const probs = [];
    for (const [campo, val] of [['created_at', d10(r.created_at)], ['prazo', d10(r.prazo)]]) {
      if (!val) continue;
      const d = new Date(val + 'T00:00:00');
      if (d < lo) probs.push(`${campo}=${val} (${dias(val, base)}d ANTES do mês da vigência)`);
      else if (d > hi) probs.push(`${campo}=${val} (${dias(base, val)}d depois do mês)`);
    }
    if (probs.length) {
      n++;
      const fato = String(r.fato || '').split('\n')[0].slice(0, 48);
      console.log(`id=${r.id} · ${r.unidade} · ${v} · status=${r.status || 'Não iniciada'} · ${fato}`);
      probs.forEach(p => console.log(`   → ${p}`));
    }
  }
}
console.log(n ? `\n${n} linha(s) suspeitas.` : 'Nenhuma linha fora da janela — a escala esticada vem de outro lugar.');
