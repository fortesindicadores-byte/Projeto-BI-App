// ═══════════════════════════════════════════════════════════════════════════
// Farol Frota — núcleo (dados + render). Mapeamento por NOME de coluna,
// conforme o diagnóstico das abas (farol-frota/abas.html) de jul/2026.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL='https://lozwipoeacpvplgkrxkq.supabase.co';
const SUPABASE_KEY='sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';
const FAROL_SHEET_ID='1xOv7OJzErGV3vNCMOY_5O6px7vFvC990CW-1vGul5sY';
// Disponibilidade — mesma planilha do painel /disponibilidade/
const DISP_SHEET_ID='1oW3mss0pXVI6gaDU2z5cDAKvW40LWHCQXpanqSvb12o';
const DISP_META=93, DISP_SONHO=97;   // <93 vermelho · 93–97 amarelo · ≥97 verde
// Pneus — mesmo Supabase (Conlog) do painel /pneus/
const PNEUS_SB_URL='https://ewbzeqsneeylwkxtcpme.supabase.co';
const PNEUS_SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3YnplcXNuZWV5bHdreHRjcG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzY2MTcsImV4cCI6MjA5NzQ1MjYxN30.W8W6Yunt6Z8NB73qpOD8eqYlrsgMRgEG-siYsJFwDwE';
// branch_id (Prolog) → [código Farol, tier]  (2550 ANG fora do escopo Farol)
const PNEUS_BRANCH={1676:['MCC','T1'],1677:['MCC','T2'],37:['CGR',''],1906:['CBA','T1 WH'],1907:['CBA','T1'],1878:['CBA','T2'],20:['FLP',''],30:['GRL',''],24:['BLC',''],2517:['NFR',''],26:['PLT',''],38:['PIR',''],2277:['RON','']};

// ── unidades (código do portal → nome exibido) ──
const UNIDADES={
  'BLC':'Balneário Camboriú','CBA':'Cuiabá','CGR':'Campo Grande','FLP':'Florianópolis','GRL':'Guarulhos',
  'MCC':'Cachoeiras de Macacu','NFR':'Nova Friburgo','PIR':'Piraí','PLT':'Pelotas','RON':'Rondonópolis'
};
// nomes usados nas abas do Farol → código do portal (CDD/CDI, cidades e variações)
const FAROL2COD={
  'CDD CAMBORIU':'BLC','BALNEARIO CAMBORIU':'BLC',
  'CDD CUIABA':'CBA','CUIABA':'CBA','CUIABA EMPURRADA':'CBA',
  'CDD RIO DE JANEIRO':'CGR','CAMPO GRANDE':'CGR',
  'CDD FLORIANOPOLIS':'FLP','FLORIANOPOLIS':'FLP',
  'CDD GUARULHOS':'GRL','GUARULHOS':'GRL',
  'CDI MACACU':'MCC','MACACU EMPURRADA':'MCC','CACHOEIRAS DE MACACU':'MCC',
  'CDD NOVA FRIBURGO':'NFR','NOVA FRIBURGO':'NFR',
  'PIRAI EMPURRADA':'PIR','PIRAI':'PIR',
  'CDD PELOTAS':'PLT','PELOTAS':'PLT',
  'CDD RONDONOPOLIS':'RON','RONDONOPOLIS':'RON'
};

// ── helpers ──
const escF=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _n=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const codDe=nome=>FAROL2COD[_n(nome)]||null;
function parseD(v){if(v==null)return null;const m=String(v).match(/Date\((\d+),(\d+),(\d+)/);return m?new Date(+m[1],+m[2],+m[3]):null;}
function parseAnyD(v){const d=parseD(v);if(d)return d;const p=String(v||'').trim().split(/[\/\-]/);if(p.length>=3){const dd=+p[0]>31?new Date(+p[0],+p[1]-1,+p[2]):new Date(+p[2],+p[1]-1,+p[0]);if(!isNaN(dd))return dd;}return null;}
const fmtD=d=>d?d.toLocaleDateString('pt-BR'):'—';
const num=v=>{if(v==null||v==='')return null;if(typeof v==='number')return v;const f=parseFloat(String(v).replace(/\./g,'').replace(',','.'));return isNaN(f)?null:f;};
const brl=v=>{if(v==null||!isFinite(v))return '—';const a=Math.abs(v),s=v<0?'-':'';if(a>=1e6)return s+'R$ '+(a/1e6).toFixed(2).replace('.',',')+' mi';if(a>=1e3)return s+'R$ '+Math.round(a/1e3).toLocaleString('pt-BR')+'k';return s+'R$ '+Math.round(a).toLocaleString('pt-BR');};
const brlFull=v=>v==null||!isFinite(v)?'—':(v<0?'-':'')+Math.round(Math.abs(v)).toLocaleString('pt-BR');
const pct1=v=>v==null||!isFinite(v)?'—':(Math.round(v*10)/10).toLocaleString('pt-BR')+'%';
const clsPctMeta=(p,g=99.95,y=95)=>p==null?'mut':p>=g?'cg':p>=y?'cy':'cr';
const avgA=a=>{const v=a.filter(x=>x!=null&&isFinite(x));return v.length?v.reduce((s,x)=>s+x,0)/v.length:null;};
const sumA=a=>a.reduce((s,x)=>s+(isFinite(x)?x:0),0);

function gvizAny(sheetId,sheet){
  return new Promise((res,rej)=>{
    const fn='_fv'+Math.floor(Math.random()*1e9);const s=document.createElement('script');
    const clr=()=>{try{delete window[fn];s.remove();}catch(e){}};
    window[fn]=r=>{clr();try{if(r.status!=='ok')throw 0;
      let cols=(r.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
      let rows=(r.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
      if(cols.every(c=>!c)&&rows.length){cols=rows[0].map(v=>String(v==null?'':v));rows=rows.slice(1);}
      res({cols,rows});}catch(e){rej(e);}};
    s.onerror=()=>{clr();rej(0);};
    s.src=`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${encodeURIComponent(sheet)}&headers=1&tqx=out:json;responseHandler:${fn}`;
    document.head.appendChild(s);
    setTimeout(()=>{clr();rej('timeout');},20000);
  });
}
const gvizT=sheet=>gvizAny(FAROL_SHEET_ID,sheet);
function idxDe(cols,...names){const N=cols.map(_n);for(const nm of names){const i=N.indexOf(_n(nm));if(i>=0)return i;}for(const nm of names){const t=_n(nm);const i=N.findIndex(c=>c.includes(t));if(i>=0)return i;}return -1;}

// ── gate de admin ──
async function farolGate(){
  let sb;
  try{ sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY); }catch(e){ return {ok:false,msg:'Falha ao iniciar o Supabase.'}; }
  const {data:{session}}=await sb.auth.getSession();
  if(!session) return {ok:false,msg:'Entre pelo <b>hub</b> para acessar o Farol.'};
  const {data:prof}=await sb.from('fca_profiles').select('is_admin').eq('user_id',session.user.id).maybeSingle();
  if(!prof||!prof.is_admin) return {ok:false,msg:'O Farol é restrito aos administradores. As unidades recebem por e-mail (segunda, 14h).'};
  return {ok:true,sb,session};
}

// ═══════════════ CARGA E NORMALIZAÇÃO ═══════════════
const DATA={};
async function farolLoad(){
  const abas={custos:'Custos',stressV:'Stress Test Veículos',stressE:'Stress Test Empilhadeiras',cifv:'CIFV',prev:'Preventivas',alinh:'Alinhamentos',os:'OS em aberto'};
  const out=await Promise.all(Object.entries(abas).map(async([k,aba])=>{
    try{return [k,await gvizT(aba)];}catch(e){return [k,null];}
  }));
  const T={};out.forEach(([k,v])=>T[k]=v);

  // Custos: Δ ORÇ. | Δ FCT | Vigência | ESTRUTURA | UNIDADE | NÍVEL 3 | CONTA GERENCIAL | MÊS | ANO | ORÇADO | REMUNERADO | REALIZADO
  if(T.custos){const c=T.custos.cols;
    const i={vig:idxDe(c,'Vigência'),uni:idxDe(c,'UNIDADE'),n3:idxDe(c,'NÍVEL 3','NIVEL 3'),cta:idxDe(c,'CONTA GERENCIAL'),orc:idxDe(c,'ORÇADO','ORCADO'),rem:idxDe(c,'REMUNERADO'),rea:idxDe(c,'REALIZADO')};
    let rs=T.custos.rows.map(r=>({vig:parseD(r[i.vig]),cod:codDe(r[i.uni]),uni:String(r[i.uni]||'').trim(),n3:String(r[i.n3]||'').trim(),conta:String(r[i.cta]||'').trim(),orc:num(r[i.orc])||0,rem:num(r[i.rem])||0,rea:num(r[i.rea])||0})).filter(r=>r.conta);
    const mx=Math.max(...rs.map(r=>r.vig?r.vig.getTime():0));
    DATA.custos=rs.filter(r=>!r.vig||r.vig.getTime()===mx);
    DATA.custosVig=mx>0?new Date(mx):null;
  }
  // Stress Test Veículos: Período | Empresa | Filial Freightech | Placa Freightech | Freightech | Projeto | Pallets | Última Saída | Saída | Saída na FIlial | Total Viagens | Justificativa | Status | Desconto
  if(T.stressV){const c=T.stressV.cols;
    const i={per:idxDe(c,'Período','Periodo'),fil:idxDe(c,'Filial Freightech'),pla:idxDe(c,'Placa Freightech'),proj:idxDe(c,'Projeto'),sai:idxDe(c,'Saída','Saida'),saiF:idxDe(c,'Saída na FIlial','Saida na Filial'),via:idxDe(c,'Total Viagens'),jus:idxDe(c,'Justificativa'),des:idxDe(c,'Desconto')};
    let rs=T.stressV.rows.map(r=>({per:parseD(r[i.per]),cod:codDe(r[i.fil]),fil:String(r[i.fil]||'').trim(),placa:String(r[i.pla]||'').trim(),proj:String(r[i.proj]||'').trim(),saida:_n(r[i.sai]),saidaF:String(r[i.saiF]||'').trim(),viagens:num(r[i.via]),jus:String(r[i.jus]||'').trim(),desc:num(r[i.des])||0})).filter(r=>r.placa);
    const mx=Math.max(...rs.map(r=>r.per?r.per.getTime():0));
    DATA.stressV=rs.filter(r=>!r.per||r.per.getTime()===mx);
  }
  // Stress Test Empilhadeiras
  if(T.stressE){const c=T.stressE.cols;
    const i={fil:idxDe(c,'Filial GINFO','Filial FT'),pla:idxDe(c,'Placa Ginfo'),emp:idxDe(c,'Empresa FT'),ctr:idxDe(c,'Contratada'),p1:idxDe(c,'Parada 1Q?','Parada 1Q'),d1:idxDe(c,'Desconto 1Q'),p2:idxDe(c,'Parada 2Q?','Parada 2Q'),d2:idxDe(c,'Desconto 2Q'),dt:idxDe(c,'Desc. Total','Desc Total')};
    DATA.stressE=T.stressE.rows.map(r=>({cod:codDe(r[i.fil]),fil:String(r[i.fil]||'').trim(),placa:String(r[i.pla]||'').trim(),empresa:String(r[i.emp]||'').trim(),contratada:_n(r[i.ctr])==='SIM',d1:num(r[i.d1])||0,d2:num(r[i.d2])||0,dt:num(r[i.dt])||0})).filter(r=>r.placa);
  }
  // CIFV: Aderência | Filial Freightech | Veículo | Projeto | Data CIVF | Status | ... | Desconto Manutenção | Desconto Lavagem | Desconto Total
  if(T.cifv){const c=T.cifv.cols;
    const i={ad:idxDe(c,'Aderência','Aderencia'),fil:idxDe(c,'Filial Freightech'),vei:idxDe(c,'Veículo','Veiculo'),proj:idxDe(c,'Projeto'),st:idxDe(c,'Status'),dm:idxDe(c,'Desconto Manutenção','Desconto Manutencao'),dl:idxDe(c,'Desconto Lavagem'),dt:idxDe(c,'Desconto Total')};
    DATA.cifv=T.cifv.rows.map(r=>({ad:num(r[i.ad]),cod:codDe(r[i.fil]),fil:String(r[i.fil]||'').trim(),placa:String(r[i.vei]||'').trim(),proj:String(r[i.proj]||'').trim(),st:String(r[i.st]||'').trim(),dm:num(r[i.dm])||0,dl:num(r[i.dl])||0,dt:num(r[i.dt])||0})).filter(r=>r.placa);
  }
  // Preventivas: Aderência | Placa Mercosul | Projeto | Unidade | Placa | Marca | Modelo | ... | DIAS P/ Próxima | KM/HR P/ Próxima | Status | N° OS Aberta
  if(T.prev){const c=T.prev.cols;
    const i={ad:idxDe(c,'Aderência','Aderencia'),uni:idxDe(c,'Unidade'),proj:idxDe(c,'Projeto'),pla:idxDe(c,'Placa'),mar:idxDe(c,'Marca'),mod:idxDe(c,'Modelo'),dias:idxDe(c,'DIAS P/ Próxima','DIAS P/ Proxima'),km:idxDe(c,'KM / HR P/ Próxima','KM/HR P/ Proxima'),st:idxDe(c,'Status'),os:idxDe(c,'N° OS Aberta','Nº OS Aberta','No OS Aberta')};
    DATA.prev=T.prev.rows.map(r=>({ad:num(r[i.ad]),cod:codDe(r[i.uni]),fil:String(r[i.uni]||'').trim(),proj:String(r[i.proj]||'').trim(),placa:String(r[i.pla]||'').trim(),marca:String(r[i.mar]||'').trim(),modelo:String(r[i.mod]||'').trim(),dias:num(r[i.dias]),km:num(r[i.km]),st:String(r[i.st]||'').trim(),os:String(r[i.os]||'').trim()})).filter(r=>r.placa);
  }
  // Alinhamentos: Filial | Placa | Próx. Evento | Status | Dias | Documento
  if(T.alinh){const c=T.alinh.cols;
    const i={fil:idxDe(c,'Filial'),pla:idxDe(c,'Placa'),ev:idxDe(c,'Próx. Evento','Prox. Evento'),st:idxDe(c,'Status'),dias:idxDe(c,'Dias'),doc:idxDe(c,'Documento')};
    DATA.alinh=T.alinh.rows.map(r=>({cod:codDe(r[i.fil]),fil:String(r[i.fil]||'').trim(),placa:String(r[i.pla]||'').trim(),ev:parseD(r[i.ev]),st:String(r[i.st]||'').trim(),dias:num(r[i.dias]),doc:String(r[i.doc]||'').trim()})).filter(r=>r.placa);
  }
  // OS em aberto: Dias em Aberto | N° OS | Data | Status | Filial | Origem | Tipo | Criticidade | ... | Segmento | Fornecedor | Mecânico | ... | Placa | ... | Observação
  if(T.os){const c=T.os.cols;
    const i={dias:idxDe(c,'Dias em Aberto'),os:idxDe(c,'N° OS','Nº OS','No OS'),fil:idxDe(c,'Filial'),ori:idxDe(c,'Origem'),tip:idxDe(c,'Tipo'),cri:idxDe(c,'Criticidade'),seg:idxDe(c,'Segmento'),forn:idxDe(c,'Fornecedor'),mec:idxDe(c,'Mecânico','Mecanico'),pla:idxDe(c,'Placa'),obs:idxDe(c,'Observação','Observacao')};
    DATA.os=T.os.rows.map(r=>({dias:num(r[i.dias]),os:String(r[i.os]||'').trim(),cod:codDe(r[i.fil]),fil:String(r[i.fil]||'').trim(),ori:String(r[i.ori]||'').trim(),tipo:String(r[i.tip]||'').trim(),crit:String(r[i.cri]||'').trim(),seg:_seg(r[i.seg]),forn:String(r[i.forn]||'').trim(),mec:String(r[i.mec]||'').trim(),placa:String(r[i.pla]||'').trim(),obs:String(r[i.obs]||'').trim()})).filter(r=>r.os);
  }
  await loadDisp();
  try{ await loadPneus(); }catch(e){ console.error('pneus load',e); }
  return DATA;
}
// nome da unidade na planilha de Disponibilidade → [código Farol, tier]
const DISP2CT={
  'CUIABA EMPURRADA':['CBA','T1'],'CUIABA':['CBA','T1 WH'],'CDD CUIABA':['CBA','T2'],
  'MACACU EMPURRADA':['MCC','T1'],'CDI MACACU':['MCC','T2'],'CACHOEIRAS DE MACACU':['MCC','T2'],
  'CDD FLORIANOPOLIS':['FLP',''],'CDD RONDONOPOLIS':['RON',''],'CDD RIO DE JANEIRO':['CGR',''],
  'CDD GUARULHOS':['GRL',''],'CDD PELOTAS':['PLT',''],'PIRAI EMPURRADA':['PIR',''],
  'CDD NOVA FRIBURGO':['NFR',''],'CDD CAMBORIU':['BLC','']
};
const dispCls=p=>p==null?'mut':p>=DISP_SONHO?'cg':p>=DISP_META?'cy':'cr';
// carrega Disponibilidade (última vigência) — 1 linha por (cod,tier)
async function loadDisp(){
  let T;try{T=await gvizAny(DISP_SHEET_ID,'Disponibilidade');}catch(e){DATA.disp=null;return;}
  const c=T.cols;
  const i={dt:idxDe(c,'Data'),uni:idxDe(c,'Unidade'),proj:idxDe(c,'Projeto'),tipo:idxDe(c,'Tipo Veículo','Tipo'),at:idxDe(c,'Ativos'),ind:idxDe(c,'Indisponíveis','Indisponiveis','Indisp')};
  const vigDe=v=>{const s=String(v||'');const m=s.match(/Date\((\d+),(\d+),(\d+)/);if(m)return +m[1]*100+(+m[2]+1);const p=s.split('/');return p.length>=3?+p[2]*100+ +p[1]:0;};
  let rs=T.rows.map(r=>{const ct=DISP2CT[_n(r[i.uni])]||[codDe(r[i.uni]),''];return {vig:vigDe(r[i.dt]),cod:ct[0],tier:ct[1],ativos:num(r[i.at])||0,indisp:num(r[i.ind])||0};}).filter(r=>r.cod);
  const mx=Math.max(...rs.map(r=>r.vig));
  rs=rs.filter(r=>r.vig===mx);
  const g={};rs.forEach(r=>{const k=r.cod+'|'+r.tier;(g[k]=g[k]||{cod:r.cod,tier:r.tier,ativos:0,indisp:0}).ativos+=r.ativos;g[k].indisp+=r.indisp;});
  DATA.disp=Object.values(g).map(o=>({...o,pct:o.ativos>0?(o.ativos-o.indisp)/o.ativos*100:null}));
  DATA.dispVig=mx;
  await loadInd();
}
// mapeia unidade da aba Indisponibilidade → [cod, tier] (mesma lógica do painel Disponibilidade)
const IND_CITY={'RONDONOPOLIS':'RON','GUARULHOS':'GRL','FLORIANOPOLIS':'FLP','PELOTAS':'PLT','NOVA FRIBURGO':'NFR','BALNEARIO CAMBORIU':'BLC','CAMPO GRANDE':'CGR','PIRAI':'PIR'};
function mapIndCT(uni,proj,tipo){
  const u=_n(uni),p=_n(proj),t=_n(tipo);
  if(u==='CUIABA'){ if(p==='APOIO'||t.includes('EMPILHADEIRA'))return['CBA','T1 WH']; if(p==='EMPURRADA')return['CBA','T1']; return['CBA','T2']; }
  if(u==='CACHOEIRAS DE MACACU'||u==='MACACU'){ return p==='EMPURRADA'?['MCC','T1']:['MCC','T2']; }
  return [IND_CITY[u]||codDe(uni),''];
}
// placas indisponíveis (cenário atual = última data do relatório)
async function loadInd(){
  let T;try{T=await gvizAny(DISP_SHEET_ID,'Indisponibilidade');}catch(e){DATA.dispInd=null;return;}
  const c=T.cols;
  const i={dt:idxDe(c,'Data'),uni:idxDe(c,'Unidade'),proj:idxDe(c,'Projeto'),tipo:idxDe(c,'Tipo Veículo','Tipo'),plaM:idxDe(c,'Placa Mercosul'),pla:idxDe(c,'Placa'),grp:idxDe(c,'Grupo'),desc:idxDe(c,'Descrição do Problema','Descrição Problema','Descricao do Problema','Problema'),obs:idxDe(c,'Observação','Observacao'),dPar:idxDe(c,'Data Parada','Data da Parada'),prev:idxDe(c,'Previsão Retorno','Previsão de Retorno','Retorno'),st:idxDe(c,'Status'),dias:idxDe(c,'Dias Parado','Dias Indisponível','Dias Indisponivel','Dias')};
  const dnum=v=>{const s=String(v||'');const m=s.match(/Date\((\d+),(\d+),(\d+)/);if(m)return +m[1]*1e4+(+m[2]+1)*100+ +m[3];const p=s.split('/');return p.length>=3?+p[2]*1e4+ +p[1]*100+ +p[0]:0;};
  const hoje=Date.now();
  let rs=T.rows.map(r=>{const ct=mapIndCT(r[i.uni],r[i.proj],r[i.tipo]);
    const par=parseAnyD(r[i.dPar]);
    const dias=par?Math.max(0,Math.floor((hoje-par.getTime())/864e5)):num(r[i.dias]);
    const pv=parseAnyD(r[i.prev]);
    return {
    dt:dnum(r[i.dt]),cod:ct[0],tier:ct[1],
    placa:String((i.plaM>=0&&r[i.plaM])||r[i.pla]||'').trim(),
    proj:String(r[i.proj]||'').trim(),grupo:String(r[i.grp]||'').trim(),
    desc:String((r[i.desc]!=null?r[i.desc]:r[i.obs])||'').trim(),
    dPar:par?fmtD(par):'—',
    prev:pv?fmtD(pv):String(r[i.prev]||'').trim(),
    st:String(r[i.st]||'').trim(),dias};
  }).filter(r=>r.cod&&r.placa);
  const mx=Math.max(0,...rs.map(r=>r.dt));
  DATA.dispInd=mx>0?rs.filter(r=>r.dt===mx):rs;
}
// ── PNEUS (Supabase Conlog) — foto atual, carga sob demanda ──
async function loadPneus(){
  if(DATA.pneus)return DATA.pneus;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const bids=Object.keys(PNEUS_BRANCH);
  const merged={vehicles:[],tires:[],inspections:[]};let ult=0;
  const fetchB=bid=>fetch(`${PNEUS_SB_URL}/rest/v1/snapshot?branch_id=eq.${bid}&select=endpoint,branch_id,data,updated_at`,{headers:{apikey:PNEUS_SB_KEY,Authorization:'Bearer '+PNEUS_SB_KEY}}).then(r=>r.ok?r.json():null).catch(()=>null);
  for(let k=0;k<bids.length;k+=3){
    const batch=bids.slice(k,k+3);
    const res=await Promise.all(batch.map(async bid=>{for(let a=0;a<5;a++){const o=await fetchB(bid);if(o!==null)return o;await sleep(700);}return [];}));
    res.flat().forEach(r=>{const ct=PNEUS_BRANCH[r.branch_id];if(!ct||!merged[r.endpoint])return;if(r.updated_at)ult=Math.max(ult,new Date(r.updated_at).getTime());(Array.isArray(r.data)?r.data:[]).forEach(rec=>{rec._cod=ct[0];rec._tier=ct[1];merged[r.endpoint].push(rec);}); });
  }
  // reconstrói como no painel /pneus/: 1 linha por tireId (média das leituras),
  // junta o cadastro (status/nomePosicao), fica só com pneus EM USO e deduplica por veículo+posição.
  const statusAmigavel=x=>{const k=String(x||'').toUpperCase().trim();return ({INSTALLED:'Em uso',RODANDO:'Em uso',STOCK:'Estoque',ESTOQUE:'Estoque',SCRAP:'Sucata',SUCATA:'Sucata'})[k]||(k||'Sem status');};
  const cad={};merged.tires.forEach(t=>{if(t.id!=null)cad[t.id]=t;});
  const _avg=(arr,f)=>{const v=arr.map(f).filter(x=>typeof x==='number'&&!isNaN(x));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
  const porPneu={};merged.inspections.forEach(i=>{if(i.tireId==null)return;(porPneu[i.tireId]=porPneu[i.tireId]||[]).push(i);});
  let lista=Object.entries(porPneu).map(([tid,arr])=>{
    const c=cad[tid]||{},rec=arr.reduce((a,b)=>new Date(b.dataInspecao)>new Date(a.dataInspecao)?b:a);
    const menor=_avg(arr,i=>i.menorMM),st=menor==null?null:menor<2?'Bloquear':menor<=3?'Recapar':menor<=6?'Regular':'Bom';
    return {cod:c._cod||rec._cod,tier:c._tier||rec._tier||'',status:c.status||null,placa:rec.placa||c.placa||'',veiculoId:rec.veiculoId??c.veiculoId,posicao:rec.posicao??c.posicao,nomePosicao:c.nomePosicao||rec.nomePosicao||null,serial:rec.serial||c.serial||'',menor,st,desv:_avg(arr,i=>i.desvioPressao),pIdeal:_avg(arr,i=>i.pressaoIdeal),dt:rec.dataInspecao};
  });
  const inUse=lista.filter(t=>statusAmigavel(t.status)==='Em uso');
  if(inUse.length) lista=inUse;                 // guarda: se o cadastro não trouxe status, não zera o painel
  // deduplica por veículo+posição (aferição mais recente) — descarta pneu trocado/removido
  const porPos={};lista.forEach(t=>{const k=(t.veiculoId==null||t.posicao==null)?('sem|'+(t.serial||t.dt)):(t.veiculoId+'|'+t.posicao);const cur=porPos[k];if(!cur||new Date(t.dt)>new Date(cur.dt))porPos[k]=t;});
  const tires=Object.values(porPos);
  // aferição por veículo (última data) p/ aderência
  const veic={};merged.inspections.forEach(i=>{if(i.veiculoId==null)return;const d=new Date(i.dataInspecao);const cur=veic[i.veiculoId];if(!cur||d>cur.dt)veic[i.veiculoId]={cod:i._cod,tier:i._tier||'',dt:d};});
  DATA.pneus={tires,veic:Object.values(veic),ult:ult||Date.now()};
  return DATA.pneus;
}
// normaliza segmento (MECANICA/MECÂNICA_, QUALIDADE_, etc.)
function _seg(v){return _n(v).replace(/_+$/,'').trim();}

// ═══════════════ COMPONENTES DE UI ═══════════════
function secBox(id,titulo,sub){return `<div class="tbl-section" id="sec-${id}"><div class="tbl-title">${titulo}</div><div class="tbl-sub">${sub||''}</div><div class="sec-body" id="body-${id}"></div></div>`;}
function heroAder(p,meta,extra){
  const cls=p==null?'mut':p>=meta?'cg':p>=meta-7?'cy':'cr';
  return `<div class="mini-hero"><div class="mh-label">ADERÊNCIA</div><div class="mh-val ${cls}">${pct1(p)}</div><div class="mh-meta">Meta: ${meta}%${extra||''}</div></div>`;
}
// aderência por projeto como deltas pequenos (rótulo + valor), padrão visão-financeira
function projDeltas(titulo,pairs){
  const ps=pairs.filter(x=>x&&x[1]!=null);
  if(!ps.length)return '';
  return `<div class="hero-deltas" style="margin:2px 0 16px;flex-wrap:wrap">`+
    ps.map(([lb,v])=>`<div class="hero-delta"><span>${escF(lb)}</span><b class="${clsPctMeta(v)}">${pct1(v)}</b></div>`).join('')+`</div>`;
}
let _chartSeq=0;
function mkBar(holder,labels,values,meta,fmt){
  const id='ch'+(++_chartSeq);
  holder.innerHTML=`<div class="chart-wrap"><canvas id="${id}"></canvas></div>`;
  const isL=document.body.classList.contains('light-mode');
  const grid={color:isL?'rgba(0,0,0,.08)':'rgba(255,255,255,.06)'};
  const tick={color:isL?'#444':'#94A3B8',font:{family:'Montserrat',size:10}};
  const bg=values.map(v=>v==null?'transparent':(v>=meta?'rgba(59,179,59,.8)':(v>=meta-7?'rgba(234,179,8,.85)':'rgba(255,102,102,.8)')));
  new Chart(document.getElementById(id),{
    data:{labels,datasets:[
      {type:'bar',data:values,backgroundColor:bg,borderRadius:4,maxBarThickness:70,
       datalabels:undefined},
      {type:'line',data:labels.map(()=>meta),borderColor:isL?'#333':'#F1F5F9',borderWidth:1.5,borderDash:[6,4],pointRadius:0,fill:false,label:'Meta'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#141B26',titleColor:'#F97316',bodyColor:'#F1F5F9',borderColor:'#1E2D40',borderWidth:1,titleFont:{family:'Montserrat'},bodyFont:{family:'Montserrat'},callbacks:{label:c=>' '+(c.parsed.y==null?'—':(fmt?fmt(c.parsed.y):pct1(c.parsed.y)))}}},
      scales:{x:{grid,ticks:{...tick,autoSkip:false,maxRotation:0}},y:{grid,ticks:tick,beginAtZero:true}}}
  });
}
const th=(...hs)=>'<thead><tr>'+hs.map(h=>`<th${/R\$|Dias|Km|Viagens|%|Desc|1Q|2Q|Total|Orç|Rem|Real|Ativos|Indispon|Sulco|Desvio|Média/i.test(h)?' class="num"':''}>${h}</th>`).join('')+'</tr></thead>';
function wrapT(html){return `<div style="overflow-x:auto">${html}</div>`;}

// ═══════════════ SEÇÕES ═══════════════
// filtro global do Farol Geral (Set de códigos selecionados; null = todas)
let FILT={uni:null};
const passU=cod=>!FILT.uni||FILT.uni.has(cod);
// filtra pelas linhas da unidade (cod) ou, no geral, pelo filtro de unidades
const byCod=(rows,cod)=>{
  let r=rows||[];
  if(cod) return r.filter(x=>x.cod===cod);
  if(FILT.uni) return r.filter(x=>x.cod&&FILT.uni.has(x.cod));
  return r;
};
const codsFiltrados=()=>Object.keys(UNIDADES).filter(passU);

// ── CUSTOS ──
function renderCustos(el,cod){
  const rs=byCod(DATA.custos,cod);
  if(!rs.length){el.innerHTML='<div class="loading">Sem dados de custos para o recorte.</div>';return;}
  const tot={orc:sumA(rs.map(r=>r.orc)),rem:sumA(rs.map(r=>r.rem)),rea:sumA(rs.map(r=>r.rea))};
  const dOrc=Math.abs(tot.rea)-Math.abs(tot.orc), dRem=Math.abs(tot.rea)-Math.abs(tot.rem);
  const pOrc=Math.abs(tot.orc)>0?dOrc/Math.abs(tot.orc)*100:null, pRem=Math.abs(tot.rem)>0?dRem/Math.abs(tot.rem)*100:null;
  const dcls=v=>v==null?'mut':v>0?'cr':'cg';
  const vigTx=DATA.custosVig?' · '+DATA.custosVig.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}).toUpperCase():'';
  let h=`<div class="hero" style="margin-bottom:16px"><div class="hero-main" style="padding:0 0 4px">
    <div class="hero-label">REALIZADO${vigTx}</div>
    <div class="hero-value">${brl(tot.rea)}</div>
    <div class="hero-deltas">
      <div class="hero-delta"><span>Remunerado</span><b>${brl(tot.rem)}</b></div>
      <div class="hero-delta"><span>Orçado</span><b>${brl(tot.orc)}</b></div>
      <div class="hero-delta"><span>▲ vs Orç.</span><b class="${dcls(dOrc)}">${brlFull(dOrc)} <small style="font-weight:600">(${pct1(pOrc)})</small></b></div>
      <div class="hero-delta"><span>▲ vs Rem.</span><b class="${dcls(dRem)}">${brlFull(dRem)} <small style="font-weight:600">(${pct1(pRem)})</small></b></div>
    </div>
  </div></div>`;
  // tabela agrupada: geral → por UNIDADE; unidade → por NÍVEL 3 (projeto)
  const key=cod?'n3':'uni';
  const grupos={};rs.forEach(r=>{(grupos[r[key]]=grupos[r[key]]||[]).push(r);});
  h+='<table>'+th(cod?'Projeto':'Unidade','Conta Gerencial','Orç.','Rem','Real','Δ Orç.','Δ Rem','Δ Orç %','Δ Rem %')+'<tbody>';
  Object.keys(grupos).sort().forEach(g=>{
    // soma por CONTA dentro do grupo (evita a mesma conta repetida por projeto/nível 3)
    const byConta={};grupos[g].forEach(r=>{const a=byConta[r.conta]=byConta[r.conta]||{conta:r.conta,orc:0,rem:0,rea:0};a.orc+=r.orc;a.rem+=r.rem;a.rea+=r.rea;});
    const rows=Object.values(byConta).sort((a,b)=>a.orc-b.orc);
    rows.forEach((r,i)=>{
      const dO=Math.abs(r.rea)-Math.abs(r.orc), dR=Math.abs(r.rea)-Math.abs(r.rem);
      const pO=Math.abs(r.orc)>0?dO/Math.abs(r.orc)*100:null, pR=Math.abs(r.rem)>0?dR/Math.abs(r.rem)*100:null;
      h+=`<tr>${i===0?`<td rowspan="${rows.length}" style="font-weight:800;vertical-align:top">${escF(g)}</td>`:''}
        <td>${escF(r.conta)}</td><td class="num">${brlFull(r.orc)}</td><td class="num">${brlFull(r.rem)}</td><td class="num">${brlFull(r.rea)}</td>
        <td class="num ${dcls(dO)}">${brlFull(dO)}</td><td class="num ${dcls(dR)}">${brlFull(dR)}</td>
        <td class="num ${dcls(dO)}">${pct1(pO)}</td><td class="num ${dcls(dR)}">${pct1(pR)}</td></tr>`;
    });
    const t={orc:sumA(rows.map(r=>r.orc)),rem:sumA(rows.map(r=>r.rem)),rea:sumA(rows.map(r=>r.rea))};
    const dO=Math.abs(t.rea)-Math.abs(t.orc), dR=Math.abs(t.rea)-Math.abs(t.rem);
    h+=`<tr class="tot-row"><td></td><td>Total</td><td class="num">${brlFull(t.orc)}</td><td class="num">${brlFull(t.rem)}</td><td class="num">${brlFull(t.rea)}</td>
      <td class="num ${dcls(dO)}">${brlFull(dO)}</td><td class="num ${dcls(dR)}">${brlFull(dR)}</td>
      <td class="num ${dcls(dO)}">${pct1(Math.abs(t.orc)>0?dO/Math.abs(t.orc)*100:null)}</td><td class="num ${dcls(dR)}">${pct1(Math.abs(t.rem)>0?dR/Math.abs(t.rem)*100:null)}</td></tr>`;
  });
  h+='</tbody></table>';
  el.innerHTML=wrapT(h);
}

// ── STRESS TEST VEÍCULOS ──
function stressVPct(rows){if(!rows.length)return null;return rows.filter(r=>r.saida==='COM SAIDA').length/rows.length*100;}
function renderStressV(el,cod){
  const rs=byCod(DATA.stressV,cod);
  if(!rs.length){el.innerHTML='<div class="loading">Sem dados para o recorte.</div>';return;}
  const p=stressVPct(rs);
  const projs=[...new Set(rs.map(r=>r.proj))].filter(Boolean).sort();
  const desc=rs.filter(r=>r.desc>0).sort((a,b)=>b.desc-a.desc);
  const totDesc=sumA(desc.map(r=>r.desc));
  let h=heroAder(p,100)+projDeltas('Aderência por projeto',projs.map(pj=>[pj,stressVPct(rs.filter(r=>r.proj===pj))]));
  h+=`<div class="blk-t">Descontos Stress Test ${totDesc>0?`<span class="cr">· ${brl(totDesc)}</span>`:''}</div>`+
      wrapT('<table>'+th(cod?'Placa':'Unidade · Placa','Projeto','Saída','Saída na Filial','Viagens','Desconto R$')+'<tbody>'+
        rs.slice().sort((a,b)=>b.desc-a.desc||String(a.placa).localeCompare(b.placa)).slice(0,60).map(r=>
          `<tr><td><b>${cod?escF(r.placa):escF(r.fil)+' · '+escF(r.placa)}</b></td><td>${escF(r.proj)}</td>
           <td class="${r.saida==='COM SAIDA'?'cg':'cr'}">${escF(r.saida==='COM SAIDA'?'Com saída':'Sem saída')}</td>
           <td>${escF(r.saidaF||'—')}</td><td class="num">${r.viagens==null?'—':r.viagens}</td>
           <td class="num ${r.desc>0?'cr':'mut'}">${r.desc>0?brlFull(r.desc):'—'}</td></tr>`).join('')+'</tbody></table>');
  el.innerHTML=h;
}

// ── STRESS TEST EMPILHADEIRAS ──
function renderStressE(el,cod){
  const all=byCod(DATA.stressE,cod).filter(r=>r.contratada);
  if(!all.length){el.innerHTML='<div class="loading">Sem equipamentos contratados no recorte.</div>';return;}
  const a1=all.filter(r=>!(r.d1>0)).length/all.length*100;
  const a2=all.filter(r=>!(r.d2>0)).length/all.length*100;
  const at=(a1+a2)/2;
  let h=heroAder(at,100,` · 1ª Q: <b class="${clsPctMeta(a1)}">${pct1(a1)}</b> · 2ª Q: <b class="${clsPctMeta(a2)}">${pct1(a2)}</b>`);
  const desc=all.slice().sort((a,b)=>b.dt-a.dt);
  const tot=sumA(all.map(r=>r.dt));
  h+=`<div class="blk-t">Descontos por Equipamento ${tot>0?`<span class="cr">· ${brl(tot)}</span>`:''}</div>`+
    wrapT('<table>'+th(cod?'Placa Ginfo':'Filial · Placa','Empresa','Desconto 1Q','Desconto 2Q','Desc. Total')+'<tbody>'+
    desc.slice(0,60).map(r=>`<tr><td><b>${cod?escF(r.placa):escF(r.fil)+' · '+escF(r.placa)}</b></td><td>${escF(r.empresa)}</td>
      <td class="num ${r.d1>0?'cr':'mut'}">${r.d1>0?brlFull(r.d1):'—'}</td>
      <td class="num ${r.d2>0?'cr':'mut'}">${r.d2>0?brlFull(r.d2):'—'}</td>
      <td class="num ${r.dt>0?'cr':'mut'}">${r.dt>0?brlFull(r.dt):'—'}</td></tr>`).join('')+'</tbody></table>');
  el.innerHTML=h;
}

// ── CIFV ──
function renderCIFV(el,cod){
  const rs=byCod(DATA.cifv,cod);
  if(!rs.length){el.innerHTML='<div class="loading">Sem dados para o recorte.</div>';return;}
  const p=avgA(rs.map(r=>r.ad))*100;
  const projs=[...new Set(rs.map(r=>r.proj))].filter(Boolean).sort();
  const nc=rs.filter(r=>r.dt>0||r.ad===0).sort((a,b)=>b.dt-a.dt);
  const tot=sumA(rs.map(r=>r.dt));
  let h=heroAder(p,100)+projDeltas('Aderência por projeto',projs.map(pj=>{const q=rs.filter(r=>r.proj===pj);return [pj,avgA(q.map(r=>r.ad))*100];}));
  h+=`<div class="blk-t">Descontos ${tot>0?`<span class="cr">· ${brl(tot)}</span>`:''}</div>`+
      wrapT('<table>'+th(cod?'Veículo':'Filial · Veículo','Projeto','Status','Manutenção R$','Lavagem R$','Total R$')+'<tbody>'+
        (nc.length?nc:rs.slice(0,20)).slice(0,60).map(r=>
        `<tr><td><b>${cod?escF(r.placa):escF(r.fil)+' · '+escF(r.placa)}</b></td><td>${escF(r.proj)}</td>
         <td class="${r.ad===1?'cg':'cr'}">${escF(r.st||'—')}</td>
         <td class="num ${r.dm>0?'cr':'mut'}">${r.dm>0?brlFull(r.dm):'—'}</td>
         <td class="num ${r.dl>0?'cr':'mut'}">${r.dl>0?brlFull(r.dl):'—'}</td>
         <td class="num ${r.dt>0?'cr':'mut'}">${r.dt>0?brlFull(r.dt):'—'}</td></tr>`).join('')+'</tbody></table>');
  el.innerHTML=h;
}

// ── PREVENTIVAS ──
const clsDias=d=>d==null?'mut':d<0?'cr':d<=30?'cy':'cg';
const clsKm=k=>k==null?'mut':k<=0?'cr':k<=2000?'cy':'cg';
function renderPrev(el,cod){
  const rs=byCod(DATA.prev,cod);
  if(!rs.length){el.innerHTML='<div class="loading">Sem dados para o recorte.</div>';return;}
  const p=avgA(rs.map(r=>r.ad))*100;
  const projs=[...new Set(rs.map(r=>r.proj))].filter(Boolean).sort();
  const ord={'VENCIDA':0,'EM ATENCAO':1,'EM ATENÇÃO':1,'NO PRAZO':2};
  const worst=rs.slice().sort((a,b)=>(ord[_n(a.st)]??3)-(ord[_n(b.st)]??3)||(a.dias??999)-(b.dias??999));
  let h=heroAder(p,100)+projDeltas('Aderência por projeto',projs.map(pj=>{const q=rs.filter(r=>r.proj===pj);return [pj,avgA(q.map(r=>r.ad))*100];}));
  h+=`<div class="blk-t">Bottom | Placas</div>`+
      wrapT('<table>'+th(cod?'Placa':'Unidade · Placa','Projeto','Marca','Modelo','OS','Status','Dias','Km')+'<tbody>'+
        worst.slice(0,60).map(r=>{
          const sc=_n(r.st)==='VENCIDA'?'cr':_n(r.st).startsWith('EM ATEN')?'cy':'cg';
          return `<tr><td><b>${cod?escF(r.placa):escF(r.fil)+' · '+escF(r.placa)}</b></td><td>${escF(r.proj)}</td><td>${escF(r.marca)}</td><td>${escF(r.modelo)}</td>
          <td>${escF(r.os||'—')}</td><td class="${sc}">${escF(r.st||'—')}</td>
          <td class="num ${clsDias(r.dias)}">${r.dias==null?'—':Math.round(r.dias)}</td>
          <td class="num ${clsKm(r.km)}">${r.km==null?'—':Math.round(r.km).toLocaleString('pt-BR')}</td></tr>`;}).join('')+'</tbody></table>');
  el.innerHTML=h;
}

// ── ALINHAMENTO ──
function renderAlinh(el,cod){
  const rs=byCod(DATA.alinh,cod);
  if(!rs.length){el.innerHTML='<div class="loading">Sem dados para o recorte.</div>';return;}
  const noPrazo=rs.filter(r=>_n(r.st)!=='VENCIDO').length;
  const p=noPrazo/rs.length*100;
  const venc=rs.length-noPrazo;
  let h=heroAder(p,80,` · <b class="cg">${noPrazo} no prazo</b> · <b class="${venc?'cr':'mut'}">${venc} vencido(s)</b>`);
  const worst=rs.slice().sort((a,b)=>(a.dias??999)-(b.dias??999));
  h+=`<div class="blk-t">Bottom | Placas</div>`+
    wrapT('<table>'+th(cod?'Placa':'Filial · Placa','Próx. Evento','Status','Dias')+'<tbody>'+
    worst.slice(0,60).map(r=>`<tr><td><b>${cod?escF(r.placa):escF(r.fil)+' · '+escF(r.placa)}</b></td>
      <td>${fmtD(r.ev)}</td><td class="${_n(r.st)==='VENCIDO'?'cr':'cg'}">${escF(r.st||'—')}</td>
      <td class="num ${clsDias(r.dias)}">${r.dias==null?'—':Math.round(r.dias)}</td></tr>`).join('')+'</tbody></table>');
  el.innerHTML=h;
}

// ── GESTÃO DE OS ──
const OS_META=8;
function renderOS(el,cod){
  const rs=byCod(DATA.os,cod);
  if(!rs.length){el.innerHTML='<div class="loading">Sem OSs em aberto no recorte. ✓</div>';return;}
  const noPrazo=rs.filter(r=>(r.dias??0)<=OS_META).length;
  const p=noPrazo/rs.length*100;
  const cls=p>=90?'cg':p>=70?'cy':'cr';
  let h=`<div class="mini-hero"><div class="mh-label">OSs NO PRAZO (≤ ${OS_META} DIAS)</div><div class="mh-val ${cls}">${pct1(p)}</div>
    <div class="mh-meta"><b>${rs.length}</b> OSs · <b class="cg">${noPrazo}</b> no prazo · <b class="${rs.length-noPrazo?'cr':'mut'}">${rs.length-noPrazo}</b> fora do prazo</div></div>`;
  const worst=rs.slice().sort((a,b)=>(b.dias??0)-(a.dias??0));
  const dCls=d=>d==null?'mut':d<OS_META?'cg':d<=OS_META+2?'cy':'cr';
  if(!cod){
    // geral: média de dias por filial + bottom segmentos/fornecedores
    const gp=(key)=>{const m={};rs.forEach(r=>{const k=r[key]||'—';(m[k]=m[k]||[]).push(r.dias||0);});return Object.entries(m).map(([k,a])=>({k,v:avgA(a)})).sort((a,b)=>b.v-a.v);};
    const mini=(tit,list)=>`<div><div class="blk-t">${tit}</div>${wrapT('<table>'+th('','Média dias')+'<tbody>'+list.slice(0,12).map(o=>`<tr><td>${escF(o.k)}</td><td class="num ${dCls(o.v)}">${o.v==null?'—':(Math.round(o.v*10)/10).toLocaleString('pt-BR')}</td></tr>`).join('')+'</tbody></table>')}</div>`;
    h+=`<div class="tri">${mini('Por unidade',gp('fil'))}${mini('Bottom | Segmentos',gp('seg'))}${mini('Bottom | Fornecedores',gp('forn'))}</div>`;
  }
  h+=`<div class="blk-t">OSs em aberto</div>`+
    wrapT('<table>'+th('Nº OS','Tipo','Placa',cod?'Origem':'Filial','Segmento','Fornecedor','Mecânico','Observação','Dias em Aberto')+'<tbody>'+
    worst.slice(0,80).map(r=>`<tr><td><b>${escF(r.os)}</b></td><td>${escF(r.tipo)}</td><td>${escF(r.placa||'—')}</td>
      <td>${escF(cod?r.ori:r.fil)}</td><td>${escF(r.seg||'—')}</td><td>${escF(r.forn||'—')}</td><td>${escF(r.mec||'—')}</td>
      <td style="white-space:normal;max-width:260px">${escF((r.obs||'—').slice(0,90))}</td>
      <td class="num ${dCls(r.dias)}">${r.dias==null?'—':(Math.round(r.dias*10)/10).toLocaleString('pt-BR')}</td></tr>`).join('')+'</tbody></table>');
  el.innerHTML=h;
}

// ── RANKING DE UNIDADES (geral) ──
// pneus por unidade (da API/Supabase) — mesmas fórmulas da seção Pneus
function pneusStats(cod){
  const P=DATA.pneus; if(!P) return {af:null,mm:null,ca:null};
  const tires=P.tires.filter(t=>cod?t.cod===cod:true);
  const veic=P.veic.filter(v=>cod?v.cod===cod:true);
  const ref=P.ult;
  const af=veic.length?veic.filter(v=>(ref-v.dt.getTime())<=30*864e5).length/veic.length*100:null;
  const cnt={Bloquear:0,Recapar:0,Regular:0,Bom:0}; tires.forEach(t=>{if(t.st)cnt[t.st]++;});
  const totMM=tires.filter(t=>t.st).length, crit=cnt.Bloquear+cnt.Recapar;
  const mm=totMM?(totMM-crit)/totMM*100:null;
  const comP=tires.filter(t=>t.pIdeal>0&&t.desv!=null);
  const ca=comP.length?comP.filter(t=>Math.abs(t.desv)<=10).length/comP.length*100:null;
  return {af,mm,ca};
}
function unitStats(cod){
  const sv=stressVPct(byCod(DATA.stressV,cod));
  const se=(()=>{const a=byCod(DATA.stressE,cod).filter(r=>r.contratada);if(!a.length)return null;return ((a.filter(r=>!(r.d1>0)).length+a.filter(r=>!(r.d2>0)).length)/(2*a.length))*100;})();
  const cf=(()=>{const a=byCod(DATA.cifv,cod);return a.length?avgA(a.map(r=>r.ad))*100:null;})();
  const pv=(()=>{const a=byCod(DATA.prev,cod);return a.length?avgA(a.map(r=>r.ad))*100:null;})();
  const al=(()=>{const a=byCod(DATA.alinh,cod);return a.length?a.filter(r=>_n(r.st)!=='VENCIDO').length/a.length*100:null;})();
  const os=(()=>{const a=byCod(DATA.os,cod);return a.length?a.filter(r=>(r.dias??0)<=OS_META).length/a.length*100:100;})();
  const cu=(()=>{const a=byCod(DATA.custos,cod);if(!a.length)return null;const o=sumA(a.map(r=>r.orc)),re=sumA(a.map(r=>r.rea));return Math.abs(o)>0?(Math.abs(re)-Math.abs(o))/Math.abs(o)*100:null;})();
  const dp=(()=>{const a=(DATA.disp||[]).filter(r=>r.cod===cod);if(!a.length)return null;const at=sumA(a.map(r=>r.ativos)),ind=sumA(a.map(r=>r.indisp));return at>0?(at-ind)/at*100:null;})();
  const _ps=pneusStats(cod);
  return {sv,se,cf,pv,al,os,cu,dp,af:_ps.af,mm:_ps.mm,ca:_ps.ca};
}
function renderRanking(el){
  const list=codsFiltrados().map(cod=>{
    const s=unitStats(cod);
    const score=avgA([s.sv,s.se,s.cf,s.pv,s.al,s.os,s.dp,s.af,s.mm,s.ca]);
    return {cod,...s,score};
  }).sort((a,b)=>(b.score??-1)-(a.score??-1));
  const cell=(v,cls)=>`<td class="num ${cls}">${pct1(v)}</td>`;
  const cCu=v=>v==null?'mut':v<=0?'cg':v<=5?'cy':'cr';
  const rkHead='<thead><tr>'+['#','Unidade','Média','Stress Veíc.','Stress Emp.','CIFV','Preventivas','Alinhamento','OS no prazo','Disponib.','Aferições','Milimetr.','Calibr.','Custos Δ Orç %'].map((h,i)=>`<th${i>=2?' class="num"':''}>${h}</th>`).join('')+'</tr></thead>';
  el.innerHTML=wrapT('<table>'+rkHead+'<tbody>'+
    list.map((u,i)=>{
      const sc=u.score==null?'mut':u.score>=97?'#3BB33B':u.score>=90?'#EAB308':'#FF6666';
      return `<tr><td class="mut">${i+1}</td><td><b>${u.cod}</b></td>
      <td class="num">${u.score==null?'—':`<span class="pill" style="background:${sc}">${pct1(u.score)}</span>`}</td>
      ${cell(u.sv,clsPctMeta(u.sv))}${cell(u.se,clsPctMeta(u.se))}${cell(u.cf,clsPctMeta(u.cf))}${cell(u.pv,clsPctMeta(u.pv))}
      ${cell(u.al,u.al==null?'mut':u.al>=80?'cg':'cr')}${cell(u.os,u.os==null?'mut':u.os>=90?'cg':u.os>=70?'cy':'cr')}${cell(u.dp,dispCls(u.dp))}${cell(u.af,clsPctMeta(u.af,95,85))}${cell(u.mm,clsPctMeta(u.mm,90,75))}${cell(u.ca,clsPctMeta(u.ca,90,75))}
      <td class="num ${cCu(u.cu)}">${u.cu==null?'—':(u.cu>0?'+':'')+pct1(u.cu)}</td></tr>`;}).join('')+'</tbody></table>')+
    '<div class="tbl-sub" style="margin-top:8px">Média = aderências (Stress V/E, CIFV, Preventivas, Alinhamento, OS no prazo, Disponibilidade, Aferições, Milimetragem e Calibragem). Custos é informativo (Δ Real vs Orç do mês). Aferições/Milimetragem/Calibragem vêm da API (foto Prolog); detalhe na seção Pneus abaixo.</div>';
}

// ── RESUMO EXECUTIVO (geral) ──
function renderResumo(el){
  const stats=codsFiltrados().map(cod=>({cod,...unitStats(cod)}));
  const pos=[],neg=[],aten=[],acao=[];
  const worstBy=(k,label,fmt)=>{const w=stats.filter(s=>s[k]!=null).sort((a,b)=>a[k]-b[k])[0];if(w)return `${label}: pior unidade <b>${w.cod}</b> (${fmt(w[k])})`;return null;};
  const descV=sumA((DATA.stressV||[]).map(r=>r.desc));
  const descE=sumA((DATA.stressE||[]).filter(r=>r.contratada).map(r=>r.dt));
  const descC=sumA((DATA.cifv||[]).map(r=>r.dt));
  const totDesc=descV+descE+descC;
  const vencPrev=(DATA.prev||[]).filter(r=>_n(r.st)==='VENCIDA').length;
  const vencAl=(DATA.alinh||[]).filter(r=>_n(r.st)==='VENCIDO').length;
  const osFora=(DATA.os||[]).filter(r=>(r.dias??0)>OS_META).length;
  stats.forEach(s=>{[['sv','Stress Veíc.'],['cf','CIFV'],['pv','Preventivas']].forEach(([k,lb])=>{if(s[k]!=null&&s[k]>=100)pos.push(`<b>${s.cod}</b> — ${lb} 100%`);});});
  if(totDesc>0)neg.push(`Descontos da semana somam <b class="cr">${brl(totDesc)}</b> (Stress V ${brl(descV)} · Emp. ${brl(descE)} · CIFV ${brl(descC)})`);
  if(vencPrev)neg.push(`<b class="cr">${vencPrev}</b> preventiva(s) VENCIDA(S)`);
  if(vencAl)neg.push(`<b class="cr">${vencAl}</b> alinhamento(s) vencido(s)`);
  if(osFora)aten.push(`<b class="cy">${osFora}</b> OS(s) acima de ${OS_META} dias em aberto`);
  [ ['sv','Stress Veíc.'],['cf','CIFV'],['pv','Preventivas'],['al','Alinhamento'] ].forEach(([k,lb])=>{const w=worstBy(k,lb,pct1);if(w)aten.push(w);});
  acao.push('Unidades com desconto: tratar placas SEM SAÍDA / não conformes antes da próxima janela.');
  if(vencPrev)acao.push('Programar as preventivas vencidas (tabela Preventivas · piores primeiro).');
  if(osFora)acao.push('Cobrar fornecedores das OSs mais antigas (tabela Gestão de OS).');
  const quad=(t,items,cls)=>`<div class="quad ${cls}"><div class="quad-t">${t}</div>${items.length?'<ul>'+items.slice(0,6).map(i=>`<li>${i}</li>`).join('')+'</ul>':'<div class="mut" style="font-size:11px">—</div>'}</div>`;
  el.innerHTML=`<div class="quads">${quad('✅ Positivos',pos.slice(0,6),'q-pos')}${quad('🔴 Críticos',neg,'q-neg')}${quad('🟡 Atenção',aten,'q-at')}${quad('🎯 Próximos passos',acao,'q-ac')}</div>`;
}

// ── DISPONIBILIDADE (foto da última vigência) ──
function renderDisp(el,cod){
  const rs=(DATA.disp||[]).filter(r=>cod?r.cod===cod:passU(r.cod));
  if(!rs.length){el.innerHTML='<div class="loading">Sem dados de disponibilidade para o recorte.</div>';return;}
  const at=sumA(rs.map(r=>r.ativos)),ind=sumA(rs.map(r=>r.indisp));
  const p=at>0?(at-ind)/at*100:null;
  let h=`<div class="mini-hero"><div class="mh-label">DISPONIBILIDADE</div><div class="mh-val ${dispCls(p)}">${pct1(p)}</div>
    <div class="mh-meta">Meta ${DISP_META}% · Sonho ${DISP_SONHO}% · <b>${Math.round(at)}</b> ativos · <b class="${ind?'cr':'mut'}">${Math.round(ind)}</b> indisponíveis</div></div>`;
  // tabela por unidade (geral) ou por tier (unidade)
  const key=cod?'tier':'cod';
  const g={};rs.forEach(r=>{const k=(cod?(r.tier||'—'):r.cod);(g[k]=g[k]||{ativos:0,indisp:0}).ativos+=r.ativos;g[k].indisp+=r.indisp;});
  h+=wrapT('<table>'+th(cod?'Tier':'Unidade','Ativos','Indisponíveis','Disponib. %')+'<tbody>'+
    Object.keys(g).sort().map(k=>{const o=g[k];const pc=o.ativos>0?(o.ativos-o.indisp)/o.ativos*100:null;
      return `<tr><td><b>${cod?escF(k):escF(k)+' <span class="mut">'+escF(UNIDADES[k]||'')+'</span>'}</b></td>
        <td class="num">${Math.round(o.ativos)}</td><td class="num ${o.indisp?'cr':'mut'}">${Math.round(o.indisp)}</td>
        <td class="num ${dispCls(pc)}">${pct1(pc)}</td></tr>`;}).join('')+'</tbody></table>');
  // placas indisponíveis
  const indL=(DATA.dispInd||[]).filter(r=>cod?r.cod===cod:passU(r.cod)).sort((a,b)=>(b.dias??0)-(a.dias??0));
  if(indL.length){
    const dCls=d=>d==null?'mut':d>7?'cr':d>3?'cy':'cg';
    h+=`<div class="blk-t" style="margin-top:14px">Placas indisponíveis <span class="cr">· ${indL.length}</span></div>`+
      wrapT('<table>'+th(cod?'Placa':'Unidade · Placa','Projeto','Grupo','Problema','Status','Parada em','Previsão','Dias parado')+'<tbody>'+
      indL.slice(0,80).map(r=>`<tr><td><b>${cod?escF(r.placa):(escF(r.cod)+(r.tier?' '+escF(r.tier):'')+' · '+escF(r.placa))}</b></td>
        <td>${escF(r.proj||'—')}</td><td>${escF(r.grupo||'—')}</td>
        <td style="white-space:normal;max-width:280px">${escF((r.desc||'—').slice(0,110))}</td>
        <td>${escF(r.st||'—')}</td><td>${escF(r.dPar||'—')}</td><td>${escF(r.prev||'—')}</td>
        <td class="num ${dCls(r.dias)}">${r.dias==null?'—':Math.round(r.dias)}</td></tr>`).join('')+'</tbody></table>');
  }else if(DATA.dispInd){
    h+=`<div class="tbl-sub" style="margin-top:12px">Nenhuma placa indisponível no recorte. ✓</div>`;
  }
  el.innerHTML=h;
}
// ── PNEUS (foto Prolog — gestão à vista) ──
async function renderPneus(el,cod){
  el.innerHTML='<div class="loading">Lendo a base de Pneus (Prolog/Conlog)…</div>';
  let P;try{P=await loadPneus();}catch(e){el.innerHTML='<div class="loading">Não consegui ler a base de Pneus agora. Tente atualizar.</div>';return;}
  const tires=P.tires.filter(t=>cod?t.cod===cod:true);
  if(!tires.length){el.innerHTML='<div class="loading">Sem pneus no recorte.</div>';return;}
  // aferições: % da frota aferida nos últimos 30 dias
  const veic=P.veic.filter(v=>cod?v.cod===cod:true);
  const ref=P.ult;const afer=veic.length?veic.filter(v=>(ref-v.dt.getTime())<=30*864e5).length/veic.length*100:null;
  // milimetragem
  const cnt={Bloquear:0,Recapar:0,Regular:0,Bom:0};
  tires.forEach(t=>{if(t.st)cnt[t.st]++;});
  const totMM=tires.filter(t=>t.st).length;
  const crit=cnt.Bloquear+cnt.Recapar;
  const mmOk=totMM?(totMM-crit)/totMM*100:null;
  // calibragem
  const comP=tires.filter(t=>t.pIdeal>0&&t.desv!=null);
  const calOk=comP.length?comP.filter(t=>Math.abs(t.desv)<=10).length/comP.length*100:null;
  const card=(lb,val,cls,sub)=>`<div class="ch-min"><span>${lb}</span><b class="${cls}">${val}</b>${sub?`<small class="mut">${sub}</small>`:''}</div>`;
  let h=`<div class="custos-hero">
    ${card('Aferições (30d)',pct1(afer),clsPctMeta(afer,95,85),veic.length+' veículos')}
    ${card('Milimetragem OK',pct1(mmOk),clsPctMeta(mmOk,90,75),totMM+' pneus')}
    ${card('Calibragem OK',pct1(calOk),clsPctMeta(calOk,90,75),'±10% ideal')}
    ${card('Críticos',String(crit),crit?'cr':'cg','bloquear+recapar')}
  </div>`;
  const stCls=s=>s==='Bloquear'?'cr':s==='Recapar'?'cy':s==='Regular'?'':'cg';
  const pl=t=>cod?escF(t.placa):escF(t.cod)+(t.tier?' '+escF(t.tier):'')+' · '+escF(t.placa);
  const pos=t=>escF(String(t.nomePosicao||t.posicao||'—'));

  // 1) AFERIÇÕES · Ranking de Placas — placa aferida há mais tempo primeiro
  const byPl={}; tires.forEach(t=>{ if(!t.placa)return; const c=byPl[t.placa]; if(!c||new Date(t.dt)>new Date(c.dt)) byPl[t.placa]={placa:t.placa,cod:t.cod,tier:t.tier,dt:t.dt}; });
  const placas=Object.values(byPl).map(p=>({...p,dias:Math.round((P.ult-new Date(p.dt).getTime())/864e5)})).sort((a,b)=>b.dias-a.dias).slice(0,50);
  h+=`<div class="blk-t">Aferições · Ranking de Placas</div>`+
    wrapT('<table>'+th(cod?'Placa':'Unidade · Placa','Última aferição','Dias','Situação')+'<tbody>'+
    placas.map(p=>`<tr><td><b>${cod?escF(p.placa):escF(p.cod)+(p.tier?' '+escF(p.tier):'')+' · '+escF(p.placa)}</b></td>
      <td>${new Date(p.dt).toLocaleDateString('pt-BR')}</td>
      <td class="num ${p.dias<=30?'cg':'cr'}">${p.dias}</td>
      <td class="${p.dias<=30?'cg':'cr'}">${p.dias<=30?'Em dia':'Aferir'}</td></tr>`).join('')+'</tbody></table>');

  // 2) MILIMETRAGEM · Ranking por Nº de Fogo — menor sulco primeiro (Previsão de Troca completa vem na próxima etapa)
  const mmRank=tires.filter(t=>t.menor!=null).sort((a,b)=>a.menor-b.menor).slice(0,50);
  h+=`<div class="blk-t">Milimetragem · Ranking por Nº de Fogo</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <span class="pill" style="background:#FF6666">${cnt.Bloquear} Bloquear</span>
      <span class="pill" style="background:#EAB308">${cnt.Recapar} Recapar</span>
      <span class="pill" style="background:#38BDF8">${cnt.Regular} Regular</span>
      <span class="pill" style="background:#3BB33B">${cnt.Bom} Bom</span></div>`+
    wrapT('<table>'+th('Nº de Fogo',cod?'Placa':'Unidade · Placa','Posição','Sulco mm','Status')+'<tbody>'+
    mmRank.map(t=>`<tr><td><b>${escF(t.serial||'—')}</b></td><td>${pl(t)}</td><td>${pos(t)}</td>
      <td class="num ${t.menor<2?'cr':t.menor<=3?'cy':'cg'}">${t.menor.toFixed(1)}</td>
      <td class="${stCls(t.st)}">${escF(t.st||'—')}</td></tr>`).join('')+'</tbody></table>');

  // 3) CALIBRAGEM · Ranking por Nº de Fogo — maior desvio de pressão primeiro
  const calRank=tires.filter(t=>t.desv!=null).sort((a,b)=>Math.abs(b.desv)-Math.abs(a.desv)).slice(0,50);
  h+=`<div class="blk-t">Calibragem · Ranking por Nº de Fogo</div>`+
    wrapT('<table>'+th('Nº de Fogo',cod?'Placa':'Unidade · Placa','Posição','Desvio pressão')+'<tbody>'+
    calRank.map(t=>`<tr><td><b>${escF(t.serial||'—')}</b></td><td>${pl(t)}</td><td>${pos(t)}</td>
      <td class="num ${Math.abs(t.desv)>10?'cr':'cg'}">${(t.desv>0?'+':'')+Math.round(t.desv)+'%'}</td></tr>`).join('')+'</tbody></table>');
  const dt=new Date(P.ult);
  h+=`<div class="tbl-sub" style="margin-top:8px">Foto Prolog de ${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · 1 leitura por posição (aferição mais recente, só pneus em uso). Milimetragem: &lt;2 Bloquear · ≤3 Recapar · ≤6 Regular · &gt;6 Bom. Calibragem OK = ±10% da ideal.</div>`;
  el.innerHTML=h;
}

// ═══════════════ MONTAGEM DAS PÁGINAS ═══════════════
function renderFarol(el,cod){
  const S=[];
  if(!cod){S.push(['resumo','Resumo Executivo','Leitura automática do farol da semana']);S.push(['ranking','Ranking das Unidades','Aderências por indicador — melhor → pior']);}
  S.push(['custos','Custos','Realizado × Remunerado × Orçado — '+(cod?'por projeto':'por unidade')]);
  S.push(['stressv','Stress Test — Veículos','Aderência (com saída) vs meta 100% · descontos por placa']);
  S.push(['stresse','Stress Test — Empilhadeiras','Aderência 1ª/2ª quinzena · descontos por equipamento']);
  S.push(['prev','Preventivas','Aderência vs 100% · placas por status, dias e km']);
  S.push(['cifv','CIFV','Aderência das fotos da frota vs 100% · descontos por veículo']);
  S.push(['alinh','Alinhamento','No prazo vs vencidos · placas por próximo evento']);
  S.push(['os','Gestão de OS','% no prazo (≤8 dias) · OSs em aberto']);
  S.push(['disp','Disponibilidade','Foto da última vigência — veículos disponíveis da frota']);
  S.push(['pneus','Pneus','Aferições · Milimetragem · Calibragem (foto Prolog, como no painel Pneus)']);
  el.innerHTML=S.map(([id,t,sub])=>secBox(id,t,sub)).join('');
  const put=(id,fn)=>{const b=document.getElementById('body-'+id);try{fn(b,cod);}catch(e){console.error(id,e);b.innerHTML='<div class="loading">Erro ao montar esta seção.</div>';}};
  if(!cod){put('resumo',el2=>renderResumo(el2));put('ranking',el2=>renderRanking(el2));}
  put('custos',renderCustos);put('stressv',renderStressV);put('stresse',renderStressE);
  put('prev',renderPrev);put('cifv',renderCIFV);put('alinh',renderAlinh);put('os',renderOS);
  put('disp',renderDisp);
  renderPneus(document.getElementById('body-pneus'),cod).catch(e=>{console.error('pneus',e);});
}

// hero da página: dots por indicador
function renderHeroDots(el,cod){
  const stats=cod?unitStats(cod):(()=>{ // geral = média das unidades (respeita o filtro)
    const all=codsFiltrados().map(unitStats);
    const m=k=>avgA(all.map(a=>a[k]));
    return {sv:m('sv'),se:m('se'),cf:m('cf'),pv:m('pv'),al:m('al'),os:m('os'),cu:m('cu'),dp:m('dp'),af:m('af'),mm:m('mm'),ca:m('ca')};
  })();
  const dot=(v,cls)=>`<span class="dot ${cls==='cg'?'g':cls==='cy'?'y':cls==='cr'?'r':''}" style="${cls==='mut'?'background:#475569':''}"></span>`;
  const item=(lb,v,cls)=>`<div class="hero-delta"><span>${lb}</span><b class="${cls}">${dot(v,cls)} ${pct1(v)}</b></div>`;
  el.innerHTML=
    item('Stress Veíc.',stats.sv,clsPctMeta(stats.sv))+
    item('Stress Emp.',stats.se,clsPctMeta(stats.se))+
    item('CIFV',stats.cf,clsPctMeta(stats.cf))+
    item('Preventivas',stats.pv,clsPctMeta(stats.pv))+
    item('Alinhamento',stats.al,stats.al==null?'mut':stats.al>=80?'cg':'cr')+
    item('OS no prazo',stats.os,stats.os==null?'mut':stats.os>=90?'cg':stats.os>=70?'cy':'cr')+
    item('Disponib.',stats.dp,dispCls(stats.dp))+
    item('Aferições',stats.af,clsPctMeta(stats.af,95,85))+
    item('Milimetragem',stats.mm,clsPctMeta(stats.mm,90,75))+
    item('Calibragem',stats.ca,clsPctMeta(stats.ca,90,75))+
    `<div class="hero-delta"><span>Custos Δ Orç</span><b class="${stats.cu==null?'mut':stats.cu<=0?'cg':stats.cu<=5?'cy':'cr'}">${stats.cu==null?'—':(stats.cu>0?'+':'')+pct1(stats.cu)}</b></div>`;
  return stats;
}

// ═══════════════ FILTRO MULTI-SELECT (idêntico ao visão-financeira) ═══════════════
// wrap._sel = Set; VAZIO = "Todas". _farolRepaint() é definido pela página.
let _farolRepaint=()=>{};
function syncBadge(wrap){const cnt=wrap.querySelector('.ms-cnt'),n=wrap._sel?wrap._sel.size:0;if(cnt){cnt.textContent=n;cnt.style.display=n?'':'none';}}
function toggleMs(id){
  document.querySelectorAll('.ms-panel.open').forEach(p=>{if(p.closest('.ms-wrap').id!==id)p.classList.remove('open');});
  const panel=document.querySelector(`#${id} .ms-panel`);panel.classList.toggle('open');
  if(panel.classList.contains('open')){const inp=panel.querySelector('input[type=text]');if(inp)setTimeout(()=>inp.focus(),50);}
}
function getMsValues(id){const wrap=document.getElementById(id);return wrap&&wrap._sel?[...wrap._sel]:[];}
function _buildMs(wrap,renderFn,getAll){
  if(!(wrap._sel instanceof Set))wrap._sel=new Set();
  const sel=wrap._sel,list=wrap.querySelector('.ms-list'),srch=wrap.querySelector('.ms-search input');
  const render=q=>{renderFn(list,sel,q!==undefined?q:(srch.value||''));syncBadge(wrap);};
  wrap._render=render;
  if(!wrap._wired){
    wrap._wired=true;
    list.addEventListener('change',e=>{
      const box=e.target;
      if(box.classList.contains('ms-all')){sel.clear();}
      else if(sel.size===0){if(!box.checked){const all=getAll?getAll():[];all.forEach(v=>{if(v!==box.dataset.v)sel.add(v);});}}
      else{if(box.checked)sel.add(box.dataset.v);else sel.delete(box.dataset.v);if(getAll){const all=getAll();if(all.length>0&&all.every(v=>sel.has(v)))sel.clear();}}
      render(srch.value);_farolRepaint();
    });
    list.addEventListener('click',e=>{const only=e.target.closest('.ms-only');if(!only)return;e.preventDefault();e.stopPropagation();sel.clear();sel.add(only.dataset.v);render(srch.value);_farolRepaint();});
    srch.addEventListener('input',()=>render(srch.value));
    srch.addEventListener('click',e=>e.stopPropagation());
  }
  render();
}
function buildMsFilter(id,items){
  const wrap=document.getElementById(id);if(!wrap)return;wrap._items=items;
  _buildMs(wrap,(list,sel,q)=>{
    const it=wrap._items||[],f=q.toLowerCase(),shown=it.filter(v=>v.toLowerCase().includes(f)),allChk=sel.size===0;
    list.innerHTML=(!q?`<label class="ms-opt all-opt"><input type="checkbox" class="ms-all" ${allChk?'checked':''}> Todas</label>`:'')+
      shown.map(v=>`<label class="ms-opt"><input type="checkbox" data-v="${escF(v)}" ${allChk||sel.has(v)?'checked':''}> ${escF(v)}<span class="ms-only" data-v="${escF(v)}">só</span></label>`).join('');
  },()=>wrap._items||[]);
}
document.addEventListener('click',e=>{if(!e.target.closest('.ms-wrap'))document.querySelectorAll('.ms-panel.open').forEach(p=>p.classList.remove('open'));});
