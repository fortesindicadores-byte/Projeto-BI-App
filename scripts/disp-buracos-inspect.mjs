// Onde estão os BURACOS da foto diária de disponibilidade?
// O calendário do Resumo mostra dias sem nada — a pergunta do Renan (15/08/2026)
// é se são domingo/feriado, se é o começo da série ou se é falha do robô.
// Lista, mês a mês: dias presentes, dias faltando (com o dia da semana) e
// quantas unidades cada dia trouxe — unidade faltando num dia também é buraco.
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

const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaSem = d => SEM[new Date(d + 'T12:00:00Z').getUTCDay()];

const linhas = await req('disp_snapshot', 'select=data,unidade,fonte,ativos,indisponiveis&order=data');
console.log('disp_snapshot:', linhas.length, 'linhas');

const porDia = new Map();
linhas.forEach(l => {
  const d = String(l.data).slice(0, 10);
  if (!porDia.has(d)) porDia.set(d, { uni: new Set(), fontes: new Set(), a: 0, i: 0 });
  const g = porDia.get(d);
  g.uni.add(l.unidade); g.fontes.add(l.fonte); g.a += l.ativos || 0; g.i += l.indisponiveis || 0;
});
const dias = [...porDia.keys()].sort();
console.log('primeiro dia:', dias[0], '· último:', dias[dias.length - 1], '· dias com foto:', dias.length);

// unidades "normais" = as que aparecem na maior parte dos dias
const cnt = new Map();
porDia.forEach(g => g.uni.forEach(u => cnt.set(u, (cnt.get(u) || 0) + 1)));
const nUniTipico = Math.max(...[...porDia.values()].map(g => g.uni.size));
console.log('unidades vistas:', cnt.size, '· máximo de unidades num dia:', nUniTipico);

const porMes = new Map();
dias.forEach(d => { const m = d.slice(0, 7); if (!porMes.has(m)) porMes.set(m, []); porMes.get(m).push(d); });

const ini = new Date(dias[0] + 'T12:00:00Z'), fim = new Date(dias[dias.length - 1] + 'T12:00:00Z');
const meses = [];
for (let d = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth(), 1)); d <= fim; d.setUTCMonth(d.getUTCMonth() + 1))
  meses.push(d.toISOString().slice(0, 7));

console.log('\n===== BURACOS POR MÊS (dia ausente, dentro da janela da série) =====');
const faltando = [];
for (const m of meses) {
  const [y, mm] = m.split('-').map(Number);
  const nd = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  const falta = [], parcial = [];
  for (let d = 1; d <= nd; d++) {
    const iso = `${m}-${String(d).padStart(2, '0')}`;
    if (iso < dias[0] || iso > dias[dias.length - 1]) continue;   // fora da série
    const g = porDia.get(iso);
    if (!g) { falta.push(iso); faltando.push(iso); }
    else if (g.uni.size < nUniTipico) parcial.push(`${d}(${g.uni.size}un)`);
  }
  const temFoto = (porMes.get(m) || []).length;
  console.log(`${m}: ${temFoto} dias com foto` +
    (falta.length ? `\n   FALTAM: ${falta.map(d => d.slice(8) + '/' + diaSem(d)).join(' · ')}` : ' · sem buraco') +
    (parcial.length ? `\n   parciais: ${parcial.join(' · ')}` : ''));
}

console.log('\n===== OS BURACOS CAEM EM QUE DIA DA SEMANA? =====');
const porSem = {};
faltando.forEach(d => { const s = diaSem(d); porSem[s] = (porSem[s] || 0) + 1; });
console.log(Object.entries(porSem).map(([s, n]) => `${s}: ${n}`).join(' · ') || 'nenhum buraco');
console.log('total de buracos:', faltando.length);

console.log('\n===== FONTE POR MÊS (sheet = migração · app = foto diária) =====');
const fMes = new Map();
linhas.forEach(l => { const m = String(l.data).slice(0, 7), k = m + '|' + (l.fonte || '?');
  fMes.set(k, (fMes.get(k) || 0) + 1); });
[...fMes.entries()].sort().forEach(([k, n]) => console.log(' ', k, n));

console.log('\n===== ÚLTIMOS 20 DIAS (dia · unidades · ativos · indisp · fonte) =====');
dias.slice(-20).forEach(d => { const g = porDia.get(d);
  console.log(`  ${d} ${diaSem(d)} · ${g.uni.size} un · ${g.a} ativos · ${g.i} indisp · ${[...g.fontes].join(',')}`); });
