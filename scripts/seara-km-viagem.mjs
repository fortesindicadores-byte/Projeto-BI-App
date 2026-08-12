// Compara as duas maneiras de contar o KM remunerado da Seara e mede a placa
// Mercosul, antes de a regra nova valer no painel.
//
//  · ANTES: Σ da coluna Z (KM Rodado), linha a linha da Base CTEs;
//  · AGORA: Σ da coluna J (QT_QUILOMETROS_VIAGEM) contada UMA VEZ por
//    CD_VIAGEM_TRANSPORTE (col B) — a mesma viagem gera vários CTEs (normal,
//    complementar, descarga, pernoite) e todos repetem o km da viagem.
const SEARA_ID = '1Rlwc0MZiupQI38gSN8VyBq_zMADgX9R_ZbfygNP-OXE';
const GID_CTES = 1672208132, GID_REM = 0, GID_COMB = 1982300845;

const MERC = 'ABCDEFGHIJ';
function placaKey(s){
  const p = String(s==null?'':s).toUpperCase().replace(/[^A-Z0-9]/g,'');
  return /^[A-Z]{3}[0-9]{4}$/.test(p) ? p.slice(0,4)+MERC[+p[4]]+p.slice(5) : p;
}
const parse = t => { const s=t.indexOf('{'), e=t.lastIndexOf('}'); return JSON.parse(t.slice(s,e+1)); };
const n2 = v => (+v||0);
function vigDe(v){
  const s = String(v==null?'':v);
  let m = s.match(/Date\((\d+),(\d+)/);
  if(m) return String(+m[2]+1).padStart(2,'0')+'/'+m[1];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m) return m[2].padStart(2,'0')+'/'+m[3];
  const d = new Date(s);
  return isNaN(d) ? '' : String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
}
async function gvz(gid, tq){
  const p = ['gid='+gid,'headers=1','tqx=out:json'];
  if(tq) p.push('tq='+encodeURIComponent(tq));
  const j = parse(await (await fetch(`https://docs.google.com/spreadsheets/d/${SEARA_ID}/gviz/tq?${p.join('&')}`)).text());
  if(j.status!=='ok') throw new Error('gviz '+j.status);
  return (j.table.rows||[]).map(x => (x.c||[]).map(c => c ? (c.v!=null?c.v:c.f) : null));
}

const ctes = await gvz(GID_CTES);            // aba inteira: dá p/ ler B, C, D, J e Z
const brem = await gvz(GID_REM);
const comb = await gvz(GID_COMB);

// ── formato das placas nas três abas ──
const fmt = rows => rows.reduce((a,p)=>{
  const s = String(p==null?'':p).toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(/^[A-Z]{3}[0-9]{4}$/.test(s)) a.antigo++;
  else if(/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(s)) a.merc++;
  else if(s) a.outro++;
  return a;
},{antigo:0,merc:0,outro:0});
console.log('=== formato das placas ===');
console.log('  Base CTEs      :', JSON.stringify(fmt(ctes.map(r=>r[2]))));
console.log('  Base Remunerado:', JSON.stringify(fmt(brem.map(r=>r[3]))));
console.log('  Combustível    :', JSON.stringify(fmt(comb.map(r=>r[4]))));

// ── KM remunerado: Z linha a linha × J uma vez por viagem ──
const antes = {}, agora = {}, vistas = new Set();
let linhas=0, viagens=0, semViagem=0, jVaria=0;
const kmDaViagem = {};
ctes.forEach(r => {
  const placa = placaKey(r[2]), vig = vigDe(r[3]);
  if(!placa || !vig) return;
  linhas++;
  const k = placa+'|'+vig;
  antes[k] = (antes[k]||0) + n2(r[25]);              // Z
  const v = r[1];
  if(v==null || v===''){ semViagem++; return; }
  const vk = String(v);
  if(kmDaViagem[vk]!=null && Math.abs(kmDaViagem[vk]-n2(r[9]))>0.01) jVaria++;
  kmDaViagem[vk] = n2(r[9]);
  if(vistas.has(vk)) return;
  vistas.add(vk); viagens++;
  agora[k] = (agora[k]||0) + n2(r[9]);               // J, uma vez
});
console.log(`\nlinhas da Base CTEs: ${linhas} · viagens distintas: ${viagens} · ` +
  `média de ${(linhas/viagens).toFixed(2)} CTEs por viagem`);
if(semViagem) console.log(`  ATENÇÃO: ${semViagem} linha(s) sem CD_VIAGEM_TRANSPORTE (ficam de fora do km)`);
if(jVaria)   console.log(`  ATENÇÃO: ${jVaria} caso(s) em que o km diverge entre CTEs da MESMA viagem`);

const vigs = [...new Set([...Object.keys(antes),...Object.keys(agora)].map(k=>k.split('|')[1]))]
  .sort((a,b)=>(a.slice(-4)+a.slice(0,2)).localeCompare(b.slice(-4)+b.slice(0,2)));
console.log('\nvigência |   KM antes (Z) |  KM agora (J/viagem) |  variação');
console.log('---------+----------------+----------------------+----------');
vigs.forEach(v => {
  let a=0,b=0;
  Object.keys(antes).forEach(k=>{ if(k.endsWith('|'+v)) a+=antes[k]; });
  Object.keys(agora).forEach(k=>{ if(k.endsWith('|'+v)) b+=agora[k]; });
  const d = a ? (b/a-1)*100 : 0;
  console.log(`${v}  |${Math.round(a).toLocaleString('pt-BR').padStart(15)} |${Math.round(b).toLocaleString('pt-BR').padStart(21)} |` +
    `${(d>=0?'+':'')+d.toFixed(1)+'%'}`.padStart(10));
});

// ── cobertura do R$/km (col O) nas placas do painel, com a chave Mercosul ──
const MESES3 = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const temRem = new Set();
brem.forEach(r => { const p=placaKey(r[3]), v=vigDe(r[0]); if(p&&v&&n2(r[14])>0) temRem.add(p+'|'+v); });
const porVig = {};
comb.forEach(r => {
  const p = placaKey(r[4]);
  const mi = MESES3.indexOf(String(r[5]||'').toLowerCase().slice(0,3));
  const y = +r[6], real = n2(r[10]);
  if(!p || mi<0 || !y || real<=0) return;
  const vig = String(mi+1).padStart(2,'0')+'/'+y;
  const o = porVig[vig] || (porVig[vig] = {tot:new Set(), ok:new Set(), semKm:new Set()});
  o.tot.add(p);
  if(temRem.has(p+'|'+vig)) o.ok.add(p);
  if(!agora[p+'|'+vig]) o.semKm.add(p);
});
console.log('\n=== cobertura por vigência (placas da aba Combustível) ===');
Object.keys(porVig).sort((a,b)=>(a.slice(-4)+a.slice(0,2)).localeCompare(b.slice(-4)+b.slice(0,2))).forEach(v => {
  const o = porVig[v];
  console.log(`  ${v}: ${o.ok.size}/${o.tot.size} com R$/km próprio · ${o.tot.size-o.semKm.size}/${o.tot.size} com km remunerado`);
});
