// Conformidade de JULHO/2026 a partir da planilha do Termômetro.
//
// Por quê: o Ginfo trocou a régua da conformidade em ago/2026 e, quando o
// backfill de julho rodou (06/08), a tela JÁ estava no formato novo — então a
// medição antiga de julho se perdeu. jan→jun continuam na régua antiga, já
// gravados. O Termômetro tem a mesma medição pela régua antiga (a aba "Regras"
// descreve "mês corrente para CDDs que não forem GG e 2 meses para CDDs GG;
// T1 sempre 2 meses", que é o Mensal/Bimestral de sempre).
//
//   jan→jun  régua antiga (Ginfo, já no banco)
//   jul      Termômetro   ← este script
//   ago→     régua nova   (Ginfo)
//
// Grava em elite_snapshot como indicador PRÓPRIO ('conformidade-termometro'),
// sem tocar em 'conformidade' — o que está lá é a régua nova de julho, e
// sobrescrever seria repetir a perda que originou este script.
//
// A coluna é a K [10] "ADERÊNCIA CHECK CONFORMIDADE" (fração 0..1). Guardamos a
// filial e a aba CRUAS: quem resolve tier/unidade é o leitor (canonUnit), para
// o de-para não existir em dois lugares.
const TERMO_ID = '10LRn3jrXEemqFiFAMbO8_bOLk98xrWTVXVUNDeQqLac';
const TABS = ['Transportes T1','Transportes T2','WH T1','WH T2'];
const COL_CONF = 10;                       // K — ADERÊNCIA CHECK CONFORMIDADE
const VIG = process.env.VIG || '07/2026';  // 'MM/AAAA'
const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SB_KEY = process.env.GEM_SUPABASE_SERVICE_KEY || '';
const IND = 'conformidade-termometro';

const parse = t => { const s=t.indexOf('{'), e=t.lastIndexOf('}'); return JSON.parse(t.slice(s,e+1)); };
const cel = c => (c && c.v != null) ? c.v : null;

async function aba(nome){
  const url = `https://docs.google.com/spreadsheets/d/${TERMO_ID}/gviz/tq?sheet=${encodeURIComponent(nome)}&tqx=out:json`;
  const j = parse(await (await fetch(url)).text());
  if(j.status !== 'ok') throw new Error(`${nome}: gviz ${j.status}`);
  return j.table.rows || [];
}

const [mesAlvo] = VIG.split('/');
const alvo = String(+mesAlvo);             // '7'
console.log(`Conformidade do Termômetro · vigência ${VIG} (mês ${alvo})\n`);

// fica a MAIOR quinzena do mês, como o leitor já faz com OS Vencida e Blitz
const melhor = {};                          // 'aba|filial' → {q, pct}
for(const nome of TABS){
  let rows;
  try { rows = await aba(nome); }
  catch(e){ console.log(`  ${nome}: ERRO — ${e.message}`); continue; }
  let achadas = 0;
  rows.forEach(r => {
    const c = r.c || [];
    const m = String(cel(c[0]) ?? '').trim().match(/^(\d{1,2})_(\d{1,2})$/);
    if(!m || String(+m[1]) !== alvo) return;
    const filial = String(cel(c[1]) ?? '').trim(); if(!filial) return;
    const bruto = cel(c[COL_CONF]);
    if(bruto == null || bruto === '') return;
    const n = Number(bruto); if(!isFinite(n)) return;
    const pct = n <= 1 ? n*100 : n;         // a planilha guarda fração
    const k = nome+'|'+filial, q = +m[2];
    if(melhor[k] && melhor[k].q >= q) return;
    melhor[k] = {q, pct}; achadas++;
  });
  console.log(`  ${nome}: ${achadas} linha(s) na vigência`);
}

const linhas = Object.entries(melhor).map(([k,v]) => {
  const [tab, filial] = k.split('|');
  return { tab, filial, quinzena: v.q, pct: +v.pct.toFixed(2) };
}).sort((a,b) => a.tab.localeCompare(b.tab) || a.filial.localeCompare(b.filial));

console.log(`\n${linhas.length} unidade(s):`);
linhas.forEach(l => console.log(`  ${l.tab.padEnd(16)} ${l.filial.padEnd(22)} Q${l.quinzena}  ${l.pct.toFixed(1)}%`));

if(!linhas.length){ console.log('\nNada para gravar — abortando sem escrever.'); process.exit(1); }

if(!SB_KEY){ console.log('\n[dry-run] sem GEM_SUPABASE_SERVICE_KEY — nada gravado.'); process.exit(0); }
const res = await fetch(`${SB_URL}/rest/v1/elite_snapshot?on_conflict=indicador,vigencia,escopo`, {
  method:'POST',
  headers:{ apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}`, 'Content-Type':'application/json',
            Prefer:'resolution=merge-duplicates' },
  body: JSON.stringify([{ indicador:IND, vigencia:VIG, escopo:'mes', data:linhas,
                          updated_at:new Date().toISOString() }]),
});
if(!res.ok){ console.log(`\nERRO ao gravar: ${res.status} ${await res.text()}`); process.exit(1); }
console.log(`\ngravado: ${IND} ${VIG} (mes) — ${linhas.length} linhas`);
