/* DriverPro Check — testa as funções do app (scripts/app-motorista.sql) de
   ponta a ponta com a chave ANON, como o app faz: login antes do PIN, criar
   PIN no CPF de teste, entrar, ler os dados, sair. Repositório público: o log
   traz unidade, contagens e notas — nunca nome, CPF real nem token. */
const U = 'https://lozwipoeacpvplgkrxkq.supabase.co', K = 'sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';
const CPF = process.env.DP_CPF || '00000000191', PIN = process.env.DP_PIN || '1234';
const rpc = async (fn, a) => { const r = await fetch(U + '/rest/v1/rpc/' + fn, { method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: K, Authorization: 'Bearer ' + K }, body: JSON.stringify(a) });
  let j = null; try { j = await r.json(); } catch (e) { j = { erro: 'sem json' }; } return { status: r.status, j }; };
let falhas = 0; const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) falhas++; };

let r = await rpc('ce_app_login', { p_cpf: CPF, p_pin: '0000' });
console.log('login com PIN errado/sem PIN →', r.status, JSON.stringify({ ok: r.j.ok, erro: r.j.erro, primeira_vez: r.j.primeira_vez }));
ok(r.status === 200 && r.j.ok === false, 'login recusa PIN errado');
if (r.j.primeira_vez) {
  r = await rpc('ce_app_criar_pin', { p_cpf: CPF, p_pin: PIN });
  console.log('criar_pin →', r.status, r.j.ok ? JSON.stringify({ ok: true, unidade: r.j.unidade, token: 'ok' }) : JSON.stringify(r.j));
  ok(r.j.ok === true, 'criar PIN no primeiro acesso');
}
if (!r.j.token) { r = await rpc('ce_app_login', { p_cpf: CPF, p_pin: PIN }); console.log('login →', r.status, r.j.ok ? JSON.stringify({ ok: true, unidade: r.j.unidade }) : JSON.stringify(r.j)); }
ok(!!r.j.token, 'login devolve token');
if (r.j.token) {
  const d = await rpc('ce_app_dados', { p_token: r.j.token }), j = d.j;
  console.log('dados →', d.status, JSON.stringify({ ok: j.ok, erro: j.erro, unidade: j.unidade, vigente: j.vigente, posicao: j.posicao, ranking: (j.ranking || []).length, meses: (j.meses || []).length }));
  ok(j.ok === true, 'ce_app_dados responde');
  console.log('regras:', JSON.stringify(j.regras));
  (j.meses || []).forEach(m => console.log('  ', m.competencia, 'nota', m.nota, 'km', m.km, 'dias', m.dias, 'viagens', m.viagens,
    'pos', m.posicao, 'eleg', m.elegivel, 'carteira', m.carteira, 'podio', m.podio, 'rpm/idle/acel', m.rpm, m.idle, m.acel, m.motivo || ''));
  console.log('ranking (pos · nota · eu):', (j.ranking || []).map(x => x.pos + '·' + x.pontuacao + (x.eu ? '·EU' : '')).join('  '));
  const s = await rpc('ce_app_sair', { p_token: r.j.token }); ok(s.status === 204 || s.status === 200, 'sair');
  const d2 = await rpc('ce_app_dados', { p_token: r.j.token }); ok(d2.j.ok === false, 'token morre depois do sair');
}
// as tabelas fechadas não abrem para o anon
for (const t of ['ce_app_acesso', 'ce_app_sessao', 'ce_motoristas']) {
  const x = await fetch(U + '/rest/v1/' + t + '?select=*&limit=1', { headers: { apikey: K, Authorization: 'Bearer ' + K } });
  const body = await x.json().catch(() => null);
  ok(x.status !== 200 || (Array.isArray(body) && body.length === 0), t + ' fechada para o anon (' + x.status + ')');
}
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
