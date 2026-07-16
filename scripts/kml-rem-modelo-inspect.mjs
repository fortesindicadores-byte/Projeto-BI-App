// Inspeciona a aba "Base Remunerado Modelo" (média do modelo por placa+vigência)
// e a aba "Km/L", para planejar a nova origem do Rem Modelo no painel Eficiência.
// Roda via GitHub Actions (o sandbox não alcança docs.google).
const ID  = '1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';
const BASE_GID = '116010677';        // aba "Base Remunerado Modelo" (da URL)
const KML_TAB  = 'Km/L';

// ---------- CSV parser (respeita aspas) ----------
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function parseGviz(txt) {
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  return JSON.parse(txt.slice(s, e + 1));
}

// ---------- normalização de placa (Mercosul <-> antigo) ----------
// Placa antiga:   AAA9999   |  Mercosul: AAA9A99 (4ª posição letra->dígito no meio)
// Para casar os dois lados: remove tudo que não é alfanumérico e põe em maiúscula.
// (não converte formato — só limpa; comparação por igualdade limpa)
const cleanPlaca = p => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// versão "canônica" tentando unificar Mercosul: se 7 chars AAA?A?? onde pos5 é
// letra, converte a letra->dígito equivalente (G->6,B->8,etc) — mas aqui só
// reportamos, sem assumir. Guardamos limpa.

// ---------- vigência ----------
function vigKeyFromDate(s) {
  // aceita "01/06/2026" ou "2026-06-01" ou Date(2026,5,1)
  if (!s) return '';
  const m1 = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${String(+m1[2]).padStart(2,'0')}`;
  const m2 = String(s).match(/^(\d{4})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  const g = String(s).match(/Date\((\d+),(\d+)/);
  if (g) return `${g[1]}-${String(+g[2]+1).padStart(2,'0')}`;
  return String(s);
}

async function main() {
  // ===== BASE REMUNERADO MODELO (CSV, aba grande) =====
  console.log('============================================================');
  console.log('ABA: Base Remunerado Modelo  (gid=' + BASE_GID + ')  via CSV');
  console.log('============================================================');
  const baseUrl = `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${BASE_GID}`;
  const bTxt = await (await fetch(baseUrl)).text();
  const bRows = parseCSV(bTxt);
  const bHead = bRows[0] || [];
  console.log('COLUNAS (', bHead.length, '):');
  bHead.forEach((h, i) => console.log(`   [${i}] ${h}`));
  console.log('LINHAS (dados):', bRows.length - 1);
  console.log('\nPRIMEIRAS 12 LINHAS:');
  for (let i = 1; i <= Math.min(12, bRows.length - 1); i++) {
    console.log(`  r${i}: ` + bRows[i].map((v, idx) => v !== '' ? `${idx}=${v}` : null).filter(Boolean).join(' | '));
  }

  // índices assumidos a partir da imagem: I=8 Placa, J=9 Média Modelo, E=4 data, F=5 vigencia
  const iPlaca = bHead.findIndex(h => /placa/i.test(h));
  const iMedia = bHead.findIndex(h => /m[eé]dia/i.test(h));
  const iDataV = bHead.findIndex(h => /vig[eê]ncia data/i.test(h) && /\d|data/i.test(h));
  // fallback pelos índices vistos
  const PL = iPlaca >= 0 ? iPlaca : 8;
  const MD = iMedia >= 0 ? iMedia : 9;
  console.log(`\n>> Placa col=[${PL}] "${bHead[PL]}"  |  Média col=[${MD}] "${bHead[MD]}"`);

  // detectar coluna de vigência-data (dd/mm/yyyy)
  let vigCol = -1;
  for (let c = 0; c < bHead.length; c++) {
    const sample = bRows[1] && bRows[1][c];
    if (sample && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(sample)) { vigCol = c; break; }
  }
  console.log('>> Coluna vigência-data detectada:', vigCol, vigCol>=0?`"${bHead[vigCol]}" ex="${bRows[1][vigCol]}"`:'(nenhuma dd/mm/yyyy)');

  // distintas vigências
  const vigSet = new Set();
  for (let i = 1; i < bRows.length; i++) {
    const v = vigCol>=0 ? bRows[i][vigCol] : '';
    if (v) vigSet.add(vigKeyFromDate(v));
  }
  console.log('>> Vigências na base:', [...vigSet].sort().join(', '));

  // formato das placas na base
  const bPlacas = [];
  for (let i = 1; i < bRows.length; i++) { const p = bRows[i][PL]; if (p) bPlacas.push(String(p).trim()); }
  const bMerc = bPlacas.filter(p => /^[A-Z]{3}\d[A-Z]\d{2}$/.test(cleanPlaca(p))).length;
  const bOld  = bPlacas.filter(p => /^[A-Z]{3}\d{4}$/.test(cleanPlaca(p))).length;
  console.log(`>> Placas base: total=${bPlacas.length}  Mercosul(AAA9A99)=${bMerc}  Antigo(AAA9999)=${bOld}  outros=${bPlacas.length-bMerc-bOld}`);

  // mapa (placaLimpa, vigKey) -> média ; e mapa placaLimpa -> {qtdZero, qtdPos, medias por vig}
  const baseMap = new Map();          // key "PLACA|YYYY-MM" -> media(num)
  const placaStats = new Map();       // placa -> {vigs:Map(vig->media)}
  for (let i = 1; i < bRows.length; i++) {
    const p = cleanPlaca(bRows[i][PL]); if (!p) continue;
    const vk = vigCol>=0 ? vigKeyFromDate(bRows[i][vigCol]) : '';
    const med = parseFloat(String(bRows[i][MD]).replace(',', '.')) || 0;
    baseMap.set(`${p}|${vk}`, med);
    if (!placaStats.has(p)) placaStats.set(p, new Map());
    placaStats.get(p).set(vk, med);
  }

  // ===== KM/L (gviz json) =====
  console.log('\n\n============================================================');
  console.log('ABA: Km/L  (gviz json)');
  console.log('============================================================');
  const kUrl = `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?sheet=${encodeURIComponent(KML_TAB)}&tqx=out:json`;
  const kTxt = await (await fetch(kUrl)).text();
  const kj = parseGviz(kTxt);
  const kCols = (kj.table.cols || []).map(c => (c.label || c.id || '').trim());
  const kRows = (kj.table.rows || []).map(r => (r.c || []).map(c => c && c.v != null ? c.v : null));
  console.log('COLUNAS (', kCols.length, '):');
  kCols.forEach((c, i) => console.log(`   [${i}] ${c}`));
  console.log('LINHAS:', kRows.length);
  console.log('\nPRIMEIRAS 4 LINHAS:');
  for (let i = 0; i < Math.min(4, kRows.length); i++) {
    console.log(`  r${i}: ` + kRows[i].map((v, idx) => v != null && v !== '' ? `${idx}=${v}` : null).filter(Boolean).join(' | '));
  }

  // índices no Km/L (mesma lógica do painel)
  const fi = tests => { for (let i=0;i<kCols.length;i++){const lc=kCols[i].toLowerCase();if(tests.some(t=>lc.includes(t)))return i;}return -1; };
  const KVIG = fi(['vigência','vigencia']) >= 0 ? fi(['vigência','vigencia']) : 0;
  const KPLACA = fi(['placa']) >= 0 ? fi(['placa']) : 15;
  let KMOD = -1; for(let i=0;i<kCols.length;i++){const lc=kCols[i].toLowerCase();if(lc.includes('modelo')&&!lc.includes('rem')&&!lc.includes('km/l')&&!lc.includes('km /l')){KMOD=i;break;}}
  const KTIPO = fi(['tipo vei','tipo_vei']);
  const KREMM = fi(['rem modelo']);
  console.log(`\n>> Km/L: vig=[${KVIG}] placa=[${KPLACA}] modelo=[${KMOD}] tipo=[${KTIPO}] remModelo(atual)=[${KREMM}]`);

  // placa -> {modelo,tipo}  (do Km/L)
  const placaInfo = new Map();
  const kPlacaFmt = { merc:0, old:0, outros:0 };
  const kVigSet = new Set();
  for (const r of kRows) {
    const praw = r[KPLACA]; if (!praw) continue;
    const p = cleanPlaca(praw);
    if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(p)) kPlacaFmt.merc++;
    else if (/^[A-Z]{3}\d{4}$/.test(p)) kPlacaFmt.old++;
    else kPlacaFmt.outros++;
    if (!placaInfo.has(p)) placaInfo.set(p, { modelo: r[KMOD]!=null?String(r[KMOD]).trim():'', tipo: KTIPO>=0&&r[KTIPO]!=null?String(r[KTIPO]).trim():'' });
    const vk = vigKeyFromDate(r[KVIG] instanceof Object ? '' : r[KVIG]) || (function(){const g=String(r[KVIG]).match(/Date\((\d+),(\d+)/);return g?`${g[1]}-${String(+g[2]+1).padStart(2,'0')}`:'';})();
    if (vk) kVigSet.add(vk);
  }
  console.log(`>> Placas Km/L: distintas=${placaInfo.size}  Mercosul=${kPlacaFmt.merc}  Antigo=${kPlacaFmt.old}  outros=${kPlacaFmt.outros}`);
  console.log('>> Vigências Km/L:', [...kVigSet].sort().join(', '));

  // ===== CONSISTÊNCIA: placas do mesmo modelo compartilham a média? =====
  console.log('\n\n===== CONSISTÊNCIA MODELO (base, valores>0) =====');
  // agrupa (modelo, vigKey) -> Set de médias>0 (modelo vem do join Km/L)
  const modGroup = new Map();
  for (const [key, med] of baseMap) {
    if (med <= 0) continue;
    const [p, vk] = key.split('|');
    const info = placaInfo.get(p);
    const modelo = info ? info.modelo : '(sem modelo no Km/L)';
    const gk = `${modelo}||${vk}`;
    if (!modGroup.has(gk)) modGroup.set(gk, new Set());
    modGroup.get(gk).add(med.toFixed(4));
  }
  let inconsist = 0, sample = 0;
  for (const [gk, set] of modGroup) {
    if (set.size > 1) {
      inconsist++;
      if (sample < 12) { console.log(`  DIVERGE ${gk} -> ${[...set].join(', ')}`); sample++; }
    }
  }
  console.log(`>> grupos (modelo,vig): ${modGroup.size}  com valores divergentes: ${inconsist}`);

  // ===== COBERTURA: placas do Km/L achadas na base =====
  console.log('\n\n===== COBERTURA Km/L -> base =====');
  let found=0, zeroDirect=0, missing=0;
  const neverActive = [];   // placa sempre 0 na base
  const notInBase = [];     // placa nem aparece na base
  for (const [p, info] of placaInfo) {
    const st = placaStats.get(p);
    if (!st) { missing++; notInBase.push(p); continue; }
    found++;
    const vals = [...st.values()];
    if (vals.every(v => v <= 0)) neverActive.push({ p, modelo: info.modelo, tipo: info.tipo });
  }
  console.log(`>> Km/L placas: ${placaInfo.size}  achadas na base: ${found}  fora da base: ${missing}`);
  console.log(`>> placas SEMPRE 0 na base (nunca ativas): ${neverActive.length}`);
  neverActive.slice(0, 40).forEach(x => console.log(`     ${x.p}  modelo="${x.modelo}"  tipo="${x.tipo}"`));
  if (notInBase.length) { console.log(`>> placas do Km/L que NEM aparecem na base: ${notInBase.length}`); console.log('     ' + notInBase.slice(0,40).join(', ')); }

  // ===== FALLBACK: para cada placa sempre-0/missing, existe outra placa do mesmo modelo com valor>0? =====
  console.log('\n\n===== TESTE DE FALLBACK (modelo -> tipo) =====');
  // por vigência, model->valor(qualquer>0), tipo->[valores>0]
  const perVig = new Map(); // vk -> {modelo:Map(mod->val), tipo:Map(tipo->[vals])}
  for (const [key, med] of baseMap) {
    if (med <= 0) continue;
    const [p, vk] = key.split('|');
    const info = placaInfo.get(p); if (!info) continue;
    if (!perVig.has(vk)) perVig.set(vk, { modelo:new Map(), tipo:new Map() });
    const pv = perVig.get(vk);
    if (info.modelo && !pv.modelo.has(info.modelo)) pv.modelo.set(info.modelo, med);
    if (info.tipo) { if(!pv.tipo.has(info.tipo)) pv.tipo.set(info.tipo, []); pv.tipo.get(info.tipo).push(med); }
  }
  const allVigs = [...vigSet].sort();
  let resolvByModel=0, resolvByTipo=0, unresolved=0;
  const unresolvedList=[];
  for (const x of neverActive) {
    // tenta em qualquer vigência: modelo primeiro, depois tipo
    let ok=false, how='';
    for (const vk of allVigs) {
      const pv = perVig.get(vk); if(!pv) continue;
      if (x.modelo && pv.modelo.has(x.modelo)) { ok=true; how='modelo'; break; }
    }
    if(!ok) for (const vk of allVigs) {
      const pv = perVig.get(vk); if(!pv) continue;
      if (x.tipo && pv.tipo.has(x.tipo)) { ok=true; how='tipo'; break; }
    }
    if (ok) { if(how==='modelo') resolvByModel++; else resolvByTipo++; }
    else { unresolved++; unresolvedList.push(x); }
  }
  console.log(`>> nunca-ativas resolvidas por MODELO: ${resolvByModel}`);
  console.log(`>> nunca-ativas resolvidas por TIPO:   ${resolvByTipo}`);
  console.log(`>> NÃO resolvidas (sem modelo nem tipo com valor): ${unresolved}`);
  unresolvedList.slice(0,40).forEach(x => console.log(`     ${x.p}  modelo="${x.modelo}"  tipo="${x.tipo}"`));

  console.log('\nFIM.');
}
main().catch(e => { console.error('ERRO:', e); process.exit(1); });
