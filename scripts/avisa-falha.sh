#!/usr/bin/env bash
# ============================================================================
# Aviso de falha de robô, por e-mail (Resend).
#
# Vive num arquivo só de propósito: a checagem de resposta abaixo tinha sido
# feita apenas no ginfo-robot.yml, e o elite-robot.yml seguiu engolindo a
# recusa da Resend — a mesma falha silenciosa que escondeu 7 dias sem coleta
# em 08/2026. Com um script compartilhado, corrigir num lugar corrige nos dois.
#
# Variáveis esperadas no ambiente:
#   RESEND_API_KEY  (secret)   — sem ela o aviso fica desligado, sem erro
#   MAIL_FROM       (var)      — remetente; sem domínio verificado use o padrão
#   MAIL_TO         (var)      — DESTINO. Sem domínio verificado, a Resend só
#                                entrega para o e-mail dono da conta.
#   WORKFLOW, RUN_URL          — nome do robô e link do log
# ============================================================================
set -uo pipefail

if [ -z "${RESEND_API_KEY:-}" ]; then
  echo "RESEND_API_KEY ausente — aviso por e-mail desligado"
  exit 0
fi

FROM="${MAIL_FROM:-BI Frota <onboarding@resend.dev>}"
WF="${WORKFLOW:-robô}"
URL="${RUN_URL:-}"

if [ -z "${MAIL_TO:-}" ]; then
  echo "::error::O AVISO POR E-MAIL NÃO FOI ENVIADO — a variável MAIL_TO está vazia."
  echo "::error::Configure-a em Settings > Secrets and variables > Actions > Variables"
  echo "::error::com o e-mail dono da conta Resend (ou verifique um domínio em resend.com/domains)."
  exit 0
fi

AGORA_DIA=$(date -u -d '-3 hours' '+%d/%m/%Y')
AGORA_HORA=$(date -u -d '-3 hours' '+%d/%m/%Y %H:%M')

CORPO=$(printf '{"from":"%s","to":["%s"],"subject":"⚠ %s falhou (%s)","html":"O robô <b>%s</b> falhou no run de %s BRT.<br><br>Log: <a href=\\"%s\\">%s</a><br><br>Um dia isolado se cura sozinho (o cron do dia seguinte completa o que faltou). Se este e-mail repetir por 3 dias, algo mudou na origem."}' \
  "$FROM" "$MAIL_TO" "$WF" "$AGORA_DIA" "$WF" "$AGORA_HORA" "$URL" "$URL")

RESP=$(curl -sS -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$CORPO")
echo "$RESP"

# O curl devolve 0 mesmo quando a Resend RECUSA (403 de domínio não verificado,
# destinatário fora da conta…). Sem esta checagem o alarme falha em silêncio.
if echo "$RESP" | grep -q '"statusCode"'; then
  echo "::error::O AVISO POR E-MAIL NÃO FOI ENTREGUE — a Resend recusou (resposta acima)."
  echo "::error::Confira se MAIL_TO é o e-mail dono da conta Resend, ou verifique um domínio em resend.com/domains."
fi
