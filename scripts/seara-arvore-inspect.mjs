// Inspeção p/ montar a Árvore de Combustível Seara (ANHANGUERA).
// Descobre: (1) ANHANGUERA existe como unidade nas abas compartilhadas?
//           (2) o que há no workbook Seara (Base Remunerado, Base CTEs, Combustível)?
const VF_ID='1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8'; // Frota (custo)
const GV_ID='1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM'; // Dispersão de km, R$/L
const KML_ID='1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A'; // Km/L
const SEARA_ID='1Rlwc0MZiupQI38gSN8VyBq_zMADgX9R_ZbfygNP-OXE';
const GID_REM=0, GID_CTES=1672208132, GID_COMB=1982300845;

async function gviz(id, {tab, gid, tq}={}){
  const parts=[];
  if(tab) parts.push(`sheet=${encodeURIComponent(tab)}`);
  if(gid!=null) parts.push(`gid=${gid}`);
  if(tq) parts.push(`tq=${encodeURIComponent(tq)}`);
  parts.push('headers=1','tqx=out:json');
  const url=`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${parts.join('&')}`;
  const raw=await (await fetch(url)).text();
  const j=JSON.parse(raw.replace(/^[\s\S]*?setResponse\(/,'').replace(/\);?\s*$/,''));
  if(j.status!=='ok') throw new Error((j.errors&&j.errors[0]&&j.errors[0].message)||'gviz err');
  let cols=(j.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
  let rows=(j.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
  if(cols.every(c=>!c||/^[A-Z]{1,3}$/.test(c))&&rows.length){cols=rows[0].map(v=>String(v==null?'':v));rows=rows.slice(1);}
  return {cols,rows};
}
const up=s=>String(s==null?'':s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
const suf=v=>{const s=String(v||'');const i=s.indexOf('-');return i>=0?s.slice(i+1).trim():'';};
const fmt=v=>Math.abs(v)>=1e3?(v/1e3).toFixed(1)+'k':(+v).toFixed(1);

async function main(){
  // ── 1) FROTA (custo) — unidades distintas + achar ANHANGUERA/SEARA ──
  console.log('═══ FROTA (VF_ID) ═══');
  const fr=await gviz(VF_ID,{tab:'Frota'});
  console.log('cols:', fr.cols.map((c,i)=>i+':'+c).join(' | '));
  const ctaI=fr.cols.findIndex(c=>/conta gerencial/i.test(c));
  const n3I=fr.cols.findIndex(c=>/n[íi]vel 3/i.test(c));
  const remI=fr.cols.findIndex(c=>/remunerado/i.test(c));
  const realI=fr.cols.findIndex(c=>/realizado/i.test(c));
  console.log(`idx cta=${ctaI} n3=${n3I} rem=${remI} real=${realI}`);
  const unisFr=[...new Set(fr.rows.map(r=>suf(r[n3I])).filter(Boolean))].sort();
  console.log('Unidades (sufixo nível3) FROTA:', unisFr.join(' · '));
  const anh=unisFr.filter(u=>/ANHANG|SEARA/i.test(u));
  console.log('→ candidatos Seara/Anhanguera:', anh.join(' · ')||'(nenhum)');

  // ── 2) DISPERSÃO DE KM ──
  console.log('\n═══ DISPERSÃO DE KM (GV_ID) ═══');
  const dp=await gviz(GV_ID,{tab:'Dispersão de km'});
  console.log('cols:', dp.cols.map((c,i)=>i+':'+c).join(' | '));
  const dpProjI=dp.cols.findIndex(c=>/proj\./i.test(c));
  const unisDp=[...new Set(dp.rows.map(r=>suf(r[dpProjI])).filter(Boolean))].sort();
  console.log('Unidades DISPERSÃO:', unisDp.join(' · '));
  console.log('→ Seara/Anhanguera na Dispersão:', unisDp.filter(u=>/ANHANG|SEARA/i.test(u)).join(' · ')||'(nenhum)');

  // ── 3) KM/L ──
  console.log('\n═══ KM/L (KML_ID) ═══');
  const km=await gviz(KML_ID,{tab:'Km/L'});
  console.log('cols:', km.cols.map((c,i)=>i+':'+c).join(' | '));
  const kmProjI=km.cols.findIndex(c=>/projeto/i.test(c));
  const unisKm=[...new Set(km.rows.map(r=>suf(r[kmProjI])).filter(Boolean))].sort();
  console.log('Unidades KM/L:', unisKm.join(' · '));
  console.log('→ Seara/Anhanguera no Km/L:', unisKm.filter(u=>/ANHANG|SEARA/i.test(u)).join(' · ')||'(nenhum)');

  // ── 4) R$/L ──
  console.log('\n═══ R$/L (GV_ID) ═══');
  const rl=await gviz(GV_ID,{tab:'R$/L'});
  console.log('cols:', rl.cols.map((c,i)=>i+':'+c).join(' | '));
  const rlUniI=rl.cols.findIndex(c=>/unidade benner/i.test(c));
  const unisRl=rlUniI>=0?[...new Set(rl.rows.map(r=>up(r[rlUniI])).filter(Boolean))].sort():[];
  console.log('Unidade benner R$/L:', unisRl.join(' · '));
  console.log('→ Seara/Anhanguera no R$/L:', unisRl.filter(u=>/ANHANG|SEARA/i.test(u)).join(' · ')||'(nenhum)');

  // ── 5) WORKBOOK SEARA — headers das 3 abas ──
  console.log('\n═══ WORKBOOK SEARA ═══');
  for(const [name,gid] of [['Base Remunerado',GID_REM],['Base CTEs',GID_CTES],['Combustível',GID_COMB]]){
    try{
      const s=await gviz(SEARA_ID,{gid});
      console.log(`\n-- ${name} (gid=${gid}) — ${s.rows.length} linhas`);
      console.log('cols:', s.cols.map((c,i)=>i+':'+c).join(' | '));
      console.log('amostra linha0:', JSON.stringify(s.rows[0]));
    }catch(e){ console.log(`${name}: ERRO ${e.message}`); }
  }

  // ── 6) Base CTEs: tem colunas de rec/noturna/mapa (decomposição)? + meses ──
  console.log('\n═══ BASE CTEs — decomposição possível? ═══');
  const ct=await gviz(SEARA_ID,{gid:GID_CTES});
  ct.cols.forEach((c,i)=>{ if(/rec|notur|mapa|virad|1.?viag|primeira|tipo|desc|classif/i.test(c)) console.log(`  col ${i}: ${c}`); });
}
main().catch(e=>{console.error('FALHA:',e);process.exit(1);});
