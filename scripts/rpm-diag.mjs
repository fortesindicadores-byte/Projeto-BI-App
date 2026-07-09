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

// chave de vigência comparável — aceita "jan./2026", "01/2026", "dd/mm/aaaa",
// Date(a,m,d), número serial e "aaaa-mm". Normaliza tudo para "aaaa-mm".
const _MESPT={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
function vigKey(v){ if(v==null)return ''; const s=String(v).trim();
  let m=s.match(/Date\((\d+),(\d+),(\d+)/); if(m)return `${m[1]}-${String(+m[2]+1).padStart(2,'0')}`;
  // "jan./2026", "janeiro 2026", "jan-2026" — mês por extenso/abreviado + ano
  m=s.toLowerCase().match(/([a-zç]{3,})\.?[\s/\-]+(\d{4})/);
  if(m && _MESPT[m[1].slice(0,3)]) return `${m[2]}-${String(_MESPT[m[1].slice(0,3)]).padStart(2,'0')}`;
  if(s.includes('/')){ const p=s.split('/');
    if(p.length>=3){ const y=p[2].length===4?p[2]:p[0]; const mo=p[1]; return `${y}-${String(+mo).padStart(2,'0')}`; }
    if(p.length===2){ // "MM/AAAA" ou "AAAA/MM"
      const a=p[0].trim(), b=p[1].trim();
      if(b.length===4) return `${b}-${String(+a).padStart(2,'0')}`;
      if(a.length===4) return `${a}-${String(+b).padStart(2,'0')}`;
    }
  }
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
// gviz trunca a Base RPM no 1o bloco (156 linhas) mesmo com range → inútil.
// O htmlview lista as abas como items.push({name: "X", pageUrl:"...gid=N", gid:"N", ...}).
// Com o gid, /export?format=csv&gid=N traz a grade inteira.
let _gids=null;
async function loadGids(){
  if(_gids)return _gids;
  const res=await fetch(`https://docs.google.com/spreadsheets/d/${SID}/htmlview`);
  const html=await res.text();
  const map={};
  const re=/items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g;
  let m;
  while((m=re.exec(html))){
    const name=m[1].replace(/\\u002f/gi,'/').replace(/\\"/g,'"').replace(/\\\\/g,'\\');
    map[name]=m[2];
  }
  _gids=map; return map;
}
async function gviz(tab){
  const gids=await loadGids();
  const gid=gids[tab];
  if(gid==null) throw new Error(`gid de "${tab}" não encontrado no htmlview. Abas: ${JSON.stringify(gids)}`);
  const r=await fetchCSV(`https://docs.google.com/spreadsheets/d/${SID}/export?format=csv&gid=${gid}`);
  const header=(r.all[0]||[]).map(s=>String(s).trim());
  const rows=r.all.slice(1);
  return {header,rows}; }
function idxByHeader(header){ const idx={}; header.forEach((h,i)=>{ idx[normKey_(h)]=i; }); return idx; }
function getIdx(idx,cands){ for(const c of cands){ const k=normKey_(c); if(k in idx)return idx[k]; } return -1; }

async function main(){
  // ── PROBE: método de leitura + CORS (o painel roda no navegador) ──
  const gids=await loadGids();
  const gid=gids['Base RPM'];
  console.log('PROBE abas→gid:', JSON.stringify(gids));
  const probe=async(nome,url)=>{
    const r=await fetch(url); const raw=await r.text();
    const rows=parseCSV(raw).length;
    console.log(`PROBE ${nome}: status=${r.status} linhas=${rows} ACAO=${r.headers.get('access-control-allow-origin')||'(ausente)'}`);
  };
  await probe('gviz CSV por NOME', `https://docs.google.com/spreadsheets/d/${SID}/gviz/tq?tqx=out:csv&sheet=Base%20RPM`);
  await probe('gviz CSV por GID ', `https://docs.google.com/spreadsheets/d/${SID}/gviz/tq?tqx=out:csv&gid=${gid}`);
  await probe('export CSV por GID', `https://docs.google.com/spreadsheets/d/${SID}/export?format=csv&gid=${gid}`);
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
  console.log('Consolidado cols:', ch.join(' | '));
  console.log('idx cons -> Vig',cVig,'Uni',cUni,'Score',cScore);
  console.log('primeiras 5 vig cons [raw -> vigKey]:');
  cons.rows.slice(0,5).forEach(r=>console.log(`  "${r[cVig]}" -> "${vigKey(r[cVig])}" | uni="${r[cUni]}"`));
  console.log('primeiras 5 keys recomputado:', [...rec.keys()].slice(0,5).join(' ; '));
  const cur=new Map();
  for(const row of cons.rows){ if(row[cVig]==null&&row[cUni]==null)continue;
    const key=`${vigKey(row[cVig])}||${normKey_(row[cUni])}`;
    const vals=new Map(); SCORE_ORDER.forEach((ic,i)=>{ const c=icCols[i]; if(c>=0){ const n=toNumber_(row[c]); if(n!==null)vals.set(normKey_(ic),n);} });
    cur.set(key,{ score:cScore>=0?toNumber_(row[cScore]):null, vals });
  }
  console.log('primeiras 5 keys consolidado:', [...cur.keys()].slice(0,5).join(' ; '));

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
