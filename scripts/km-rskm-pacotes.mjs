// Prepara a troca do Impacto do /painel-km/: em vez da coluna AK da aba
// "Dispersão de km", passar a calcular  Δ km × R$/km REMUNERADO, com o R$/km
// dos pacotes Combustíveis + Manutenções + Pneus, do jeito que o /rs-por-km/ faz.
//
// Antes de mexer no painel: confirmar o layout da aba Frota (dois painéis do
// repo leem essa aba com mapeamentos de coluna DIFERENTES) e ver o que o
// impacto do PIR vira com a régua nova.
const COST_ID = '1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8', COST_TAB = 'Frota';
const KM_ID   = '1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM', KM_TAB   = 'Dispersão de km';
const VIG = process.env.VIG || '';   // 'MM/AAAA'; vazio = última com dado

const A1 = i => { let s='', n=i; do { s = String.fromCharCode(65 + n%26) + s; n = Math.floor(n/26)-1; } while(n>=0); return s; };
const br = v => Math.round(v).toLocaleString('pt-BR');
const n2 = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

async function sheet(id, tab){
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tab)}`;
  const t = await (await fetch(url)).text();
  const j = JSON.parse(t.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
  return { cols:(j.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim()), rows:(j.table.rows||[]) };
}
function vigDe(cell){
  if(!cell || cell.v == null) return '';
  const s = String(cell.v);
  const m = s.match(/Date\((\d+),(\d+)/);
  if(m) return String(+m[2]+1).padStart(2,'0') + '/' + m[1];
  if(cell.f) return String(cell.f).trim();
  return s.trim();
}
// mesmas regras do /rs-por-km/
const ALIAS = {'Combustíveis Veiculos e Equipamentos':'Combustíveis','Fluídos (Arla)':'Arla',
  'Personalização/Padronização de Veículos':'Personalização/Padronização',
  'Personalização e Padronização de Veículos':'Personalização/Padronização',
  'Manutenção de Veículos e Equipamentos':'Manutenção de Veículos e Equip.',
  'Consertos e Recapagens de Pneus':'Recapagens e Outros Serviços','Pneus e Camaras':'Pneus Novos'};
const PACOTE = {'Combustíveis':'Combustíveis','Arla':'Combustíveis',
  'Manutenção de Carrocerias':'Manutenções','Contratos de Manutenção Fabricante':'Manutenções',
  'Materiais e Ferramentas de Oficina':'Manutenções','Personalização/Padronização':'Manutenções',
  'Lavação de Veículos':'Manutenções','Manutenção de Veículos e Equip.':'Manutenções',
  'Recapagens e Outros Serviços':'Pneus','Pneus Novos':'Pneus'};
const TRES = new Set(['Combustíveis','Manutenções','Pneus']);
const limpa = s => String(s||'').replace(/\s*\(INATIVO\)\s*/ig,'').trim();
const partes = s => { const v = limpa(s); const i = v.indexOf('-');
  return i>=0 ? {proj:v.slice(0,i).trim(), uni:v.slice(i+1).trim()} : {proj:v, uni:v}; };

const custo = await sheet(COST_ID, COST_TAB);
console.log('=== aba Frota — cabeçalhos ===');
custo.cols.forEach((c,i) => { if(i<16) console.log(`  ${A1(i).padEnd(3)} [${String(i).padStart(2)}] ${c}`); });

// descobre as colunas pelo NOME, em vez de confiar num índice fixo
const acha = (...termos) => custo.cols.findIndex(c => termos.some(t => c.toLowerCase().includes(t)));
const C = { vig:acha('vigência','vigencia'), nv3:acha('nível 3','nivel 3','nv3'), cta:acha('conta'),
            rem:acha('remunerado'), real:acha('realizado') };
console.log('\ncolunas achadas pelo nome:', JSON.stringify(C),
  '\n  (rs-por-km usa vig:0 nv3:4 cta:5 rem:9 real:10 · visao-financeira usa vig:9 nv3:11 cta:12 rem:1 real:2)');
if(Object.values(C).some(i => i < 0)){ console.log('\nALGUMA COLUNA NÃO FOI ACHADA — abortando.'); process.exit(0); }

// custo remunerado dos 3 pacotes, por vigência|unidade|projeto
const custoRem = {};
custo.rows.forEach(row => {
  const g = i => row.c && row.c[i] ? row.c[i].v : null;
  const vig = vigDe(row.c && row.c[C.vig]); if(!vig) return;
  const {proj,uni} = partes(g(C.nv3));
  const cta = ALIAS[String(g(C.cta)||'').trim()] || String(g(C.cta)||'').trim();
  if(!TRES.has(PACOTE[cta])) return;
  const k = vig+'|'+uni.toUpperCase()+'|'+proj.toUpperCase();
  // custo na DRE vem NEGATIVO — o custo de verdade é -valor, senão o R$/km sai
  // negativo e inverte o sinal de todo impacto
  custoRem[k] = (custoRem[k]||0) - n2(g(C.rem));
});

// km do painel (mesma aba/colunas que o /painel-km/ lê)
const km = await sheet(KM_ID, KM_TAB);
const linhas = km.rows.map(row => {
  const g = i => (row.c && row.c[i] && row.c[i].v != null) ? row.c[i].v : 0;
  const s = i => (row.c && row.c[i] && row.c[i].v) ? String(row.c[i].v).trim() : '';
  const vig = vigDe(row.c && row.c[0]); const {proj,uni} = partes(s(14));
  return { vig, uni: uni||s(13), proj, rem:n2(g(31)), real:n2(g(32)), imp:n2(g(36)) };
}).filter(r => r.vig && (r.rem>0 || r.real>0));

const vigs = [...new Set(linhas.map(r=>r.vig))].sort((a,b)=>(a.slice(-4)+a.slice(0,2)).localeCompare(b.slice(-4)+b.slice(0,2)));
const vig = VIG || vigs[vigs.length-1];
console.log(`\n=== ${vig}: R$/km remunerado (Combustíveis+Manutenções+Pneus) por unidade|projeto ===`);
console.log('unidade  | projeto              |     km rem |   custo rem | R$/km |  Δ km  | imp NOVO | imp HOJE (AK)');

const porChave = {};
linhas.filter(r => r.vig === vig).forEach(r => {
  const k = r.vig+'|'+r.uni.toUpperCase()+'|'+r.proj.toUpperCase();
  const o = porChave[k] || (porChave[k] = {uni:r.uni, proj:r.proj, rem:0, real:0, imp:0});
  o.rem += r.rem; o.real += r.real; o.imp += r.imp;
});
let nSem = 0, totNovo = 0, totHoje = 0;
Object.entries(porChave).sort((a,b)=>a[1].uni.localeCompare(b[1].uni)).forEach(([k,o]) => {
  const cr = custoRem[k];
  const taxa = (cr != null && o.rem) ? cr/o.rem : null;
  const novo = taxa != null ? (o.real-o.rem)*taxa : null;
  if(taxa == null) nSem++; else { totNovo += novo; totHoje += o.imp; }
  console.log(`${o.uni.slice(0,8).padEnd(8)} | ${o.proj.slice(0,20).padEnd(20)} |${br(o.rem).padStart(11)} |` +
    `${(cr==null?'—':br(cr)).padStart(12)} |${(taxa==null?'—':taxa.toFixed(2)).padStart(6)} |` +
    `${br(o.real-o.rem).padStart(7)} |${(novo==null?'—':br(novo)).padStart(9)} |${br(o.imp).padStart(14)}`);
});
console.log(`\nchaves sem custo casado: ${nSem}`);
console.log(`total do mês — impacto NOVO ${br(totNovo)} × impacto HOJE ${br(totHoje)}`);

// o sinal passa a acompanhar o Δ?
const trocaSinal = Object.entries(porChave).filter(([k,o]) => {
  const cr = custoRem[k]; if(cr==null || !o.rem) return false;
  const novo = (o.real-o.rem)*(cr/o.rem);
  return Math.sign(novo) !== Math.sign(o.real-o.rem) && novo !== 0;
});
console.log(`chaves em que o impacto NOVO discorda do sinal do Δ: ${trocaSinal.length} (esperado: 0)`);
