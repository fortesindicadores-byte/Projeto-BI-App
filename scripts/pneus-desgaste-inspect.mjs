// ============================================================
// Pneus — por que o Desgaste não sai numa unidade? (ex.: PIR)
// Reproduz EXATAMENTE a taxa própria do painel (calcPrevisao /
// _taxaPropria): ≥3 leituras com mm>0 e odômetro>0, ≥3 odômetros
// distintos, ≥2.000 km de intervalo, inclinação negativa, ≤2,5
// mm/1.000km — e diz em qual critério cada pneu da unidade morre.
//
// Uso: BRANCH=38 node scripts/pneus-desgaste-inspect.mjs
// ============================================================
const SUPABASE_URL = 'https://ewbzeqsneeylwkxtcpme.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3YnplcXNuZWV5bHdreHRjcG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzY2MTcsImV4cCI6MjA5NzQ1MjYxN30.W8W6Yunt6Z8NB73qpOD8eqYlrsgMRgEG-siYsJFwDwE';
const BRANCH = process.env.BRANCH || '38'; // PIR

async function fetchBranch(bid) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/snapshot?branch_id=eq.${bid}&select=endpoint,branch_id,data,updated_at`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

const rows = await fetchBranch(BRANCH);
const por = {};
rows.forEach(r => { por[r.endpoint] = { data: r.data || [], at: r.updated_at }; });
const tires = por.tires?.data || [];
const insps = por.inspections?.data || [];
console.log(`branch ${BRANCH} · tires=${tires.length} · inspections=${insps.length} · updated=${por.tires?.at}`);

// histórico por pneu, como no painel
const hist = {};
insps.forEach(i => {
  if (!i.tireId || !(i.menorMM > 0) || !(i.odometro > 0)) return;
  (hist[i.tireId] = hist[i.tireId] || []).push(i);
});
Object.values(hist).forEach(a => a.sort((x, y) => new Date(x.dataInspecao) - new Date(y.dataInspecao)));

// quantas inspeções da unidade têm mm/odômetro válidos?
let semMM = 0, semOdo = 0, ok = 0;
insps.forEach(i => {
  const mmOk = i.menorMM > 0, odoOk = i.odometro > 0;
  if (mmOk && odoOk) ok++;
  else { if (!mmOk) semMM++; if (!odoOk) semOdo++; }
});
console.log(`inspeções: ${ok} válidas · ${semMM} sem mm>0 · ${semOdo} sem odômetro>0`);

const instalados = tires.filter(t => String(t.status).toUpperCase() === 'INSTALLED' && t.menorMM > 0);
console.log(`pneus em uso com mm: ${instalados.length}`);

const motivo = { menos3Leituras: 0, menos3Odos: 0, kmCurto: 0, slopeNaoNeg: 0, acimaTeto: 0, confiavel: 0 };
const ws = [], exemplos = [];
instalados.forEach(t => {
  const h = hist[t.id];
  if (!h || h.length < 3) { motivo.menos3Leituras++; return; }
  const pts = h.map(i => ({ km: i.odometro, mm: i.menorMM }));
  const odos = new Set(pts.map(p => p.km)).size;
  if (odos < 3) { motivo.menos3Odos++; return; }
  const dKm = h[h.length - 1].odometro - h[0].odometro;
  if (dKm < 2000) { motivo.kmCurto++; return; }
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.km, 0), sy = pts.reduce((s, p) => s + p.mm, 0);
  const sxx = pts.reduce((s, p) => s + p.km * p.km, 0), sxy = pts.reduce((s, p) => s + p.km * p.mm, 0);
  const den = n * sxx - sx * sx;
  const slope = den !== 0 ? (n * sxy - sx * sy) / den : 0;
  if (!(slope < 0)) { motivo.slopeNaoNeg++; if (exemplos.length < 6) exemplos.push({ t, h, slope }); return; }
  const w = -slope * 1000;
  if (w > 2.5) { motivo.acimaTeto++; return; }
  motivo.confiavel++; ws.push(w);
  if (w < 0.05 && exemplos.length < 6) exemplos.push({ t, h, slope });
});
console.log('motivos:', JSON.stringify(motivo));
ws.sort((a, b) => a - b);
const q = p => ws.length ? ws[Math.min(ws.length - 1, Math.floor((ws.length - 1) * p))] : null;
console.log(`taxas próprias confiáveis: n=${ws.length} · min=${ws[0]?.toFixed(3)} · mediana=${q(.5)?.toFixed(3)} · max=${ws[ws.length-1]?.toFixed(3)} · <0,05: ${ws.filter(w => w < 0.05).length}`);

// amostra: seriais da tela + exemplos coletados
const ALVOS = ['79412', '80045', '79996', '80044', '78002'];
const alvoTires = instalados.filter(t => ALVOS.includes(String(t.serial)));
[...alvoTires.map(t => ({ t, h: hist[t.id] })), ...exemplos].slice(0, 10).forEach(({ t, h, slope }) => {
  console.log(`\n#${t.serial} placa=${t.placa} pos=${t.nomePosicao || t.posicao} mm=${t.menorMM} ${slope !== undefined ? 'slope=' + slope : ''}`);
  (h || []).slice(-8).forEach(i => console.log(`   ${String(i.dataInspecao).slice(0, 10)} odo=${i.odometro} mm=${i.menorMM}`));
  if (!h) console.log('   (sem histórico com mm>0 e odômetro>0)');
});

// odômetro da unidade: os veículos têm km andando?
const veh = (por.vehicles?.data || []);
const odoInsp = {};
insps.forEach(i => { if (i.veiculoId && i.odometro > 0) (odoInsp[i.veiculoId] = odoInsp[i.veiculoId] || []).push(i.odometro); });
let vFrozen = 0, vMoving = 0;
Object.values(odoInsp).forEach(a => { (new Set(a).size <= 1 ? vFrozen++ : vMoving++); });
console.log(`\nveículos com odômetro variando nas inspeções: ${vMoving} · congelado: ${vFrozen} · total veículos: ${veh.length}`);

// ════════════════════════════════════════════════════════════
// REGRA NOVA — km do ABASTECIMENTO quando o odômetro é inútil
// (mesma conta do painel: kmEntreLeituras/ptsKm)
// ════════════════════════════════════════════════════════════
const KMDIA_SHEET_ID = '1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';
const _norm = s => (s == null ? '' : String(s)).trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const _avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const KMDIA = { placa: {}, modelo: {}, cidade: {} };
try {
  const url = `https://docs.google.com/spreadsheets/d/${KMDIA_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent('Km/L')}`;
  const text = await (await fetch(url)).text();
  const json = JSON.parse(text.match(/setResponse\(([\s\S]*)\)/)[1]);
  const cell = (r, i) => (r.c && r.c[i] ? r.c[i].v : null);
  const porPlaca = {};
  (json.table.rows || []).forEach(r => {
    const placa = _norm(cell(r, 16)), kmRod = parseFloat(cell(r, 22));
    if (!placa || !(kmRod > 0)) return;
    const p = porPlaca[placa] || (porPlaca[placa] = { soma: 0, n: 0, modelo: '', cidade: '' });
    p.soma += kmRod / 25; p.n++;
    if (!p.modelo) p.modelo = _norm(cell(r, 19));
    if (!p.cidade) p.cidade = _norm(cell(r, 15));
  });
  const porModelo = {}, porCidade = {};
  Object.values(porPlaca).forEach(p => {
    const kd = p.soma / p.n;
    if (p.modelo) (porModelo[p.modelo] = porModelo[p.modelo] || []).push(kd);
    if (p.cidade) (porCidade[p.cidade] = porCidade[p.cidade] || []).push(kd);
  });
  Object.entries(porPlaca).forEach(([k, p]) => { KMDIA.placa[k] = p.soma / p.n; });
  Object.entries(porModelo).forEach(([k, a]) => { KMDIA.modelo[k] = _avg(a); });
  Object.entries(porCidade).forEach(([k, a]) => { KMDIA.cidade[k] = _avg(a); });
  console.log(`\nKm/L carregada: ${Object.keys(KMDIA.placa).length} placas com km/dia`);
} catch (e) { console.log('\nKm/L NÃO carregou:', e.message); }

const vehPorPlaca = {};
veh.forEach(v => { const k = _norm(v.placa); if (k && !vehPorPlaca[k]) vehPorPlaca[k] = v; });
const CIDADES = { 1676:'MACACU', 1677:'MACACU', 37:'RIO DE JANEIRO', 1906:'CUIABA', 1907:'CUIABA', 1878:'CUIABA',
  20:'FLORIANOPOLIS', 30:'GUARULHOS', 24:'CAMBORIU', 2517:'NOVA FRIBURGO', 26:'PELOTAS', 38:'PIRAI', 2277:'RONDONOPOLIS', 2550:'SEARA' };
const CIDADE = CIDADES[+BRANCH] || '';
function kmDiaVeiculo(t) {
  const placaN = _norm(t.placa);
  const v = vehPorPlaca[placaN];
  if (_norm(v && v.tipo).includes('EMPILHADEIRA')) return 250;
  if (KMDIA.placa[placaN] > 0) return KMDIA.placa[placaN];
  const modeloN = _norm(v && v.modelo);
  if (modeloN && KMDIA.modelo[modeloN] > 0) return KMDIA.modelo[modeloN];
  if (KMDIA.cidade[CIDADE] > 0) return KMDIA.cidade[CIDADE];
  return 0;
}
function odoValido(v) { return v > 0 && !/^9+$/.test(String(Math.round(v))); }
function kmEntreLeituras(a, b, kd) {
  const dias = (new Date(b.dataInspecao) - new Date(a.dataInspecao)) / 86400000;
  if (dias <= 0) return 0;
  if (odoValido(a.odometro) && odoValido(b.odometro)) {
    const d = b.odometro - a.odometro;
    if (d > 0 && d / dias <= 2000) return d;
    if (d === 0 && !(kd > 0)) return 0;
  }
  return (kd > 0) ? kd * dias : null;
}
// histórico SÓ com mm>0 (regra nova não exige odômetro)
const hist2 = {};
insps.forEach(i => { if (i.tireId && i.menorMM > 0) (hist2[i.tireId] = hist2[i.tireId] || []).push(i); });
Object.values(hist2).forEach(a => a.sort((x, y) => new Date(x.dataInspecao) - new Date(y.dataInspecao)));

const motivo2 = { menos3Leituras: 0, semEscala: 0, menos3Kms: 0, kmCurto: 0, slopeNaoNeg: 0, acimaTeto: 0, confiavel: 0 };
const ws2 = [];
instalados.forEach(t => {
  const h = hist2[t.id];
  if (!h || h.length < 3) { motivo2.menos3Leituras++; return; }
  const kd = kmDiaVeiculo(t);
  let acum = 0; const pts = [{ km: 0, mm: h[0].menorMM }];
  let escala = true;
  for (let i = 1; i < h.length; i++) {
    const d = kmEntreLeituras(h[i - 1], h[i], kd);
    if (d == null) { escala = false; break; }
    acum += d; pts.push({ km: acum, mm: h[i].menorMM });
  }
  if (!escala) { motivo2.semEscala++; return; }
  if (new Set(pts.map(p => p.km)).size < 3) { motivo2.menos3Kms++; return; }
  if (pts[pts.length - 1].km < 2000) { motivo2.kmCurto++; return; }
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.km, 0), sy = pts.reduce((s, p) => s + p.mm, 0);
  const sxx = pts.reduce((s, p) => s + p.km * p.km, 0), sxy = pts.reduce((s, p) => s + p.km * p.mm, 0);
  const den = n * sxx - sx * sx;
  const slope = den !== 0 ? (n * sxy - sx * sy) / den : 0;
  if (!(slope < 0)) { motivo2.slopeNaoNeg++; return; }
  const w = -slope * 1000;
  if (w > 2.5) { motivo2.acimaTeto++; return; }
  motivo2.confiavel++; ws2.push(w);
});
ws2.sort((a, b) => a - b);
const q2 = p => ws2.length ? ws2[Math.min(ws2.length - 1, Math.floor((ws2.length - 1) * p))] : null;
console.log('REGRA NOVA — motivos:', JSON.stringify(motivo2));
console.log(`REGRA NOVA — taxas próprias: n=${ws2.length} · min=${ws2[0]?.toFixed(3)} · Q1=${q2(.25)?.toFixed(3)} · mediana=${q2(.5)?.toFixed(3)} · Q3=${q2(.75)?.toFixed(3)} · max=${ws2[ws2.length - 1]?.toFixed(3)}`);
