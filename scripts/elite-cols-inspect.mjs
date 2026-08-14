// Colunas de CADA indicador no elite_snapshot + as linhas de MACACU.
// Objetivo: achar o DENOMINADOR de cada tela (viagens, veículos, contagens…)
// para unificar CDI MACACU + MACACU EMPURRADA de forma ponderada — e não com
// média de médias. Roda via Actions (o sandbox não alcança o Supabase).
const URL = process.env.GEM_SUPABASE_URL || 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.log('SEM GEM_SUPABASE_SERVICE_KEY'); process.exit(1); }
const req = async q => {
  const r = await fetch(`${URL}/rest/v1/elite_snapshot?${q}`, { headers:{apikey:KEY, Authorization:'Bearer '+KEY} });
  if (!r.ok) throw new Error('http '+r.status);
  return r.json();
};
const N = s => String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim();
const rows = await req(`escopo=eq.mes&vigencia=eq.07/2026&select=indicador,data&order=indicador`);
for (const r of rows) {
  const d = Array.isArray(r.data) ? r.data : [];
  console.log(`\n===== ${r.indicador} · ${d.length} linhas =====`);
  if (!d.length) continue;
  console.log('colunas:', Object.keys(d[0]).join(' | '));
  const macacu = d.filter(l => Object.values(l).some(v => /MACACU/i.test(String(v))));
  macacu.forEach(l => console.log('   MACACU →', JSON.stringify(l)));
  if (!macacu.length) console.log('   (sem linha de MACACU)');
}
