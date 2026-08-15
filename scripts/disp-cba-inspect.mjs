// "CBA T1 não está puxando os dados" (Renan, 15/08/2026).
// CBA T1 = CUIABA EMPURRADA. Este inspetor mostra, para a família CBA, o que
// existe em cada perna do app: a FROTA (ginfo_snapshot['ativos'] + ativos_manual,
// passando pelo mesmo de-para do app), as FOTOS (disp_snapshot) e os EVENTOS
// (indisponibilidade). Assim dá para ver em qual delas o CBA T1 some.
const URL = process.env.GEM_SUPABASE_URL || 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.log('SEM GEM_SUPABASE_SERVICE_KEY'); process.exit(1); }

const req = async (tab, q) => {
  const out = [], PAG = 1000;
  for (let de = 0; ; de += PAG) {
    const r = await fetch(`${URL}/rest/v1/${tab}?${q}`, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Range: `${de}-${de + PAG - 1}` } });
    if (!r.ok) throw new Error(tab + ' http ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const l = await r.json();
    out.push(...l);
    if (l.length < PAG) return out;
  }
};

// ── mesmo de-para do app (disponibilidade-preenchimento/index.html) ──
const NAME2COD = {
  'CDD CAMBORIU':'BLC','BALNEARIO CAMBORIU':'BLC','CAMBORIU':'BLC',
  'CDD CUIABA':'CBA T2','CUIABA':'CBA T1 WH','CUIABA EMPURRADA':'CBA T1',
  'CDD RIO DE JANEIRO':'CGR','CAMPO GRANDE':'CGR','RIO DE JANEIRO':'CGR',
  'CDD FLORIANOPOLIS':'FLP','FLORIANOPOLIS':'FLP',
  'CDD GUARULHOS':'GRL','GUARULHOS':'GRL','ANHANGUERA':'ANG',
  'CDI MACACU':'MCC T2','MACACU EMPURRADA':'MCC T1','CACHOEIRAS DE MACACU':'MCC T2','MACACU':'MCC T2',
  'CDD NOVA FRIBURGO':'NFR','NOVA FRIBURGO':'NFR',
  'PIRAI EMPURRADA':'PIR','PIRAI':'PIR','CDD PELOTAS':'PLT','PELOTAS':'PLT',
  'CDD RONDONOPOLIS':'RON','RONDONOPOLIS':'RON'
};
const normU = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
function unitCod(nome, projeto){
  const n = normU(nome); if(!n) return null;
  let cod = NAME2COD[n]; if(!cod) return n;
  const p = normU(projeto);
  if (cod.startsWith('CBA')) {
    if (/EMPURRAD/.test(p)) cod='CBA T1';
    else if (/APOIO|EMPILHADEIRA|ARMAZEM|\bWH\b/.test(p)) cod='CBA T1 WH';
    else if (/ROTA|CDD|AUTO SERVICO|VAN/.test(p)) cod='CBA T2';
  } else if (cod.startsWith('MCC')) {
    if (/EMPURRAD/.test(p)) cod='MCC T1';
    else if (/ROTA|CDI|CDD|AUTO SERVICO|VAN/.test(p)) cod='MCC T2';
  }
  return cod;
}

// ---------- 1) FROTA ----------
const [gs] = await req('ginfo_snapshot', "chave=eq.ativos&select=data,updated_at");
const ativos = Array.isArray(gs && gs.data) ? gs.data : [];
console.log('ginfo_snapshot[ativos]:', ativos.length, 'linhas · atualizado', gs && gs.updated_at);

const porCombo = new Map();
ativos.forEach(e => {
  const fil = String(e['Filial']||'').trim(), pro = String(e['Projeto']||'').trim();
  const k = fil + ' ||| ' + pro;
  if (!porCombo.has(k)) porCombo.set(k, { fil, pro, n: 0, cod: unitCod(fil, pro) });
  porCombo.get(k).n++;
});
console.log('\n===== COMBINAÇÕES Filial × Projeto que contêm CUIABA =====');
[...porCombo.values()].filter(c => /CUIAB/i.test(c.fil))
  .sort((a,b)=>b.n-a.n)
  .forEach(c => console.log(`  "${c.fil}" × "${c.pro}"  →  ${c.cod}   (${c.n} placas)`));

const porCod = new Map();
porCombo.forEach(c => porCod.set(c.cod, (porCod.get(c.cod)||0) + c.n));
console.log('\n===== FROTA POR CÓDIGO (todas as unidades) =====');
[...porCod.entries()].sort().forEach(([c,n]) => console.log(`  ${String(c).padEnd(12)} ${n}`));

const man = await req('ativos_manual', 'select=unidade,placa');
const manPorUni = {};
man.forEach(r => { manPorUni[r.unidade] = (manPorUni[r.unidade]||0) + 1; });
console.log('\native os_manual por unidade:', JSON.stringify(manPorUni));

// ---------- 2) FOTOS ----------
const snap = await req('disp_snapshot', 'unidade=like.CBA*&select=data,unidade,unidade_nome,projeto,ativos,indisponiveis,fonte&order=data.desc&limit=100000');
const porUniMes = new Map();
snap.forEach(r => {
  const k = r.unidade + ' | ' + String(r.data).slice(0,7);
  if (!porUniMes.has(k)) porUniMes.set(k, { linhas: 0, a: 0, i: 0, dias: new Set() });
  const g = porUniMes.get(k); g.linhas++; g.a += r.ativos||0; g.i += r.indisponiveis||0; g.dias.add(String(r.data).slice(0,10));
});
console.log('\n===== disp_snapshot · família CBA (unidade | mês) =====');
[...porUniMes.entries()].sort().forEach(([k,g]) =>
  console.log(`  ${k.padEnd(22)} ${String(g.linhas).padStart(4)} linhas · ${g.dias.size} dias · ativos ${g.a} · indisp ${g.i}`));

const ult = snap.filter(r => String(r.data).slice(0,10) === String(snap[0] && snap[0].data).slice(0,10));
console.log('\n  último dia da família CBA:', String(snap[0] && snap[0].data).slice(0,10));
ult.forEach(r => console.log(`    ${String(r.unidade).padEnd(12)} nome="${r.unidade_nome}" proj="${r.projeto}" ativos=${r.ativos} indisp=${r.indisponiveis} (${r.fonte})`));

// ---------- 3) EVENTOS ----------
const ev = await req('indisponibilidade', 'select=unidade,unidade_nome,projeto,placa,data_parada,data_retorno&order=data_parada.desc&limit=20000');
const evPorUni = {}, abertosPorUni = {};
ev.forEach(r => { evPorUni[r.unidade] = (evPorUni[r.unidade]||0)+1;
  if (!r.data_retorno) abertosPorUni[r.unidade] = (abertosPorUni[r.unidade]||0)+1; });
console.log('\n===== indisponibilidade =====');
console.log('  eventos por unidade :', JSON.stringify(evPorUni));
console.log('  ABERTOS por unidade :', JSON.stringify(abertosPorUni));
console.log('\n  abertos da família CBA:');
ev.filter(r => !r.data_retorno && /^CBA/.test(String(r.unidade||''))).slice(0, 20)
  .forEach(r => console.log(`    ${String(r.unidade).padEnd(12)} ${r.placa} proj="${r.projeto}" parou ${r.data_parada}`));

// ---------- 4) as placas de CBA T1 estão na frota? ----------
const placasT1 = new Set(ativos.filter(e => unitCod(e['Filial'], e['Projeto']) === 'CBA T1')
  .map(e => String(e['Placa']||'').toUpperCase().replace(/[^A-Z0-9]/g,'')));
console.log('\n===== CBA T1 =====');
console.log('  placas na frota (Ginfo):', placasT1.size);
const evT1 = ev.filter(r => r.unidade === 'CBA T1' && !r.data_retorno);
console.log('  eventos abertos:', evT1.length);
evT1.forEach(r => console.log(`    ${r.placa} ${placasT1.has(String(r.placa||'').toUpperCase().replace(/[^A-Z0-9]/g,'')) ? 'ESTÁ na frota' : 'FORA da frota'}`));
