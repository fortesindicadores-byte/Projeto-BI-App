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
// Canônica: unifica Mercosul (AAA9A99) e antigo (AAA9999). No Mercosul o 5º
// caractere (2º dígito do formato antigo) virou LETRA: 0->A 1->B 2->C 3->D
// 4->E 5->F 6->G 7->H 8->I 9->J. Convertendo essa letra de volta para dígito
// obtemos a placa antiga equivalente — chave de join estável para ambos.
const MERC2NUM = { A:'0',B:'1',C:'2',D:'3',E:'4',F:'5',G:'6',H:'7',I:'8',J:'9' };
function canonPlaca(p) {
  const c = cleanPlaca(p);
  if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(c)) {        // Mercosul -> antigo
    const d = MERC2NUM[c[4]];
    if (d != null) return c.slice(0,4) + d + c.slice(5);
  }
  return c;
}

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
    const p = canonPlaca(bRows[i][PL]); if (!p) continue;
    const vk = vigCol>=0 ? vigKeyFromDate(bRows[i][vigCol]) : '';
    const med = parseFloat(String(bRows[i][MD]).replace(',', '.')) || 0;
    baseMap.set(`${p}|${vk}`, med);
    if (!placaStats.has(p)) placaStats.set(p, new Map());
    placaStats.get(p).set(vk, med);
  }

  // ===== BASE via GVIZ (verificar se trunca vs CSV=6255) =====
  const bGviz = `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?sheet=${encodeURIComponent('Base Remunerado Modelo')}&tqx=out:json`;
  try {
    const gTxt = await (await fetch(bGviz)).text();
    const gj = parseGviz(gTxt);
    const gRows = (gj.table.rows || []).length;
    const gCols = (gj.table.cols || []).map(c => (c.label||c.id||'').trim());
    console.log(`\n>> BASE via gviz: linhas=${gRows} (CSV=${bRows.length-1})  cols=${gCols.length} [${gCols.join(' | ')}]`);
  } catch (e) { console.log('>> BASE gviz ERRO:', e.message); }

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
  const kmlRowsSlim = [];   // {p, modelo, tipo, vk} por linha do Km/L
  for (const r of kRows) {
    const praw = r[KPLACA]; if (!praw) continue;
    const p = canonPlaca(praw);
    if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(p)) kPlacaFmt.merc++;
    else if (/^[A-Z]{3}\d{4}$/.test(p)) kPlacaFmt.old++;
    else kPlacaFmt.outros++;
    const modelo = r[KMOD]!=null?String(r[KMOD]).trim():'';
    const tipo = KTIPO>=0&&r[KTIPO]!=null?String(r[KTIPO]).trim():'';
    if (!placaInfo.has(p)) placaInfo.set(p, { modelo, tipo });
    const vk = (function(){const g=String(r[KVIG]).match(/Date\((\d+),(\d+)/);return g?`${g[1]}-${String(+g[2]+1).padStart(2,'0')}`:vigKeyFromDate(r[KVIG]);})();
    if (vk) kVigSet.add(vk);
    kmlRowsSlim.push({ p, modelo, tipo, vk });
  }
  console.log(`>> Placas Km/L: distintas=${placaInfo.size}  Mercosul=${kPlacaFmt.merc}  Antigo=${kPlacaFmt.old}  outros=${kPlacaFmt.outros}`);
  console.log('>> Vigências Km/L:', [...kVigSet].sort().join(', '));

  // ===== COBERTURA (com placa canônica Mercosul<->antigo) =====
  console.log('\n\n===== COBERTURA Km/L -> base (placa canônica) =====');
  let found=0, notInBase=0;
  for (const [p] of placaInfo) { if (placaStats.has(p)) found++; else notInBase++; }
  console.log(`>> Km/L placas distintas: ${placaInfo.size}  com linha na base: ${found}  fora da base: ${notInBase}`);

  // ===== ÍNDICES p/ o resolvedor (iguais aos do painel) =====
  // médias por (vig, modelo) e (vig, tipo) — média simples dos valores>0 da base,
  // usando o modelo/tipo herdado do Km/L (join por placa canônica).
  const allVigs = [...vigSet].sort();
  const modAgg = new Map();  // `${vk}|${modelo}` -> {s,n}
  const tipAgg = new Map();  // `${vk}|${tipo}`   -> {s,n}
  for (const [key, med] of baseMap) {
    if (med <= 0) continue;
    const [p, vk] = key.split('|');
    const info = placaInfo.get(p); if (!info) continue;
    if (info.modelo) { const k=`${vk}|${info.modelo}`; const a=modAgg.get(k)||{s:0,n:0}; a.s+=med; a.n++; modAgg.set(k,a); }
    if (info.tipo)   { const k=`${vk}|${info.tipo}`;   const a=tipAgg.get(k)||{s:0,n:0}; a.s+=med; a.n++; tipAgg.set(k,a); }
  }
  const meanOf = (map,vk,key) => { const a=map.get(`${vk}|${key}`); return a&&a.n>0?a.s/a.n:null; };
  // vigências <= vk (mais recentes primeiro) e depois as demais (mais recentes primeiro)
  function vigOrder(vk){
    const le = allVigs.filter(v=>v<=vk).sort().reverse();
    const gt = allVigs.filter(v=>v>vk).sort().reverse();
    return [...le, ...gt];
  }
  // resolvedor: placa(vig) -> {val, src}
  function resolve(pc, modelo, tipo, vk){
    const direct = baseMap.get(`${pc}|${vk}`);
    if (direct != null && direct > 0) return { val: direct, src: 'placa' };
    if (modelo){ const m = meanOf(modAgg, vk, modelo); if (m!=null) return { val:m, src:'modelo' }; }
    if (tipo){   const t = meanOf(tipAgg, vk, tipo);   if (t!=null) return { val:t, src:'tipo' }; }
    for (const v of vigOrder(vk)){ if (v===vk) continue;
      if (modelo){ const m = meanOf(modAgg, v, modelo); if (m!=null) return { val:m, src:'modelo~'+v }; } }
    for (const v of vigOrder(vk)){ if (v===vk) continue;
      if (tipo){ const t = meanOf(tipAgg, v, tipo); if (t!=null) return { val:t, src:'tipo~'+v }; } }
    return { val: null, src: 'SEM' };
  }

  // ===== SIMULA em TODAS as linhas reais do Km/L =====
  console.log('\n\n===== RESOLUÇÃO por linha do Km/L =====');
  const srcCount = { placa:0, modelo:0, tipo:0, 'modelo~':0, 'tipo~':0, SEM:0 };
  const semSet = new Map();  // placa -> {modelo,tipo,vigs:Set}
  for (const row of kmlRowsSlim) {
    if (!row.vk) continue;
    const { val, src } = resolve(row.p, row.modelo, row.tipo, row.vk);
    const bucket = src.startsWith('modelo~') ? 'modelo~' : src.startsWith('tipo~') ? 'tipo~' : src;
    srcCount[bucket] = (srcCount[bucket]||0) + 1;
    if (src === 'SEM') {
      if (!semSet.has(row.p)) semSet.set(row.p, { modelo: row.modelo, tipo: row.tipo, vigs: new Set() });
      semSet.get(row.p).vigs.add(row.vk);
    }
  }
  const totalRows = kmlRowsSlim.filter(r=>r.vk).length;
  console.log(`>> linhas Km/L (com vig): ${totalRows}`);
  console.log(`   por PLACA direta:        ${srcCount.placa}`);
  console.log(`   por MODELO (mesma vig):  ${srcCount.modelo}`);
  console.log(`   por TIPO   (mesma vig):  ${srcCount.tipo}`);
  console.log(`   por MODELO (outra vig):  ${srcCount['modelo~']}`);
  console.log(`   por TIPO   (outra vig):  ${srcCount['tipo~']}`);
  console.log(`   SEM MÉDIA (nunca ativa): ${srcCount.SEM}`);

  console.log('\n===== STATUS: placas sem média em nenhuma hipótese =====');
  if (semSet.size === 0) {
    console.log('  NENHUMA — todas as placas do Km/L conseguem uma média (placa/modelo/tipo).');
  } else {
    console.log(`  ${semSet.size} placa(s) sem média (modelo/tipo também vazios na base):`);
    for (const [p, x] of semSet) {
      console.log(`     ${p}  modelo="${x.modelo}"  tipo="${x.tipo}"  vigs=${[...x.vigs].sort().join(',')}`);
    }
  }

  // ===== ANÁLISE MODA vs MÉDIA por (modelo,vig) =====
  console.log('\n\n===== MODA vs MÉDIA por (modelo,vig) — valores>0 =====');
  // distValues[`${vk}|${modelo}`] = Map(valorFix2 -> contagem de placas)
  const dist = new Map();
  for (const [key, med] of baseMap) {
    if (med <= 0) continue;
    const [p, vk] = key.split('|');
    const info = placaInfo.get(p); if (!info || !info.modelo) continue;
    const gk = `${vk}|${info.modelo}`;
    if (!dist.has(gk)) dist.set(gk, new Map());
    const dv = med.toFixed(2);
    dist.get(gk).set(dv, (dist.get(gk).get(dv) || 0) + 1);
  }
  const modeOf = m => { let best=null, bc=-1; for (const [v,c] of m){ if (c>bc || (c===bc && +v < +best)){best=v;bc=c;} } return best; };
  const meanOfMap = m => { let s=0,n=0; for (const [v,c] of m){ s+=(+v)*c; n+=c; } return n?s/n:null; };
  // foco: ACTROS 2651S e 2548S em jun/2026
  for (const foc of ['2026-06|M.BENZ/ACTROS 2651S','2026-06|M.BENZ/ACTROS 2548S','2026-06|M.BENZ ACTROS 2651 6X4']) {
    const m = dist.get(foc);
    if (m) console.log(`  ${foc}\n     dist=${[...m].map(([v,c])=>`${v}×${c}`).join('  ')}\n     MODA=${modeOf(m)}   MÉDIA=${meanOfMap(m).toFixed(4)}`);
    else console.log(`  ${foc} -> (sem valores>0)`);
  }
  // quantos grupos divergem e, neles, quão dominante é a moda
  let div=0, domFortes=0;
  for (const [gk, m] of dist) {
    if (m.size <= 1) continue;
    div++;
    let tot=0, mc=0; for (const [,c] of m){ tot+=c; if(c>mc)mc=c; }
    if (mc/tot >= 0.6) domFortes++;
  }
  console.log(`\n  grupos (modelo,vig) com >1 valor: ${div}  |  moda domina >=60% em: ${domFortes}`);

  // ===== DUMP por placa: quem são as divergentes (proj/unidade) =====
  console.log('\n\n===== DUMP placas por (modelo,vig) — proj/unidade =====');
  // placa canônica -> {proj,uni} do Km/L (col14 Projeto "VAN - GRL", col15 Unidade)
  const KPROJ=14, KUNI=15;
  const meta=new Map();
  for (const r of kRows){ const pr=r[KPLACA]; if(!pr)continue; const cp=canonPlaca(pr); if(!meta.has(cp)) meta.set(cp,{proj:r[KPROJ]!=null?String(r[KPROJ]).trim():'',uni:r[KUNI]!=null?String(r[KUNI]).trim():''}); }
  for (const foc of ['2026-06|M.BENZ/ACTROS 2651S','2026-06|M.BENZ/ACTROS 2548S']){
    const [fvk,fmod]=foc.split('|');
    console.log(`\n  ${foc}:`);
    const linhas=[];
    for (const [key,med] of baseMap){
      const [p,vk]=key.split('|'); if(vk!==fvk)continue;
      const inf=placaInfo.get(p); if(!inf||inf.modelo!==fmod)continue;
      const mt=meta.get(p)||{proj:'',uni:''};
      linhas.push({p,med,proj:mt.proj,uni:mt.uni});
    }
    linhas.sort((a,b)=>a.med-b.med);
    linhas.forEach(x=>console.log(`     ${x.p}  media=${x.med}  proj="${x.proj}"  uni="${x.uni}"`));
  }

  // ===== VALIDA computeDivergencias (grupo vig|uniBenner|modelo) =====
  console.log('\n\n===== DIVERGÊNCIAS (vig|unidadeBenner|modelo) — como no painel =====');
  const IUNI = bHead.findIndex(h => /unidade benner/i.test(h));
  const UB = IUNI>=0?IUNI:1;
  const pmod = new Map();  // placaCanon -> modelo (Km/L)
  for (const [p,inf] of placaInfo) if(!pmod.has(p)) pmod.set(p, inf.modelo);
  const grp = new Map();
  for (let i=1;i<bRows.length;i++){
    const med=parseFloat(String(bRows[i][MD]).replace(',','.'))||0; if(!(med>0))continue;
    const p=canonPlaca(bRows[i][PL]); if(!p)continue;
    const modelo=pmod.get(p); if(!modelo)continue;
    const vk=vigCol>=0?vigKeyFromDate(bRows[i][vigCol]):''; if(!vk)continue;
    const uni=String(bRows[i][UB]||'').trim();
    const gk=`${vk}|${uni}|${modelo}`;
    let g=grp.get(gk); if(!g){g={cnt:new Map(),rows:[]};grp.set(gk,g);}
    g.cnt.set(med,(g.cnt.get(med)||0)+1);
    g.rows.push({placa:String(bRows[i][PL]).trim(),med,vk,uni,modelo});
  }
  const modeV=cnt=>{let b=null,bc=-1;for(const[v,c]of cnt){if(c>bc||(c===bc&&v<b)){b=v;bc=c;}}return b;};
  let divTot=0; const divSample=[];
  for(const[,g]of grp){ if(g.cnt.size<=1)continue; const md=modeV(g.cnt);
    g.rows.forEach(x=>{ if(x.med!==md){divTot++; if(x.vk==='2026-06'&&/2651S/.test(x.modelo)) divSample.push(`${x.placa} media=${x.med} moda=${md} (${x.uni})`);} }); }
  console.log(`>> total de divergências (todas vigências): ${divTot}`);
  console.log(`>> exemplo ACTROS 2651S jun/2026:`); divSample.forEach(s=>console.log('   '+s));

  // ===== DIVERGÊNCIAS pelo VALOR RESOLVIDO (como o painel agora faz) =====
  console.log('\n\n===== DIVERGÊNCIAS pelo Rem Modelo RESOLVIDO (vig|uni|modelo) =====');
  const KPROJ2=14;
  const gRes=new Map();
  for (const r of kRows){
    const praw=r[KPLACA]; if(!praw)continue;
    const pc=canonPlaca(praw);
    const modelo=KMOD>=0&&r[KMOD]!=null?String(r[KMOD]).trim():''; if(!modelo)continue;
    const g=String(r[KVIG]).match(/Date\((\d+),(\d+)/); const vk=g?`${g[1]}-${String(+g[2]+1).padStart(2,'0')}`:vigKeyFromDate(r[KVIG]); if(!vk)continue;
    const tipo=KTIPO>=0&&r[KTIPO]!=null?String(r[KTIPO]).trim():'';
    const projRaw=r[KPROJ2]!=null?String(r[KPROJ2]):''; const ix=projRaw.indexOf('-'); const uni=ix>=0?projRaw.slice(ix+1).trim():projRaw.trim();
    const {val}=resolve(pc,modelo,tipo,vk); if(val==null)continue;
    const v2=Math.round(val*100)/100;
    const gk=`${vk}|${uni}|${modelo}`;
    let gg=gRes.get(gk); if(!gg){gg={cnt:new Map(),rows:[]};gRes.set(gk,gg);}
    gg.cnt.set(v2,(gg.cnt.get(v2)||0)+1);
    gg.rows.push({placa:String(praw).trim(),v2,uni});
  }
  const modeV2=cnt=>{let b=null,bc=-1;for(const[v,c]of cnt){if(c>bc||(c===bc&&v<b)){b=v;bc=c;}}return b;};
  let resTot=0; const resSample=[]; const seenR=new Set();
  for(const[gk,gg]of gRes){ if(gg.cnt.size<=1)continue; const md=modeV2(gg.cnt);
    gg.rows.forEach(x=>{ if(x.v2===md)return; const dk=gk+'|'+x.placa; if(seenR.has(dk))return; seenR.add(dk); resTot++;
      if(gk.startsWith('2026-06|')&&/2651S/.test(gk)&&/PIR/.test(x.uni)) resSample.push(`${x.placa} rem=${x.v2} moda=${md}`); }); }
  console.log(`>> total divergências (resolvido, dedup placa): ${resTot}`);
  console.log(`>> ACTROS 2651S PIR jun/2026 (deve ter 3):`); resSample.forEach(s=>console.log('   '+s));

  console.log('\nFIM.');
}
main().catch(e => { console.error('ERRO:', e); process.exit(1); });
