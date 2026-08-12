// Decompõe o R$/km da Base CTEs componente a componente, para confirmar que a
// coluna que o Painel KM da Seara usa hoje (S) é SÓ combustível — e para ver
// quanto do salto ao trocar pela coluna O da Base Remunerado vem de "somar os
// outros custos" e quanto vem de "trocar o preço do combustível".
//
// Base CTEs:       S combustível · T arla · U manutenção · V pneu ·
//                  W recapagem · X lubrificante · Y lavagem · Z km rodado
// Base Remunerado: T diesel · U arla · V manutenção · AD pneu · AE recapagem ·
//                  AF lubrificante · AJ lavagem · O = soma dos sete
const SEARA_ID = '1Rlwc0MZiupQI38gSN8VyBq_zMADgX9R_ZbfygNP-OXE';
const GID_REM  = 0, GID_CTES = 1672208132;
const VIGS = (process.env.VIGS || '').split(',').map(s=>s.trim()).filter(Boolean);

const placaKey = s => String(s==null?'':s).toUpperCase().replace(/[^A-Z0-9]/g,'').trim();
const parse = t => { const s=t.indexOf('{'), e=t.lastIndexOf('}'); return JSON.parse(t.slice(s,e+1)); };
const n2 = v => (+v||0);

async function gvz(gid){
  const url = `https://docs.google.com/spreadsheets/d/${SEARA_ID}/gviz/tq?gid=${gid}&headers=1&tqx=out:json`;
  const j = parse(await (await fetch(url)).text());
  if(j.status!=='ok') throw new Error('gviz '+j.status);
  return (j.table.rows||[]).map(x => (x.c||[]).map(c => c ? (c.v!=null?c.v:c.f) : null));
}
function vigDe(v){
  const s = String(v==null?'':v);
  let m = s.match(/Date\((\d+),(\d+)/);
  if(m) return String(+m[2]+1).padStart(2,'0')+'/'+m[1];
  m = s.match(/(\d{1,2})\/(\d{4})/);
  if(m) return m[1].padStart(2,'0')+'/'+m[2];
  const d = new Date(s);
  return isNaN(d) ? '' : String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
}

const brem = await gvz(GID_REM), ctes = await gvz(GID_CTES);
const vigs = VIGS.length ? VIGS
  : [...new Set(brem.map(r=>vigDe(r[0])).filter(Boolean))].sort((a,b)=>a.slice(-4)+a.slice(0,2)<b.slice(-4)+b.slice(0,2)?-1:1);

const CTE_COMP = {comb:18, arla:19, manut:20, pneu:21, recap:22, lubr:23, lavag:24};
const REM_COMP = {comb:19, arla:20, manut:21, pneu:29, recap:30, lubr:31, lavag:35};

console.log('vigência | placas |  CTE comb | Rem diesel |  CTE resto | Rem resto |  CTE total | Rem O (col)');
console.log('---------+--------+-----------+------------+------------+-----------+------------+------------');

for(const vig of vigs){
  // CTEs agregadas por placa
  const agg = {};
  ctes.forEach(r => {
    const p = placaKey(r[2]); if(!p || vigDe(r[3])!==vig) return;
    const o = agg[p] || (agg[p] = {km:0, comb:0, resto:0});
    o.km += n2(r[25]); o.comb += n2(r[CTE_COMP.comb]);
    o.resto += ['arla','manut','pneu','recap','lubr','lavag'].reduce((a,k)=>a+n2(r[CTE_COMP[k]]),0);
  });
  // Base Remunerado por placa
  const rem = {};
  brem.forEach(r => {
    if(vigDe(r[0])!==vig) return;
    const p = placaKey(r[3]); if(!p) return;
    rem[p] = {
      comb:n2(r[REM_COMP.comb]), o:n2(r[14]),
      resto:['arla','manut','pneu','recap','lubr','lavag'].reduce((a,k)=>a+n2(r[REM_COMP[k]]),0)
    };
  });
  // médias ponderadas por km, só nas placas presentes nas duas bases
  let km=0, comb=0, resto=0, rc=0, rr=0, ro=0, np=0;
  Object.keys(agg).forEach(p => {
    const a = agg[p], b = rem[p];
    if(!b || !a.km) return;
    np++; km += a.km; comb += a.comb; resto += a.resto;
    rc += b.comb*a.km; rr += b.resto*a.km; ro += b.o*a.km;
  });
  if(!km){ console.log(`${vig} | (sem cruzamento)`); continue; }
  const f = v => v.toFixed(4).padStart(10);
  console.log(`${vig}  |${String(np).padStart(7)} |${f(comb/km)} |${f(rc/km)}  |${f(resto/km)} |${f(rr/km)} |` +
    `${f((comb+resto)/km)} |${f(ro/km)}`);
}

console.log('\nLeitura: "CTE comb" é o que o painel usa hoje (ΣS÷ΣZ). Se "CTE resto"');
console.log('bater com "Rem resto", os seis componentes não-combustível das duas');
console.log('bases são os mesmos e a única divergência real é o preço do diesel.');
