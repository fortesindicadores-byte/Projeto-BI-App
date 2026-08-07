// Inspeciona a planilha do Termômetro (fonte dos novos indicadores do Gerot:
// Blitz de Segurança, OS Vencida — e conferência de MTTR/MTBF).
// Para cada aba de tier (+ acumulado): colunas, unidades, vigências e amostra
// dos pares valor/pontos. Roda via GitHub Actions (o sandbox não alcança docs.google).
const ID = '10LRn3jrXEemqFiFAMbO8_bOLk98xrWTVXVUNDeQqLac';
const TABS = ['Transportes T1','Transportes T2','WH T1','WH T2',
              'Transportes T1 - Acum','Transportes T2 - Acum','WH T1 - Acum','WH T2 - Acum',
              'Regras'];

const COLLET = i => { let s=''; i=Number(i); while(i>=0){ s=String.fromCharCode(65+(i%26))+s; i=Math.floor(i/26)-1; } return s; };
function parse(txt){ const s=txt.indexOf('{'), e=txt.lastIndexOf('}'); return JSON.parse(txt.slice(s,e+1)); }
function cell(c){ if(!c) return ''; if(c.v!=null) return String(c.v); if(c.f!=null) return String(c.f); return ''; }

async function dump(name){
  console.log('\n\n============================================================');
  console.log(`ABA: ${name}`);
  console.log('============================================================');
  const url = `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?sheet=${encodeURIComponent(name)}&tqx=out:json`;
  let txt;
  try { txt = await (await fetch(url)).text(); } catch(e){ console.log('  ERRO fetch:', e.message); return; }
  let j;
  try { j = parse(txt); } catch(e){ console.log('  ERRO parse:', e.message, '| raw:', txt.slice(0,200)); return; }
  if (j.status!=='ok'){ console.log('  status:', j.status, JSON.stringify(j.errors||{})); return; }
  const cols = (j.table.cols||[]).map((c,i)=>`[${i}|${COLLET(i)}] ${c.label||c.id||''}${c.type?' <'+c.type+'>':''}`);
  const rows = j.table.rows||[];
  console.log('COLUNAS (', cols.length, '):'); cols.forEach(c=>console.log('   ',c));
  console.log('LINHAS:', rows.length);
  const unis = new Set(), vigs = new Set();
  rows.forEach(r=>{ const u=cell(r.c?.[1]); if(u) unis.add(u); const v=cell(r.c?.[0]); if(v) vigs.add(v); });
  console.log('COL A (vigência) distintos:', [...vigs].slice(0,30).join(' , '));
  console.log('COL B (unidade) distintos:', [...unis].join(' , '));
  const showRow = r => (r.c||[]).map((c,i)=>{ const v=cell(c); return v!==''?`${COLLET(i)}=${v}`:null; }).filter(Boolean).join(' | ');
  console.log('PRIMEIRAS 4:');
  for (let i=0;i<Math.min(4,rows.length);i++) console.log('  r'+i+': '+showRow(rows[i]));
  console.log('ÚLTIMAS 2:');
  for (let i=Math.max(0,rows.length-2);i<rows.length;i++) console.log('  r'+i+': '+showRow(rows[i]));
}

for (const t of TABS) await dump(t);
console.log('\n\nFIM.');
