/* DriverPro Check — testa as funções do app (scripts/app-motorista.sql) de
   ponta a ponta com a chave ANON, como o app faz: login antes do PIN, criar
   PIN no CPF de teste, entrar, ler os dados, sair. Repositório público: o log
   traz unidade, contagens e notas — nunca nome, CPF real nem token. */
const U = 'https://lozwipoeacpvplgkrxkq.supabase.co', K = 'sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';
const CPF = process.env.DP_CPF || '00000000191', PIN = process.env.DP_PIN || '1234';
const SK = process.env.GEM_SUPABASE_SERVICE_KEY;
const rpc = async (fn, a) => { const r = await fetch(U + '/rest/v1/rpc/' + fn, { method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: K, Authorization: 'Bearer ' + K }, body: JSON.stringify(a) });
  let j = null; try { j = await r.json(); } catch (e) { j = { erro: 'sem json' }; } return { status: r.status, j }; };
let falhas = 0; const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) falhas++; };

/* MOTORISTA DE TESTE PRÓPRIO (05/09/2026): todo motorista do Geotab já tem o
   CPF real no banco, então o CPF de teste não pode mais ficar preso a um
   motorista de verdade (o gt:b396 ficou 1 dia sem conseguir entrar). O check
   cria/mantém a linha `teste:driverpro` em ce_motoristas com a service key —
   sem nota mensal, então ele não entra em ranking nem em pódio de ninguém. */
if (SK && !process.env.DP_CPF) {
  const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
  const r0 = await fetch(U + '/rest/v1/ce_motoristas?on_conflict=chave', { method: 'POST', headers: H,
    body: JSON.stringify([{ chave: 'teste:driverpro', nome: 'Motorista de Teste', unidade: 'EMP PIRAI', fonte: 'Geotab', ativo: true, cpf: CPF }]) });
  ok(r0.ok, 'motorista de teste teste:driverpro no banco (' + r0.status + ')');
  if (!r0.ok) console.log('   ', (await r0.text()).slice(0, 200));
}

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
// autocadastro: a lista de unidades e a de nomes livres respondem (só contagens no log)
{
  const l = await rpc('ce_app_cadastro_lista', {});
  const unis = (l.j && l.j.unidades) || [];
  ok(l.status === 200 && l.j.ok === true && Array.isArray(unis), 'ce_app_cadastro_lista devolve unidades (' + unis.length + ')');
  if (unis.length) {
    const m = await rpc('ce_app_cadastro_lista', { p_unidade: unis[0] });
    ok(m.status === 200 && m.j.ok === true, 'nomes livres em ' + unis[0] + ': ' + ((m.j.motoristas || []).length));
  }
  const c = await rpc('ce_app_cadastro', { p_cpf: '11111111111', p_pin: '1234', p_chave: 'teste:driverpro' });
  ok(c.status === 200 && c.j.ok === false, 'ce_app_cadastro recusa CPF inválido');
}
// as tabelas fechadas não abrem para o anon
for (const t of ['ce_app_acesso', 'ce_app_sessao', 'ce_motoristas']) {
  const x = await fetch(U + '/rest/v1/' + t + '?select=*&limit=1', { headers: { apikey: K, Authorization: 'Bearer ' + K } });
  const body = await x.json().catch(() => null);
  ok(x.status !== 200 || (Array.isArray(body) && body.length === 0), t + ' fechada para o anon (' + x.status + ')');
}
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
