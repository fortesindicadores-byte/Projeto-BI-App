// Inspeciona a nova base de Gerot + Frota de Elite (1 aba = 1 indicador).
// Para cada aba: colunas, nº de linhas, vigências distintas, primeiras/últimas linhas.
// Confirma as colunas de "desconto" dos indicadores calculados (Stress/CIVF).
// Roda via GitHub Actions (o sandbox não alcança docs.google).
const ID = '1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M';

// nome da aba -> coluna de desconto (0-based) p/ os calculados; null = valor direto
const TABS = [
  { name: 'Disponibilidade',      desconto: null },
  { name: 'Preventivas',          desconto: null },
  { name: 'Pneus',                desconto: null },
  { name: 'Checklist T1/T2',      desconto: null },
  { name: 'Checklist WH',         desconto: null },
  { name: 'Conformidade',         desconto: null },
  { name: 'Stress Test - Veíc.',  desconto: 16 },  // col Q
  { name: 'Stress Test - Emp',    desconto: 19 },  // col T
  { name: 'CIVF',                 desconto: 12 },  // col M
  { name: 'SLA Man.',             desconto: null },
];

const COLLET = i => { let s=''; i=Number(i); while(i>=0){ s=String.fromCharCode(65+(i%26))+s; i=Math.floor(i/26)-1; } return s; };
function parse(txt){ const s=txt.indexOf('{'), e=txt.lastIndexOf('}'); return JSON.parse(txt.slice(s,e+1)); }
function cell(c){ if(!c) return ''; if(c.f!=null) return String(c.f); if(c.v==null) return ''; return String(c.v); }
function vigOf(c){ if(!c) return ''; const g=String(c.v||'').match(/Date\((\d+),(\d+)/); if(g) return `${g[1]}-${String(+g[2]+1).padStart(2,'0')}`; return String(c.f||c.v||''); }

async function dump(tab){
  console.log('\n\n============================================================');
  console.log(`ABA: ${tab.name}${tab.desconto!=null?`   (desconto col ${COLLET(tab.desconto)}=${tab.desconto})`:''}`);
  console.log('============================================================');
  const url = `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?sheet=${encodeURIComponent(tab.name)}&tqx=out:json`;
  let txt;
  try { txt = await (await fetch(url)).text(); } catch(e){ console.log('  ERRO fetch:', e.message); return; }
  let j;
  try { j = parse(txt); } catch(e){ console.log('  ERRO parse:', e.message, '| raw:', txt.slice(0,200)); return; }
  if (j.status!=='ok'){ console.log('  status:', j.status, JSON.stringify(j.errors||{})); return; }
  const cols = (j.table.cols||[]).map((c,i)=>`[${i}|${COLLET(i)}] ${c.label||c.id||''}${c.type?' <'+c.type+'>':''}`);
  const rows = j.table.rows||[];
  console.log('COLUNAS (', cols.length, '):'); cols.forEach(c=>console.log('   ',c));
  console.log('LINHAS:', rows.length);

  const labels = (j.table.cols||[]).map(c=>String(c.label||'').toLowerCase());
  let vc = labels.findIndex(l=>l.includes('vig'));
  const vigs = new Set(); rows.forEach(r=>{ const v = vc>=0 ? vigOf(r.c?.[vc]) : ''; if(v) vigs.add(v); });
  console.log('VIGÊNCIAS distintas:', [...vigs].sort().join(', ') || '(coluna de vigência não achada)');

  const showRow = r => (r.c||[]).map((c,i)=>{ const v=cell(c); return v!==''?`${COLLET(i)}=${v}`:null; }).filter(Boolean).join(' | ');
  console.log('\nPRIMEIRAS 2:');
  for (let i=0;i<Math.min(2,rows.length);i++) console.log('  r'+i+': '+showRow(rows[i]));
  console.log('ÚLTIMAS 2:');
  for (let i=Math.max(0,rows.length-2);i<rows.length;i++) console.log('  r'+i+': '+showRow(rows[i]));

  if (tab.desconto!=null){
    const dc = tab.desconto;
    const lbl = (j.table.cols?.[dc]?.label)||'(sem label)';
    const amostra = rows.slice(0,20).map(r=>cell(r.c?.[dc])).filter(v=>v!=='');
    const distintos = [...new Set(rows.map(r=>cell(r.c?.[dc])))].slice(0,12);
    console.log(`\n  >> DESCONTO col ${COLLET(dc)} label="${lbl}"`);
    console.log(`     amostra(20): ${amostra.slice(0,12).join(' , ')||'(vazias)'}`);
    console.log(`     valores distintos (12): ${distintos.map(v=>v===''?'∅':v).join(' , ')}`);
  }
}

for (const t of TABS) await dump(t);
console.log('\n\nFIM.');
