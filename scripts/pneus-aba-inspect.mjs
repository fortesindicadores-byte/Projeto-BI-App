// Inspeciona a aba "Pneus" do workbook Frota de Elite (export de detalhes do
// Ginfo colado pelo Renan). Objetivo: descobrir se o export traz TODOS os
// períodos de uma vez — se trouxer, o robô pode coletá-lo sem depender dos
// tiles de mês da tela de Pneus (que foi justamente o que travou a automação).
const ID = '1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M';

function parse(txt){ const s=txt.indexOf('{'), e=txt.lastIndexOf('}'); return JSON.parse(txt.slice(s,e+1)); }
function cell(c){ if(!c) return ''; if(c.f!=null) return String(c.f); if(c.v==null) return ''; return String(c.v); }

const url = `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?sheet=Pneus&tqx=out:json`;
const j = parse(await (await fetch(url)).text());
if (j.status !== 'ok') { console.log('status:', j.status, JSON.stringify(j.errors||{})); process.exit(1); }

const cols = (j.table.cols||[]).map(c => c.label || c.id || '');
const rows = j.table.rows || [];
console.log('COLUNAS:', JSON.stringify(cols));
console.log('LINHAS:', rows.length);

const iPer = cols.findIndex(c => /per[íi]odo/i.test(c));
const iSt  = cols.findIndex(c => /status/i.test(c));
const iFil = cols.findIndex(c => /filial/i.test(c));
const iEv  = cols.findIndex(c => /evento/i.test(c));

const porPeriodo = new Map(), status = new Map(), eventos = new Map();
for (const r of rows) {
  const p = cell(r.c?.[iPer]).trim();
  if (p) porPeriodo.set(p, (porPeriodo.get(p)||0) + 1);
  const s = cell(r.c?.[iSt]).trim();
  if (s) status.set(s, (status.get(s)||0) + 1);
  const e = cell(r.c?.[iEv]).trim();
  if (e) eventos.set(e, (eventos.get(e)||0) + 1);
}
console.log('\nPERÍODOS presentes (', porPeriodo.size, '):');
[...porPeriodo.entries()].forEach(([p,n]) => console.log(`   ${p.padEnd(24)} ${String(n).padStart(6)} linhas`));
console.log('\nSTATUS distintos:', JSON.stringify([...status.entries()]));
console.log('EVENTOS distintos:', JSON.stringify([...eventos.entries()]));
console.log('\nFILIAIS distintas:', new Set(rows.map(r => cell(r.c?.[iFil]).trim())).size);

// aderência por filial no período mais recente, do jeito que o leitor calcula
const ult = [...porPeriodo.keys()].pop();
const g = {};
for (const r of rows) {
  if (cell(r.c?.[iPer]).trim() !== ult) continue;
  const f = cell(r.c?.[iFil]).trim(); if (!f) continue;
  const o = g[f] = g[f] || {ok:0, n:0};
  o.n++; if (!/n[ãa]o realizado/i.test(cell(r.c?.[iSt]))) o.ok++;
}
console.log(`\nAderência por filial em "${ult}" (mesma conta do leitor):`);
Object.entries(g).sort().forEach(([f,o]) => console.log(`   ${f.padEnd(24)} ${o.ok}/${o.n} = ${(o.ok/o.n*100).toFixed(1)}%`));
console.log('\nFIM.');
