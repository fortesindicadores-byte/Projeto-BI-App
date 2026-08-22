// ============================================================================
// Perfil Inspect — olha um perfil do fca_profiles direto do Actions (o sandbox
// do Claude não alcança o Supabase; este é o mesmo padrão das outras sondas).
//
// Env:
//   GEM_SUPABASE_SERVICE_KEY  service key (Secret)
//   PERFIL_NOME               trecho do nome a procurar (ilike), ex.: 'ssica'
//   PERFIL_CONSERTAR          '1' normaliza tokens legados (CBA→3 tiers,
//                             MCC→MCC T1,MCC T2) em TODOS os perfis
//
// O repositório é PÚBLICO: o log mascara o nome (1ª letra + asteriscos) e
// não imprime user_id nem e-mail.
// ============================================================================
const SB_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('Falta GEM_SUPABASE_SERVICE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const NOME = (process.env.PERFIL_NOME || '').trim();
const CONSERTAR = process.env.PERFIL_CONSERTAR === '1';
const CANON = ['BLC','CBA T1','CBA T1 WH','CBA T2','CGR','FLP','GRL','MCC T1','MCC T2','NFR','PIR','PLT','RON','ANG'];
const mask = s => String(s || '').split(/\s+/).map(p => p ? p[0] + '*'.repeat(Math.max(1, p.length - 1)) : p).join(' ');
const tokens = u => String(u || '').split(',').map(s => s.trim()).filter(Boolean);
const normaliza = u => {
  const out = [];
  tokens(u).forEach(t => {
    const T = t.toUpperCase();
    if (T === 'CBA') out.push('CBA T1', 'CBA T1 WH', 'CBA T2');
    else if (T === 'MCC') out.push('MCC T1', 'MCC T2');
    else out.push(T);
  });
  return [...new Set(out)].join(',');
};

async function main() {
  const filtro = NOME ? `&nome=ilike.*${encodeURIComponent(NOME)}*` : '';
  const res = await fetch(`${SB_URL}/rest/v1/fca_profiles?select=user_id,nome,is_admin,unidade,farol_unidades${filtro}`, { headers: H });
  if (!res.ok) { console.error('REST', res.status, await res.text()); process.exit(1); }
  const rows = await res.json();
  console.log(`perfis encontrados p/ "${NOME || '(todos)'}": ${rows.length}\n`);
  for (const r of rows) {
    const toks = tokens(r.unidade);
    const exatos = CANON.filter(c => toks.includes(c));
    const estranhos = toks.filter(t => !CANON.includes(t));
    console.log(`— ${mask(r.nome)}`);
    console.log(`   is_admin: ${!!r.is_admin}`);
    console.log(`   unidade (cru): ${JSON.stringify(r.unidade)}`);
    console.log(`   tokens EXATOS (o que o RLS aceita): ${JSON.stringify(exatos)}`);
    if (estranhos.length) console.log(`   ⚠ tokens que o RLS NÃO reconhece: ${JSON.stringify(estranhos)}`);
    console.log(`   farol_unidades: ${JSON.stringify(r.farol_unidades)}`);
    ['MCC T1', 'MCC T2', 'CBA T1'].forEach(u =>
      console.log(`   consegue lançar em ${u}? ${toks.includes(u) ? 'SIM' : 'NÃO'}`));
    console.log('');
  }
  if (CONSERTAR) {
    const all = NOME ? rows : rows;   // normaliza só o recorte pedido
    let n = 0;
    for (const r of all) {
      if (!r.unidade) continue;
      const novo = normaliza(r.unidade);
      if (novo === r.unidade) continue;
      const up = await fetch(`${SB_URL}/rest/v1/fca_profiles?user_id=eq.${r.user_id}`, {
        method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ unidade: novo }),
      });
      if (!up.ok) { console.error(`PATCH ${mask(r.nome)}: ${up.status}`, await up.text()); continue; }
      console.log(`consertado ${mask(r.nome)}: ${JSON.stringify(r.unidade)} → ${JSON.stringify(novo)}`);
      n++;
    }
    console.log(`\n${n} perfil(is) normalizado(s).`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
