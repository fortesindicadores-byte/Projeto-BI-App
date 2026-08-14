// Inspeciona os exports de checklist no elite_snapshot atrás da coluna
// "Saídas com OS Crítica" (existe na tela ADERÊNCIA FROTA do Ginfo — imagem do
// Renan 14/08/2026: 125 no ano, CUIABA 63, GUARULHOS 25, PELOTAS 12…).
// Se a coluna estiver gravada, o Gerot lê o indicador dela, mês a mês e no
// acumulado, sem robô novo. Roda via Actions (sandbox não alcança o Supabase).
const URL = process.env.GEM_SUPABASE_URL || 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.log('SEM GEM_SUPABASE_SERVICE_KEY'); process.exit(1); }

const req = async (q) => {
  const r = await fetch(`${URL}/rest/v1/elite_snapshot?${q}`, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
  if (!r.ok) throw new Error('http ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
};

const RE_OSC = /sa[ií]das?\s*com\s*os\s*cr[ií]tica/i;
const num = v => { if (v == null || v === '') return 0;
  let s = String(v).replace(/[%\s]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s); return isFinite(n) ? n : 0; };

for (const ind of ['checklist-t2', 'checklist-t1', 'checklist-wh']) {
  for (const escopo of ['mes', 'ano']) {
    const rows = await req(`indicador=eq.${ind}&escopo=eq.${escopo}&select=vigencia,data&order=vigencia`);
    console.log(`\n========== ${ind} · escopo ${escopo} · ${rows.length} vigências ==========`);
    for (const r of rows) {
      const data = Array.isArray(r.data) ? r.data : [];
      if (!data.length) { console.log(`  ${r.vigencia}: vazio`); continue; }
      const keys = Object.keys(data[0]);
      const kOsc = keys.find(k => RE_OSC.test(k));
      const kFil = keys.find(k => /^filial/i.test(k.trim())) || keys[0];
      if (r === rows[0]) console.log('  colunas:', keys.join(' | '));
      if (!kOsc) { console.log(`  ${r.vigencia}: SEM coluna de OS Crítica`); continue; }
      const porFil = {};
      let tot = 0;
      data.forEach(l => { const v = num(l[kOsc]); tot += v;
        const f = String(l[kFil] || '?').trim(); porFil[f] = (porFil[f] || 0) + v; });
      const top = Object.entries(porFil).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([f, v]) => `${f}=${v}`).join(' · ');
      console.log(`  ${r.vigencia}: total ${tot}  [${kOsc}]  ${top}`);
    }
  }
}
