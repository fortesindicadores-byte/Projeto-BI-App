// Roda o LEITOR de verdade (assets/gerot-base.js) contra o Supabase real e
// aplica o mesmo icsDoElite() do Scorecard / Diagnóstico / Resumo Executivo.
// Serve para provar que os ICs saem do elite_snapshot (e não caem na Base RPM,
// que parou de ser apurada em jul/2026 e travava os painéis em junho).
//
// O gerot-base é um script de navegador: aqui damos a ele um `window`, um
// `document` que resolve o JSONP do gviz por fetch e um `supabase.createClient`
// que fala REST. Nada do leitor é reimplementado — é o mesmo arquivo do ar.
import fs from 'node:fs';
import vm from 'node:vm';

const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY = process.env.GEM_SUPABASE_SERVICE_KEY
            || 'sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';

const ctx = vm.createContext({ console, fetch, setTimeout, clearTimeout });
vm.runInContext('globalThis.window = globalThis;', ctx);

// ── supabase.createClient mínimo: from().select().eq().in() → REST ──
ctx.supabase = {
  createClient: () => ({
    from(tab) {
      const st = { tab, sel: '*', qs: [] };
      const run = async () => {
        const url = `${SB_URL}/rest/v1/${st.tab}?select=${encodeURIComponent(st.sel)}`
                  + (st.qs.length ? '&' + st.qs.join('&') : '');
        const r = await fetch(url, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
        if (!r.ok) return { data: null, error: new Error(r.status + ' ' + (await r.text()).slice(0, 200)) };
        return { data: await r.json(), error: null };
      };
      const api = {
        select(s) { st.sel = s; return api; },
        eq(c, v) { st.qs.push(`${c}=eq.${encodeURIComponent(v)}`); return api; },
        in(c, arr) { st.qs.push(`${c}=in.(${arr.map(x => '"' + x + '"').join(',')})`); return api; },
        then(res, rej) { return run().then(res, rej); },
      };
      return api;
    },
  }),
};

// ── document mínimo: o <script> do JSONP vira fetch + eval no mesmo contexto ──
ctx.document = {
  createElement: () => ({ remove() {} }),
  head: {
    appendChild(el) {
      fetch(el.src)
        .then(r => (r.ok ? r.text() : Promise.reject(new Error('http ' + r.status))))
        .then(t => vm.runInContext(t, ctx))
        .catch(() => { if (el.onerror) el.onerror(); });
    },
  },
};

vm.runInContext(fs.readFileSync(new URL('../assets/gerot-base.js', import.meta.url), 'utf8'), ctx);

// ── o icsDoElite() dos painéis, palavra por palavra ──
const UNI_LIST = ['CDD CAMBORIU','CDD CUIABA','CDD FLORIANOPOLIS','CDD GUARULHOS','CDD NOVA FRIBURGO',
  'CDD PELOTAS','CDD RIO DE JANEIRO','CDD RONDONOPOLIS','CDI MACACU','CUIABA','CUIABA EMPURRADA',
  'MACACU EMPURRADA','PIRAI EMPURRADA'];
const UNI_SET = new Set(UNI_LIST);
const IC_ORDEM = ['disp','prev','comb','pneus','checkT','checkWH','conf','stVeic','stEmp','sla','civf'];
const IC_PESOS = {disp:20,prev:15,comb:10,pneus:10,checkT:10,checkWH:10,conf:5,stVeic:5,stEmp:5,sla:5,civf:5};

const GerotBase = ctx.window.GerotBase;
if (!GerotBase) { console.log('GerotBase não carregou'); process.exit(1); }

const recs = await GerotBase.load();
console.log('records do GerotBase:', recs.length);

const COD2UNI = GerotBase.COD2UNIT || {};
const nomeDe = u => (UNI_SET.has(u) ? u : COD2UNI[u]);

// diagnóstico do bug: quantos records o caminho ANTIGO (só COD2UNIT) achava
const antigo = recs.filter(r => !r.soGerot && COD2UNI[r.unit]).length;
const novo   = recs.filter(r => !r.soGerot && nomeDe(r.unit) && UNI_SET.has(nomeDe(r.unit))).length;
console.log(`unidades resolvidas — caminho antigo (COD2UNIT[r.unit]): ${antigo} · corrigido: ${novo}`);
console.log('exemplos de r.unit:', [...new Set(recs.map(r => r.unit))].slice(0, 6).join(' | '));

const por = new Map();
recs.forEach(r => {
  if (r.soGerot) return;
  const uni = nomeDe(r.unit); if (!uni || !UNI_SET.has(uni)) return;
  if (r.atg == null || !isFinite(r.atg)) return;
  const m = String(r.vig || '').match(/^(\d{4})-(\d{2})$/); if (!m) return;
  const k = r.vig + '|' + uni;
  if (!por.has(k)) por.set(k, { vig: r.vig, unidade: uni, f: {} });
  por.get(k).f[r.field] = Math.min(100, r.atg);
});
const linhas = [...por.values()].map(o => {
  let num = 0, den = 0;
  for (const k in IC_PESOS) { const v = o.f[k]; if (v == null) continue;
    const w = IC_PESOS[k] / 100; den += w; num += w * Math.min(1, v / 100); }
  return { vig: o.vig, unidade: o.unidade, f: o.f, pont: den > 0 ? (num / den) * 100 : null };
});

const vigs = [...new Set(linhas.map(l => l.vig))].sort();
console.log('\nvigências dos ICs:', vigs.join(' ') || '(nenhuma)');
if (!vigs.length) { console.log('\n>>> os painéis cairiam na Base RPM (parada em junho)'); process.exit(1); }

const ult = vigs[vigs.length - 1];
console.log(`\n── ${ult} · pontuação por unidade (o que o Scorecard mostra) ──`);
linhas.filter(l => l.vig === ult).sort((a, b) => (b.pont ?? -1) - (a.pont ?? -1)).forEach(l => {
  const faltam = IC_ORDEM.filter(k => l.f[k] == null);
  console.log(' ', l.unidade.padEnd(20), l.pont == null ? '—' : l.pont.toFixed(1).padStart(6),
              faltam.length ? '· sem: ' + faltam.join(',') : '');
});
