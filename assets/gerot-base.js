// ============================================================
// Base Gerot / Frota de Elite — fonte: elite_snapshot (Supabase),
// gravado pelo robô (scripts/elite-robot.mjs). A planilha Frota de
// Elite (GerotBase antigo via gviz) está aposentada como fonte.
//
// Não existe mais "IV"/"IC": é tudo INDICADOR (Renan, plano do robô).
//   INDICADORES        → os indicadores-chave, iguais nas DUAS bases
//                        (Frota de Elite e Gerot), lidos da MESMA fonte.
//   INDICADORES_GEROT  → os adicionais que só aparecem no Gerot, para
//                        gerar ação; não pontuam no Frota de Elite.
//
// Contrato mantido para os painéis:
//   load() → records {field, label, unit, vig, meta, real, atg, atgMeta}
//     · real em pontos percentuais (0-100) · vig = 'YYYY-MM'
//     · chave: `atg` = a PRÓPRIA aderência — é o que o Frota de Elite pontua
//       (pesos do programa montados em cima disso, Renan 05/08/2026);
//       `meta` = METAS e `atgMeta` = real ÷ meta, que é o que o Gerot mostra
//       e de onde saem os FCAs da RPM (Renan 07/08/2026)
//     · adicionais: meta = regra do termômetro / do painel de origem,
//       atg = atgMeta = meta/real ('lower') ou real/meta ('higher'),
//       com soGerot:true
//
// Novo:
//   acumFor(vigsArr) → records do ACUMULADO da janela selecionada
//     (síncrono, usa o cache do load()). Regra por tipo de indicador:
//     · % por filial (disp, prev, checkT, checkWH, conf, sla): janela
//       jan→M usa o escopo 'ano' coletado do Ginfo (acumulado ponderado
//       da própria tela — média de médias NÃO é acumulado). Janela que
//       não começa em janeiro não tem acumulado exato → média mensal.
//     · 1/0 por equipamento (stVeic, stEmp, civf): junta as linhas dos
//       meses da janela e recalcula — isso É a ponderação exata.
//     · pneus: 1/0 por placa da aba 'Pneus' do Sheets (Frota de Elite,
//       colada do Ginfo pelo Renan) — pool exato em qualquer janela;
//       fallback: contagens da API no elite_snapshot.
//     · comb: Σ km / Σ litros da janela vs média do Rem.
//
// Unidades: nomes do Ginfo ('CDD CUIABA', 'CUIABA EMPURRADA', …), os
// mesmos que os painéis usam (NOMES do programa-reconhecimento).
// ============================================================
(function(global){
  const GEM_URL = 'https://lozwipoeacpvplgkrxkq.supabase.co';
  const GEM_KEY = 'sb_publishable_ggKEEebc5zjgQDVsF92Upw_6uoLmKe9';

  const NK = s => String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();

  // ── filial dos exports → unidade canônica (mesmo de-para do farol-core) ──
  const FIL2COD = {
    'CDD CAMBORIU':'BLC','BALNEARIO CAMBORIU':'BLC',
    'CDD CUIABA':'CBA T2','CUIABA':'CBA T1 WH','CUIABA EMPURRADA':'CBA T1',
    'CDD RIO DE JANEIRO':'CGR','CAMPO GRANDE':'CGR',
    'CDD FLORIANOPOLIS':'FLP','FLORIANOPOLIS':'FLP',
    'CDD GUARULHOS':'GRL','GUARULHOS':'GRL',
    'CDI MACACU':'MCC T2','MACACU EMPURRADA':'MCC T1','CACHOEIRAS DE MACACU':'MCC T2','MACACU':'MCC T2',
    'CDD NOVA FRIBURGO':'NFR','NOVA FRIBURGO':'NFR',
    'PIRAI EMPURRADA':'PIR','PIRAI':'PIR',
    'CDD PELOTAS':'PLT','PELOTAS':'PLT',
    'CDD RONDONOPOLIS':'RON','RONDONOPOLIS':'RON'
  };
  const COD2UNIT = {
    'BLC':'CDD CAMBORIU','CBA T2':'CDD CUIABA','CBA T1 WH':'CUIABA','CBA T1':'CUIABA EMPURRADA',
    'CGR':'CDD RIO DE JANEIRO','FLP':'CDD FLORIANOPOLIS','GRL':'CDD GUARULHOS',
    'MCC T2':'CDI MACACU','MCC T1':'MACACU EMPURRADA','NFR':'CDD NOVA FRIBURGO',
    'PIR':'PIRAI EMPURRADA','PLT':'CDD PELOTAS','RON':'CDD RONDONOPOLIS'
  };
  // refina o tier de CBA/MCC pelo projeto da linha (igual ao refineCod do farol)
  function refineCodG(cod, proj){
    if(!cod) return cod;
    const p = NK(proj);
    if(cod.startsWith('CBA')){
      if(/EMPURRAD/.test(p)) return 'CBA T1';
      if(/APOIO|EMPILHADEIRA|\bWH\b/.test(p)) return 'CBA T1 WH';
      if(/ROTA|CDD|AUTO SERVICO/.test(p)) return 'CBA T2';
      return cod;
    }
    if(cod.startsWith('MCC')){
      if(/EMPURRAD/.test(p)) return 'MCC T1';
      if(/ROTA|CDI|CDD|AUTO SERVICO/.test(p)) return 'MCC T2';
      return cod;
    }
    return cod;
  }
  // ── FUSÃO DE UNIDADES (Frota de Elite, Renan 14/08/2026) ─────────────────
  // CDI MACACU + MACACU EMPURRADA viram uma unidade só: MACACU. É opt-in
  // (load({fundir:true})) porque o Gerot e os FCAs da RPM continuam tratando
  // os dois tiers separados — lá o RPM_UNIT_MAP depende dos nomes originais.
  // A fusão acontece AQUI, na origem: assim as telas de contagem (conformidade,
  // pneus, stress, CIVF, combustível) já poolam sozinhas — a soma das contagens
  // É o número exato. As telas que só dão % ganham PESO (ver PESOS abaixo) e
  // viram média ponderada pelo denominador de cada uma. Nada de média de médias.
  const FUSAO = {'CDI MACACU':'MACACU','MACACU EMPURRADA':'MACACU'};
  let FUNDIR = false;
  const fundido = u => (FUNDIR && u && FUSAO[u]) ? FUSAO[u] : u;
  function canonUnit(filial, proj){
    const cod = refineCodG(FIL2COD[NK(filial)]||null, proj);
    return fundido(cod ? COD2UNIT[cod] : NK(filial));
  }

  // ── parsers de valor do export (xlsx → JSON: número, "96,9%", "0,969"…) ──
  function numVal(v){
    if(v==null||v==='') return null;
    if(typeof v==='number') return isFinite(v)?v:null;
    let s=String(v).replace(/[%\s]/g,'');
    if(s.indexOf(',')>=0) s=s.replace(/\./g,'').replace(',','.');
    const n=parseFloat(s); return isFinite(n)?n:null;
  }
  function pctVal(v){
    const n=numVal(v); if(n==null) return null;
    return Math.abs(n)<=1.5 ? n*100 : n;    // 0.969 → 96,9 · 96,9 → 96,9
  }
  // durações (MTTR/MTBF/Tempo Médio): "hh:mm:ss" → segundos; número ≤2 é
  // fração de dia do Excel (→ ×86400); número maior fica como veio.
  function timeVal(v){
    if(v==null||v==='') return null;
    const s=String(v); const m=s.match(/(\d+):(\d+)(?::(\d+))?/);
    if(m) return (+m[1])*3600+(+m[2])*60+(+(m[3]||0));
    const n=numVal(v); if(n==null) return null;
    return Math.abs(n)<=2 ? n*86400 : n;
  }
  // acha a chave do objeto pelo nome normalizado (exato → depois "contém")
  function kOf(sample, ...names){
    if(!sample) return null;
    const ks=Object.keys(sample), N=ks.map(NK);
    for(const nm of names){ const i=N.indexOf(NK(nm)); if(i>=0) return ks[i]; }
    for(const nm of names){ const t=NK(nm); const i=N.findIndex(k=>k.includes(t)); if(i>=0) return ks[i]; }
    return null;
  }

  // ── elite_snapshot em cache: E[escopo][indicador][vig 'YYYY-MM'] = rows ──
  let E=null;
  const PCT_INDS=['disponibilidade','preventivas','checklist-t2','checklist-t1','checklist-wh','conformidade','sla-manutencao'];
  async function fetchElite(){
    if(E) return E;
    const sb = global.supabase.createClient(GEM_URL, GEM_KEY);
    const [mes, ano] = await Promise.all([
      sb.from('elite_snapshot').select('indicador,vigencia,data').eq('escopo','mes'),
      // 'conformidade-mar' (acumulado mar→M das empurradas) saiu: março deixou de
      // contar para elas em 18/08/2026, então aquela janela ficou contaminada.
      sb.from('elite_snapshot').select('indicador,vigencia,data').eq('escopo','ano').in('indicador', PCT_INDS),
    ]);
    if(mes.error) throw mes.error;
    if(ano.error) throw ano.error;
    E={mes:{},ano:{}};
    const put=(esc,r)=>{ const m=String(r.vigencia).match(/(\d{2})\/(\d{4})/); if(!m) return;
      const vig=m[2]+'-'+m[1];
      ((E[esc][r.indicador]=E[esc][r.indicador]||{})[vig]=Array.isArray(r.data)?r.data:[]); };
    (mes.data||[]).forEach(r=>put('mes',r));
    (ano.data||[]).forEach(r=>put('ano',r));
    return E;
  }
  const vigsDe = ind => E&&E.mes[ind] ? Object.keys(E.mes[ind]) : [];

  // ── adaptadores: linhas de um export → [{unit, real}] por vigência ────────
  // Conformidade: Piraí/Macacu/Cuiabá Empurrada + CDD Rio usam a Bimestral de
  // jan a jun; as demais a Mensal. De julho/2026 em diante, TODAS a Bimestral.
  const CONF_BIM = new Set(['PIRAI EMPURRADA','MACACU EMPURRADA','CUIABA EMPURRADA','CDD RIO DE JANEIRO']);
  const confBimestral = (unit, vigFim) => vigFim >= '2026-07' || CONF_BIM.has(unit);
  // Empurradas só contam Conformidade de ABR/2026 em diante (Renan, 18/08/2026 —
  // antes a regra era mar/2026): jan, fev e mar ficam SEM VALOR, no mensal, no
  // acumulado e nos adicionais de conformidade. Sem valor ≠ zero: o peso do
  // indicador é redistribuído entre os que a unidade tem.
  const CONF_EMP = new Set(['PIRAI EMPURRADA','MACACU EMPURRADA','CUIABA EMPURRADA']);
  const CONF_EMP_INI = '2026-04';
  const confVale = (unit, vigFim) => vigFim >= CONF_EMP_INI || !CONF_EMP.has(unit);

  function direto(rows, vigFim, opts){
    // opts: {col:[nomes], proj?:string (tier default), conf?:true,
    //        peso?:[nomes da coluna denominadora], pesoHoras?:true}
    const out=[];
    const s=rows[0]; if(!s) return out;
    const kFil=kOf(s,'Filial'), kMen=opts.conf?kOf(s,'Aderência Mensal'):null, kBim=opts.conf?kOf(s,'Aderência Bimestral'):null;
    const kVal=opts.conf?null:kOf(s,...opts.col);
    const kPeso=opts.peso?kOf(s,...opts.peso):null;
    if(!kFil||(!kVal&&!opts.conf)) return out;
    rows.forEach(r=>{
      const unit=canonUnit(r[kFil], opts.proj||'');
      if(opts.conf && unit && !confVale(unit,vigFim)) return;
      const v=opts.conf ? pctVal(r[confBimestral(unit,vigFim)?kBim:kMen]) : pctVal(r[kVal]);
      if(unit&&v!=null) out.push({unit, real:v, peso:pesoDa(r,kPeso,v,opts)});
    });
    return fundeLinhas(out);
  }
  // peso = denominador da tela. Na Disponibilidade a tela não dá as horas totais,
  // mas elas saem do próprio par: horas = Tempo Indisponível ÷ (1 − disp).
  function pesoDa(r,kPeso,v,opts){
    if(!kPeso) return null;
    if(opts.pesoHoras){ const t=timeVal(r[kPeso]); return (t!=null&&v<100)?t/(1-v/100):null; }
    const n=numVal(r[kPeso]); return (n!=null&&n>0)?n:null;
  }
  // duas filiais na mesma unidade (fusão) → média PONDERADA pelo denominador.
  // Se faltar peso em alguma, cai na média simples e avisa no console.
  function fundeLinhas(out){
    if(!FUNDIR) return out;
    const g={};
    out.forEach(o=>{ const t=g[o.unit]=g[o.unit]||{vals:[],pesos:[]}; t.vals.push(o.real); t.pesos.push(o.peso); });
    return Object.entries(g).map(([unit,t])=>{
      if(t.vals.length===1) return {unit, real:t.vals[0], peso:t.pesos[0]};
      const todosComPeso=t.pesos.every(p=>p!=null&&isFinite(p)&&p>0);
      if(todosComPeso){
        const sw=t.pesos.reduce((a,b)=>a+b,0);
        return {unit, real:t.vals.reduce((a,v,i)=>a+v*t.pesos[i],0)/sw, peso:sw};
      }
      console.warn('GerotBase: fusão sem denominador em', unit, '— média simples');
      return {unit, real:t.vals.reduce((a,b)=>a+b,0)/t.vals.length, approx:true};
    });
  }
  // ISENÇÕES do Stress Test de empilhadeira (Renan, 07/08/2026): erro de
  // cadastro ENTRE UNIDADES gerou desconto indevido. Estes equipamentos contam
  // sem desconto nas vigências indicadas. O casamento é pelo identificador, não
  // pela unidade — a unidade é justamente o que estava errado.
  const ST_EMP_ISENTOS = [
    {id:'EMP2024', unidade:'CDD FLORIANOPOLIS', de:'2026-01', ate:'2026-05'},
    {id:'EMP2026', unidade:'CDD PELOTAS',       de:'2026-01', ate:'2026-05'},
  ];
  const semEspaco = s => NK(s).replace(/[\s.\-]/g,'');
  function stEmpIsento(row, kId, vig){
    if(!kId||!vig) return false;
    const id=semEspaco(row[kId]); if(!id) return false;
    return ST_EMP_ISENTOS.some(x=>semEspaco(x.id)===id && vig>=x.de && vig<=x.ate);
  }

  const ST_EMP_OPTS = {fil:['Filial GINFO','Filial FT x GINFO','Filial FT'], desc:['Desc. Total'],
                       idCol:['Placa Ginfo','Chassis'], isencao:stEmpIsento};

  // 1/0 por equipamento → agrega por unidade {unit:{ok,n}} (para pool multi-vig)
  function contagem10(rows, opts, vig){
    const g={};
    const s=rows[0]; if(!s) return g;
    const kFil=kOf(s,...opts.fil), kProj=opts.projCol?kOf(s,...opts.projCol):null, kDesc=kOf(s,...opts.desc);
    const kId=opts.idCol?kOf(s,...opts.idCol):null;
    if(!kFil||!kDesc) return g;
    rows.forEach(r=>{
      const unit=canonUnit(r[kFil], kProj?r[kProj]:'');
      if(!unit) return;
      const isento=opts.isencao&&opts.isencao(r,kId,vig);
      const d=isento?0:numVal(r[kDesc]);
      const o=g[unit]=g[unit]||{ok:0,n:0};
      o.n++; if(d==null||d===0) o.ok++;
    });
    return g;
  }
  // ── Conformidade · REGRA NOVA do Ginfo (08/2026) ─────────────────────────
  // A aderência passou a ser medida pelo PRAZO DE VENCIMENTO de cada
  // equipamento (WH 30 dias · DU 60 dias), então acabou a distinção
  // Mensal x Bimestral: a periodicidade já está embutida no Status.
  //   OK  = Realizado Dentro Prazo + No Prazo
  //   NOK = Nunca Realizado + Não Realizado + Realizado Fora Prazo
  //   Aderência = OK ÷ (soma dos cinco)
  // Como são CONTAGENS, somar os meses da janela dá o acumulado exato — igual
  // ao Stress Test. Mas só DENTRO da metade nova do ano: ver o corte abaixo.
  // ── O CORTE DE AGOSTO/2026 ────────────────────────────────────────────────
  // O Ginfo trocou a régua no meio do ano. Para não penalizar nem beneficiar
  // unidade nenhuma, 2026 tem DUAS metades e cada uma é medida com a régua da
  // sua época (Renan, 11/08/2026):
  //     jan→jul  = o que o robô coletou ANTES da mudança (Mensal/Bimestral)
  //     ago→dez  = a régua nova (contagens por status de prazo)
  // No acumulado que cruza o corte, a conformidade do ano é a MÉDIA SIMPLES
  // das duas metades — não a soma das contagens, que misturaria as réguas.
  const CONF_CORTE = '2026-08';
  const confRegraNova = vig => String(vig) >= CONF_CORTE;

  const CONF_OK  = ['Realizado Dentro Prazo','No Prazo'];
  const CONF_NOK = ['Nunca Realizado','Não Realizado','Realizado Fora Prazo'];
  const confNovo = rows => !!(rows[0] && kOf(rows[0],'Realizado Dentro Prazo'));
  function contagemConf(rows, vig){
    const g={};
    const s=rows[0]; if(!s) return g;
    const kFil=kOf(s,'Filial'); if(!kFil) return g;
    const kOk=CONF_OK.map(n=>kOf(s,n)), kNok=CONF_NOK.map(n=>kOf(s,n));
    if(kOk.some(k=>!k)) return g;
    rows.forEach(r=>{
      const unit=canonUnit(r[kFil],''); if(!unit) return;
      if(!confVale(unit,vig)) return;              // empurradas só de abr/2026
      const ok  = kOk .reduce((a,k)=>a+(numVal(r[k])||0),0);
      const nok = kNok.reduce((a,k)=>a+(k?(numVal(r[k])||0):0),0);
      if(!(ok+nok)) return;
      const o=g[unit]=g[unit]||{ok:0,n:0};
      o.ok+=ok; o.n+=ok+nok;
    });
    return g;
  }

  function contagemPneus(rows){
    const g={};
    const s=rows[0]; if(!s) return g;
    const kFil=kOf(s,'Filial'), kOk=kOf(s,'Aferidos em 30 dias'), kFr=kOf(s,'Frota');
    if(!kFil) return g;
    rows.forEach(r=>{
      const unit=canonUnit(r[kFil],'');
      if(!unit) return;
      const o=g[unit]=g[unit]||{ok:0,n:0};
      o.ok+=numVal(r[kOk])||0; o.n+=numVal(r[kFr])||0;
    });
    return g;
  }
  const pctDe = g => Object.entries(g).map(([unit,o])=>({unit, real:o.n?o.ok/o.n*100:null})).filter(x=>x.real!=null);

  // um indicador (field) numa vigência, a partir do escopo pedido
  function valores(field, esc, vig){
    const src=E[esc];
    switch(field){
      // peso = denominador de cada tela (só usado quando há fusão de unidades)
      case 'disp':    return direto(src['disponibilidade']?.[vig]||[], vig, {col:['Disponibilidade Veículos'], peso:['Tempo Indisponível'], pesoHoras:true});
      case 'prev':    return direto(src['preventivas']?.[vig]||[],     vig, {col:['Aderência'], peso:['Preventivas Realizadas']});
      case 'sla':     return direto(src['sla-manutencao']?.[vig]||[],  vig, {col:['SLA Atendimento'], peso:['Executadas']});
      case 'conf': {
        const rows=src['conformidade']?.[vig]||[];
        const novo=confNovo(rows);
        // de agosto/2026 em diante manda a régua nova (contagens por status)
        if(confRegraNova(vig)) return novo ? pctDe(contagemConf(rows,vig)) : direto(rows, vig, {conf:true});
        // antes do corte vale o que foi coletado na régua antiga. Se a linha já
        // tiver sido recoletada no formato novo, usa o que existe — melhor um
        // número na régua nova do que a unidade sem nota nenhuma.
        const velho=direto(rows, vig, {conf:true});
        return velho.length ? velho : (novo ? pctDe(contagemConf(rows,vig)) : []);
      }
      case 'checkWH': return direto(src['checklist-wh']?.[vig]||[],    vig, {col:['Aderência'], proj:'APOIO', peso:['Realizados']});
      case 'checkT': {
        // T2 (031120) + T1 (Empurrada · indicador = Aderência Saída) na mesma linha do painel
        const t2=direto(src['checklist-t2']?.[vig]||[], vig, {col:['Aderência'], peso:['Viagens']});
        const t1=direto(src['checklist-t1']?.[vig]||[], vig, {col:['Aderência Saída'], proj:'EMPURRADA', peso:['Viagens']});
        // com FUSÃO a mesma unidade pode ter as DUAS telas (T1 na empurrada,
        // T2 no CDI): aí valem as duas, ponderadas por viagens. Sem fusão,
        // T2 manda (comportamento de sempre).
        if(FUNDIR) return fundeLinhas(t2.concat(t1));
        const seen=new Set(t2.map(x=>x.unit));
        return t2.concat(t1.filter(x=>!seen.has(x.unit)));
      }
      case 'pneus':   return pneusSheetOk() ? pctDe(PNEUS[vig]||{}) : pctDe(contagemPneus(src['pneus']?.[vig]||[]));
      case 'stVeic':  return pctDe(contagem10(src['stress-test-frota']?.[vig]||[], {fil:['Filial Freightech','Filial'], projCol:['Projeto'], desc:['Desconto']}));
      case 'stEmp':   return pctDe(contagem10(src['stress-test-empilhadeira']?.[vig]||[], ST_EMP_OPTS, vig));
      case 'civf':    return pctDe(contagem10(src['civf']?.[vig]||[], {fil:['Filial Freightech'], projCol:['Projeto'], desc:['Desconto Total']}));
    }
    return [];
  }

  const cap100 = v => v==null?null:Math.min(100,v);

  // ── METAS dos indicadores-chave (Renan, 07/08/2026) ──────────────────────
  // É delas que saem os FCAs da RPM: no Gerot o atingimento é real ÷ meta.
  // O Frota de Elite NÃO muda — lá `atg` continua sendo a própria aderência
  // (os pesos do programa já estão montados em cima disso).
  // Combustível fica de fora: a meta dele é o km/L remunerado, que varia por
  // unidade e vigência, e já vem calculada em loadComb/combAcum.
  const METAS = {disp:95, prev:100, pneus:100, checkT:95, checkWH:95,
                 conf:100, stVeic:100, stEmp:100, civf:100, sla:75};
  // registro de um indicador-chave: atg = aderência (Frota de Elite) ·
  // atgMeta = atingimento da meta (Gerot / FCAs da RPM)
  function recChave(field,label,unit,vig,real){
    const meta=METAS[field]!=null?METAS[field]:null;
    return {field,label,unit,vig,meta,real,atg:cap100(real),atgMeta:atgDe(real,meta,'higher')};
  }

  // ── ACUMULADO da janela (síncrono; requer load() antes) ──────────────────
  // 1/0 e pneus: pool exato das linhas mensais. % por filial: escopo 'ano' do
  // Ginfo quando a janela é jan→M do mesmo ano; senão média mensal (aproximação).
  const POOL_FIELDS = new Set(['stVeic','stEmp','civf','pneus']);
  function janPrefix(vigs){
    const ys=[...new Set(vigs.map(v=>v.slice(0,4)))];
    if(ys.length!==1) return null;
    const ms=vigs.map(v=>+v.slice(5)).sort((a,b)=>a-b);
    for(let i=0;i<ms.length;i++) if(ms[i]!==i+1) return null;
    return ys[0]+'-'+String(ms[ms.length-1]).padStart(2,'0');   // 'YYYY-MM' do fim
  }
  // Conformidade acumulada de UMA metade (todas as vigências na mesma régua).
  function confMetade(vigs){
    const fim=vigs[vigs.length-1];
    if(vigs.length===1) return valores('conf','mes',fim);
    // régua nova = contagens → poola exato
    if(vigs.every(v=>confRegraNova(v) && confNovo(E.mes['conformidade']?.[v]||[]))){
      const g={};
      vigs.forEach(vig=>Object.entries(contagemConf(E.mes['conformidade']?.[vig]||[], vig))
        .forEach(([u,o])=>{ const t=g[u]=g[u]||{ok:0,n:0}; t.ok+=o.ok; t.n+=o.n; }));
      return pctDe(g);
    }
    // régua antiga = percentual por filial: acumulado do Ginfo quando a janela
    // começa em janeiro; senão, média das vigências (aproximação, sinalizada)
    const mediaDe = so => {
      const g={};
      vigs.forEach(vig=>valores('conf','mes',vig).forEach(v=>{ if(!so||so(v.unit)) (g[v.unit]=g[v.unit]||[]).push(v.real); }));
      return Object.entries(g).map(([u,a])=>({unit:u, real:a.reduce((s,x)=>s+x,0)/a.length, approx:true}));
    };
    const pref=janPrefix(vigs);
    let list=null;
    if(pref){ const vs=valores('conf','ano',pref); if(vs.length) list=vs; }
    if(!list) list=mediaDe(null);
    if(fim.slice(0,4)==='2026'){
      // Empurradas: o acumulado 'ano' do Ginfo é jan→M e inclui jan, fev e mar,
      // quando elas NÃO contavam. O acumulado delas sai da média dos meses que
      // valem — o confVale já tirou jan/fev/mar do mensal, então a média é de
      // abr em diante. (Era a janela mar→M do 'conformidade-mar'; março saiu da
      // regra em 18/08/2026 e aquele acumulado passou a estar contaminado.)
      const emp=mediaDe(u=>CONF_EMP.has(u));
      list=list.filter(v=>!CONF_EMP.has(v.unit)).concat(emp);
    }
    return list;
  }
  // Conformidade acumulada da janela inteira: se ela cruza o corte de agosto,
  // cada metade vale pela sua régua e o resultado é a média simples das duas.
  function confAcum(vigs){
    const antes =vigs.filter(v=>!confRegraNova(v));
    const depois=vigs.filter(v=> confRegraNova(v));
    if(!antes.length)  return confMetade(depois);
    if(!depois.length) return confMetade(antes);
    const g={};
    confMetade(antes ).forEach(v=>(g[v.unit]=g[v.unit]||[]).push(v.real));
    confMetade(depois).forEach(v=>(g[v.unit]=g[v.unit]||[]).push(v.real));
    return Object.entries(g).map(([u,a])=>({unit:u,
      real:a.reduce((s,x)=>s+x,0)/a.length,
      metades:a.length}));            // 2 = média das duas réguas; 1 = só uma metade tinha a unidade
  }

  function acumFor(vigsArr){
    if(!E) return [];
    const vigs=[...new Set(vigsArr)].sort();
    if(!vigs.length) return [];
    const fim=vigs[vigs.length-1];
    const out=[];
    INDICADORES.forEach(ind=>{
      const f=ind.field;
      if(f==='comb'){ out.push(...combAcum(vigs)); return; }
      if(vigs.length===1){
        valores(f,'mes',fim).forEach(v=>out.push(recChave(f,ind.label,v.unit,fim,v.real)));
        return;
      }
      if(f==='conf'){
        confAcum(vigs).forEach(v=>out.push(Object.assign(
          recChave(f,ind.label,v.unit,fim,v.real),
          {approx:v.approx||undefined, metades:v.metades})));
        return;
      }
      if(POOL_FIELDS.has(f)){
        const g={};
        vigs.forEach(vig=>{
          const cont = f==='pneus'
            ? (pneusSheetOk() ? (PNEUS[vig]||{}) : contagemPneus(E.mes['pneus']?.[vig]||[]))
            : contagem10(E.mes[{stVeic:'stress-test-frota',stEmp:'stress-test-empilhadeira',civf:'civf'}[f]]?.[vig]||[],
                f==='stVeic'?{fil:['Filial Freightech','Filial'],projCol:['Projeto'],desc:['Desconto']}:
                f==='stEmp' ?ST_EMP_OPTS:
                             {fil:['Filial Freightech'],projCol:['Projeto'],desc:['Desconto Total']}, vig);
          Object.entries(cont).forEach(([u,o])=>{ const t=g[u]=g[u]||{ok:0,n:0}; t.ok+=o.ok; t.n+=o.n; });
        });
        pctDe(g).forEach(v=>out.push(recChave(f,ind.label,v.unit,fim,v.real)));
        return;
      }
      // % por filial
      const pref=janPrefix(vigs);
      const mediaDe = so => {   // aproximação: média das vigências mensais
        const g={};
        vigs.forEach(vig=>valores(f,'mes',vig).forEach(v=>{ if(!so||so(v.unit)) (g[v.unit]=g[v.unit]||[]).push(v.real); }));
        return Object.entries(g).map(([u,a])=>({unit:u, real:a.reduce((s,x)=>s+x,0)/a.length, approx:true}));
      };
      let list=null;
      if(pref){ const vs=valores(f,'ano',pref); if(vs.length) list=vs; }
      if(!list){
        list=mediaDe(null);
        if(!pref) console.warn('GerotBase.acumFor: janela não começa em janeiro — %', f, 'é média mensal (sem acumulado exato)');
      }
      list.forEach(v=>out.push(Object.assign(recChave(f,ind.label,v.unit,fim,v.real),{approx:v.approx||undefined})));
    });
    return out;
  }

  // ══════════ Combustível — Km/L via gviz (fora do Ginfo, segue no Sheets) ══════════
  const KML_ID = '1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';
  const KML_TAB = 'Km/L';
  const UNI2COD = {'CDD CAMBORIU':'BLC','CDD CUIABA':'CBA','CUIABA':'CBA','CUIABA EMPURRADA':'CBA','CDD FLORIANOPOLIS':'FLP','CDD GUARULHOS':'GRL','CDD NOVA FRIBURGO':'NFR','CDD PELOTAS':'PLT','CDD RIO DE JANEIRO':'CGR','CDD RONDONOPOLIS':'RON','CDI MACACU':'MCC','MACACU EMPURRADA':'MCC','PIRAI EMPURRADA':'PIR'};
  const UNI_SEM_KM = new Set(['CUIABA']);
  const UNI_LIST_COMB = Object.keys(UNI2COD);
  function projMatchUni(uniNome,projStr){
    const p=NK(projStr), cod=UNI2COD[uniNome]; if(!cod) return false;
    if(!p.includes(cod)) return false;
    const isEmp=/EMPURRAD/.test(p);
    if(uniNome==='CUIABA EMPURRADA'||uniNome==='MACACU EMPURRADA') return isEmp;
    if(uniNome==='CDD CUIABA'||uniNome==='CDI MACACU') return !isEmp;
    return true;
  }
  function gvig(c){ if(!c) return null; const v=c.v;
    let m=String(v).match(/Date\((\d+),(\d+)/); if(m) return m[1]+'-'+String(+m[2]+1).padStart(2,'0');
    const f=String(c.f!=null?c.f:(v!=null?v:'')); m=f.match(/(\d{1,2})[\/\-](\d{4})/); if(m) return m[2]+'-'+m[1].padStart(2,'0');
    m=f.match(/(\d{4})[\/\-](\d{1,2})/); if(m) return m[1]+'-'+m[2].padStart(2,'0'); return null; }
  function fetchTabFrom(wbId,name){ return new Promise((res,rej)=>{
    const fn='_gb'+Math.floor(Math.random()*1e9)+Date.now();
    const s=document.createElement('script');
    const clr=()=>{try{delete global[fn];s.remove();}catch(e){}};
    global[fn]=r=>{ clr(); try{ if(r.status!=='ok'){ rej(new Error(name+' status '+r.status)); return; } res(r.table.rows||[]); }catch(e){ rej(e); } };
    s.onerror=()=>{ clr(); rej(new Error('erro rede '+name)); };
    s.src=`https://docs.google.com/spreadsheets/d/${wbId}/gviz/tq?sheet=${encodeURIComponent(name)}&tqx=out:json;responseHandler:${fn}`;
    document.head.appendChild(s);
  }); }

  // ══════════ Pneus — detalhamento por placa na aba 'Pneus' do Sheets ══════════
  // O Renan cola o export "detalhes" do Ginfo (CALIBRAGEM) na aba Pneus do
  // workbook Frota de Elite: Filial | Evento | Placa | Projeto | Período |
  // Última Leitura | Status. Cada linha é uma placa na vigência; Status
  // "Não Realizado" = 0, senão 1 — Σok/Σn dá o mês E qualquer janela
  // acumulada exata (mesma mecânica do Stress Test), batendo com o Ginfo.
  // Se a aba falhar/vier vazia, cai para as contagens da API (elite_snapshot).
  const ELITE_WB = '1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M';
  const PNEUS_TAB = 'Pneus';
  const MES_PT = {JANEIRO:1,FEVEREIRO:2,MARCO:3,ABRIL:4,MAIO:5,JUNHO:6,JULHO:7,AGOSTO:8,SETEMBRO:9,OUTUBRO:10,NOVEMBRO:11,DEZEMBRO:12};
  function pvig(cell){                     // Período: data OU "janeiro de 2026"
    const v=gvig(cell); if(v) return v;
    const s=NK(cell&&(cell.f!=null?cell.f:cell.v));
    const m=s.match(/([A-Z]+)\s+DE\s+(\d{4})/);
    return m&&MES_PT[m[1]] ? m[2]+'-'+String(MES_PT[m[1]]).padStart(2,'0') : null;
  }
  let PNEUS=null;                          // {vig:{unit:{ok,n}}}
  const pneusSheetOk = () => PNEUS && Object.keys(PNEUS).length>0;
  async function loadPneusSheet(){
    PNEUS={};
    let rows; try{ rows=await fetchTabFrom(ELITE_WB,PNEUS_TAB); }catch(e){ console.error('Gerot base — falha aba Pneus (usando fallback da API)', e); return; }
    rows.forEach(r=>{
      const c=r.c||[];
      const val=i=>c[i]&&c[i].v!=null?c[i].v:(c[i]&&c[i].f!=null?c[i].f:'');
      if(!FIL2COD[NK(val(0))]) return;     // ignora cabeçalho e linhas soltas
      const unit=canonUnit(val(0), val(3));
      const vig=pvig(c[4]);
      if(!unit||!vig) return;
      const o=((PNEUS[vig]=PNEUS[vig]||{})[unit]=PNEUS[vig][unit]||{ok:0,n:0});
      o.n++; if(NK(val(6))!=='NAO REALIZADO') o.ok++;
    });
  }

  let COMB=null;   // {filial:{vig:{km,lit,rems[]}}} — SEM fusão; cache p/ o acumulado
  async function loadComb(){
    let rows; try{ rows=await fetchTabFrom(KML_ID,KML_TAB); }catch(e){ console.error('Gerot base — falha Km/L (comb)', e); return []; }
    const nRaw = c => { if(!c||c.v==null) return 0; const n=Number(c.v); return isFinite(n)?n:0; };
    const parsed = rows.map(r=>{ const c=r.c||[]; const vig=gvig(c[0]); if(!vig)return null;
      return {vig, proj:String(c[14]&&c[14].v!=null?c[14].v:''), km:nRaw(c[22]), lit:nRaw(c[23]), rem:nRaw(c[4])}; }).filter(Boolean);
    const vigsK=[...new Set(parsed.map(p=>p.vig))];
    COMB={};
    // COMB é sempre por FILIAL de origem — a fusão acontece depois, em combFunde.
    for(const uni of UNI_LIST_COMB){
      if(UNI_SEM_KM.has(uni)) continue;
      for(const vig of vigsK){
        let km=0,lit=0,rems=[];
        parsed.forEach(p=>{ if(p.vig!==vig||!projMatchUni(uni,p.proj))return; km+=p.km; lit+=p.lit; if(p.rem>0)rems.push(p.rem); });
        if(!lit||!rems.length) continue;
        (COMB[uni]=COMB[uni]||{})[vig]={km,lit,rems};
      }
    }
    const porVig={};
    for(const uni in COMB) for(const vig in COMB[uni]){
      const r=combUm(uni,vig,COMB[uni][vig]); if(r) (porVig[vig]=porVig[vig]||[]).push(r);
    }
    const recs=[];
    for(const vig in porVig) recs.push(...combFunde(porVig[vig],vig));
    return recs;
  }
  // uma filial: Km/L realizado = Σkm ÷ Σlitros, alvo = média do remunerado.
  function combUm(uni,vig,o){
    if(!o||!o.lit||!o.rems.length) return null;
    const rem=o.rems.reduce((s,x)=>s+x,0)/o.rems.length; if(!rem) return null;
    const real=o.km/o.lit, atg=real/rem*100;
    return {field:'comb',label:'Combustível',unit:uni,vig,meta:rem,real,atg,atgMeta:atg,_km:o.km,_lit:o.lit};
  }
  // FUSÃO do combustível — pool de LITROS, não Σkm ÷ Σlitros (bug real, 18/08/2026):
  // empurrada (~2 km/L) e CDI/rota (~3,5 km/L) têm ALVOS diferentes. Somar os km e
  // os litros dos dois e comparar contra a média das metas misturava frotas
  // incomparáveis e jogava o atingimento do MACACU unido para BAIXO dos dois lados
  // (jul/26: 94,6 e 103,1 separados → 73,4 unido). O certo é cobrar cada filial
  // contra a PRÓPRIA meta e ponderar pelo que ela gastou:
  //   Σ(litros esperados) ÷ Σ(litros gastos) = Σ(atg_i × lit_i) ÷ Σlit_i,
  // que é exatamente o atingimento da unidade inteira e sempre cai entre os dois.
  function combFunde(itens,vig){
    const g={}; itens.forEach(r=>{ const k=fundido(r.unit); (g[k]=g[k]||[]).push(r); });
    return Object.keys(g).map(k=>{
      const ls=g[k];
      if(ls.length===1) return Object.assign({},ls[0],{unit:k});
      let km=0,lit=0,esp=0;
      ls.forEach(r=>{ km+=r._km; lit+=r._lit; esp+=r.atg/100*r._lit; });
      if(!lit||!esp) return null;
      const atg=esp/lit*100, real=km/lit;
      return {field:'comb',label:'Combustível',unit:k,vig,meta:real/(atg/100),real,atg,atgMeta:atg,_km:km,_lit:lit};
    }).filter(Boolean);
  }
  function combAcum(vigs){
    if(!COMB) return [];
    const fim=vigs[vigs.length-1], itens=[];
    for(const uni in COMB){
      let km=0,lit=0,rems=[];
      vigs.forEach(v=>{ const o=COMB[uni][v]; if(!o)return; km+=o.km; lit+=o.lit; rems.push(...o.rems); });
      const r=combUm(uni,fim,{km,lit,rems}); if(r) itens.push(r);
    }
    return combFunde(itens,fim);
  }

  // ══════════ Indicadores a mais — SÓ no Gerot, para gerar ação ══════════
  // Exatamente os 6 do plano do Renan: Amplitude · MTBF · MTTR · OS Vencida ·
  // Blitz de Segurança · % Calibragem OK. Não pontuam no Frota de Elite; aqui
  // são indicadores como os demais, com meta e % de atingimento.
  const ADIC_DEF = [
    // MTTR/MTBF: valores do relatório "MTBF E MTTR" do Ginfo (Renan, 05/08);
    // meta = regra do termômetro: "melhor que o 3º quartil" das unidades na vigência.
    {field:'mttr', label:'MTTR', src:'disponibilidade', col:['MTTR Veículos'], val:timeVal, fmt:'time', dir:'lower',  metaMode:'quartil'},
    {field:'mtbf', label:'MTBF', src:'disponibilidade', col:['MTBF Veículos'], val:timeVal, fmt:'time', dir:'higher', metaMode:'quartil'},
  ];
  function quantile(a,q){ const v=a.filter(x=>x!=null&&isFinite(x)).sort((x,y)=>x-y); if(!v.length) return null; const pos=(v.length-1)*q; const lo=Math.floor(pos), hi=Math.ceil(pos); return v[lo]+(v[hi]-v[lo])*(pos-lo); }
  // % de atingimento dos adicionais (os indicadores-chave já têm atg = aderência).
  // 'lower' (MTTR, OS Vencida, Amplitude…): meta/real · 'higher': real/meta.
  function atgDe(real, meta, dir){
    if(real==null||meta==null||!isFinite(real)||!isFinite(meta)) return null;
    if(dir==='lower'){
      if(meta===0) return real<=0?100:0;
      if(real<=0)  return 100;
      return cap100(meta/real*100);
    }
    if(meta===0) return 100;
    return cap100(real/meta*100);
  }
  function loadAdicionais(){
    const recs=[];
    ADIC_DEF.forEach(ind=>{
      const vals=[];
      Object.entries(E.mes[ind.src]||{}).forEach(([vig,rows])=>{
        const s=rows[0]; if(!s) return;
        const kFil=kOf(s,'Filial'); if(!kFil) return;
        const kV=kOf(s,...ind.col); if(!kV) return;
        rows.forEach(r=>{ const unit=canonUnit(r[kFil],''); const value=ind.val(r[kV]);
          if(unit&&value!=null&&isFinite(value)) vals.push({unit,vig,value}); });
      });
      let metaByVig=null;
      if(ind.metaMode==='quartil'){ metaByVig={}; const g={}; vals.forEach(v=>{(g[v.vig]=g[v.vig]||[]).push(v.value);});
        Object.keys(g).forEach(vg=>metaByVig[vg]=quantile(g[vg], ind.dir==='lower'?0.25:0.75)); }
      vals.forEach(v=>{ const meta=metaByVig?metaByVig[v.vig]:ind.meta;
        const atg=atgDe(v.value,meta,ind.dir);
        recs.push({field:ind.field,label:ind.label,unit:v.unit,vig:v.vig,real:v.value,meta,
                   atg,atgMeta:atg,dir:ind.dir,fmt:ind.fmt,soGerot:true}); });
    });
    return recs;
  }
  // ── Adicionais do Termômetro: OS Vencida e Blitz de Segurança (PPTX do Renan) ──
  // Planilha do termômetro, abas por tier; vigência 'MM_Q' (vale a Q2 do mês,
  // senão a Q1, igual ao painel do termômetro). OS Vencida (col Q) = contagem,
  // somada Frota+Armazém por unidade — meta da regra: < 10. Blitz (col M) só
  // existe no Transportes T2 — meta da regra: 100% realizada.
  const TERMO_ID = '10LRn3jrXEemqFiFAMbO8_bOLk98xrWTVXVUNDeQqLac';
  const TERMO_TABS = [
    {name:'Transportes T1', proj:'EMPURRADA'},
    {name:'Transportes T2', proj:'', blitz:true},
    {name:'WH T1', proj:'APOIO'},
    {name:'WH T2', proj:''},
  ];
  const ADIC_TERMO = [
    {field:'osVenc', label:'OS Vencida', fmt:'count', dir:'lower',  meta:10},
    {field:'blitz',  label:'Blitz de Segurança',      fmt:'pct',   dir:'higher', meta:100},
  ];
  async function loadTermometro(){
    const recs=[];
    const tabs=await Promise.all(TERMO_TABS.map(t=>
      fetchTabFrom(TERMO_ID,t.name).then(rows=>({t,rows})).catch(e=>{ console.error('Gerot base — falha termômetro', t.name, e); return {t,rows:[]}; })));
    const eff={};   // 'tab|unit|vig' → {q, os, blitz} (fica a maior quinzena)
    tabs.forEach(({t,rows})=>{
      rows.forEach(r=>{
        const c=r.c||[];
        const vraw=String(c[0]&&c[0].v!=null?c[0].v:'').trim();
        const m=vraw.match(/^(\d{1,2})_(\d{1,2})$/); if(!m) return;
        const vig='2026-'+m[1].padStart(2,'0'), q=+m[2];
        const fil=String(c[1]&&c[1].v!=null?c[1].v:'');
        if(!FIL2COD[NK(fil)]) return;
        const unit=canonUnit(fil, t.proj);
        const k=t.name+'|'+unit+'|'+vig;
        if(eff[k]&&eff[k].q>=q) return;
        eff[k]={q, os:numVal(c[16]&&c[16].v), blitz:t.blitz?pctVal(c[12]&&c[12].v):null};
      });
    });
    const os={}, bl={};   // OS: soma Frota+Armazém por unit|vig · Blitz: só T2
    Object.keys(eff).forEach(k=>{
      const [,unit,vig]=k.split('|'); const o=eff[k];
      if(o.os!=null){ const kk=unit+'|'+vig; os[kk]=(os[kk]||0)+o.os; }
      if(o.blitz!=null) bl[unit+'|'+vig]=o.blitz;
    });
    Object.entries(os).forEach(([kk,v])=>{ const [unit,vig]=kk.split('|');
      const atg=atgDe(v,10,'lower');
      recs.push({field:'osVenc',label:ADIC_TERMO[0].label,unit,vig,real:v,meta:10,atg,atgMeta:atg,dir:'lower',fmt:'count',soGerot:true}); });
    Object.entries(bl).forEach(([kk,v])=>{ const [unit,vig]=kk.split('|');
      const atg=atgDe(v,100,'higher');
      recs.push({field:'blitz',label:ADIC_TERMO[1].label,unit,vig,real:v,meta:100,atg,atgMeta:atg,dir:'higher',fmt:'pct',soGerot:true}); });
    return recs;
  }

  // API do Prolog: Amplitude (meta do painel Milimetragem) e % Calibragem OK
  // (meta do painel Calibragem: pressão dentro de ±10% da ideal em ≥98% da frota)
  const ADIC_PNEUS = [
    {field:'pneuAmp',   label:'Amplitude',        fmt:'mm',  dir:'lower',  meta:5},
    {field:'pneuCalib', label:'% Calibragem OK',  fmt:'pct', dir:'higher', meta:98},
  ];
  // Saída com OS Crítica: mesma base do farol Checklist (ginfo_snapshot
  // 'checklist-031120', drill do card "SAÍDAS COM OS CRÍTICA"). Regra binária
  // do farol: 0 saídas no mês = 100 · ≥1 = 0. Meta é ZERO saídas.
  const ADIC_CHK = {field:'osCritica', label:'Saída com OS Crítica', fmt:'count', dir:'lower', meta:0};

  // Os adicionais do plano, na ordem do Renan (+ Saída com OS Crítica, 14/08/2026)
  const INDICADORES_GEROT = [
    ADIC_PNEUS[0],   // Amplitude
    ADIC_DEF[1],     // MTBF
    ADIC_DEF[0],     // MTTR
    ADIC_TERMO[0],   // OS Vencida
    ADIC_CHK,        // Saída com OS Crítica
    ADIC_TERMO[1],   // Blitz de Segurança
    ADIC_PNEUS[1],   // % Calibragem OK
  ];

  // Saída com OS Crítica: a coluna "Saídas com OS Crítica" do export MENSAL do
  // checklist-t2 (tela ADERÊNCIA FROTA - 031120, a mesma da imagem do Renan) —
  // validado 14/08/2026 contra o Ginfo: soma dos meses jan→jul = 125, batendo
  // com o acumulado da tela (CUIABA 63 · GRL 25 · BLC 17 · PLT 12…). Histórico
  // mensal completo, sem depender do snapshot do farol (que guarda um mês só).
  // A tela cobre os CDDs/CDI; empurradas (T1) e WH não têm a coluna → sem valor.
  function loadOsCritica(){
    const recs=[];
    Object.entries(E.mes['checklist-t2']||{}).forEach(([vig,rows])=>{
      const s=rows[0]; if(!s) return;
      const kFil=kOf(s,'Filial'); if(!kFil) return;
      const kV=Object.keys(s).find(k=>/sa[ií]das?\s*com\s*os\s*cr[ií]tica/i.test(k)); if(!kV) return;
      rows.forEach(r=>{
        const unit=canonUnit(r[kFil],''); if(!unit) return;
        const real=numVal(r[kV]); if(real==null) return;
        const atg=real===0?100:0;   // binário, regra do farol: meta é ZERO saídas
        recs.push({field:ADIC_CHK.field,label:ADIC_CHK.label,unit,vig,real,meta:0,
                   atg,atgMeta:atg,dir:'lower',fmt:'count',soGerot:true});
      });
    });
    return recs;
  }

  // Pneus (adicionais de amplitude/calibragem/mm): snapshot do painel Pneus (Prolog)
  const PN_URL = 'https://ewbzeqsneeylwkxtcpme.supabase.co';
  const PN_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3YnplcXNuZWV5bHdreHRjcG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzY2MTcsImV4cCI6MjA5NzQ1MjYxN30.W8W6Yunt6Z8NB73qpOD8eqYlrsgMRgEG-siYsJFwDwE';
  const FILIAL2BRANCH = {'CDD CAMBORIU':24,'CDD CUIABA':1878,'CUIABA':1906,'CUIABA EMPURRADA':1907,'CDD FLORIANOPOLIS':20,'CDD GUARULHOS':30,'CDD NOVA FRIBURGO':2517,'CDD PELOTAS':26,'CDD RIO DE JANEIRO':37,'CDD RONDONOPOLIS':2277,'CDI MACACU':1677,'MACACU EMPURRADA':1676,'PIRAI EMPURRADA':38};
  async function loadPneusAdic(latestVig){
    if(!latestVig) return [];
    let rows;
    try{ const res=await fetch(`${PN_URL}/rest/v1/snapshot?endpoint=eq.tires&select=branch_id,data`, {headers:{apikey:PN_KEY, Authorization:'Bearer '+PN_KEY}}); if(!res.ok) throw new Error('http '+res.status); rows=await res.json(); }
    catch(e){ console.error('Pneus (Prolog) falhou', e); return []; }
    const byBranch={}; rows.forEach(r=>{ byBranch[r.branch_id]=r.data||[]; });
    const mean=a=>{ const v=a.filter(x=>x!=null&&isFinite(x)); return v.length?v.reduce((s,x)=>s+x,0)/v.length:null; };
    const recs=[];
    for(const uni in FILIAL2BRANCH){
      const tires=(byBranch[FILIAL2BRANCH[uni]]||[]).filter(t=>t && t.placa && (+t.menorMM)>0);
      if(!tires.length) continue;
      const amp=mean(tires.map(t=>+t.amplitude));
      const comP=tires.filter(t=>+t.pressaoIdeal>0);
      const calib=comP.length?comP.filter(t=>Math.abs(+t.desvioPressao)<=10).length/comP.length*100:null;
      ADIC_PNEUS.forEach(ind=>{ const real=ind.field==='pneuAmp'?amp:calib; if(real==null)return;
        const atg=atgDe(real,ind.meta,ind.dir);
        recs.push({field:ind.field,label:ind.label,unit:uni,vig:latestVig,real,meta:ind.meta,
                   atg,atgMeta:atg,dir:ind.dir,fmt:ind.fmt,soGerot:true,snapshot:true}); });
    }
    return recs;
  }

  // ── carga completa: registros mensais (contrato antigo) ──────────────────
  async function load(opts){
    FUNDIR = !!(opts&&opts.fundir);
    const combP=loadComb();
    const pneusP=loadPneusSheet();
    const termoP=loadTermometro();
    await fetchElite();
    await pneusP;
    const records=[];
    INDICADORES.forEach(ind=>{
      if(ind.field==='comb') return;
      const src={disp:'disponibilidade',prev:'preventivas',pneus:'pneus',checkT:'checklist-t2',checkWH:'checklist-wh',conf:'conformidade',stVeic:'stress-test-frota',stEmp:'stress-test-empilhadeira',civf:'civf',sla:'sla-manutencao'}[ind.field];
      const vigsSrc = ind.field==='pneus' && pneusSheetOk() ? Object.keys(PNEUS).sort() : vigsDe(src);
      vigsSrc.forEach(vig=>{
        valores(ind.field,'mes',vig).forEach(v=>{
          records.push(recChave(ind.field,ind.label,v.unit,vig,v.real));
        });
      });
    });
    records.push(...loadAdicionais());
    try{ records.push(...loadOsCritica()); }catch(e){ console.error('Saída com OS Crítica', e); }
    try{ records.push(...await termoP); }catch(e){ console.error('adicionais do termômetro', e); }
    records.push(...await combP);
    const vigsAll=[...new Set(records.map(r=>r.vig))].sort();
    try{ records.push(...await loadPneusAdic(vigsAll[vigsAll.length-1])); }catch(e){ console.error('adicionais de pneus', e); }
    return records;
  }

  const INDICADORES = [
    {field:'disp',    label:'Disponibilidade'},
    {field:'prev',    label:'Preventivas'},
    {field:'comb',    label:'Combustível',       fmt:'kml', cap:false},
    {field:'pneus',   label:'Pneus'},
    {field:'checkT',  label:'Checklist T1/T2'},
    {field:'checkWH', label:'Checklist WH'},
    {field:'conf',    label:'Conformidade'},
    {field:'stVeic',  label:'Stress Test Veíc.'},
    {field:'stEmp',   label:'Stress Test Emp.'},
    {field:'civf',    label:'CIVF'},
    {field:'sla',     label:'SLA Man.'},
  ];

  global.GerotBase = { INDICADORES, INDICADORES_GEROT, METAS, atgDe, load, acumFor, FUSAO,
    COD2UNIT, FIL2COD,     // de-para de unidade (o Scorecard usa p/ voltar ao nome do Gerot)
    unidadeFundida: u => fundido(u),
    fieldLabels: INDICADORES.reduce((m,i)=>{ m[i.field]=i.label; return m; }, {}),
    fieldOrder: INDICADORES.map(i=>i.field) };
})(window);
