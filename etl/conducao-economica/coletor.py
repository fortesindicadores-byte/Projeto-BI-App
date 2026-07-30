#!/usr/bin/env python3
"""
Condução Econômica — coletor / ETL (esqueleto do modelo híbrido).

Fluxo:
    Fontes (Geotab / vFleets)  ->  extrai leitura diária  ->  ce_leituras_diarias
                                ->  agrega por mês + calcula pontos/score  ->  ce_scores_mensais
    O painel (HTML) passa a LER ce_scores_mensais no lugar de generateRawRows().

Roda no GitHub Actions (cron diário) — ver .github/workflows/ce-coletor.yml.

O QUE JÁ ESTÁ PRONTO:
    - calc_score(): média ponderada redistribuindo pilares ausentes (idêntico ao painel)
    - agregação diária -> mensal, upsert no Supabase (PostgREST)
O QUE É TBD (fecha quando lermos a telemetria de verdade):
    - extrai_vfleets() / extrai_geotab(): parsear os campos reais das APIs
    - pontos_por_pilar(): a CURVA que converte a métrica medida em pontos (0–100)

Dependências: requests  (ver requirements.txt)
"""
from __future__ import annotations
import os
import sys
import json
import datetime as dt
from collections import defaultdict

import requests

# ── Config (segredos vêm do ambiente / GitHub Secrets) ──────────────────────
SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")  # service_role (ignora RLS)

VFLEETS_TOKEN    = os.environ.get("VFLEETS_TOKEN", "")
VFLEETS_BASE_URL = os.environ.get(
    "VFLEETS_BASE_URL",
    "https://api.vfleets.com.br/integrationcore-conducao/conducoes/detalhada",
)
VFLEETS_UO_IDS   = os.environ.get("VFLEETS_UO_IDS", "")  # ex.: "123,456"

GEOTAB_SERVER   = os.environ.get("GEOTAB_SERVER", "my.geotab.com")
GEOTAB_DATABASE = os.environ.get("GEOTAB_DATABASE", "")
GEOTAB_USER     = os.environ.get("GEOTAB_USER", "")
GEOTAB_PASSWORD = os.environ.get("GEOTAB_PASSWORD", "")

# ── Modelo de score — IDÊNTICO ao painel (PILAR / pesos / calcScore_) ───────
PESOS = {"rpm": 25, "idle": 20, "acel": 15, "frea": 10, "vel": 15, "freio": 10, "cambio": 5}
PILARES = list(PESOS.keys())
# pilares que SÓ existem no vFleets; para motoristas Geotab ficam None (peso redistribuído)
SO_VFLEETS = {"freio", "cambio"}


def calc_score(pontos: dict) -> float | None:
    """Média ponderada (0–100) redistribuindo o peso dos pilares ausentes.
    Espelha calcScore_ do painel: den só soma o peso dos pilares presentes."""
    num = den = 0.0
    for f, peso in PESOS.items():
        v = pontos.get(f)
        if v is None:
            continue
        w = peso / 100.0
        den += w
        v01 = min(v / 100.0, 1.0)
        num += w * v01
    return (num / den) * 100.0 if den > 0 else None


# ── EXTRACT (TBD — preencher quando os acessos chegarem) ────────────────────
def extrai_vfleets(dia: dt.date) -> list[dict]:
    """GET Condução Detalhada (DaaS) do dia e devolve leituras normalizadas.
    TODO: parsear os campos reais (rpm em faixas, motorOcioso, aceleracoes,
    frenagens, velocidade em faixas, freioMotor, banguela, batendoTransmissao,
    CPF/CNH, placa). Respeitar o rate limit (1 req/5 min por token).
    Ver amostra puxada pelo scripts/vfleets-explorer.gs."""
    if not VFLEETS_TOKEN:
        return []
    # url = f"{VFLEETS_BASE_URL}?dia={dia:%Y-%m-%d}"
    # r = requests.get(url, headers={"Authorization": VFLEETS_TOKEN}, timeout=60)
    # r.raise_for_status()
    # for reg in r.json():
    #     yield _normaliza_vfleets(reg, dia)
    return []


def extrai_geotab(dia: dt.date) -> list[dict]:
    """Autentica no MyGeotab (JSON-RPC) e lê ExceptionEvents + StatusData do dia.
    TODO: Authenticate -> sessão; Get/GetFeed de Device/User/ExceptionEvent/StatusData;
    agregar por motorista/dia (faixa verde de RPM, idle, acel/frea, velocidade)."""
    if not (GEOTAB_DATABASE and GEOTAB_USER and GEOTAB_PASSWORD):
        return []
    return []


# ── TRANSFORM: métrica medida -> pontos (0–100) ─────────────────────────────
def pontos_por_pilar(metricas: dict, fonte: str) -> dict:
    """Converte as MÉTRICAS BRUTAS do dia em PONTOS (0–100) por pilar.

    TBD — a CURVA de cada pilar (o que vira 100, o que vira 0) só será fechada
    quando lermos a telemetria real. Por ora devolve os pontos que já vierem
    prontos (ou None). Mantém None para pilares que a fonte não entrega."""
    pontos = {}
    for p in PILARES:
        if p in SO_VFLEETS and fonte == "Geotab":
            pontos[p] = None
            continue
        # TODO: aplicar a curva real. Placeholder: usa 'pontos_<pilar>' se já vier.
        pontos[p] = metricas.get(f"pontos_{p}")
    return pontos


def media(valores: list) -> float | None:
    vs = [v for v in valores if v is not None]
    return sum(vs) / len(vs) if vs else None


def agrega_mensal(leituras: list[dict]) -> list[dict]:
    """Agrupa leituras diárias por (motorista, competência=mês) e calcula
    pontos médios por pilar + score final. Devolve linhas de ce_scores_mensais."""
    grupos: dict[tuple, list[dict]] = defaultdict(list)
    for l in leituras:
        comp = l["dia"].replace(day=1)
        grupos[(l["motorista"], comp)].append(l)

    linhas = []
    for (motorista, comp), regs in grupos.items():
        base = regs[0]
        row = {
            "competencia": comp.isoformat(),
            "motorista": motorista,
            "unidade": base.get("unidade"),
            "fonte": base.get("fonte"),
            "km_total": sum(r.get("km") or 0 for r in regs),
            "dias_com_dado": len(regs),
        }
        pontos = {}
        for p in PILARES:
            pts = media([r["pontos"].get(p) for r in regs])
            pontos[p] = pts
            row[f"{p}_pontos"] = pts
            row[f"{p}_valor"] = media([r.get("valores", {}).get(p) for r in regs])
        row["pontuacao"] = calc_score(pontos)
        linhas.append(row)
    return linhas


# ── LOAD: upsert no Supabase via PostgREST ──────────────────────────────────
def upsert(tabela: str, linhas: list[dict], on_conflict: str) -> None:
    if not linhas:
        return
    if not (SUPABASE_URL and SUPABASE_SERVICE_KEY):
        print(f"[dry-run] {tabela}: {len(linhas)} linhas (sem SUPABASE_URL/KEY)")
        return
    url = f"{SUPABASE_URL}/rest/v1/{tabela}?on_conflict={on_conflict}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    r = requests.post(url, headers=headers, data=json.dumps(linhas), timeout=60)
    r.raise_for_status()
    print(f"[ok] {tabela}: {len(linhas)} linhas upsertadas")


# ── MAIN ────────────────────────────────────────────────────────────────────
def coleta_dia(dia: dt.date) -> list[dict]:
    leituras = list(extrai_vfleets(dia)) + list(extrai_geotab(dia))
    for l in leituras:
        l.setdefault("dia", dia)
        l["pontos"] = pontos_por_pilar(l.get("metricas", {}), l.get("fonte", ""))
    return leituras


def main() -> int:
    # por padrão coleta ONTEM; aceita ISO date como argumento (backfill de 1 dia)
    dia = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else (
        dt.date.today() - dt.timedelta(days=1)
    )
    print(f"Condução Econômica — coletando {dia:%Y-%m-%d}")

    leituras = coleta_dia(dia)
    print(f"  {len(leituras)} leituras diárias")

    # RAW (guarda tudo)  — TODO: mapear leituras -> colunas de ce_leituras_diarias
    # upsert("ce_leituras_diarias", [_linha_raw(l) for l in leituras], "dia,fonte,veiculo_placa,cpf")

    # MART: recomputa o mês da competência do dia coletado
    scores = agrega_mensal(leituras)
    print(f"  {len(scores)} linhas de score mensal")
    upsert("ce_scores_mensais", scores, "competencia,motorista")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
