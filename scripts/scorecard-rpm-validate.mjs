// Valida o port do pipeline do Frota de Elite (Base RPM) para o Scorecard.
// Compara os ICs recalculados da Base RPM com a aba Consolidado ICs (mai/26)
// e confirma se jun/26 aparece. Roda via GitHub Actions (sandbox não alcança docs.google).
const SHEET_ID='1xGl1Xrk2sPS9zWghEuecFMNBHwmeLiZ02U-QpO8cDPY';
const BASE_RPM_URL=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const ICS_URL=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent('Consolidado ICs')}&tqx=out:json`;

const UNI_LIST=['CDD CAMBORIU','CDD CUIABA','CDD FLORIANOPOLIS','CDD GUARULHOS','CDD NOVA FRIBURGO','CDD PELOTAS','CDD RIO DE JANEIRO','CDD RONDONOPOLIS','CDI MACACU','CUIABA','CUIABA EMPURRADA','MACACU EMPURRADA','PIRAI EMPURRADA'];
const UNI_SET=new Set(UNI_LIST);
const RPM_WEIGHTS={'IC: % de Disponibilidade Equipamentos':20,'IC: % de Aderência às Preventivas':15,'IC: Consumo Km/l':10,'IC: % de Aderência às Aferições':10,'IC: Aderência ao Checklist - T1 e T2':10,'IC: Aderência ao Checklist - Apoio':10,'IC: % de conformidade da Frota':5,'IC: Aderência ao Stress Test - Caminhões':5,'IC: Aderência ao Stress Test - Empilhadeiras':5,'IC: SLA de atendimento':5,'IC: Aderência à Conformidade':5};
const RPM_ORDER=Object.keys(RPM_WEIGHTS);
const RPM_FIELD_RAW={'IC: % de Disponibilidade Equipamentos':'disp','IC: % de Aderência às Preventivas':'prev','IC: Consumo Km/l':'comb','IC: % de Aderência às Aferições':'pneus','IC: Aderência ao Checklist - T1 e T2':'checkT','IC: Aderência ao Checklist - Apoio':'checkWH','IC: % de conformidade da Frota':'conf','IC: Aderência ao Stress Test - Caminhões':'stVeic','IC: Aderência ao Stress Test - Empilhadeiras':'stEmp','IC: SLA de atendimento':'civf','IC: Aderência à Conformidade':'sla'};
function rpmNorm(s){let str=String(s||''),cleaned='';for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);if(c>=0x200B&&c<=0x200D)continue;if(c===0xFEFF)continue;if(c===0x00A0){cleaned+=' ';continue;}cleaned+=str.charAt(i);}const nfd=cleaned.trim().toLowerCase().normalize('NFD');let res='';for(let j=0;j<nfd.length;j++){const cc=nfd.charCodeAt(j);if(cc>=0x0300&&cc<=0x036F)continue;if(cc===0xFF1A){res+=':';continue;}res+=nfd.charAt(j);}return res.replace(/\s+/g,' ');}
const RPM_FIELD={},RPM_CANON={};Object.entries(RPM_FIELD_RAW).forEach(([k,v])=>RPM_FIELD[rpmNorm(k)]=v);RPM_ORDER.forEach(k=>RPM_CANON[rpmNorm(k)]=k);
function rpmToNum(v){if(v==null)return null;let s=String(v).trim();if(!s||s==='—'||s==='-'||s==='null')return null;s=s.replace('%','').trim().replace(/\./g,'').replace(',','.');const n=parseFloat(s);return Number.isNaN(n)?null:n;}
function rpmScore(icVals){let num=0,den=0;for(const nm of RPM_ORDER){const w=(RPM_WEIGHTS[nm]||0)/100,kN=rpmNorm(nm);let v=icVals.get(kN);if(v==null)continue;den+=w;let v01=v/100;if(v01>1)v01=1;num+=w*v01;}return den<=0?null:(num/den)*100;}
const _MES={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
function rpmVigYMD(v){if(v==null)return null;const s=String(v).trim();let m=s.match(/Date\((\d+),(\d+),(\d+)/);if(m)return[+m[1],+m[2],+m[3]];m=s.toLowerCase().match(/([a-zç]{3,})\.?[\s/\-]+(\d{4})/);if(m&&_MES[m[1].slice(0,3)])return[+m[2],_MES[m[1].slice(0,3)]-1,1];m=s.match(/^(\d{4})-(\d{2})/);if(m)return[+m[1],+m[2]-1,1];if(s.includes('/')){const p=s.split('/');if(p.length>=3){const y=p[2].length===4?+p[2]:+p[0];const mo=+p[1];const d=p[2].length===4?+p[0]:+p[2];return[y,mo-1,d||1];}if(p.length===2){const a=p[0].trim(),b=p[1].trim();if(b.length===4)return[+b,+a-1,1];if(a.length===4)return[+a,+b-1,1];}}return null;}
function parseCSV(text){const rows=[];let row=[],cur='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c!=='\r')cur+=c;}if(cur!==''||row.length){row.push(cur);rows.push(row);}return rows;}
function pivotRPM(grid){
  if(!grid.length)return[];
  const header=grid[0].map(s=>String(s).trim()),H={};header.forEach((h,i)=>{H[rpmNorm(h)]=i;});
  const col=(...ns)=>{for(const n of ns){const k=rpmNorm(n);if(k in H)return H[k];}return -1;};
  const iUni=col('Unidade'),iVig=col('Vigência','Vigencia'),iKpi=col('KPI'),iAt=col('% de Ating.','% de Ating','% Ating.','% Ating');
  if(iUni<0||iVig<0||iKpi<0||iAt<0){console.log('  !! colunas faltando',{iUni,iVig,iKpi,iAt,header});return[];}
  const combos=new Map();
  for(let r=1;r<grid.length;r++){const row=grid[r];const kpiN=rpmNorm(row[iKpi]);if(!(kpiN in RPM_CANON))continue;const at=rpmToNum(row[iAt]);if(at==null)continue;const ymd=rpmVigYMD(row[iVig]);if(!ymd)continue;const unit=String(row[iUni]||'').trim().toUpperCase();if(!UNI_SET.has(unit))continue;const key=ymd.join('-')+'||'+unit;if(!combos.has(key))combos.set(key,{ymd,unit,icVals:new Map(),fields:{}});const o=combos.get(key);o.icVals.set(kpiN,at);o.fields[RPM_FIELD[kpiN]]=at;}
  const out=[];
  for(const o of combos.values()){const f=o.fields,gv=k=>(f[k]==null?null:f[k]/100);
    out.push({ymd:o.ymd,unidade:o.unit,ic:[gv('disp'),gv('prev'),gv('comb'),gv('pneus'),gv('checkT'),gv('checkWH'),gv('conf'),gv('stVeic'),gv('stEmp'),gv('civf'),gv('sla')],pont:rpmScore(o.icVals)});}
  return out;
}
const IC_LABELS=['Disp','Prev','Comb','Pneus','ChkT','ChkWH','Conf','StCam','StEmp','SLA(civf)','Conf(sla)'];
const f2=v=>v==null?'—':(v*100).toFixed(1);

const csv=await fetch(BASE_RPM_URL).then(r=>r.text());
const rpm=pivotRPM(parseCSV(csv));
console.log('== BASE RPM ==');
console.log('linhas pivotadas (unidade×vigência):',rpm.length);
const vigs=[...new Set(rpm.map(o=>o.ymd[0]*100+o.ymd[1]))].sort((a,b)=>a-b);
console.log('vigências (YYYYMM):',vigs.join(', '));
console.log('jun/2026 presente?', vigs.includes(202605) ? 'SIM (mês índice 5 = junho)' : 'NÃO');
// amostra mai/26 (mês índice 4) — 2 unidades
const sample=['CDD CAMBORIU','CDD GUARULHOS'];
console.log('\n== Amostra mai/26 (Base RPM recalculado) ==');
for(const u of sample){const o=rpm.find(x=>x.ymd[0]===2026&&x.ymd[1]===4&&x.unidade===u);if(!o){console.log(u,'-> sem linha');continue;}console.log(u,'pont=',o.pont?.toFixed(2),'| '+IC_LABELS.map((l,i)=>l+'='+f2(o.ic[i])).join(' '));}

// Consolidado ICs (gviz) p/ comparar mai/26
function gvParse(txt){const s=txt.indexOf('{'),e=txt.lastIndexOf('}');return JSON.parse(txt.slice(s,e+1));}
const icsTxt=await fetch(ICS_URL).then(r=>r.text());
const icsJ=gvParse(icsTxt);
const rows=(icsJ.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
console.log('\n== Consolidado ICs (mai/26) p/ comparar ==');
for(const u of sample){
  const r=rows.find(rr=>{const d=String(rr[0]||'').match(/Date\((\d+),(\d+),/);return d&&+d[1]===2026&&+d[2]===4&&String(rr[1]||'').trim().toUpperCase()===u;});
  if(!r){console.log(u,'-> sem linha no ICS');continue;}
  const ic=[2,3,4,5,6,7,8,9,10,11,12].map(c=>r[c]!=null?+r[c]:null);
  console.log(u,'pont=',(r[13]!=null?(+r[13]).toFixed(2):'—'),'| '+IC_LABELS.map((l,i)=>l+'='+f2(ic[i])).join(' '));
}
console.log('\nFIM.');
