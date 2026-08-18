// MACACU unificado (Renan, 14/08/2026): CDI MACACU + MACACU EMPURRADA viram
// uma unidade só no Frota de Elite. A pontuação da unidade caiu depois da
// fusão — este script mostra, indicador a indicador, de onde vem a diferença.
//
// Roda o LEITOR de verdade (assets/gerot-base.js) contra o Supabase real, uma
// vez com fundir:false e outra com fundir:true, em CONTEXTOS SEPARADOS (o
// leitor guarda caches internos por modo).
import fs from 'node:fs';
import vm from 'node:vm';

const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY = process.env.GEM_SUPABASE_SERVICE_KEY
            || 'sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';

function novoContexto() {
  const ctx = vm.createContext({ console, fetch, setTimeout, clearTimeout });
  vm.runInContext('globalThis.window = globalThis;', ctx);
  ctx.supabase = { createClient: () => ({
    from(tab) {
      const st = { tab, sel: '*', qs: [] };
      const run = async () => {
        const url = `${SB_URL}/rest/v1/${st.tab}?select=${encodeURIComponent(st.sel)}`
                  + (st.qs.length ? '&' + st.qs.join('&') : '');
        const r = await fetch(url, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
        if (!r.ok) return { data: null, error: new Error(r.status + ' ' + (await r.text()).slice(0, 200)) };
        return { data: await r.json(), error: null };
      };
      const api = { select(s){ st.sel=s; return api; }, eq(c,v){ st.qs.push(`${c}=eq.${encodeURIComponent(v)}`); return api; },
                    in(c,a){ st.qs.push(`${c}=in.(${a.map(x=>'"'+x+'"').join(',')})`); return api; },
                    then(res, rej){ return run().then(res, rej); } };
      return api;
    } }) };
  ctx.document = { createElement: () => ({ remove(){} }), head: { appendChild(el) {
    fetch(el.src).then(r => (r.ok ? r.text() : Promise.reject(new Error('http ' + r.status))))
      .then(t => vm.runInContext(t, ctx)).catch(() => { if (el.onerror) el.onerror(); });
  } } };
  vm.runInContext(fs.readFileSync(new URL('../assets/gerot-base.js', import.meta.url), 'utf8'), ctx);
  return ctx;
}

// pesos do Frota de Elite (programa-reconhecimento: FIELD_WEIGHTS + calcScore_)
const W = { disp:20, prev:15, comb:10, pneus:10, checkT:10, checkWH:10, conf:5, stVeic:5, stEmp:5, sla:5, civf:5 };
const ORDEM = Object.keys(W);
const score = f => { let num=0, den=0;
  for (const k of ORDEM) { const v = f[k]; if (v == null) continue;
    den += W[k] / 100; num += (W[k] / 100) * Math.min(1, v / 100); }
  return den > 0 ? (num / den) * 100 : null; };
const n1 = v => (v == null ? '  —  ' : v.toFixed(1).padStart(5));

const porUnidVig = recs => { const m = new Map();
  recs.forEach(r => { if (r.soGerot) return; const k = r.vig + '||' + r.unit;
    if (!m.has(k)) m.set(k, { vig: r.vig, unit: r.unit, f: {} });
    m.get(k).f[r.field] = r.atg; });
  return m; };

const sep = await novoContexto().window.GerotBase.load({ fundir: false });
const fus = await novoContexto().window.GerotBase.load({ fundir: true });

const S = porUnidVig(sep), F = porUnidVig(fus);
const vigs = [...new Set([...S.values()].map(o => o.vig))].sort();

console.log('=== POR VIGÊNCIA — indicador a indicador ===');
for (const vig of vigs) {
  const cdi = S.get(vig + '||CDI MACACU'), emp = S.get(vig + '||MACACU EMPURRADA'), un = F.get(vig + '||MACACU');
  if (!cdi && !emp && !un) continue;
  console.log(`\n── ${vig} ──`);
  console.log('  indicador'.padEnd(14), 'CDI MACACU  MACACU EMP.   MACACU(unido)');
  for (const k of ORDEM) {
    const a = cdi && cdi.f[k], b = emp && emp.f[k], c = un && un.f[k];
    if (a == null && b == null && c == null) continue;
    const alerta = (c != null && a != null && b != null && (c < Math.min(a, b) - 0.05 || c > Math.max(a, b) + 0.05)) ? '  << fora do intervalo' : '';
    const novo = (c != null && a == null && b == null) ? '  << só aparece unido' : '';
    const some = (c == null && (a != null || b != null)) ? '  << SUMIU na fusão' : '';
    console.log(' ', k.padEnd(12), n1(a == null ? null : a), '     ', n1(b == null ? null : b), '     ', n1(c == null ? null : c), alerta + novo + some);
  }
  const pc = cdi && score(cdi.f), pe = emp && score(emp.f), pu = un && score(un.f);
  console.log('  PONTUAÇÃO   ', n1(pc), '     ', n1(pe), '     ', n1(pu),
    (pu != null && pc != null && pe != null) ? `   · média simples dos dois: ${((pc + pe) / 2).toFixed(1)}` : '');
  // quais indicadores cada lado NÃO tinha (peso redistribuído) e o unido passou a ter
  const faltCdi = ORDEM.filter(k => cdi && cdi.f[k] == null && un && un.f[k] != null);
  const faltEmp = ORDEM.filter(k => emp && emp.f[k] == null && un && un.f[k] != null);
  if (faltCdi.length) console.log('   > entram no CDI MACACU pela fusão:      ', faltCdi.join(', '));
  if (faltEmp.length) console.log('   > entram na MACACU EMPURRADA pela fusão:', faltEmp.join(', '));
}
