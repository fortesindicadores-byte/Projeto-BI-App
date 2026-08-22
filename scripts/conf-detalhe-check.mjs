// ============================================================================
// Conf Detalhe Check — audita o conformidade-detalhe gravado no Supabase:
// linhas por filial em cada vigência, duplicatas exatas e placas repetidas.
// Roda no Actions (o sandbox não alcança o Supabase).
// ============================================================================
const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('Falta GEM_SUPABASE_SERVICE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

const res = await fetch(`${SB_URL}/rest/v1/elite_snapshot?indicador=eq.conformidade-detalhe&escopo=eq.mes&select=vigencia,data,updated_at&order=vigencia`, { headers: H });
if (!res.ok) { console.error('REST', res.status, await res.text()); process.exit(1); }
const rows = await res.json();
console.log(`vigências gravadas: ${rows.length}\n`);
for (const r of rows) {
  const d = Array.isArray(r.data) ? r.data : [];
  const porFil = {};
  d.forEach(x => { const f = String(x['Filial'] || '?').trim(); porFil[f] = (porFil[f] || 0) + 1; });
  // duplicata exata = mesma filial+placa+competência+vencimento+status
  const chaves = new Set(); let dups = 0;
  d.forEach(x => {
    const k = [x['Filial'], x['Placa'], x['Competência'], x['Vencimento Vigente'], x['Status']].join('|');
    if (chaves.has(k)) dups++; else chaves.add(k);
  });
  const st = {};
  d.forEach(x => { const s = String(x['Status'] || '?').trim(); st[s] = (st[s] || 0) + 1; });
  console.log(`— ${r.vigencia}: ${d.length} linha(s) · ${Object.keys(porFil).length} filial(is) · ${dups} duplicata(s)`);
  console.log('   por filial:', Object.entries(porFil).sort().map(([f, n]) => `${f}=${n}`).join(' · '));
  console.log('   por status:', Object.entries(st).sort().map(([s, n]) => `${s}=${n}`).join(' · '));
}
