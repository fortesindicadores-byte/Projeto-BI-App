// Enumera TODAS as abas do workbook Seara e imprime o cabeçalho de cada uma.
//
// Por quê: a Base Remunerado foi enxugada (hoje termina na col O, ReaisPorKm) e
// levou junto KmPorLitro e PrecoDiesel — as colunas que os painéis Km/L · Seara
// e R$/L · Seara usavam para o REMUNERADO. Antes de reapontar os painéis é
// preciso ver ONDE esses dados vivem agora (aba nova? coluna renomeada?).
//
// O gviz não lista abas; o export xlsx (planilha link-readable) lista. Roda via
// GitHub Actions porque o sandbox não alcança docs.google.
const SEARA_ID = '1Rlwc0MZiupQI38gSN8VyBq_zMADgX9R_ZbfygNP-OXE';

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const url = `https://docs.google.com/spreadsheets/d/${SEARA_ID}/export?format=xlsx`;
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
writeFileSync('/tmp/seara.xlsx', buf);
console.log(`xlsx: ${(buf.length/1024/1024).toFixed(1)} MB\n`);

execSync('pip install --quiet openpyxl', {stdio:'inherit'});
const py = `
import openpyxl
wb = openpyxl.load_workbook('/tmp/seara.xlsx', read_only=True)
A1 = lambda i: (chr(65+(i//26)-1) if i>=26 else '') + chr(65+i%26)
for name in wb.sheetnames:
    ws = wb[name]
    print(f"=== {name} · {ws.max_row} linhas × {ws.max_column} colunas ===")
    hdr = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), ())
    for i, v in enumerate(hdr):
        if v is not None:
            print(f"  {A1(i):>3} [{i:2}] {v}")
    # segunda linha como amostra (ajuda a ver se é fórmula viva ou coluna morta)
    smp = next(ws.iter_rows(min_row=2, max_row=2, values_only=True), ())
    vivos = sum(1 for v in smp if v is not None)
    print(f"  (linha 2: {vivos} células preenchidas)\\n")
`;
writeFileSync('/tmp/abas.py', py);
execSync('python3 /tmp/abas.py', {stdio:'inherit'});
