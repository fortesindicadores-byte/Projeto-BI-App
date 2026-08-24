// ============================================================
// Peso da abertura — quantos bytes cada painel baixa do Supabase no boot.
//
// Renan (24/08/2026): "Gestão à Vista, Scorecard etc ainda demorando para
// carregar no início". O cache (SwrCache/IndexedDB) já pinta na hora quando
// existe; o que dói é a primeira carga e o refresh em segundo plano. Este
// script mede o tamanho real de cada consulta que os painéis fazem, para a
// otimização mirar no que pesa de verdade (e não no palpite).
//
// Uso: GEM_SUPABASE_SERVICE_KEY=... node scripts/peso-boot.mjs
// ============================================================
const URL_BASE = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const mb = n => (n / 1048576).toFixed(2) + ' MB';
const kb = n => (n / 1024).toFixed(0) + ' kB';

async function medir(rot, path) {
  const t0 = Date.now();
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers: H });
  const txt = await r.text();
  const ms = Date.now() - t0;
  let n = 0; try { n = JSON.parse(txt).length; } catch (e) {}
  console.log(`${rot.padEnd(46)} ${String(ms).padStart(6)} ms  ${mb(txt.length).padStart(9)}  ${String(n).padStart(6)} linha(s)`);
  return { bytes: txt.length, ms, txt };
}

console.log('consulta                                          tempo      tamanho   linhas');
console.log('─'.repeat(84));

// ── Gestão à Vista / Farol ──
console.log('\n[Gestão à Vista]');
const gin = await medir('ginfo_snapshot (tudo — farolLoad)', 'ginfo_snapshot?select=chave,data,updated_at');
const conf = await medir("elite_snapshot conformidade-dia", "elite_snapshot?select=vigencia,data,updated_at&indicador=eq.conformidade-dia");
const confDet = await medir('elite_snapshot conformidade-detalhe', 'elite_snapshot?select=vigencia,data,updated_at&indicador=eq.conformidade-detalhe');
const fca = await medir('fca (colunas do GAV)', 'fca?select=unidade,vigencia,origem,fato,prazo,status');

// quebra do ginfo por chave — o que pesa dentro do pacote
try {
  const linhas = JSON.parse(gin.txt);
  console.log('\n  peso por base do Ginfo:');
  linhas.map(l => ({ chave: l.chave, b: JSON.stringify(l.data || '').length,
                     n: Array.isArray(l.data) ? l.data.length : null }))
    .sort((a, b) => b.b - a.b)
    .forEach(x => console.log(`    ${String(x.chave).padEnd(28)} ${kb(x.b).padStart(9)}  ${x.n ?? '?'} linha(s)`));
} catch (e) { console.log('  (não deu para quebrar o ginfo:', e.message, ')'); }

// ── Scorecard / Gerot (GerotBase.load) ──
console.log('\n[Scorecard · Diagnóstico · Resumo Executivo — GerotBase]');
const elite = await medir('elite_snapshot (tudo — GerotBase.load)', 'elite_snapshot?select=indicador,vigencia,escopo,data,updated_at');
try {
  const linhas = JSON.parse(elite.txt);
  const porInd = new Map();
  linhas.forEach(l => {
    const k = l.indicador;
    const b = JSON.stringify(l.data || '').length;
    const o = porInd.get(k) || { b: 0, n: 0 };
    o.b += b; o.n++; porInd.set(k, o);
  });
  console.log('\n  peso por indicador:');
  [...porInd.entries()].sort((a, b) => b[1].b - a[1].b)
    .forEach(([k, o]) => console.log(`    ${k.padEnd(28)} ${kb(o.b).padStart(9)}  ${o.n} registro(s)`));
} catch (e) { console.log('  (não deu para quebrar o elite:', e.message, ')'); }

const totalGAV = gin.bytes + conf.bytes + confDet.bytes + fca.bytes;
console.log('\n─'.repeat(84));
console.log(`Gestão à Vista baixa no boot: ${mb(totalGAV)}`);
console.log(`GerotBase (Scorecard e cia)  : ${mb(elite.bytes)}`);
