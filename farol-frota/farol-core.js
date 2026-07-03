// ═══════════════════════════════════════════════════════════════════════════
// Farol Frota — núcleo compartilhado (geral.html e unidade.html)
// Fonte: planilha do Farol (abas por indicador) + painéis Pneus/Disponibilidade.
// As seções de planilha são ligadas por MAPEAMENTO DE COLUNAS (SECOES abaixo)
// preenchido a partir dos cabeçalhos reais das abas — nada de adivinhar índice.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL='https://lozwipoeacpvplgkrxkq.supabase.co';
const SUPABASE_KEY='sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';
const FAROL_SHEET_ID='1xOv7OJzErGV3vNCMOY_5O6px7vFvC990CW-1vGul5sY';

// unidades do portal (código → nome exibido). O de-para p/ o nome usado na
// planilha do Farol (ex.: "CDD RIO DE JANEIRO") entra quando mapearmos as abas.
const UNIDADES={
  'BLC':'Balneário Camboriú','CBA':'Cuiabá','CGR':'Campo Grande','FLP':'Florianópolis','GRL':'Guarulhos',
  'MCC':'Cachoeiras de Macacu','NFR':'Nova Friburgo','PIR':'Piraí','PLT':'Pelotas','RON':'Rondonópolis'
};

// ── Seções do Farol (ordem de exibição). status:'pendente' = aguardando o
//    print do cabeçalho da aba p/ mapear as colunas; 'painel' = reusa painel existente.
const SECOES=[
  {id:'custos',        titulo:'Custos',                    aba:'Custos',                    status:'pendente',
   desc:'Orç. × Rem × Real por conta gerencial — deltas com condicional (geral: por unidade · unidade: por projeto).'},
  {id:'stress',        titulo:'Stress Test — Veículos',    aba:'Stress Test / Stress Test Veículos', status:'pendente',
   desc:'Aderência vs meta 100% + bottom por projeto + descontos por placa (saída/sem saída, viagens, R$).'},
  {id:'stress-emp',    titulo:'Stress Test — Empilhadeiras', aba:'Stress Test Empilhadeiras', status:'pendente',
   desc:'Aderência 1ª/2ª quinzena e total + descontos por equipamento (placa Ginfo).'},
  {id:'cifv',          titulo:'CIFV',                      aba:'CIFV',                      status:'pendente',
   desc:'Aderência das fotos da frota vs 100% + descontos (lavagem/manutenção) + detalhe por veículo (Conforme/Rejeitado).'},
  {id:'preventivas',   titulo:'Preventivas',               aba:'Preventivas',               status:'pendente',
   desc:'Aderência + estratificação por placa (status, dias e km até vencer — dias <0 vermelho · 0–30 amarelo · >30 verde).'},
  {id:'alinhamento',   titulo:'Alinhamento',               aba:'Alinhamentos',              status:'pendente',
   desc:'Aderência + status dos alinhamentos + placas com próximo evento e dias.'},
  {id:'os',            titulo:'Gestão de OS',              aba:'OS em aberto',              status:'pendente',
   desc:'Média de dias em aberto vs meta 8 + bottom por segmento e fornecedor + OSs abertas (unidade).'},
  {id:'pneus',         titulo:'Pneus',                     aba:null,                        status:'painel',
   desc:'Fonte: base Conlog (API Prolog) — milimetragem, aferições, pneus críticos. Reusa o painel Pneus.'},
  {id:'disponibilidade',titulo:'Disponibilidade',          aba:null,                        status:'painel',
   desc:'Fonte: painel Disponibilidade — % vs meta/atenção, S-1 e aberturas de indisponibilidade.'},
];

// ── infra comum ──
function gvizT(sheet){ // lê aba da planilha do Farol com cabeçalhos
  return new Promise((res,rej)=>{
    const fn='_fv'+Math.floor(Math.random()*1e9);const s=document.createElement('script');
    const clr=()=>{try{delete window[fn];s.remove();}catch(e){}};
    window[fn]=r=>{clr();try{if(r.status!=='ok')throw 0;
      const cols=(r.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
      const rows=(r.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
      res({cols,rows});}catch(e){rej(e);}};
    s.onerror=()=>{clr();rej(0);};
    s.src=`https://docs.google.com/spreadsheets/d/${FAROL_SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheet)}&headers=1&tqx=out:json;responseHandler:${fn}`;
    document.head.appendChild(s);
    setTimeout(()=>{clr();rej('timeout');},15000);
  });
}
const escF=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// gate de admin (mesmo padrão dos demais painéis)
async function farolGate(){
  let sb;
  try{ sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY); }catch(e){ return {ok:false,msg:'Falha ao iniciar o Supabase.'}; }
  const {data:{session}}=await sb.auth.getSession();
  if(!session) return {ok:false,msg:'Entre pelo <b>hub</b> para acessar o Farol.'};
  const {data:prof}=await sb.from('fca_profiles').select('is_admin').eq('user_id',session.user.id).maybeSingle();
  if(!prof||!prof.is_admin) return {ok:false,msg:'O Farol é restrito aos administradores. As unidades recebem por e-mail (segunda, 14h).'};
  return {ok:true,sb,session};
}

// render das seções (esqueleto — cada seção vira conteúdo real conforme o mapeamento entra)
function renderSecoes(el,escopo){
  el.innerHTML=SECOES.map(s=>{
    const badge=s.status==='painel'
      ?'<span class="sec-badge pan">liga no painel existente</span>'
      :'<span class="sec-badge pen">aguardando mapeamento da aba</span>';
    return `<div class="tbl-section" id="sec-${s.id}">
      <div class="tbl-title">${escF(s.titulo)} ${badge}</div>
      <div class="tbl-sub">${escF(s.desc)}${s.aba?` · Aba: <b>${escF(s.aba)}</b>`:''}</div>
      <div class="sec-body"><div class="loading">Estrutura pronta — os dados entram quando a aba for mapeada${escopo?' (recorte: '+escF(escopo)+')':''}.</div></div>
    </div>`;
  }).join('');
}
