// Até onde vai o elite_snapshot? (o Scorecard, o Gerot, o Frota de Elite e o
// Painel de Metas leem daqui — se a base parou, todos param juntos)
// Lista, por indicador e escopo, as vigências gravadas e a última delas.
const URL = process.env.GEM_SUPABASE_URL || 'https://lozwipoeacpvplgkrxkq.supabase.co';
const KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!KEY) { console.log('SEM GEM_SUPABASE_SERVICE_KEY'); process.exit(1); }

const req = async (tab, q) => {
  const r = await fetch(`${URL}/rest/v1/${tab}?${q}`, { headers:{ apikey:KEY, Authorization:'Bearer '+KEY } });
  if (!r.ok) throw new Error(tab+' http '+r.status+' '+(await r.text()).slice(0,200));
  return r.json();
};
const ordVig = v => { const m=String(v).match(/(\d{2})\/(\d{4})/); return m ? +m[2]*100 + +m[1] : 0; };

const linhas = await req('elite_snapshot', 'select=indicador,vigencia,escopo,updated_at&order=indicador');
console.log('elite_snapshot:', linhas.length, 'registros\n');

const porInd = {};
linhas.forEach(r => {
  const k = r.indicador+' ('+r.escopo+')';
  (porInd[k] = porInd[k] || []).push(r);
});
Object.keys(porInd).sort().forEach(k => {
  const rs = porInd[k].sort((a,b)=>ordVig(a.vigencia)-ordVig(b.vigencia));
  const ult = rs[rs.length-1];
  console.log(k.padEnd(34), rs.length, 'vig ·', rs.map(r=>r.vigencia).join(' '),
              '· última gravação:', String(ult.updated_at||'').slice(0,16));
});

// quantas linhas de dado tem a última vigência de cada indicador (escopo mes)
console.log('\n── volume da última vigência (escopo mes) ──');
const ults = {};
linhas.filter(r=>r.escopo==='mes').forEach(r=>{
  if(!ults[r.indicador] || ordVig(r.vigencia)>ordVig(ults[r.indicador])) ults[r.indicador]=r.vigencia;
});
for (const ind of Object.keys(ults).sort()) {
  const [row] = await req('elite_snapshot',
    `indicador=eq.${encodeURIComponent(ind)}&vigencia=eq.${encodeURIComponent(ults[ind])}&escopo=eq.mes&select=data`);
  const n = row && Array.isArray(row.data) ? row.data.length : 0;
  console.log(' ', ind.padEnd(26), ults[ind], '·', n, 'linhas');
}

// as outras bases que alimentam os mesmos painéis
for (const [tab, sel] of [['ginfo_snapshot','select=chave,updated_at'],
                          ['locacao_conferencia','select=vigencia,updated_at']]) {
  try {
    const rs = await req(tab, sel+'&order=updated_at.desc');
    console.log(`\n── ${tab}: ${rs.length} registro(s) ──`);
    rs.forEach(r => console.log('  ', (r.chave||r.vigencia||'').padEnd(26), String(r.updated_at||'').slice(0,16)));
  } catch (e) { console.log(`\n── ${tab}: ${e.message}`); }
}
