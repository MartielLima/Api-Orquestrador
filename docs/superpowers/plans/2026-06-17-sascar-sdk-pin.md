# sascar-sdk v1.1.1 Pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the `sascar-sdk` dependency to the audited `v1.1.1` release (with new `SascarXmlRpcClient` module + bugfixes) so `npm install` and the Docker build are reproducible, without adding any new functionality.

**Architecture:** Change two strings — one in `package.json` (npm tag pin) and one in the `Dockerfile` (`git clone --branch`). Regenerate `package-lock.json` so it carries the SHA of the tag. Update `CHANGELOG.md` and `README.md` to mention the pin. Verify with `typecheck` / `lint` / `build` / unit tests (no new code in `src/`).

**Tech Stack:** npm 7+ (GitHub tag pin syntax `#v1.1.1`), git 2+ (`git clone --branch v1.1.1`), existing TypeScript toolchain (tsc, eslint, jest).

**Spec:** `docs/superpowers/specs/2026-06-17-sascar-sdk-pin-design.md`

**Test conventions:** this plan has no new unit tests — the "tests" are the existing validation commands (`typecheck`, `lint`, `build`, `jest tests/unit`) which must continue to pass. The plan also includes a smoke check that the new XML-RPC symbol is present in the installed SDK (catches the case where npm silently resolved to an older version).

**Prereqs before starting:**
- Working tree clean (`git status` shows nothing to commit).
- Node 18+, npm 7+, git 2+ in PATH.
- No need for Docker / Postgres for the unit tests we run; integration tests are intentionally out of scope (they need `docker compose up -d postgres` and were failing before this pin).

---

## File Structure

```
api-orquestrador/
├── package.json                  # MODIFICADO: "sascar-sdk": "github:MartielLima/sascar-sdk#v1.1.1"
├── package-lock.json             # REGENERADO: npm install ancorando no SHA da tag
├── Dockerfile                    # MODIFICADO: git clone --branch v1.1.1
├── CHANGELOG.md                  # MODIFICADO: entrada "Pinned sascar-sdk to v1.1.1"
├── README.md                     # MODIFICADO: notas operacionais + Docker
└── docs/superpowers/
    ├── specs/2026-06-17-sascar-sdk-pin-design.md  (já existe)
    └── plans/2026-06-17-sascar-sdk-pin.md         (este arquivo)
```

Nenhum arquivo em `src/`, `tests/`, ou `dist/` é alterado. Nenhuma migration. Nenhuma mudança em `docs/api.md`.

---

## Task 1: Pin sascar-sdk em package.json

**Files:**
- Modify: `package.json:52`

- [ ] **Step 1: Edit package.json para fixar a tag v1.1.1**

Abra `package.json`. Localize a linha 52:

```json
    "sascar-sdk": "github:MartielLima/sascar-sdk",
```

Substitua por:

```json
    "sascar-sdk": "github:MartielLima/sascar-sdk#v1.1.1",
```

- [ ] **Step 2: Verificar que a edição ficou correta**

Run:
```bash
grep '"sascar-sdk"' package.json
```

Expected output (exatamente):
```
    "sascar-sdk": "github:MartielLima/sascar-sdk#v1.1.1",
```

Se a string não contém `#v1.1.1`, voltar ao Step 1.

- [ ] **Step 3: Validar JSON**

Run:
```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).dependencies['sascar-sdk'])"
```

Expected output:
```
github:MartielLima/sascar-sdk#v1.1.1
```

(Isso garante que o `package.json` continua sendo JSON válido — uma edição com aspas faltando faria o `npm install` falhar depois.)

---

## Task 2: Pin sascar-sdk em Dockerfile (clone com --branch)

**Files:**
- Modify: `Dockerfile` (etapa "Builder", comando `git clone`)

- [ ] **Step 1: Localizar a linha de clone**

Run:
```bash
grep -n 'sascar-sdk.git' Dockerfile
```

Expected output (uma linha):
```
XX:    git clone --depth 1 https://github.com/MartielLima/sascar-sdk.git /tmp/sascar-sdk && \
```

(Anote o número da linha — `XX` — para confirmar que o `grep` retornou apenas uma ocorrência. Se retornou mais, parar e pedir revisão manual antes de editar.)

- [ ] **Step 2: Editar Dockerfile para usar `--branch v1.1.1`**

Edite a linha encontrada no Step 1. Troque:

```dockerfile
    git clone --depth 1 https://github.com/MartielLima/sascar-sdk.git /tmp/sascar-sdk && \
```

por:

```dockerfile
    git clone --depth 1 --branch v1.1.1 https://github.com/MartielLima/sascar-sdk.git /tmp/sascar-sdk && \
```

- [ ] **Step 3: Verificar a edição**

Run:
```bash
grep -n 'sascar-sdk.git' Dockerfile
```

Expected output (uma linha, contendo `--branch v1.1.1`):
```
XX:    git clone --depth 1 --branch v1.1.1 https://github.com/MartielLima/sascar-sdk.git /tmp/sascar-sdk && \
```

---

## Task 3: Limpar node_modules/sascar-sdk e package-lock.json

**Files:**
- Delete: `node_modules/sascar-sdk/` (diretório)
- Delete: `package-lock.json`

- [ ] **Step 1: Confirmar que o working tree está limpo**

Run:
```bash
git status --short
```

Expected output: (vazio)

Se houver mudanças não commitadas, parar e revisar antes de prosseguir. O pin exige tree limpo porque vamos regerar `package-lock.json` e queremos que o diff mostre exatamente o que mudou por causa do pin.

- [ ] **Step 2: Remover a cópia local antiga do SDK**

Run:
```bash
rm -rf node_modules/sascar-sdk
```

(Se a pasta já não existir, sem problema — `rm -rf` não falha nesse caso.)

- [ ] **Step 3: Remover o lock file para forçar resolução fresca**

Run:
```bash
rm -f package-lock.json
```

- [ ] **Step 4: Verificar remoções**

Run:
```bash
ls -d node_modules/sascar-sdk 2>&1; ls package-lock.json 2>&1
```

Expected output:
```
ls: cannot access 'node_modules/sascar-sdk': No such file or directory
ls: cannot access 'package-lock.json': No such file or directory
```

---

## Task 4: Reinstalar dependências com a nova resolução

**Files:**
- Regenerate: `package-lock.json`
- Regenerate: `node_modules/sascar-sdk/`

- [ ] **Step 1: Rodar `npm install`**

Run:
```bash
npm install
```

Expected: comando termina com exit 0. Saída típica:
```
added 450 packages in 25s
```
(O número de pacotes pode variar ±50; o importante é exit 0 e ausência de erros `ERR!`.)

Se o comando falhar com `EAI_AGAIN` ou `ENOTFOUND`, verificar conectividade. Se falhar com `Could not resolve to commit ...` para o `sascar-sdk`, a tag `v1.1.1` pode ter sido movida — voltar para a Task 1 e investigar.

- [ ] **Step 2: Smoke check da versão instalada**

Run:
```bash
node -e "console.log(require('sascar-sdk/package.json').version)"
```

Expected output:
```
1.1.1
```

Se mostrar `1.0.0` ou outro valor, o `npm install` resolveu errado. Verificar `package.json` (Task 1) e o conteúdo de `package-lock.json` para a entrada `"sascar-sdk"`. Se necessário, voltar à Task 3 e repetir.

- [ ] **Step 3: Smoke check do novo símbolo XML-RPC**

Run:
```bash
grep -c 'SascarXmlRpcClient' node_modules/sascar-sdk/dist/index.d.ts
```

Expected output:
```
1
```
(ou mais, se a classe for referenciada em mais de um `export`).

Se for `0`, a versão instalada é anterior à v1.1.0. Voltar à Task 1 e investigar.

---

## Task 5: Rodar typecheck (deve passar sem mudanças)

**Files:** nenhum — verificação de tipos sobre o código atual + SDK pinado.

- [ ] **Step 1: Rodar typecheck**

Run:
```bash
npm run typecheck
```

Expected: exit 0, sem output (ou apenas mensagem "tsc --noEmit" sem erros).

Se falhar com erro de tipos vindo de `node_modules/sascar-sdk/dist/*.d.ts`, isso indica que o pin trouxe uma incompatibilidade. Capturar a mensagem de erro completa e investigar antes de prosseguir (provavelmente: alguma classe/erro foi renomeada na nova versão — pouco provável dado o changelog, mas vale conferir).

---

## Task 6: Rodar lint (deve passar)

**Files:** nenhum.

- [ ] **Step 1: Rodar lint**

Run:
```bash
npm run lint
```

Expected: exit 0, sem warnings/errors.

Falhas de lint após um pin de dependência são improváveis (não tocamos em `src/`). Se aparecer, investigar antes de prosseguir.

---

## Task 7: Rodar build (tsc)

**Files:**
- Regenerate: `dist/` (output do `tsc`)

- [ ] **Step 1: Rodar build**

Run:
```bash
npm run build
```

Expected: exit 0. O comando `tsc` (sem `--noEmit`) compila `src/` → `dist/`. Sem erros esperados.

- [ ] **Step 2: Verificar que o build produziu arquivos**

Run:
```bash
ls dist/orchestrator/SascarOrchestrator.js dist/orchestrator/errors.js
```

Expected output (duas linhas):
```
dist/orchestrator/SascarOrchestrator.js
dist/orchestrator/errors.js
```

(Confirma que os dois arquivos que importam do SDK foram compilados — eles são os pontos de contato diretos com `sascar-sdk`.)

---

## Task 8: Rodar testes unitários (sem DB)

**Files:** nenhum — execução de testes existentes.

- [ ] **Step 1: Rodar suítes que não precisam de PostgreSQL**

Run:
```bash
npx jest tests/unit tests/auth/errors.spec.ts tests/auth/validators.spec.ts
```

Expected: exit 0, todas as suítes passam. Output típico no fim:
```
Test Suites: 8 passed, 8 total
Tests:       XX passed, XX total
```

Suítes esperadas (8):
- `tests/unit/config.spec.ts`
- `tests/unit/jwt.spec.ts`
- `tests/unit/logger.spec.ts`
- `tests/unit/password.spec.ts`
- `tests/unit/SascarOrchestrator.spec.ts`
- `tests/unit/orchestrator-errors.spec.ts`
- `tests/auth/errors.spec.ts`
- `tests/auth/validators.spec.ts`

- [ ] **Step 2: Confirmar que `SascarOrchestrator` test suite ainda passa**

Essa é a suíte mais sensível ao pin: ela constrói o client real e exercita o `AsyncQueue` importado de `sascar-sdk`. Se ela passou no Step 1, o pin está validado para o consumidor SOAP.

Output esperado dentro do log do Step 1:
```
PASS tests/unit/SascarOrchestrator.spec.ts
```

- [ ] **Step 3: Confirmar que `orchestrator-errors` test suite ainda passa**

Mesma justificativa — exercita o `mapSascarError` que importa 5 classes de erro do SDK.

Output esperado:
```
PASS tests/unit/orchestrator-errors.spec.ts
```

Se **qualquer** das 8 suítes falhar após o pin, capturar a mensagem de erro e investigar. As causas prováveis: alguma classe exportada pelo SDK mudou de nome ou de comportamento. Nesse caso, **não** tentar contornar modificando nosso código — voltar à Task 1, considerar pinar em uma versão diferente, e pedir revisão.

---

## Task 9: Atualizar CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md:5` (inserir nova entrada)

- [ ] **Step 1: Adicionar entrada no topo do CHANGELOG**

Edite `CHANGELOG.md`. A primeira seção hoje é `## [0.2.0] - 2026-06-15`. Insira uma nova seção **acima** dela:

```markdown
## [Unreleased]

### Changed

- **build(deps)**: Pinned `sascar-sdk` to `v1.1.1` (was: tracking `main`). Reproducible builds + capture the audited `SascarXmlRpcClient` module and bugfixes from the v1.1.x line. No runtime changes in this project — the XML-RPC client is not consumed yet. See `docs/superpowers/specs/2026-06-17-sascar-sdk-pin-design.md`.

```

(Manter uma linha em branco depois da entrada e antes do `## [0.2.0]`.)

- [ ] **Step 2: Verificar a edição**

Run:
```bash
head -15 CHANGELOG.md
```

Expected: as 9 primeiras linhas mostradas contêm a nova entrada `## [Unreleased]` logo após o preâmbulo do Keep a Changelog.

---

## Task 10: Atualizar README.md (Notas operacionais + Docker)

**Files:**
- Modify: `README.md` (parágrafo sobre `sascar-sdk` em "Notas operacionais" e menção em "Docker")

- [ ] **Step 1: Localizar a menção atual a `sascar-sdk` em Notas operacionais**

Run:
```bash
grep -n 'sascar-sdk' README.md
```

Expected output (deve mostrar pelo menos duas linhas):
```
XX:  - **sascar-sdk** é instalado do GitHub. ...
YY: 1. **Builder**: clona o `sascar-sdk` do GitHub, builda seu `dist/`, ...
```

(Anote os números das linhas para editar.)

- [ ] **Step 2: Editar o bullet de "Notas operacionais"**

Edite a primeira ocorrência. Troque:

```markdown
- **sascar-sdk** é instalado do GitHub. O `postinstall` builda automaticamente. Se o `postinstall` falhar (ex: sem rede), rode manualmente: `cd node_modules/sascar-sdk && npm run build`.
```

por:

```markdown
- **sascar-sdk** é pined em [`v1.1.1`](https://github.com/MartielLima/sascar-sdk/releases/tag/v1.1.1) (GitHub tag). Builds são reprodutíveis. O `postinstall` continua buildando localmente se o `dist/` vier ausente; em geral vem no tarball. Se o `postinstall` falhar (ex: sem rede), rode manualmente: `cd node_modules/sascar-sdk && npm run build`.
```

- [ ] **Step 3: Editar o bullet de Docker Builder**

Edite a segunda ocorrência. Troque:

```markdown
1. **Builder**: clona o `sascar-sdk` do GitHub, builda seu `dist/`, instala deps (com `npm rebuild bcrypt` para o native binding), compila nosso TS.
```

por:

```markdown
1. **Builder**: clona o `sascar-sdk` do GitHub no tag `v1.1.1` (`git clone --branch v1.1.1`), builda seu `dist/`, instala deps (com `npm rebuild bcrypt` para o native binding), compila nosso TS.
```

- [ ] **Step 4: Verificar a edição**

Run:
```bash
grep -n 'sascar-sdk' README.md
```

Expected output: as duas linhas contêm agora referência a `v1.1.1` (a primeira com link markdown, a segunda com `git clone --branch v1.1.1`).

---

## Task 11: Commit consolidado

**Files:**
- Stage: `package.json`, `package-lock.json`, `Dockerfile`, `CHANGELOG.md`, `README.md`

- [ ] **Step 1: Conferir o diff antes de commitar**

Run:
```bash
git status
```

Expected output (5 arquivos modificados/criados, mais nada):
```
modified:   package.json
modified:   package-lock.json
modified:   Dockerfile
modified:   CHANGELOG.md
modified:   README.md
```

Se aparecer `modified:   src/...` ou qualquer coisa fora dessa lista, parar e revisar — alguma edição extra vazou.

- [ ] **Step 2: Conferir o diff do package.json**

Run:
```bash
git diff -- package.json
```

Expected: 1 linha alterada, exatamente:
```diff
-    "sascar-sdk": "github:MartielLima/sascar-sdk",
+    "sascar-sdk": "github:MartielLima/sascar-sdk#v1.1.1",
```

- [ ] **Step 3: Conferir o diff do Dockerfile**

Run:
```bash
git diff -- Dockerfile
```

Expected: 1 linha alterada, adicionando ` --branch v1.1.1` ao `git clone`. Sem outras mudanças.

- [ ] **Step 4: Conferir o diff do CHANGELOG e README**

Run:
```bash
git diff --stat -- CHANGELOG.md README.md
```

Expected: ambos com `+9` e `+1`/+`+2` linhas, respectivamente. (Tamanhos aproximados — o importante é que os diffs não tocam em código, só em prosa.)

- [ ] **Step 5: Stagear tudo**

Run:
```bash
git add package.json package-lock.json Dockerfile CHANGELOG.md README.md
```

- [ ] **Step 6: Commitar**

Run:
```bash
git commit -m "build(deps): pin sascar-sdk to v1.1.1"
```

Expected: commit criado, com mensagem exatamente `build(deps): pin sascar-sdk to v1.1.1` e os 5 arquivos no diff. Sem `Co-Authored-By:` no rodapé (a spec não pede).

- [ ] **Step 7: Verificar working tree limpo**

Run:
```bash
git status
```

Expected: `nothing to commit, working tree clean`.

- [ ] **Step 8: Conferir o commit**

Run:
```bash
git log -1 --stat
```

Expected: mostra o commit novo com os 5 arquivos listados nos stats, e a mensagem começando com `build(deps): pin sascar-sdk to v1.1.1`.

---

## Self-Review

**1. Spec coverage:**
- §"1. Pin no package.json" → Task 1 ✓
- §"2. Pin no Dockerfile" → Task 2 ✓
- §"3. Limpar e reinstalar" → Tasks 3 e 4 ✓
- §"4. Verificar versão instalada" → Task 4 Step 2 ✓
- §"5. Validações obrigatórias" → Tasks 5, 6, 7, 8 ✓ (smoke check de SascarXmlRpcClient na Task 4 Step 3)
- §"6. Documentação" → Tasks 9 e 10 ✓
- §"Plano de execução" → Task 11 ✓
- §"Critérios de aceitação" → cada checkbox de cada task é um critério binário ✓

**2. Placeholder scan:**
- Procurado: "TBD", "TODO", "implement later", "fill in details", "add appropriate", "similar to Task N". **Nenhuma ocorrência** ✓
- Todos os comandos têm `Expected output` explícito ✓
- Todas as edições mostram o `oldString` e o `newString` completos (sem `...` ou placeholders) ✓

**3. Type consistency:**
- Nenhuma função ou tipo novo é introduzido neste plano (só editamos strings + rodamos validações) — N/A ✓
- Path do arquivo: `package.json:52` confirmado no Step 1 da Task 1 (validado por `grep`)
- Path do arquivo: `Dockerfile` validado por `grep` no Step 1 da Task 2
- Nomes de comandos npm: `typecheck`, `lint`, `build` — todos existem no `package.json` scripts ✓
- Comando jest: `npx jest tests/unit tests/auth/errors.spec.ts tests/auth/validators.spec.ts` — 8 suítes listadas na Task 8 Step 1, batem com as 8 listadas em `tests/unit/` (6) + 2 auth sem DB (errors, validators) ✓

**4. Riscos residuais:**
- Lock file pode ter tamanho diferente do atual (esperado — agora tem SHA do commit) — não é problema
- O `postinstall` (Task 4 Step 1) pode rodar `npm run build` no SDK se a versão do tarball não trouxer `dist/`; isso é idempotente e já estava documentado na v0.1.0 — não introduz risco novo
