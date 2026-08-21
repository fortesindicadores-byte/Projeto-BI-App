// ============================================================
// Robô gviz → Supabase (Renan, 19/08/2026: "pode fazer todos")
//
// Baixa as abas do Google Sheets que os painéis usam na abertura e grava
// o TEXTO CRU da resposta gviz em gviz_snapshot. O assets/gviz-cache.js
// serve esses snapshots aos painéis (~200ms) em vez do gviz (1–4s/aba).
//
// A chave TEM de bater com a do gviz-cache.js:
//   "<sheet_id>|s=<aba>|g=<gid>|q=<tq>|h=<headers>"
//
// Alvo fora desta lista NÃO quebra nada: o painel simplesmente segue
// para o Google, como sempre. financeiro-pessoal fica FORA de propósito
// (dados pessoais não entram no snapshot compartilhado).
// ============================================================
import { createHash } from 'node:crypto';

const SUPA = 'https://lozwipoeacpvplgkrxkq.supabase.co';
const SERVICE_KEY = process.env.GEM_SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) { console.error('GEM_SUPABASE_SERVICE_KEY ausente'); process.exit(1); }
const HDRS = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY };

const DRE  = '1qcTy2ppLCGBKKqZCxCYWCTL9kTAuWfHBMyBfWJOyih8';   // DRE (Visão Financeira e cia.)
const DISP = '1wCoRGsvOgmIvfLW4F9Sxr-5AX9Go-aFlRVjrQ_B2ilM';   // Base Dispersão de km
const KML  = '1ZZdvG_RK5cTBLdPl3TWCbNeqw-Y4fTYwWsQV4w-e__A';   // Consumo (Km/L, R$/L)
const TERM = '1oW3mss0pXVI6gaDU2z5cDAKvW40LWHCQXpanqSvb12o';   // DPO/Demarco/FCA Total
const RPM  = '1xGl1Xrk2sPS9zWghEuecFMNBHwmeLiZ02U-QpO8cDPY';   // Gerot / Base RPM / ICs
const TERM2 = '10LRn3jrXEemqFiFAMbO8_bOLk98xrWTVXVUNDeQqLac';  // Termômetro (tiers)
const SEARA = '1Rlwc0MZiupQI38gSN8VyBq_zMADgX9R_ZbfygNP-OXE';  // Seara (3 abas)
const ELITE = '1DXmjzj2KRrTdQxmvXRclGxhBeDMwoIoLvORqbh3GG6M';  // Frota de Elite (aba Pneus)
const MANUT = '1S7L6G3L8bboirAExGPRCITYkWsGoVpjUoXc-aVXdW6k';  // Manutenção
const TEND  = '1EFmp2qlevQG5OEgGJePrI_O8wKuQo3IDmbJIReN2Fl0';  // Tendência/Comparativos (aba Base)

const ALVOS = [
  // DRE
  { id: DRE, sheet: 'Frota' },
  { id: DRE, sheet: 'EBITDA' },
  // Dispersão de km
  { id: DISP, sheet: 'Dispersão de km' },
  { id: DISP, sheet: 'Árvore Comb.' },
  // Consumo
  { id: KML, sheet: 'Km/L' },
  { id: KML, sheet: 'R$/L' },
  // DPO / Demarco / FCA
  { id: TERM, sheet: 'DPO' },
  { id: TERM, sheet: 'Demarco' },
  { id: TERM, sheet: 'FCA Total', headers: '1' },
  { id: TERM, gid: '216663799' },
  { id: TERM, gid: '199351909' },
  // Gerot / RPM
  { id: RPM, gid: '0' },
  { id: RPM, sheet: 'De-Para', headers: '0' },
  { id: RPM, sheet: 'Base RPM', headers: '1' },
  { id: RPM, sheet: 'Consolidado ICs' },
  // Termômetro / MPR (mês + acumulado por tier)
  ...['Transportes T1', 'Transportes T2', 'WH T1', 'WH T2']
    .flatMap(t => [{ id: TERM2, sheet: t }, { id: TERM2, sheet: t + ' - Acum' }]),
  // Seara (mesmos parâmetros que o painel pede)
  { id: SEARA, gid: '0', headers: '1' },
  { id: SEARA, gid: '1672208132', headers: '1', tq: 'select B, C, D, J' },
  { id: SEARA, gid: '1982300845', headers: '1' },
  // Frota de Elite / Manutenção / Tendência
  { id: ELITE, sheet: 'Pneus' },
  { id: MANUT, gid: '0', headers: '1' },
  { id: TEND, sheet: 'Base' },
];

const chaveDe = a => `${a.id}|s=${a.sheet || ''}|g=${a.gid || ''}|q=${a.tq || ''}|h=${a.headers || ''}`;
function urlDe(a) {
  const p = [];
  if (a.sheet) p.push('sheet=' + encodeURIComponent(a.sheet));
  if (a.gid != null) p.push('gid=' + encodeURIComponent(a.gid));
  if (a.tq) p.push('tq=' + encodeURIComponent(a.tq));
  if (a.headers != null) p.push('headers=' + a.headers);
  p.push('tqx=out:json');
  return `https://docs.google.com/spreadsheets/d/${a.id}/gviz/tq?${p.join('&')}`;
}

// A coluna hash pode ainda não existir (SQL não rodado): detectar uma vez
// e, sem ela, cair no comportamento antigo (upsert sempre).
let temHash = false;
try {
  const r = await fetch(`${SUPA}/rest/v1/gviz_snapshot?select=key,hash&limit=1`, { headers: HDRS });
  temHash = r.ok;
  if (!temHash) console.log('coluna hash ausente (rodar o ALTER TABLE) — gravando sempre');
} catch (e) { console.log('não deu para checar a coluna hash: ' + e.message); }

let ok = 0, iguais = 0, falhas = 0;
for (const alvo of ALVOS) {
  const key = chaveDe(alvo);
  try {
    let body = null;
    for (let t = 0; t < 3 && body == null; t++) {           // 3 tentativas
      const r = await fetch(urlDe(alvo));
      const txt = r.ok ? await r.text() : '';
      if (txt.includes('setResponse') && txt.includes('"status":"ok"')) body = txt;
      else await new Promise(res => setTimeout(res, 1500));
    }
    if (body == null) throw new Error('resposta gviz inválida');
    const hash = createHash('md5').update(body).digest('hex');

    // Conteúdo igual ao gravado? Só renova o updated_at (gravação minúscula:
    // não reescreve o corpo de MBs — poupa o Disk IO Budget do Supabase).
    if (temHash) {
      const q = await fetch(`${SUPA}/rest/v1/gviz_snapshot?key=eq.${encodeURIComponent(key)}&select=hash`, { headers: HDRS });
      const row = q.ok ? (await q.json())[0] : null;
      if (row && row.hash === hash) {
        const tk = await fetch(`${SUPA}/rest/v1/gviz_snapshot?key=eq.${encodeURIComponent(key)}`, {
          method: 'PATCH',
          headers: { ...HDRS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ updated_at: new Date().toISOString() })
        });
        if (!tk.ok) throw new Error('touch HTTP ' + tk.status + ' ' + (await tk.text()).slice(0, 120));
        ok++; iguais++;
        console.log(`=   ${key}  sem mudança (${(body.length / 1024).toFixed(0)}KB poupados)`);
        continue;
      }
    }

    const reg = { key, body, bytes: body.length, updated_at: new Date().toISOString() };
    if (temHash) reg.hash = hash;
    const up = await fetch(`${SUPA}/rest/v1/gviz_snapshot?on_conflict=key`, {
      method: 'POST',
      headers: { ...HDRS, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([reg])
    });
    if (!up.ok) throw new Error('upsert HTTP ' + up.status + ' ' + (await up.text()).slice(0, 120));
    ok++;
    console.log(`ok  ${key}  ${(body.length / 1024).toFixed(0)}KB`);
  } catch (e) {
    falhas++;
    console.log(`FALHOU  ${key}  ${e.message}`);
  }
}
console.log(`\n${ok} ok (${iguais} sem mudança) · ${falhas} falha(s) de ${ALVOS.length} alvos`);
if (ok === 0) process.exit(1);   // nada gravado = erro de verdade; falha parcial não derruba (o shim cai p/ o Google)
