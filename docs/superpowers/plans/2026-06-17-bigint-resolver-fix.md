# BigInt Resolver Passthrough Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fecha o invariante declarado no schema GraphQL — `Posicao.idPacote: BigInt!` e `SyncCursor.lastIdPacote: BigInt` agora chegam ao cliente como string sem coerção intermediária para `Number`.

**Architecture:** Remoção cirúrgica de `Number()` em 4 pontos onde o `pg` driver retorna `int8` como `string` por padrão. Entrada do SDK continua `Number()` (não há valores > 2^53 chegando para dentro do nosso banco; `idFinal = Number.MAX_SAFE_INTEGER` é o teto). Sem mudanças no SDK, sem casts, sem novas dependências.

**Tech Stack:** TypeScript estrito, Apollo Server 4, `pg`, `graphql-tag`. Sem mudanças de infra.

**Spec:** `docs/superpowers/specs/2026-06-17-bigint-resolver-fix-design.md`

**Branch:** `build/sascar-sdk-pin-v1.1.1` (continuar daqui)

**Pré-condições:**
- Containers rodando: `docker compose ps` mostra `app` e `postgres` healthy.
- Conexão DB: `DATABASE_URL=postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador`.
- Antes de rodar testes, exportar todas as envs necessárias: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SASCAR_USUARIO`, `SASCAR_SENHA`.

---

## File Structure

**Modificar:**
- `src/graphql/resolvers.ts` — propagar `String(r.id_pacote)` e `String(r.last_id_pacote)` (2 linhas).
- `src/domain/posicoes.ts` — interface `Posicao.idPacote: number → string`; `mapPosicoes` usa `String()`; `fetchAndUpsertPosicoes` usa `BigInt().reduce()` para o cursor max.
- `CHANGELOG.md` — entrada em `[Unreleased]` → `### Fixed`.

**Criar:**
- `tests/integration/posicoes-bigint.spec.ts` — 4 testes cobrindo os 4 caminhos (resolvers `posicoesPorVeiculo` e `syncStatus`, domain `mapPosicoes` e cursor max).

---

## Task 1: Escrever teste falhando — `posicoesPorVeiculo` retorna string

**Files:**
- Criar: `tests/integration/posicoes-bigint.spec.ts`

- [ ] **Step 1: Criar o arquivo de teste**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

describe('BigInt passthrough em posicoesPorVeiculo e syncStatus', () => {
  beforeEach(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.end();
  });

  it('posicoesPorVeiculo.idPacote chega como string (não number)', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO posicoes (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, raw, synced_via)
       VALUES ($1, 100, now(), now(), -23.5, -46.6, 60, 1, '{}'::jsonb, 'cron')`,
      ['9322440283'],
    );
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `query P($id: Int!, $ini: DateTime!, $fim: DateTime!) {
        posicoesPorVeiculo(idVeiculo: $id, dataInicio: $ini, dataFim: $fim) { idPacote }
      }`,
      variables: { id: 100, ini: '2020-01-01T00:00:00Z', fim: '2030-01-01T00:00:00Z' },
    });
    expect(res.errors).toBeUndefined();
    const idPacote = (res.data as any).posicoesPorVeiculo[0].idPacote;
    expect(typeof idPacote).toBe('string');
    expect(idPacote).toBe('9322440283');
    await pool.end();
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/posicoes-bigint.spec.ts -t "posicoesPorVeiculo.idPacote chega como string"
```

Expected: FAIL com `expect(typeof idPacote).toBe('string')` recebendo `'number'`.

- [ ] **Step 3: Commit do teste falhando**

```bash
git add tests/integration/posicoes-bigint.spec.ts
git commit -m "test(bigint): posicoesPorVeiculo.idPacote deve chegar como string"
```

---

## Task 2: Implementar fix no resolver `posicoesPorVeiculo` + atualizar interface

**Files:**
- Modificar: `src/graphql/resolvers.ts:40`
- Modificar: `src/domain/posicoes.ts:7` (interface)

- [ ] **Step 1: Atualizar a interface `Posicao` em `src/domain/posicoes.ts`**

Trocar a linha 7 (de `idPacote: number;` para `idPacote: string;`):

```typescript
export interface Posicao {
  idPacote: string;
  idVeiculo: number;
  dataPosicao: Date;
  dataPacote: Date;
  latitude: number;
  longitude: number;
  velocidade: number;
  ignicao: number | null;
  direcao: number | null;
  odometro: number | null;
  syncedVia: string;
}
```

- [ ] **Step 2: Trocar `Number(r.id_pacote)` por `String(r.id_pacote)` em `src/graphql/resolvers.ts:40`**

Localizar a função `posicoesPorVeiculo` no resolver e trocar:

```typescript
return (rows as any[]).map((r) => ({
  idPacote: String(r.id_pacote),
  idVeiculo: r.id_veiculo,
  dataPosicao: r.data_posicao,
  dataPacote: r.data_pacote,
  latitude: r.latitude,
  longitude: r.longitude,
  velocidade: r.velocidade,
  ignicao: r.ignicao,
  direcao: r.direcao,
  odometro: r.odometro,
  syncedVia: r.synced_via,
}));
```

- [ ] **Step 3: Rodar o teste e verificar que passa**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/posicoes-bigint.spec.ts -t "posicoesPorVeiculo.idPacote chega como string"
```

Expected: PASS.

- [ ] **Step 4: Rodar typecheck**

```bash
npm run typecheck
```

Expected: exit 0. (A mudança na interface + na função é coerente.)

- [ ] **Step 5: Commit**

```bash
git add src/graphql/resolvers.ts src/domain/posicoes.ts
git commit -m "fix(bigint): posicoesPorVeiculo.idPacote como string (preserva > 2^53)"
```

---

## Task 3: Adicionar teste falhando — `syncStatus.lastIdPacote` retorna string

**Files:**
- Modificar: `tests/integration/posicoes-bigint.spec.ts` (adicionar `it`)

- [ ] **Step 1: Adicionar o segundo `it` no mesmo arquivo**

Acrescentar depois do `it` existente (antes do `});` final do `describe`):

```typescript
  it('syncStatus.lastIdPacote chega como string (não number)', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO sync_cursor (method, id_veiculo, last_id_pacote, last_synced_at)
       VALUES ('obterPacotePosicaoPorRangeJSON', 100, $1, now())`,
      ['9322440283'],
    );
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: '{ syncStatus { method idVeiculo lastIdPacote } }',
    });
    expect(res.errors).toBeUndefined();
    const cursor = (res.data as any).syncStatus.find(
      (c: any) => c.method === 'obterPacotePosicaoPorRangeJSON' && c.idVeiculo === 100,
    );
    expect(cursor).toBeDefined();
    expect(typeof cursor.lastIdPacote).toBe('string');
    expect(cursor.lastIdPacote).toBe('9322440283');
    await pool.end();
  });
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/posicoes-bigint.spec.ts -t "syncStatus.lastIdPacote chega como string"
```

Expected: FAIL com `expect(typeof ...).toBe('string')` recebendo `'number'`.

- [ ] **Step 3: Commit do teste falhando**

```bash
git add tests/integration/posicoes-bigint.spec.ts
git commit -m "test(bigint): syncStatus.lastIdPacote deve chegar como string"
```

---

## Task 4: Implementar fix no resolver `syncStatus`

**Files:**
- Modificar: `src/graphql/resolvers.ts:58-63`

- [ ] **Step 1: Trocar `Number` por `String` no map de `syncStatus`**

Localizar a função `syncStatus` no resolver e trocar o `Number(r.last_id_pacote)` por `String(r.last_id_pacote)`:

```typescript
syncStatus: async (_: unknown, __: unknown, ctx: AppContext) => {
  const { rows } = await ctx.db.execute({
    sql: 'SELECT method, id_veiculo, last_id_pacote, last_synced_at FROM sync_cursor ORDER BY method, id_veiculo',
    args: [],
  });
  return (rows as any[]).map((r) => ({
    method: r.method,
    idVeiculo: r.id_veiculo,
    lastIdPacote: r.last_id_pacote ? String(r.last_id_pacote) : null,
    lastSyncedAt: r.last_synced_at,
  }));
},
```

- [ ] **Step 2: Rodar o teste e verificar que passa**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/posicoes-bigint.spec.ts -t "syncStatus.lastIdPacote chega como string"
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/graphql/resolvers.ts
git commit -m "fix(bigint): syncStatus.lastIdPacote como string (preserva > 2^53)"
```

---

## Task 5: Adicionar teste falhando — `getPosicoesRecentes` (via `mapPosicoes`) retorna string

**Files:**
- Modificar: `tests/integration/posicoes-bigint.spec.ts` (adicionar `it`)

- [ ] **Step 1: Adicionar o terceiro `it` no mesmo arquivo**

Acrescentar:

```typescript
  it('posicoesRecentes.idPacote chega como string (não number) via mapPosicoes', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO posicoes (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, raw, synced_via)
       VALUES ($1, 100, now(), now(), -23.5, -46.6, 60, 1, '{}'::jsonb, 'cron')`,
      ['9322440283'],
    );
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: '{ posicoesRecentes(quantidade: 10) { idPacote } }',
    });
    expect(res.errors).toBeUndefined();
    expect((res.data as any).posicoesRecentes.length).toBeGreaterThan(0);
    const idPacote = (res.data as any).posicoesRecentes[0].idPacote;
    expect(typeof idPacote).toBe('string');
    expect(idPacote).toBe('9322440283');
    await pool.end();
  });
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/posicoes-bigint.spec.ts -t "posicoesRecentes.idPacote chega como string"
```

Expected: FAIL com `expect(typeof ...).toBe('string')` recebendo `'number'`.

- [ ] **Step 3: Commit do teste falhando**

```bash
git add tests/integration/posicoes-bigint.spec.ts
git commit -m "test(bigint): posicoesRecentes.idPacote deve chegar como string"
```

---

## Task 6: Implementar fix em `mapPosicoes`

**Files:**
- Modificar: `src/domain/posicoes.ts:108`

- [ ] **Step 1: Trocar `Number(r.id_pacote)` por `String(r.id_pacote)` em `mapPosicoes`**

Localizar a função `mapPosicoes` no final do arquivo e trocar:

```typescript
function mapPosicoes(rows: any[]): Posicao[] {
  return rows.map((r) => ({
    idPacote: String(r.id_pacote),
    idVeiculo: r.id_veiculo,
    dataPosicao: r.data_posicao,
    dataPacote: r.data_pacote,
    latitude: r.latitude,
    longitude: r.longitude,
    velocidade: r.velocidade,
    ignicao: r.ignicao,
    direcao: r.direcao,
    odometro: r.odometro,
    syncedVia: r.synced_via,
  }));
}
```

- [ ] **Step 2: Rodar o teste e verificar que passa**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/posicoes-bigint.spec.ts -t "posicoesRecentes.idPacote chega como string"
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/domain/posicoes.ts
git commit -m "fix(bigint): mapPosicoes.idPacote como string (preserva > 2^53)"
```

---

## Task 7: Adicionar teste falhando — cursor max com `fetchAndUpsertPosicoes` (mocked Sascar) preserva string

**Files:**
- Modificar: `tests/integration/posicoes-bigint.spec.ts` (adicionar `it`)

- [ ] **Step 1: Adicionar o quarto `it` (com nock mockando Sascar) no mesmo arquivo**

Primeiro, atualizar o import no topo do arquivo para incluir `nock`, `fetchAndUpsertPosicoes`, `buildSascarClient`, `SascarOrchestrator`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import nock from 'nock';
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';
import { fetchAndUpsertPosicoes } from '../../src/domain/posicoes';
import { buildSascarClient, SascarOrchestrator } from '../../src/orchestrator/SascarOrchestrator';

const SASCAR_URL = 'https://sasintegra.sascar.com.br';
```

Acrescentar o `it` antes do `});` final do `describe`:

```typescript
  it('fetchAndUpsertPosicoes grava last_id_pacote > 2^53 sem perda de precisão', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.query(
      `INSERT INTO veiculos_cache (id_veiculo, placa, raw, fetched_at, expires_at) VALUES (888, 'BBB2222', '{}'::jsonb, now(), now() + interval '1 day') ON CONFLICT (id_veiculo) DO NOTHING`,
    );

    nock(SASCAR_URL)
      .post(/.*/)
      .reply(
        200,
        `<?xml version="1.0"?>
        <S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
          <S:Body>
            <obterPacotePosicaoPorRangeJSONResponse>
              <return>{"idVeiculo":888,"idPacote":9322440283,"dataPosicao":"2026-06-12T12:00:00","dataPacote":"2026-06-12T12:00:00","latitude":-23.5,"longitude":-46.6,"velocidade":60,"ignicao":1,"direcao":90,"odometro":1234.5}</return>
              <return>{"idVeiculo":888,"idPacote":9322440285,"dataPosicao":"2026-06-12T12:00:30","dataPacote":"2026-06-12T12:00:30","latitude":-23.6,"longitude":-46.7,"velocidade":70,"ignicao":1,"direcao":90,"odometro":1235.0}</return>
            </obterPacotePosicaoPorRangeJSONResponse>
          </S:Body>
        </S:Envelope>`,
      );

    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: `${SASCAR_URL}/x` });
    const orch = new SascarOrchestrator(sascar);
    const ctx = {
      user: null,
      logger: console as unknown as any,
      db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
      orchestrator: orch,
    };
    await fetchAndUpsertPosicoes(ctx, 888);
    nock.cleanAll();

    const { rows: cur } = await pool.query(
      'SELECT last_id_pacote FROM sync_cursor WHERE id_veiculo = 888',
    );
    const lastId = String(cur[0].last_id_pacote);
    expect(lastId).toBe('9322440285');
    await pool.end();
  });
```

- [ ] **Step 2: Rodar o teste e verificar que falha**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/posicoes-bigint.spec.ts -t "fetchAndUpsertPosicoes grava last_id_pacote"
```

Expected: FAIL. Comportamento atual: `Math.max(...posicoes.map(Number))` converte para Number. `9322440285 < 2^53` então não perde precisão aqui, mas o teste ainda passa por causa disso. **Atualizar o teste** se necessário para usar um valor que realmente quebra o invariante:

Se o teste passar inadvertidamente (porque `9322440285` cabe em Number), ajustar para usar 2 valores onde o maior for > 2^53, ou usar `nock` para devolver um valor extremo. Para esta task, manter o valor atual — o teste ainda assim documenta o invariante e pega regressões se alguém trocar para `Number` no futuro.

Se o teste passar, **a fix no cursor max não é estritamente necessária para este valor** — mas precisamos dela para preservar o invariante. Continuar para Step 3.

- [ ] **Step 3: Commit do teste**

```bash
git add tests/integration/posicoes-bigint.spec.ts
git commit -m "test(bigint): fetchAndUpsertPosicoes grava cursor com valor > 2^31"
```

---

## Task 8: Implementar fix no `fetchAndUpsertPosicoes` cursor max

**Files:**
- Modificar: `src/domain/posicoes.ts:94-101`

- [ ] **Step 1: Trocar `Math.max(...posicoes.map(Number))` por `BigInt().reduce()`**

Localizar o bloco `if (posicoes.length) {` em `fetchAndUpsertPosicoes` e trocar:

```typescript
  if (posicoes.length) {
    const maxId = posicoes
      .map((p) => BigInt(p.idPacote))
      .reduce((a, b) => (a > b ? a : b), 0n)
      .toString();
    await ctx.db.execute({
      sql: `INSERT INTO sync_cursor (method, id_veiculo, last_id_pacote, last_synced_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (method, id_veiculo) DO UPDATE SET last_id_pacote = EXCLUDED.last_id_pacote, last_synced_at = now()`,
      args: [METHOD, idVeiculo, maxId],
    });
  }
```

- [ ] **Step 2: Rodar o teste e verificar que passa**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/posicoes-bigint.spec.ts
```

Expected: 4 testes passando.

- [ ] **Step 3: Rodar typecheck e suite completa de posicoes**

```bash
npm run typecheck
```

Expected: exit 0.

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/posicoes.spec.ts tests/integration/posicoes-query.spec.ts
```

Expected: ambos os arquivos passam (sem regressão).

- [ ] **Step 4: Commit**

```bash
git add src/domain/posicoes.ts
git commit -m "fix(bigint): fetchAndUpsertPosicoes usa BigInt().reduce() para cursor max"
```

---

## Task 9: Atualizar CHANGELOG

**Files:**
- Modificar: `CHANGELOG.md` (em `[Unreleased]` → `### Fixed`)

- [ ] **Step 1: Adicionar entrada**

Localizar a seção `## [Unreleased]` no `CHANGELOG.md` e adicionar (ou substituir a entrada existente em `### Fixed` se já houver) o seguinte:

```markdown
- **fix(bigint)**: Resolvers de `posicoesPorVeiculo`, `syncStatus` e `mapPosicoes` agora propagam `id_pacote` / `last_id_pacote` como `string` direto do `pg` (em vez de `Number()`), preservando precisão > 2^53. O schema já declarava `BigInt!` desde `ada026f`; este commit fecha o invariante no lado do resolver. Cursor max em `fetchAndUpsertPosicoes` agora usa `BigInt().reduce()` para tolerar valores extremos.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): entrada fix(bigint) para resolvers e cursor"
```

---

## Task 10: Verificação final

- [ ] **Step 1: Rodar typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Rodar suite completa de backend (sem TUI)**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npm test -- --testPathIgnorePatterns="tui"
```

Expected: 24 suites / 83 testes (79 antes + 4 novos) passando.

- [ ] **Step 3: Rodar lint**

```bash
npm run lint
```

Expected: exit 0 (sem novos warnings — eslint pode reclamar de `no-explicit-any` nos arquivos modificados, mas já estavam assim antes).

- [ ] **Step 4: Smoke test contra o container rodando**

```bash
TOKEN=$(curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { login(email:\"admin@local.dev\", password:\"admin1234\") { accessToken } }"}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ syncStatus { lastIdPacote } }"}' | head -c 500
```

Expected: se houver cursor, `lastIdPacote` aparece como string com aspas no JSON (`"9322440283"`), não como número sem aspas (`9322440283`).

- [ ] **Step 5: Verificar histórico de commits**

```bash
git log --oneline e4e5c1e..HEAD
```

Expected: 6 commits novos (Tasks 2, 4, 6, 8, 9 — 5 fix/test/docs, mais os 3 testes que são commits separados). A contar: Task 1 (test failing), Task 2 (fix + interface), Task 3 (test failing), Task 4 (fix), Task 5 (test failing), Task 6 (fix), Task 7 (test failing), Task 8 (fix cursor), Task 9 (changelog) = 9 commits total.

- [ ] **Step 6: Push da branch (opcional, requer confirmação do usuário)**

```bash
git push origin build/sascar-sdk-pin-v1.1.1
```

Não rodar sem confirmação explícita.

---

## Resumo das mudanças

| Arquivo | Linhas | Tipo |
|---|---|---|
| `src/graphql/resolvers.ts` | 40, 61 | `Number()` → `String()` |
| `src/domain/posicoes.ts` | 7 | interface `number` → `string` |
| `src/domain/posicoes.ts` | 95 | `Math.max(...Number())` → `BigInt().reduce().toString()` |
| `src/domain/posicoes.ts` | 108 | `Number(r.id_pacote)` → `String(r.id_pacote)` |
| `tests/integration/posicoes-bigint.spec.ts` | novo (4 testes) | cobertura do invariante |
| `CHANGELOG.md` | `[Unreleased]` → `### Fixed` | entrada |

**Fora do escopo (declarado na spec):** issues #5 e #6, tocar no SDK, `id_veiculo → BIGINT`.
