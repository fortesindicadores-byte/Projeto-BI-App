// Diagnóstico: recalcula os ICs a partir da "Base RPM" e compara com a aba "Consolidado ICs".
// Roda no GitHub Actions (alcança docs.google). Descartável. Replica o Apps Script consolidarICs_RPM.
const SID='1xGl1Xrk2sPS9zWghEuecFMNBHwmeLiZ02U-QpO8cDPY';

const CFG={ CAP_AT_100:true, MISSING_AS_ZERO:false };
const SCORE_WEIGHTS_PCT={
  'IC: % de Disponibilidade Equipamentos':20,'IC: % de Aderência às Preventivas':15,'IC: Consumo Km/l':10,
  'IC: % de Aderência às Aferições':10,'IC: Aderência ao Checklist - T1 e T2':10,'IC: Aderência ao Checklist - Apoio':10,
  'IC: % de conformidade da Frota':5,'IC: Aderência ao Stress Test - Caminhões':5,'IC: Aderência ao Stress Test - Empilhadeiras':5,
  'IC: SLA de atendimento':5,'IC: Aderência à Conformidade':5
};
const SCORE_ORDER=Object.keys(SCORE_WEIGHTS_PCT);

// ── helpers (iguais ao Apps Script) ──
function normKey_(s){ let str=String(s||''),cleaned='';
  for(let i=0;i<str.length;i++){ const c=str.charCodeAt(i);
    if(c>=0x200B&&c<=0x200D)continue; if(c===0xFEFF)continue; if(c===0x00A0){cleaned+=' ';continue;} cleaned+=str.charAt(i); }
  const nfd=cleaned.trim().toLowerCase().normalize('NFD'); let res='';
  for(let j=0;j<nfd.length;j++){ const cc=nfd.charCodeAt(j); if(cc>=0x0300&&cc<=0x036F)continue; if(cc===0xFF1A){res+=':';continue;} res+=nfd.charAt(j); }
  return res.replace(/\s+/g,' '); }
function toNumber_(v){ if(v===''||v===null||v===undefined)return null; if(typeof v==='number')return v;
  if(typeof v==='string'){ let s=v.trim(); if(!s||s==='—'||s==='-')return null; const isPct=s.includes('%'); s=s.replace('%','').trim();
    s=s.replace(/\./g,'').replace(',','.'); const n=Number(s); if(Number.isNaN(n))return null; return isPct?(n/100):n; } return null; }
const startsWithIC_=k=>String(k||'').trim().toUpperCase().startsWith('IC:');
function calcScore_(vals){ let num=0,den=0;
  for(const kpi of SCORE_ORDER){ const w=(Number(SCORE_WEIGHTS_PCT[kpi])||0)/100; const kN=normKey_(kpi); let v=vals.get(kN);
    if(v===undefined||v===null||v===''){ if(CFG.MISSING_AS_ZERO){ v=0; den+=w; } else continue; } else den+=w;
    v=toNumber_(v); if(v===null)v=0; if(CFG.CAP_AT_100&&v>1)v=1; num+=w*v; }
  if(den<=0)return 0; return (num/den)*100; }

// chave de vigência comparável (aceita Date(...), número serial, dd/mm/aaaa, aaaa-mm)
function vigKey(v){ if(v==null)return ''; const s=String(v);
  let m=s.match(/Date\((\d+),(\d+),(\d+)/); if(m)return `${m[1]}-${String(+m[2]+1).padStart(2,'0')}`;
  if(s.includes('/')){ const p=s.split('/'); if(p.length>=3){ const y=p[2].length===4?p[2]:p[0]; const mo=p[1]; return `${y}-${String(+mo).padStart(2,'0')}`; } }
  m=s.match(/^(\d{4})-(\d{2})/); if(m)return `${m[1]}-${m[2]}`;
  return s.trim(); }

// parser CSV (aspas, vírgulas e quebras de linha dentro de campos)
function parseCSV(text){
  const rows=[]; let row=[], cur='', q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else if(c==='"') q=true;
    else if(c===','){ row.push(cur); cur=''; }
    else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; }
    else if(c!=='\r') cur+=c;
  }
  if(cur!==''||row.length){ row.push(cur); rows.push(row); }
  return rows;
}
async function fetchCSV(url){
  const res=await fetch(url); const raw=await res.text();
  const all=parseCSV(raw);
  return {status:res.status,len:raw.length,all};
}
// gviz auto-detecta só o 1o bloco (para na 1a linha em branco → 156 linhas).
// range=A1:M100000 força a leitura da grade inteira, ignorando o auto-detect.
async function gviz(tab){
  const base=`https://docs.google.com/spreadsheets/d/${SID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const r=await fetchCSV(`${base}&range=A1:M100000`);
  const header=(r.all[0]||[]).map(s=>String(s).trim());
  const rows=r.all.slice(1);
  return {header,rows}; }
function idxByHeader(header){ const idx={}; header.forEach((h,i)=>{ idx[normKey_(h)]=i; }); return idx; }
function getIdx(idx,cands){ for(const c of cands){ const k=normKey_(c); if(k in idx)return idx[k]; } return -1; }

async function main(){
  // ── PROBE: qual método traz a grade inteira? ──
  const gb=`https://docs.google.com/spreadsheets/d/${SID}/gviz/tq?tqx=out:csv&sheet=Base%20RPM`;
  const noRange=await fetchCSV(gb);
  const wRange=await fetchCSV(`${gb}&range=A1:M100000`);
  console.log(`PROBE gviz sem range: status=${noRange.status} linhas=${noRange.all.length}`);
  console.log(`PROBE gviz com range A1:M100000: status=${wRange.status} linhas=${wRange.all.length}`);
  const hv=await fetch(`https://docs.google.com/spreadsheets/d/${SID}/htmlview`);
  const html=await hv.text();
  console.log(`PROBE htmlview: status=${hv.status} len=${html.length} temBaseRPM=${html.includes('Base RPM')} temGid=${/gid[=":]/.test(html)}`);
  const gidHits=[...html.matchAll(/gid["=: ]+"?(\d{2,})"?/g)].slice(0,10).map(m=>m[1]);
  console.log(`PROBE gids no htmlview:`, gidHits.join(',')||'(nenhum)');
  const bi=html.indexOf('Base RPM');
  if(bi>=0) console.log(`PROBE trecho htmlview em torno de "Base RPM":`, html.slice(Math.max(0,bi-120),bi+80).replace(/\s+/g,' '));
  console.log('--- fim PROBE ---\n');

  const src=await gviz('Base RPM');
  const idx=idxByHeader(src.header);
  const iVig=getIdx(idx,['Vigência','Vigencia']), iUni=getIdx(idx,['Unidade']), iKpi=getIdx(idx,['KPI']),
        iAt=getIdx(idx,['% de Ating.','% de Ating','% Ating.','% Ating']);
  console.log('Base RPM cols:', src.header.join(' | '));
  console.log('idx -> Vig',iVig,'Uni',iUni,'KPI',iKpi,'Ating',iAt);
  const canon=new Map(); SCORE_ORDER.forEach(k=>canon.set(normKey_(k),k));

  console.log(`\n--- DEBUG: total de linhas do gviz = ${src.rows.length} ---`);
  const totIC=src.rows.filter(r=>startsWithIC_(r[iKpi])).length;
  const totAt=src.rows.filter(r=>startsWithIC_(r[iKpi])&&toNumber_(r[iAt])!==null).length;
  console.log(`linhas com KPI "IC:" = ${totIC} · dessas com % de Ating preenchido = ${totAt}`);
  console.log('primeiras 30 linhas [Uni | Vig | KPI | ating]:');
  src.rows.slice(0,30).forEach((r,i)=>{
    console.log(`  ${i}: uni="${r[iUni]}" vig="${r[iVig]}" kpi="${String(r[iKpi]||'').slice(0,42)}" at="${r[iAt]}"`);
  });
  console.log('--- fim debug ---\n');

  const pivot=new Map();
  for(const row of src.rows){
    const kpiRaw=String(row[iKpi]||'').trim(); if(!startsWithIC_(kpiRaw))continue;
    const at=toNumber_(row[iAt]); if(at===null)continue;
    const kN=normKey_(kpiRaw); if(!canon.has(kN))continue;
    const key=`${vigKey(row[iVig])}||${normKey_(row[iUni])}`;
    if(!pivot.has(key))pivot.set(key,{vig:row[iVig],uni:row[iUni],vals:new Map()});
    pivot.get(key).vals.set(kN,at);
  }
  // recomputado
  const rec=new Map();
  for(const [k,o] of pivot){ rec.set(k,{ score:calcScore_(o.vals), vals:o.vals, vig:o.vig, uni:o.uni }); }

  // atual (Consolidado ICs)
  const cons=await gviz('Consolidado ICs');
  const ch=cons.header, cIdx=idxByHeader(ch);
  const cVig=getIdx(cIdx,['Vigência','Vigencia']), cUni=getIdx(cIdx,['Unidade']), cScore=getIdx(cIdx,['Pontuação Total','Pontuacao Total']);
  const icCols=SCORE_ORDER.map(ic=>getIdx(cIdx,[ic]));
  const cur=new Map();
  for(const row of cons.rows){ if(row[cVig]==null&&row[cUni]==null)continue;
    const key=`${vigKey(row[cVig])}||${normKey_(row[cUni])}`;
    const vals=new Map(); SCORE_ORDER.forEach((ic,i)=>{ const c=icCols[i]; if(c>=0){ const n=toNumber_(row[c]); if(n!==null)vals.set(normKey_(ic),n);} });
    cur.set(key,{ score:cScore>=0?toNumber_(row[cScore]):null, vals });
  }

  console.log(`\nlinhas: recomputado ${rec.size} · consolidado ${cur.size}`);
  // comparação
  let okScore=0, difScore=0, faltando=0, extra=0, difIC=0;
  const amostras=[];
  const allKeys=new Set([...rec.keys(),...cur.keys()]);
  for(const key of allKeys){
    const a=rec.get(key), b=cur.get(key);
    if(!a){ extra++; if(amostras.length<8)amostras.push(`SÓ no consolidado: ${key}`); continue; }
    if(!b){ faltando++; if(amostras.length<8)amostras.push(`SÓ no recomputado: ${key}`); continue; }
    const ds=Math.abs((a.score||0)-(b.score||0));
    if(ds<=0.02) okScore++; else { difScore++; if(amostras.length<12)amostras.push(`SCORE dif ${ds.toFixed(3)} em ${key}: rec ${a.score.toFixed(2)} × cons ${(b.score||0).toFixed(2)}`); }
    // ICs
    for(const ic of SCORE_ORDER){ const kN=normKey_(ic); const va=a.vals.get(kN), vb=b.vals.get(kN);
      if(va==null&&vb==null)continue;
      if(va==null||vb==null||Math.abs(va-vb)>0.0005){ difIC++; if(amostras.length<20)amostras.push(`IC dif [${ic}] ${key}: rec ${va==null?'—':(va*100).toFixed(2)+'%'} × cons ${vb==null?'—':(vb*100).toFixed(2)+'%'}`); }
    }
  }
  console.log(`\n=== RESULTADO ===`);
  console.log(`Pontuação: ${okScore} batem · ${difScore} divergem`);
  console.log(`Linhas só num lado: ${faltando} (só recomputado) · ${extra} (só consolidado)`);
  console.log(`Células de IC divergentes: ${difIC}`);
  if(amostras.length){ console.log('\n--- amostras ---'); amostras.forEach(s=>console.log('  '+s)); }
  else console.log('\n✅ TUDO BATE — recomputado da Base RPM == Consolidado ICs');
  console.log('\n=== FIM ===');
}
main().catch(e=>{ console.error('Falha:',e); process.exit(1); });
