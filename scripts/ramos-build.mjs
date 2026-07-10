// Gera manutencao/ramos.json = { "<fornecedor normalizado>": "<Ramo>" }.
// Classifica pelo NOME (palavra-chave). Quando o nome não é claro, busca o
// CNAE pelo CNPJ (aba Fornecedores) na BrasilAPI. Roda no GitHub Actions.
import { writeFileSync } from 'node:fs';

const SID='1S7L6G3L8bboirAExGPRCITYkWsGoVpjUoXc-aVXdW6k';
const _n=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const _digits=s=>String(s==null?'':s).replace(/\D/g,'');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function gviz(qs){
  const url=`https://docs.google.com/spreadsheets/d/${SID}/gviz/tq?${qs}&headers=1&tqx=out:json`;
  const raw=await (await fetch(url)).text();
  const json=JSON.parse(raw.replace(/^[\s\S]*?setResponse\(/, '').replace(/\);?\s*$/, ''));
  const cols=(json.table.cols||[]).map(c=>String((c&&(c.label||c.id))||'').trim());
  let rows=(json.table.rows||[]).map(x=>(x.c||[]).map(c=>c?c.v:null));
  if(cols.every(c=>!c)&&rows.length){ const h=rows[0].map(v=>String(v==null?'':v)); rows=rows.slice(1); return {cols:h,rows}; }
  return {cols,rows};
}
const col=(cols,...names)=>{ const N=cols.map(_n); for(const nm of names){ const i=N.indexOf(_n(nm)); if(i>=0)return i; } for(const nm of names){ const t=_n(nm); const i=N.findIndex(c=>c.includes(t)); if(i>=0)return i; } return -1; };

// ── Ramos por PALAVRA-CHAVE no nome (ordem: específico → genérico) ──
const NAME_RULES=[
  [/BORRACHAR|\bPNEU|RECAP|RECAUCH/, 'Pneus/Borracharia'],
  [/FUNILAR|PINTURA|LANTERNAG|LANTERNA/, 'Funilaria/Pintura'],
  [/TACOGRAF|CRONOTAC/, 'Tacógrafo'],
  [/ALINHAD|ALINHAMENTO|GEOMETRIA|BALANCEAMENTO|SUSPENSAO|\bMOLAS?\b/, 'Molas/Suspensão/Alinhamento'],
  [/HIDRAULIC/, 'Hidráulica'],
  [/ELETRIC/, 'Elétrica automotiva'],
  [/DIESEL|INJEC|INJET|COMMON RAIL|\bBOMBA\b/, 'Diesel/Injeção'],
  [/VIDRO|PARABRISA|PARA-?\s?BRISA/, 'Vidros'],
  [/AR-?\s?CONDICIONADO|CLIMATIZ/, 'Ar-condicionado'],
  [/RADIADOR|ARREFEC/, 'Radiador/Arrefecimento'],
  [/LUBRIFIC|\bOLEO\b|LUBRAX|LUBRICANT/, 'Lubrificantes/Óleo'],
  [/GUINCHO|REBOQUE|AUTO SOCORRO|\bSOCORRO\b/, 'Guincho/Reboque'],
  [/LAVA ?-?JATO|LAVAGEM|LAVACAO|ESTETICA AUTOMOTIVA/, 'Lavagem'],
  [/SOLDA|CALDEIRAR|CARROCERI|IMPLEMENTOS RODOV/, 'Solda/Caldeiraria/Carroceria'],
  [/AUTOPEC|AUTO ?-?PECAS|\bPECAS?\b|ROLAMENTOS|RETENTORES|PARAFUSO|AUTO PARTS/, 'Autopeças/Peças'],
  [/CONCESSIONARI|\bVEICULOS\b|CAMINHOES|ONIBUS/, 'Concessionária/Veículos'],
  [/MECANIC|AUTO ?CENTER|TRUCK ?CENTER|SERVICOS AUTOMOTIVOS|AUTOMOTIV|\bOFICINA\b|RETIFICA|\bTRUCK\b/, 'Mecânica/Serviços automotivos'],
  [/COMBUSTIVEL|\bPOSTO\b|AUTO POSTO/, 'Combustível'],
  [/TRANSPORTE|LOGISTIC/, 'Transporte/Frete'],
];
function ramoPorNome(nome){ const s=_n(nome); for(const [re,r] of NAME_RULES){ if(re.test(s)) return r; } return null; }

// ── Ramos por CNAE (código fiscal numérico) ──
const CNAE_RULES=[
  [/^4520001/, 'Mecânica/Serviços automotivos'],
  [/^452000[23]/, 'Funilaria/Pintura'],
  [/^4520004/, 'Elétrica automotiva'],
  [/^4520005/, 'Molas/Suspensão/Alinhamento'],
  [/^4520006/, 'Pneus/Borracharia'],
  [/^4520007/, 'Lavagem'],
  [/^4520008/, 'Diesel/Injeção'],
  [/^45(3|4)/, 'Autopeças/Peças'],
  [/^2950/, 'Pneus/Borracharia'],
  [/^221/, 'Pneus/Borracharia'],
  [/^451[12]/, 'Concessionária/Veículos'],
  [/^4732|^4681|^4671/, 'Combustível'],
  [/^1920|^4661.*lubr/, 'Lubrificantes/Óleo'],
  [/^4930|^521|^522/, 'Transporte/Frete'],
  [/^331|^332/, 'Manutenção/Reparo industrial'],
  [/^28/, 'Máquinas e Equipamentos'],
  [/^25/, 'Solda/Caldeiraria/Carroceria'],
  [/^62|^63|^951|^952/, 'TI/Eletrônicos'],
  [/^46/, 'Comércio/Atacado'],
  [/^47/, 'Comércio/Varejo'],
];
function ramoPorCnae(cnae){ const s=String(cnae||''); for(const [re,r] of CNAE_RULES){ if(re.test(s)) return r; } return null; }

async function cnaeDoCnpj(cnpj){
  for(let tent=0;tent<3;tent++){
    try{
      const r=await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if(r.status===429){ await sleep(2500); continue; }
      if(!r.ok) return null;
      const j=await r.json();
      return { cnae:String(j.cnae_fiscal||''), desc:j.cnae_fiscal_descricao||'' };
    }catch(e){ await sleep(1500); }
  }
  return null;
}

async function main(){
  // fornecedor → cnpj (aba Fornecedores; dedupe por nome, pega 1º CNPJ válido)
  const fo=await gviz('sheet='+encodeURIComponent('Fornecedores'));
  const fForn=col(fo.cols,'Fornecedor'), fCnpj=col(fo.cols,'CPF/CNPJ','CNPJ','CPF');
  const nome2cnpj=new Map();
  fo.rows.forEach(r=>{ const nm=_n(r[fForn]); const cj=_digits(r[fCnpj]); if(nm&&cj&&cj.length>=11&&!nome2cnpj.has(nm)) nome2cnpj.set(nm,cj); });

  // fornecedores presentes na base (DRE) + custo (para priorizar/cobrir)
  const dre=await gviz('gid=0');
  const dForn=col(dre.cols,'Fornecedor'), dReal=col(dre.cols,'Realizado','Valor Realizado','Valor');
  const custo=new Map();
  dre.rows.forEach(r=>{ const nm=_n(r[dForn]); if(!nm||nm==='-')return; custo.set(nm,(custo.get(nm)||0)+(Number(r[dReal])||0)); });
  const alvos=[...custo.keys()].sort((a,b)=>Math.abs(custo.get(b))-Math.abs(custo.get(a)));
  console.log(`Fornecedores na base=${alvos.length} · com CNPJ conhecido=${alvos.filter(n=>nome2cnpj.has(n)).length}`);

  const MAP={}; let porNome=0, porCnae=0, naoClass=0, semCnpj=0, custoNaoClass=0, custoTot=0;
  for(const nome of alvos){
    custoTot+=Math.abs(custo.get(nome)||0);
    let ramo=ramoPorNome(nome), fonte='nome';
    if(!ramo){
      const cj=nome2cnpj.get(nome);
      if(cj && cj.length===14){
        const c=await cnaeDoCnpj(cj); await sleep(220);
        if(c){ ramo=ramoPorCnae(c.cnae)||'Outros'; fonte='cnpj'; }
      } else if(cj && cj.length===11){ ramo='Autônomo/PF'; fonte='cpf'; }
    }
    if(!ramo){ ramo='Não classificado'; fonte='-'; if(!nome2cnpj.has(nome))semCnpj++; naoClass++; custoNaoClass+=Math.abs(custo.get(nome)||0); }
    else if(fonte==='nome')porNome++; else if(fonte==='cnpj')porCnae++;
    MAP[nome]=ramo;
  }
  const covPct=custoTot?(100*(custoTot-custoNaoClass)/custoTot):0;
  console.log(`\nClassificados por NOME=${porNome} · por CNPJ/CNAE=${porCnae} · Não classificado=${naoClass} (sem CNPJ=${semCnpj})`);
  console.log(`Cobertura por CUSTO=${covPct.toFixed(1)}% (não classificado=${Math.round(custoNaoClass)} de ${Math.round(custoTot)})`);
  // distribuição por ramo
  const dist={}; Object.values(MAP).forEach(r=>dist[r]=(dist[r]||0)+1);
  console.log('\nDistribuição por ramo:'); Object.entries(dist).sort((a,b)=>b[1]-a[1]).forEach(([r,n])=>console.log(`  ${n}\t${r}`));

  writeFileSync('manutencao/ramos.json', JSON.stringify(MAP, null, 0));
  console.log(`\nramos.json gravado com ${Object.keys(MAP).length} fornecedores.`);
}
main().catch(e=>{ console.error('Falha:',e); process.exit(1); });
