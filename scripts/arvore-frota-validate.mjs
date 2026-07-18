// Valida a Árvore de Custo da Frota (painel /arvore-frota/).
// Reproduz o compute do painel: custo por conta/pacote/total (aba Frota),
// receita líquida (aba Receita Líquida), km + frota ativa (aba Dispersão de km).
// Escopo: só Transportes (exclui projeto "Apoio").
const VF='1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8'; // Frota + Receita Líquida
const GV='1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM'; // Dispersão de km

async function gviz(sid,tab){
  const url=`https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?sheet=${encodeURIComponent(tab)}&headers=1&tqx=out:json`;
  const raw=await (await fetch(url)).text();
  const json=JSON.parse(raw.replace(/^[\s\S]*?setResponse\(/, '').replace(/\);?\s*$/, ''));
  const cols=(json.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
  let rows=(json.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
  if(cols.every(c=>!c)&&rows.length){ const h=rows[0].map(v=>String(v==null?'':v)); rows=rows.slice(1); return {cols:h,rows}; }
  return {cols,rows};
}
const fi=(cols,...t)=>{for(let i=0;i<cols.length;i++){const lc=String(cols[i]||'').toLowerCase();if(t.some(x=>lc.includes(x)))return i;}return -1;};
const fb=(i,d)=>i>=0?i:d;
const nk=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const pre=v=>v?String(v).split('-')[0].trim():v;
const isApoio=n3=>nk(pre(n3))==='APOIO';
const MMAP={jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};
function parseVig(v){
  if(!v)return null;
  if(v instanceof Date)return new Date(v.getFullYear(),v.getMonth(),1);
  if(typeof v==='string'){
    const g=v.match(/^Date\((\d+),(\d+)/);if(g)return new Date(+g[1],+g[2],1);
    const m1=v.match(/^([a-zà-ú]+)\.?\/(\d{4})$/i);if(m1){const mo=MMAP[m1[1].toLowerCase().slice(0,3)];if(mo!==undefined)return new Date(+m1[2],mo,1);}
    const m2=v.match(/^(\d{1,2})\/(\d{4})$/);if(m2)return new Date(+m2[2],+m2[1]-1,1);
  }
  if(typeof v==='number'){const d=new Date(1899,11,30);d.setDate(d.getDate()+Math.round(v));return new Date(d.getFullYear(),d.getMonth(),1);}
  return null;
}
const vigBR=d=>`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
const PACOTES_MAP={
  'Combustíveis Veiculos e Equipamentos':'Combustíveis','Combustíveis':'Combustíveis',
  'Estorno de ICMS não Aproveitado':'Combustíveis','Fluídos (Arla)':'Combustíveis',
  'Arla':'Combustíveis','ICMS Crédito Presumido':'Combustíveis',
  'Manutenção de Veículos e Equipamentos':'Manutenções','Manutenção de Veículos e Equip.':'Manutenções',
  'Materiais e Ferramentas de Oficina':'Manutenções','Lavação de Veículos':'Manutenções',
  'Manutenção de Carrocerias':'Manutenções','Personalização/Padronização de Veículos':'Manutenções',
  'Personalização/Padronização':'Manutenções','Personalização e Padronização de Veículos':'Manutenções',
  'Contratos de Manutenção Fabricante':'Manutenções','Consertos e Recapagens de Pneus':'Pneus',
  'Pneus e Camaras':'Pneus','Recapagens e Outros Serviços':'Pneus','Pneus Novos':'Pneus',
  'IPVA e Licenciamento de Veículos':'Seguros e licenças','IPVA e Licenciamento':'Seguros e licenças',
  'Seguro de Veículos e Equipamentos':'Seguros e licenças','Seguros':'Seguros e licenças',
};
const PAC_ORDER=['Seguros e licenças','Pneus','Manutenções','Combustíveis'];
const fmt=v=>{const a=Math.abs(v);return (v<0?'-':'')+(a>=1e6?(a/1e6).toFixed(2)+'mi':a>=1e3?(a/1e3).toFixed(1)+'k':Math.round(a));};

async function main(){
  const [fr,re,dp]=await Promise.all([gviz(VF,'Frota'),gviz(VF,'Receita Líquida'),gviz(GV,'Dispersão de km')]);
  console.log(`linhas: Frota=${fr.rows.length} Receita=${re.rows.length} Dispersão=${dp.rows.length}`);

  const FR={vig:0,rem:fb(fi(fr.cols,'remunerado'),1),real:fb(fi(fr.cols,'realizado'),2),cta:fb(fi(fr.cols,'conta gerencial','conta'),12),n3:fb(fi(fr.cols,'nível 3','nivel 3'),11)};
  const RE={vig:0,rem:fb(fi(re.cols,'remunerado'),1),real:fb(fi(re.cols,'realizado'),2),n3:fb(fi(re.cols,'nível 3','nivel 3'),11)};
  const detAtiva=cols=>{ for(let i=0;i<cols.length;i++){ const lc=String(cols[i]||'').toLowerCase(); if(lc.includes('frota ativa')&&!lc.includes('km')&&!lc.includes('/')&&!lc.includes('%')) return i; } return 21; };
  const DP={vig:0,proj:fb(fi(dp.cols,'proj.','projeto'),14),kmRem:fb(fi(dp.cols,'km rem. tt'),31),kmReal:fb(fi(dp.cols,'km rodado tt'),32),ativa:detAtiva(dp.cols)};
  console.log('col21 header =',JSON.stringify(dp.cols[21]),'| ativa detectada =',DP.ativa,'->',JSON.stringify(dp.cols[DP.ativa]));
  console.log('\n== COLUNAS DETECTADAS ==');
  console.log('Frota   ',FR,'->',{rem:fr.cols[FR.rem],real:fr.cols[FR.real],cta:fr.cols[FR.cta],n3:fr.cols[FR.n3]});
  console.log('Receita ',RE,'->',{rem:re.cols[RE.rem],real:re.cols[RE.real],n3:re.cols[RE.n3]});
  console.log('Dispersão',DP,'->',{proj:dp.cols[DP.proj],kmRem:dp.cols[DP.kmRem],kmReal:dp.cols[DP.kmReal],ativa:dp.cols[DP.ativa]});

  const projsFR=[...new Set(fr.rows.map(r=>pre(r[FR.n3])).filter(Boolean))].sort();
  const projsDP=[...new Set(dp.rows.map(r=>pre(r[DP.proj])).filter(Boolean))].sort();
  console.log('\nProjetos Frota   :',projsFR.join(' | '));
  console.log('Projetos Dispersão:',projsDP.join(' | '));

  const vigsFR=[...new Set(fr.rows.filter(r=>{const c=String(r[FR.cta]||'');return PACOTES_MAP[c]&&!isApoio(r[FR.n3])&&((+r[FR.rem]||0)||(+r[FR.real]||0));}).map(r=>{const d=parseVig(r[FR.vig]);return d?vigBR(d):null;}).filter(Boolean))];
  vigsFR.sort((a,b)=>{const[ma,ya]=a.split('/'),[mb,yb]=b.split('/');return(ya-yb)||(ma-mb);});
  const V=vigsFR[vigsFR.length-1];
  console.log(`\n== VIGÊNCIAS com custo: ${vigsFR.join(', ')} → default=${V} ==`);

  const mt=(vigStr,n3)=>vigStr===V&&!isApoio(n3);

  const contas={};
  for(const r of fr.rows){ const c=String(r[FR.cta]||''); const pac=PACOTES_MAP[c]; if(!pac)continue; const d=parseVig(r[FR.vig]); if(!d)continue; if(!mt(vigBR(d),r[FR.n3]))continue; if(!contas[c])contas[c]={pac,rem:0,real:0}; contas[c].rem+=+r[FR.rem]||0; contas[c].real+=+r[FR.real]||0; }
  let recRem=0,recReal=0; for(const r of re.rows){ const d=parseVig(r[RE.vig]); if(!d)continue; if(!mt(vigBR(d),r[RE.n3]))continue; recRem+=+r[RE.rem]||0; recReal+=+r[RE.real]||0; }
  let kmRem=0,kmReal=0,ativa=0; for(const r of dp.rows){ const d=parseVig(r[DP.vig]); if(!d)continue; if(!mt(vigBR(d),r[DP.proj]))continue; kmRem+=+r[DP.kmRem]||0; kmReal+=+r[DP.kmReal]||0; ativa+=+r[DP.ativa]||0; }

  const kmProjSet=new Set(dp.rows.filter(r=>{const d=parseVig(r[DP.vig]);return d&&vigBR(d)===V&&((+r[DP.kmReal]||0)||(+r[DP.kmRem]||0));}).map(r=>nk(pre(r[DP.proj]))));
  console.log('\n== COBERTURA KM (vigência '+V+') ==');
  console.log('Projetos COM km:',[...kmProjSet].join(', '));
  let comKm=0,semKm=0; const semKmProj={};
  for(const r of fr.rows){ const c=String(r[FR.cta]||''); if(!PACOTES_MAP[c])continue; const d=parseVig(r[FR.vig]); if(!d||vigBR(d)!==V||isApoio(r[FR.n3]))continue; const p=nk(pre(r[FR.n3])); const val=+r[FR.real]||0; if(kmProjSet.has(p))comKm+=val; else {semKm+=val; semKmProj[p]=(semKmProj[p]||0)+val;} }
  console.log(`Custo Real em projetos COM km: ${fmt(comKm)}  |  SEM km: ${fmt(semKm)}`);
  console.log('Custo SEM km por projeto:',Object.entries(semKmProj).filter(([,v])=>Math.abs(v)>1000).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).map(([p,v])=>`${p}=${fmt(v)}`).join(' | '));

  console.log('\n== RAIZ ==');
  const totRem=Object.values(contas).reduce((a,c)=>a+c.rem,0), totReal=Object.values(contas).reduce((a,c)=>a+c.real,0);
  console.log(`Custo Total : Rem=${fmt(totRem)}  Real=${fmt(totReal)}`);
  console.log(`Receita Líq.: Rem=${fmt(recRem)}  Real=${fmt(recReal)}`);
  console.log(`Km Rodado   : Rem=${fmt(kmRem)}  Real=${fmt(kmReal)}`);
  console.log(`Frota Ativa : ${ativa}`);

  console.log('\n== PACOTES / CONTAS  (R$/km real · AV real) ==');
  for(const pn of PAC_ORDER){
    const cs=Object.entries(contas).filter(([,c])=>c.pac===pn).sort((a,b)=>Math.abs(b[1].real)-Math.abs(a[1].real));
    if(!cs.length)continue;
    const pr=cs.reduce((a,[,c])=>a+c.rem,0), prl=cs.reduce((a,[,c])=>a+c.real,0);
    console.log(`\n▸ ${pn}: Rem=${fmt(pr)} Real=${fmt(prl)}`);
    for(const [nm,c] of cs){
      const rkm=kmReal?(c.real/kmReal).toFixed(2):'—';
      const rat=ativa?Math.round(c.real/ativa):'—';
      const av=recReal?(Math.abs(c.real/recReal)*100).toFixed(1)+'%':'—';
      console.log(`   · ${nm.padEnd(42)} Rem=${fmt(c.rem).padStart(9)} Real=${fmt(c.real).padStart(9)}  R$/km=${rkm}  R$/ativa=${rat}  AV=${av}`);
    }
  }
}
main().catch(e=>{console.error('ERRO',e);process.exit(1);});
