// Farol Frota — disparador de e-mail (Resend API)
// Rodado pelo GitHub Actions (.github/workflows/farol-mailer.yml).
// Hoje: modo TESTE (envia um e-mail de exemplo p/ validar remetente/entrega).
// Depois: o conteúdo real do farol (foto de segunda 14h) entra no lugar de buildTestHtml().
// Env: RESEND_API_KEY (secret) · FAROL_FROM (secret, ex.: "Gestão em Movimento <noreply@seudominio.com>")
//      FAROL_TO (destinatário do teste)

const KEY  = (process.env.RESEND_API_KEY || '').trim();
const FROM = (process.env.FAROL_FROM || '').trim();
const TO   = (process.env.FAROL_TO || '').trim();

if (!KEY || !FROM || !TO) {
  console.error('Faltam env vars: RESEND_API_KEY / FAROL_FROM / FAROL_TO');
  process.exit(1);
}

const HUB = 'https://fortesindicadores-byte.github.io/gestao-em-movimento/farol-frota/';
const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

// dot de farol (inline style p/ e-mail)
const dot = c => `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${c};vertical-align:middle;"></span>`;
const G = '#3BB33B', Y = '#EAB308', R = '#FF6666';

// linha de indicador (exemplo)
const row = (nome, status, valor, obs) => `
  <tr>
    <td style="padding:10px 14px;border-bottom:1px solid #1E2D40;font-size:13px;color:#F1F5F9;font-weight:600;">${nome}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #1E2D40;text-align:center;">${status}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #1E2D40;text-align:right;font-size:13px;color:#F1F5F9;font-weight:700;">${valor}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #1E2D40;font-size:11px;color:#94A3B8;">${obs}</td>
  </tr>`;

function buildTestHtml() {
  return `
<div style="background:#0C1017;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="padding:0 4px 14px;">
      <div style="font-size:11px;letter-spacing:2px;color:#64748B;font-weight:bold;">GESTÃO EM MOVIMENTO · BI FROTA</div>
      <div style="font-size:24px;color:#F97316;font-weight:bold;margin-top:4px;">🚦 Farol Frota</div>
      <div style="font-size:12px;color:#94A3B8;margin-top:4px;">Retrato semanal — ${hoje} · <b style="color:#EAB308;">E-MAIL DE TESTE</b></div>
    </div>
    <div style="background:#141B26;border:1px solid #1E2D40;border-radius:10px;overflow:hidden;">
      <div style="padding:14px 14px 6px;">
        <div style="font-size:14px;color:#F1F5F9;font-weight:bold;">Este é um envio de teste da infraestrutura do Farol.</div>
        <div style="font-size:12px;color:#94A3B8;margin-top:6px;line-height:1.6;">
          Quando ativado, este e-mail sairá <b style="color:#F1F5F9;">toda segunda-feira às 14h</b> com o farol da(s) unidade(s)
          liberada(s) para cada destinatário no Gerenciar Acessos. Abaixo, um exemplo do formato:
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <tr style="background:#1A2335;">
          <th style="padding:9px 14px;text-align:left;font-size:10px;letter-spacing:1px;color:#94A3B8;">INDICADOR</th>
          <th style="padding:9px 14px;text-align:center;font-size:10px;letter-spacing:1px;color:#94A3B8;">FAROL</th>
          <th style="padding:9px 14px;text-align:right;font-size:10px;letter-spacing:1px;color:#94A3B8;">RESULTADO</th>
          <th style="padding:9px 14px;text-align:left;font-size:10px;letter-spacing:1px;color:#94A3B8;">OBS.</th>
        </tr>
        ${row('Custos', dot(R), '+8,4% vs rem.', 'exemplo')}
        ${row('Preventivas', dot(Y), '97,7%', 'exemplo · meta 100%')}
        ${row('Stress Test Veículos', dot(G), '100%', 'exemplo')}
        ${row('Stress Test Empilhadeiras', dot(R), '83,0%', 'exemplo · meta 100%')}
        ${row('CIFV', dot(Y), '98,7%', 'exemplo · meta 100%')}
        ${row('Alinhamento', dot(G), '100%', 'exemplo')}
        ${row('Gestão de OS', dot(R), '36 dias médios', 'exemplo · meta 8')}
        ${row('Aferições de Pneus', dot(R), '0,0%', 'exemplo · meta 100%')}
        ${row('Disponibilidade', dot(Y), '92%', 'exemplo · meta 97%')}
      </table>
      <div style="padding:18px 14px 20px;text-align:center;">
        <a href="${HUB}" style="display:inline-block;background:#F97316;color:#0C1017;font-weight:bold;font-size:13px;text-decoration:none;padding:11px 26px;border-radius:6px;">Abrir o Farol no portal</a>
      </div>
    </div>
    <div style="padding:14px 4px;font-size:10px;color:#64748B;line-height:1.6;">
      E-mail automático do portal Gestão em Movimento — foto de segunda-feira às 14h. Não responda a este e-mail.
    </div>
  </div>
</div>`;
}

async function main() {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: TO.split(',').map(s => s.trim()).filter(Boolean),
      subject: '🚦 Farol Frota — e-mail de TESTE (' + hoje + ')',
      html: buildTestHtml(),
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error('Resend respondeu ' + res.status + ': ' + body);
    process.exit(1);
  }
  console.log('Enviado com sucesso para ' + TO + ' · resposta: ' + body);
}
main().catch(e => { console.error(e); process.exit(1); });
