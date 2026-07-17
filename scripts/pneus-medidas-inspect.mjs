// Lê o snapshot de pneus no Supabase e agrega as MEDIDAS distintas com:
//  - qtde de pneus por medida
//  - distribuição da pressão ideal (recommendedPressure) hoje cadastrada
//  - marcas/modelos mais comuns por medida
// Objetivo: mapear todo o universo de pneus p/ definir um padrão de PSI por medida.
// Roda via GitHub Actions (usa os secrets SUPABASE_URL / SUPABASE_SERVICE_KEY).
const SUPABASE = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const KEY      = (process.env.SUPABASE_SERVICE_KEY || '').trim();
if (!SUPABASE || !KEY) { console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }

function med(a){ a=a.filter(x=>isFinite(x)).sort((x,y)=>x-y); if(!a.length)return null; const n=a.length; return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2; }
function topN(map,n){ return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n); }

async function main(){
  const url = `${SUPABASE}/rest/v1/snapshot?endpoint=eq.tires&select=branch_id,data`;
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: 'Bearer '+KEY } });
  if (res.status >= 300) { console.error('Supabase', res.status, (await res.text()).slice(0,300)); process.exit(1); }
  const rows = await res.json();
  console.log('Snapshots (unidades) lidos:', rows.length);

  const M = new Map();   // medida -> {n, pres:[], presCnt:Map, marcas:Map, modelos:Map, ativos, semPres}
  let total=0;
  rows.forEach(r=>{
    (r.data||[]).forEach(t=>{
      total++;
      const m = (t.medida && t.medida.trim()) || '(sem medida)';
      if(!M.has(m)) M.set(m,{n:0,pres:[],presCnt:new Map(),marcas:new Map(),modelos:new Map(),semPres:0,statusCnt:new Map()});
      const o=M.get(m); o.n++;
      const p=+t.pressaoIdeal||0;
      if(p>0){ o.pres.push(p); o.presCnt.set(p,(o.presCnt.get(p)||0)+1); } else o.semPres++;
      const mk=(t.marca||'?').trim(); o.marcas.set(mk,(o.marcas.get(mk)||0)+1);
      const md=(t.modelo||'?').trim(); o.modelos.set(md,(o.modelos.get(md)||0)+1);
      const st=(t.status||'?'); o.statusCnt.set(st,(o.statusCnt.get(st)||0)+1);
    });
  });
  console.log('Total de pneus:', total, '| Medidas distintas:', M.size);

  // ordena por qtde de pneus desc
  const arr=[...M.entries()].sort((a,b)=>b[1].n-a[1].n);
  console.log('\n===== MEDIDAS (por volume) =====');
  for(const [medida,o] of arr){
    const presDist = topN(o.presCnt,6).map(([v,c])=>`${v}psi×${c}`).join('  ');
    const mn=o.pres.length?Math.min(...o.pres):null, mx=o.pres.length?Math.max(...o.pres):null, md=med(o.pres);
    console.log(`\n▸ ${medida}   (pneus: ${o.n}${o.semPres?` · sem pressão: ${o.semPres}`:''})`);
    console.log(`   pressão ideal hoje → min ${mn} · mediana ${md} · max ${mx}`);
    console.log(`   distribuição: ${presDist||'(nenhuma)'}`);
    console.log(`   marcas: ${topN(o.marcas,4).map(([v,c])=>`${v}(${c})`).join(', ')}`);
    console.log(`   modelos: ${topN(o.modelos,4).map(([v,c])=>`${v}(${c})`).join(', ')}`);
  }
  console.log('\nFIM.');
}
main().catch(e=>{ console.error('ERRO:', e); process.exit(1); });
