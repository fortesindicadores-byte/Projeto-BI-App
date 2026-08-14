// Como unificar CDI MACACU + MACACU EMPURRADA "da forma mais poderosa"?
// Para cada indicador do elite_snapshot mostra: as colunas da tela, e o que
// existe para as DUAS filiais de Macacu — valor (%) ou contagem 1/0 —, para
// decidir onde dá pool exato e onde é preciso ponderar (e por qual peso).
const URL = process.env.GEM_SUPABASE_URL || 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.log('SEM GEM_SUPABASE_SERVICE_KEY'); process.exit(1); }
const req = async q => {
  const r = await fetch(`${URL}/rest/v1/elite_snapshot?${q}`, { headers:{apikey:KEY, Authorization:'Bearer '+KEY} });
  if (!r.ok) throw new Error('http '+r.status); return r.json();
};
const N = s => String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const ehMacacu = f => /MACACU/.test(N(f));
const num = v => { if (v==null||v==='') return null; if (typeof v==='number') return v;
  let s=String(v).replace(/[%\s]/g,''); if (s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
  const n=parseFloat(s); return isFinite(n)?n:null; };

const rows = await req(`escopo=eq.mes&vigencia=eq.07/2026&select=indicador,data&order=indicador`);
for (const r of rows) {
  const d = Array.isArray(r.data) ? r.data : [];
  console.log(`\n===== ${r.indicador} · ${d.length} linhas =====`);
  if (!d.length) continue;
  const cols = Object.keys(d[0]);
  console.log('  colunas:', cols.join(' | '));
  const kFil = cols.find(c => /^filial/i.test(c.trim())) || cols.find(c => /filial/i.test(c)) || cols[0];
  const linhas = d.filter(l => ehMacacu(l[kFil]));
  const porFil = {};
  linhas.forEach(l => { const f = String(l[kFil]).trim(); (porFil[f] = porFil[f] || []).push(l); });
  Object.entries(porFil).forEach(([f, ls]) => {
    if (ls.length === 1) {
      // tela agregada por filial: mostra todos os números da linha
      const nums = Object.entries(ls[0]).filter(([, v]) => num(v) != null)
        .map(([k, v]) => `${k}=${v}`).join(' · ');
      console.log(`  ${f}: [1 linha] ${nums}`);
    } else {
      // tela linha-a-linha (placa/equipamento): conta e soma o desconto
      const kDesc = cols.find(c => /^desconto/i.test(c.trim())) || cols.find(c => /desconto total/i.test(c));
      const semDesc = kDesc ? ls.filter(l => !num(l[kDesc])).length : null;
      console.log(`  ${f}: [${ls.length} linhas]` + (kDesc ? ` sem desconto ${semDesc}/${ls.length} = ${(semDesc/ls.length*100).toFixed(1)}%` : ' (sem coluna de desconto)'));
    }
  });
  if (!linhas.length) console.log('  (sem linha de MACACU)');
}
