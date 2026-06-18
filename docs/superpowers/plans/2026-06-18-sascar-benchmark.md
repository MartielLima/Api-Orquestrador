# Sascar Benchmark Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `scripts/benchmark-sascar.ts` (one-shot benchmark) + `tests/integration/sascar-benchmark.spec.ts` (smoke test gated) + 2 doc updates + `package.json` script + `.gitignore` entry. Mede tempo de chamadas Sascar em 3 grupos (blackbox, CAN, posições históricas).

**Architecture:** Script standalone em `scripts/` (não Jest) que itera por `veiculos_cache` e chama Sascar via `SascarOrchestrator`, medindo tempo por operação. Smoke test gated no jest. Saída: console table com chalk + arquivo em `reports/`. Env vars configuram escopo (vehicle limit, dias de range).

**Tech Stack:** TypeScript 5, Node 18+, `pg`, `chalk` (já em deps), `tsx` (já em deps), `node:fs` + `node:path`. Sem mudanças de dependência.

**Branch:** `main`.

**Pré-condições:**
- Containers `app` e `postgres` rodando.
- `.env` com `DATABASE_URL`, `SASCAR_USUARIO`, `SASCAR_SENHA`, `SASCAR_WSDL_URL`.
- `veiculos_cache` populado (rodar `sascar-real` antes se vazio).

---

## File Structure

**Criar:**
- `scripts/benchmark-sascar.ts` (script CLI)
- `tests/integration/sascar-benchmark.spec.ts` (smoke test gated)

**Modificar:**
- `package.json` (adicionar script `benchmark:sascar`)
- `.gitignore` (adicionar `reports/`)
- `CHANGELOG.md` (entrada em `[Unreleased]` → `### Added`)
- `README.md` (atualizar seção "Testes com Sascar real (gated)" com referência ao benchmark)

**Resultado:** 2 novos arquivos, 4 modificados.

---

## Task 1: Criar `scripts/benchmark-sascar.ts`

**Files:**
- Create: `scripts/benchmark-sascar.ts`

- [ ] **Step 1: Criar o arquivo com estrutura inicial (config + validação)**

Crie `scripts/benchmark-sascar.ts` com a estrutura de imports, `BenchmarkConfig` interface, `loadConfig`, `validateConfig`, e `time` helper. Não inclua o `main()` ainda — virá nos próximos steps.

- [ ] **Step 2: Adicionar helpers de formatação**

Adicione ao arquivo:
- `startOfWeek()` — retorna `Monday 00:00 UTC` da semana atual
- `fmtSascar(d: Date)` — formata data como `YYYY-MM-DD HH:MM:SS` (formato Sascar)
- `fmtShort(d: Date)` — formata data como `MM-DD HH:MM` (para display compacto)
- `round(n, decimals = 2)` — `n.toFixed(decimals)`

- [ ] **Step 3: Adicionar a função `main` com Grupo 1 (Blackbox)**

Em `main`:
1. Carrega config, valida, instancia `buildSascarClient` + `SascarOrchestrator` + `Pool`.
2. Carrega `veiculos_cache` com `LIMIT $1` (vehicleLimit).
3. Loga: contagem de veículos + total de janelas de 10min.
4. Loop duplo: para cada veículo, para cada janela desde `startOfWeek()` até `now`, chama `orch.call('solicitarEventosCaixaPreta', [idVeiculo, placa, fmtSascar(windowStart), fmtSascar(windowEnd)])`.
5. Mede tempo com `time()`, pusha resultado no array `results`.
6. `.` verde para ok, `E` vermelho para erro.

- [ ] **Step 4: Adicionar Grupo 2 (CAN bus) ao main**

Em `main` (após Grupo 1):
- Loop: para cada veículo, `orch.call('obterDadosAdicionais', [idVeiculo])`.
- Mede tempo, pusha resultado, loga `.` ou `E`.

- [ ] **Step 5: Adicionar Grupo 3 (Posições históricas) ao main**

Em `main` (após Grupo 2):
- Calcula `historyStart = now - BENCHMARK_MONTH_DAYS_BACK * 24h`.
- Loop: para cada veículo, `orch.call('obterPacotePosicaoHistorico', [fmtSascar(historyStart), fmtSascar(now), idVeiculo])`.
- Mede tempo, pusha resultado, loga `.` ou `E`.

- [ ] **Step 6: Adicionar formatadores de relatório**

Adicione ao arquivo:
- `formatTable(rows)` — tabela formatada com chalk (header com `chalk.bold`, linhas alternadas)
- `groupTotals(rows)` — agrupa por `group`, calcula total/avg/err
- `formatTotals(totals)` — formata totais por grupo
- `stripAnsi(s)` — remove códigos ANSI (para salvar em arquivo)

- [ ] **Step 7: Adicionar salvamento do relatório e finalização**

Em `main` (após os 3 grupos):
- `console.log(formatTable(results))`
- `console.log(formatTotals(groupTotals(results)))`
- Cria `reports/` se não existe (`mkdirSync({ recursive: true })`)
- Salva relatório em `reports/benchmark-sascar-{ISO timestamp}.txt` (com ANSI stripped)
- `await pool.end()`
- Loga path do relatório

- [ ] **Step 8: Adicionar entry point e error handling**

No fim do arquivo:
```typescript
main().catch((err) => {
  console.error(chalk.red('Erro fatal:'), err);
  process.exit(1);
});
```

- [ ] **Step 9: Typecheck + lint**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
npm run lint
```

Esperado: exit 0 para ambos.

- [ ] **Step 10: Smoke run com limits mínimos**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
BENCHMARK_VEHICLE_LIMIT=1 \
BENCHMARK_DAYS_BACK=1 \
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
SASCAR_USUARIO="RMMOTAMULTISATGR" \
SASCAR_SENHA="sascar" \
SASCAR_WSDL_URL="https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService" \
npx tsx scripts/benchmark-sascar.ts
```

Esperado: roda em <2min, imprime tabela, salva relatório. Reportar tempo total.

Se algum grupo falhar com SASCAR_FAULT (ex: blackbox desativado), é esperado. Reportar como DONE_WITH_CONCERNS com os erros.

---

## Task 2: Criar `tests/integration/sascar-benchmark.spec.ts`

**Files:**
- Create: `tests/integration/sancar-benchmark.spec.ts` (typo corrigido para `sascar-benchmark.spec.ts`)

- [ ] **Step 1: Criar o arquivo**

Use a estrutura do spec em `docs/superpowers/specs/2026-06-18-sascar-benchmark-design.md` seção 2. Use dynamic imports no `beforeAll` (mesmo padrão do `sascar-real.spec.ts` para evitar falha no module-init sem env vars).

- [ ] **Step 2: Typecheck + lint**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
npm run lint
```

Esperado: exit 0.

- [ ] **Step 3: Validar gate (sem env var = skipped)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npx jest tests/integration/sascar-benchmark.spec.ts 2>&1 | tail -5
```

Esperado: `1 skipped suite, 0 of 1 total`.

- [ ] **Step 4: Rodar com gate on (smoke)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="RMMOTAMULTISATGR" \
SASCAR_SENHA="sascar" \
SASCAR_WSDL_URL="https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService" \
RUN_BENCHMARK_SMOKE=1 \
npx jest tests/integration/sancar-benchmark.spec.ts 2>&1 | tail -10
```

Esperado: 3 passing. Anote o tempo total.

---

## Task 3: Atualizar `package.json` + `.gitignore`

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Adicionar script `benchmark:sascar` no `package.json`**

Edite `package.json` e adicione ao objeto `scripts`:

```json
"benchmark:sascar": "tsx scripts/benchmark-sascar.ts"
```

- [ ] **Step 2: Adicionar `reports/` ao `.gitignore`**

Edite `.gitignore` e adicione:

```
# Benchmark reports
reports/
```

- [ ] **Step 3: Verificar**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
cat package.json | grep -A 1 "benchmark:sascar"
cat .gitignore | grep -A 1 "Benchmark"
```

Esperado: ver o script e a entrada do gitignore.

---

## Task 4: Atualizar CHANGELOG + README

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: Adicionar entradas no CHANGELOG**

Em `CHANGELOG.md` → `[Unreleased]` → `### Added`, adicione (após a entrada do `sascar-real` que está na linha 16):

```markdown
- **feat(scripts)**: New `scripts/benchmark-sascar.ts` — script CLI para benchmark de chamadas Sascar reais em 3 grupos (blackbox desde início da semana, CAN bus, posições do mês passado). Configurável via `BENCHMARK_VEHICLE_LIMIT` (default 5), `BENCHMARK_DAYS_BACK` (default 7), `BENCHMARK_MONTH_DAYS_BACK` (default 35). Imprime tabela no terminal e salva relatório em `reports/benchmark-sascar-*.txt`. Use `npm run benchmark:sascar`.
- **test(integration)**: New `tests/integration/sancar-benchmark.spec.ts` (NOTE: corrigir para `sascar-benchmark.spec.ts`) — smoke test gated por `RUN_BENCHMARK_SMOKE=1` que valida 1 veículo × 1 chamada para cada um dos 3 grupos. Por padrão skipped.
```

(Note: ajuste o nome do arquivo na entrada para `sascar-benchmark.spec.ts` — o typo foi corrigido no commit da spec.)

- [ ] **Step 2: Atualizar seção "Testes com Sascar real (gated)" no README**

Edite `README.md`, na seção "Testes com Sascar real (gated)" (linhas 218-229), adicione ao final:

```markdown
## Benchmark massivo

Para benchmark de chamadas Sascar em escala, use `npm run benchmark:sascar`. O script itera por todos os veículos do `veiculos_cache` em 3 grupos (blackbox, CAN bus, posições históricas) e mede o tempo de cada chamada. Salva relatório em `reports/benchmark-sascar-*.txt`.

**Configurável via env vars:**
- `BENCHMARK_VEHICLE_LIMIT` (default 5) — número de veículos.
- `BENCHMARK_DAYS_BACK` (default 7) — range do blackbox.
- `BENCHMARK_MONTH_DAYS_BACK` (default 35) — range das posições históricas.

**Atenção:** para N veículos, o Grupo 1 (blackbox) faz N × 1008 chamadas SOAP (janelas de 10min × 1 semana). Comece com `BENCHMARK_VEHICLE_LIMIT=1` para validar a pipeline.
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
npm run lint
```

Esperado: exit 0.

---

## Task 5: Verificação final + commits

- [ ] **Step 1: Commit Task 1 (script)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add scripts/benchmark-sascar.ts
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "feat(scripts): benchmark-sascar script para 3 grupos (blackbox/CAN/historico)"
```

- [ ] **Step 2: Commit Task 2 (smoke test)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add tests/integration/sancar-benchmark.spec.ts
# NOTA: usar o nome correto do arquivo: tests/integration/sascar-benchmark.spec.ts
# Se o nome foi criado errado, corrija: git mv tests/integration/sancar-benchmark.spec.ts tests/integration/sascar-benchmark.spec.ts
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "test(integration): sascar-benchmark smoke test gated por RUN_BENCHMARK_SMOKE=1"
```

- [ ] **Step 3: Commit Task 3 (package.json + .gitignore)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add package.json .gitignore
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "chore: npm run benchmark:sascar + gitignore reports/"
```

- [ ] **Step 4: Commit Task 4 (CHANGELOG + README)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add CHANGELOG.md README.md
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "docs: CHANGELOG + README para sascar benchmark"
```

- [ ] **Step 5: Verificar 4 commits + working tree clean**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git log --oneline 949311a..HEAD
git status
```

Esperado: 4 commits, working tree clean.

- [ ] **Step 6: Suite default sem regressão**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npm test 2>&1 | tail -8
```

Esperado: 52+2 suites, 172+3 passing (a nova suite de benchmark é skipped). Sem regressão.

---

## Resumo das mudanças

| Arquivo | Tipo | Linhas |
| --- | --- | --- |
| `scripts/benchmark-sascar.ts` | new (script) | ~250 |
| `tests/integration/sancar-benchmark.spec.ts` | new (test) | ~80 |
| `package.json` | modified (1 linha) | +1 |
| `.gitignore` | modified (2 linhas) | +2 |
| `CHANGELOG.md` | modified (2 entradas) | +5 |
| `README.md` | modified (nova seção) | +15 |

**Fora do escopo:** CI integration, paralelismo, persistência de dados retornados, JSON output.

---

## Self-Review

1. **Spec coverage:**
   - Seção "Mudanças → 1" (script) → Task 1 ✅
   - Seção "Mudanças → 2" (smoke test) → Task 2 ✅
   - Seção "Mudanças → 3" (package.json) → Task 3 ✅
   - Seção "Mudanças → 4" (CHANGELOG) → Task 4 Step 1 ✅
   - Seção "Mudanças → 5" (README) → Task 4 Step 2 ✅
   - Seção "Verificação" → Task 5 ✅

2. **Placeholder scan:** sem "TBD" / "TODO" / "fix later". Steps têm comandos exatos.

3. **Type consistency:** todos os métodos Sascar usados (`solicitarEventosCaixaPreta`, `obterDadosAdicionais`, `obterPacotePosicaoHistorico`) existem em `sascar-sdk`. Env vars consistentes.

4. **Commit ordering:** cada task é verde após aplicação. Task 1 não depende de Task 2-4. Tasks 2-4 independentes. Task 5 apenas verifica.
