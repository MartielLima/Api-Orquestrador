# Real Sascar Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar `tests/integration/sascar-real.spec.ts` (gated por `RUN_REAL_SASCAR_TESTS=1`) + entradas em CHANGELOG/README documentando o uso, em 2 commits.

**Architecture:** Suite única `describe.skip` por padrão. 4 testes end-to-end (Sascar SOAP real → SDK → `SascarOrchestrator` → Postgres → GraphQL) com `beforeEach` que faz cleanup defensivo. Gate em runtime via `process.env.RUN_REAL_SASCAR_TESTS === '1'`. Sem mudanças em código de produção.

**Tech Stack:** TypeScript 5 estrito, Jest + ts-jest, `pg` Pool, `buildSascarClient` + `SascarOrchestrator` (já usados pelos outros integration tests), `buildTestServer` (helper Apollo).

**Branch:** `main` (já em `8ced2ad`).

**Pré-condições:**
- Container `app` e `postgres` rodando (`docker compose ps`).
- `.env` com `DATABASE_URL`, `SASCAR_USUARIO`, `SASCAR_SENHA`, `SASCAR_WSDL_URL` (já temos).
- API Sascar acessível (já validado: `curl https://sasintegra.sascar.com.br/...` → 200).

---

## File Structure

**Criar:**
- `tests/integration/sascar-real.spec.ts` (suite gated, 4 testes)

**Modificar:**
- `CHANGELOG.md` (entrada em `[Unreleased]` → `### Added` + atualizar contagem de testes)
- `README.md` (seção "Testes" ou nova nota)

**Resultado:** 1 arquivo novo + 2 modificados, 2 commits (T1: test, T2: docs).

---

## Task 1: Criar `tests/integration/sascar-real.spec.ts` + validar gated default

**Files:**
- Create: `tests/integration/sascar-real.spec.ts`

- [ ] **Step 1: Criar o arquivo com o conteúdo da spec verbatim**

Crie `tests/integration/sascar-real.spec.ts` com o conteúdo exato da seção "Mudanças → 1" de `docs/superpowers/specs/2026-06-18-sascar-real-integration-tests-design.md` (linhas 41-167 da spec). O conteúdo completo está naquele arquivo. Copie verbatim — incluindo:
- `/* eslint-disable @typescript-eslint/no-explicit-any */` no topo
- `const runReal = process.env.RUN_REAL_SASCAR_TESTS === '1';`
- `const describeIf = runReal ? describe : describe.skip;`
- `const requiredEnv = ['SASCAR_WSDL_URL', 'SASCAR_USUARIO', 'SASCAR_SENHA', 'DATABASE_URL'];`
- `const missingEnv = requiredEnv.filter((k) => !process.env[k]);`
- `const describeIfReady = runReal && missingEnv.length === 0 ? describe : describe.skip;`
- Os 4 `it` blocks com a sequência: obterClientesV2, obterVeiculos, obterMotoristas, obterPacotePosicaoPorRangeJSON

- [ ] **Step 2: Rodar typecheck (sanity)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
```

Esperado: exit 0.

- [ ] **Step 3: Rodar lint**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run lint
```

Esperado: exit 0 (sem warnings novos).

- [ ] **Step 4: Rodar suite default (sem env var) — suite deve aparecer como skipped**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/sascar-real.spec.ts
```

Esperado: a suite é `describe.skip`, então nada roda. Jest reporta `No tests found, exiting with code 1` OU similar (suite skipped, 0 tests). **Não é falha** — é o comportamento esperado do gate. Confirme que `process.env.RUN_REAL_SASCAR_TESTS` não está setado.

- [ ] **Step 5: Confirmar que a suite EXISTE mas está skipped via grep**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
grep -E "describeIfReady|describeIf" tests/integration/sascar-real.spec.ts
```

Esperado: ver as 2 linhas (`describeIf` e `describeIfReady`).

- [ ] **Step 6: Rodar a suite REAL (gated)**

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
RUN_REAL_SASCAR_TESTS=1 \
npx jest tests/integration/sascar-real.spec.ts
```

**Possíveis outcomes:**

(a) **Todos os 4 testes passam:** o Sascar respondeu, o pipeline funcionou, o GraphQL respondeu. Avançar para Step 7.

(b) **Algum teste falha:** reportar DONE_WITH_CONCERNS com a primeira linha do erro. Investigar se é:
- Sascar fora do ar (HTTP timeout, SASCAR_NETWORK) — pode ser flake de rede
- Schema mudou (campo faltando, tipo errado) — investigar diff entre SDK e resposta
- Credenciais inválidas (SASCAR_AUTH) — verificar `.env`
- DB constraint falhou (BIGINT overflow, FK violation) — reportar e investigar

(c) **Suite toda skipped mesmo com env var:** algum requiredEnv está faltando. Reportar como BLOCKED com o nome da env var faltando.

- [ ] **Step 7: Rodar suite completa default (sem env var) para garantir que nada regrediu**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npm test
```

Esperado: 52+1 suites / 172+4 tests (a nova suite é skipped, com 4 tests skipped). Total de testes ativos continua 172 passing.

- [ ] **Step 8: Commit**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add tests/integration/sascar-real.spec.ts
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "test(integration): sascar-real suite gated por RUN_REAL_SASCAR_TESTS=1

Adiciona tests/integration/sascar-real.spec.ts que bate no Sascar real
(nao mocka) e valida end-to-end: SDK SOAP -> SascarOrchestrator -> Postgres
-> GraphQL. Cobre os 4 metodos principais:

- obterClientesV2 -> clientes_cache -> Query.clientes
- obterVeiculos -> veiculos_cache -> Query.veiculos { idEquipamento }
- obterMotoristas -> motoristas_cache -> Query.motoristas
- obterPacotePosicaoPorRangeJSON -> posicoes -> Veiculo.status via GraphQL

Por padrao a suite e describe.skip — nao impacta CI nem devs locais.
Para rodar:
  RUN_REAL_SASCAR_TESTS=1 SASCAR_USUARIO=... SASCAR_SENHA=... npm test

Requer credenciais Sascar validas no .env e o container postgres rodando.
Demora ~5-10min.

Complementa a cobertura existente (nock em posicoes.spec.ts e
posicoes-bigint.spec.ts, stub em SascarOrchestrator.spec.ts)."
git log --oneline -1
```

Esperado: novo commit. **Nota:** o SHA do commit deve ser registrado para o report final.

---

## Task 2: Atualizar CHANGELOG + README

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: Adicionar entrada em `CHANGELOG.md` → `[Unreleased]` → `### Added`**

Localizar a linha 13 do CHANGELOG (entrada `feat(graphql) New VeiculoStatus type...` que adicionamos antes) e adicionar logo abaixo, em `### Added`:

```markdown
- **test(integration)**: New `tests/integration/sascar-real.spec.ts` — suite gated por `RUN_REAL_SASCAR_TESTS=1` que bate no Sascar real (não mocka) e valida end-to-end os 4 métodos principais: `obterClientesV2`, `obterVeiculos`, `obterMotoristas`, `obterPacotePosicaoPorRangeJSON`. Por padrão a suite é `describe.skip` — roda só quando explicitamente habilitada (smoke job, debug local, validação de release). Cobertura de ~5-10min.
```

Atualizar a linha de "Notes" para refletir a nova contagem (de 52 para 53 suites; de 172 para 172+4 tests, mas só 172 ativos porque a nova suite é skipped por padrão). Sugestão: deixar a contagem como `52 suites / 172 tests passing` (a nova suite é skipped e os 4 tests skipped não somam nos passing).

- [ ] **Step 2: Adicionar seção "Testes com Sascar real" no `README.md`**

Localizar a seção "Testes" no README (grep por "## Testes" ou similar) e adicionar após a seção existente (ou criar nova seção se não existir):

```markdown
## Testes com Sascar real (gated)

O projeto inclui `tests/integration/sascar-real.spec.ts` que bate no Sascar real (sem mock). Por padrão a suite é skipped via `describe.skip`. Para rodar:

\`\`\`bash
RUN_REAL_SASCAR_TESTS=1 npm test
\`\`\`

Requer credenciais Sascar válidas no `.env` (`SASCAR_USUARIO`, `SASCAR_SENHA`, `SASCAR_WSDL_URL`) e o container postgres rodando. Demora ~5-10min. Use para debug local, validação de release, ou smoke job.
```

- [ ] **Step 3: Rodar typecheck + lint**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
npm run lint
```

Esperado: exit 0 para ambos.

- [ ] **Step 4: Confirmar diffs (read-only)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git diff HEAD -- CHANGELOG.md README.md | head -50
```

Esperado: ver a entrada nova no CHANGELOG e a seção nova no README.

- [ ] **Step 5: Commit**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add CHANGELOG.md README.md
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "docs: CHANGELOG + README para sascar-real integration tests

- CHANGELOG.md [Unreleased] Added: feat(test) sascar-real suite
  gated por RUN_REAL_SASCAR_TESTS=1 (resumo dos 4 metodos, gate, custo).
- README.md: nova secao 'Testes com Sascar real (gated)' explicando
  como rodar com RUN_REAL_SASCAR_TESTS=1, credenciais necessarias,
  e caso de uso (debug local, smoke job, validacao de release)."
git log --oneline -1
```

Esperado: novo commit. Anotar SHA.

---

## Task 3: Verificação final

- [ ] **Step 1: Confirmar 2 commits no log**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git log --oneline 8ced2ad..HEAD
```

Esperado: 2 commits (Task 1 e Task 2).

- [ ] **Step 2: Working tree limpo**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git status
```

Esperado: `nothing to commit, working tree clean`.

- [ ] **Step 3: Suite default (sem env var) ainda passa**

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

Esperado: 52+1 suites, 172+4 tests (4 skipped na nova suite), 172 passing.

- [ ] **Step 4: Resumo final**

Reportar:
- SHA dos 2 commits
- Resultado do Step 6 da Task 1 (suite real rodou e passou? quantos testes passaram?)
- Estatísticas: 1 arquivo novo, 2 modificados, ~150 linhas adicionadas
- Próximos passos opcionais (CI integration, TUI smoke)

---

## Resumo das mudanças

| Arquivo | Tipo | Linhas |
| --- | --- | --- |
| `tests/integration/sascar-real.spec.ts` | new (test) | ~120 |
| `CHANGELOG.md` | modified (docs) | +2 |
| `README.md` | modified (docs) | +10 |

**Fora do escopo:** rodar em CI (precisa secret management), TUI smoke com Sascar real (precisa rebuild container), cobrir os 63 métodos SOAP (apenas os 4 principais).

---

## Self-Review

1. **Spec coverage:**
   - Seção "Mudanças → 1" (suite) → Task 1 ✅
   - Seção "Mudanças → 2" (CHANGELOG) → Task 2 Step 1 ✅
   - Seção "Mudanças → 3" (README) → Task 2 Step 2 ✅
   - Seção "Testes" → a suite é o próprio teste ✅
   - Seção "Verificação" → Task 3 Step 3 ✅
   - Seção "Riscos" → não há ações mitigadoras no plano (mitigações são operacionais); documentado na spec ✅

2. **Placeholder scan:** sem "TBD" / "TODO" / "fix later". Steps têm código verbatim ou comandos exatos.

3. **Type consistency:** os types referenciados (`Veiculo`, `Posicao`, `AppContext`, etc.) são os mesmos usados em outros integration tests. `buildTestServer` já existe. `buildSascarClient` + `SascarOrchestrator` já existem. `getClientes`/`getVeiculos`/`getMotoristas`/`fetchAndUpsertPosicoes` são as exports atuais.

4. **Commit ordering:** cada task é verde após aplicação. Task 1 (test commit) tem o arquivo de teste + a suite rodou real (verificada no Step 6). Task 2 (docs) é puramente docs, não impacta runtime. Task 3 valida que nada regrediu.
