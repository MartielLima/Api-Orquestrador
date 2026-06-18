# VeiculoStatus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validar, organizar e commitar a feature `VeiculoStatus` em **5 commits granulares** (TDD-style, todos verdes) na branch `build/sascar-sdk-pin-v1.1.1`, sem introduzir regressões.

**Architecture:** Cada commit cobre uma camada (domain → graphql → tui → docs) e fica verde após aplicação. O trabalho já está escrito nos arquivos untracked/modificados — o plano consiste em validar, splittar o arquivo de integration test que tem 2 describes, e fazer `git add` seletivo em 5 commits. A spec retroativa já está commitada em `docs/superpowers/specs/2026-06-18-veiculos-status-design.md` (commit `f92b5b3`).

**Tech Stack:** TypeScript 5 estrito, Apollo Server 4, `pg`, `graphql-tag`, Jest + ts-jest, ESLint, prettier, TUI Ink. Sem mudanças de dependência ou infra.

**Branch:** `build/sascar-sdk-pin-v1.1.1`.

**Pré-condições (verificar antes de começar):**
- `git status` mostra 7 arquivos modificados + 5 untracked (ver Tabela de Arquivos abaixo).
- Containers rodando: `docker compose ps` mostra `app` e `postgres` healthy.
- Env vars: `DATABASE_URL=postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador`, `JWT_ACCESS_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, `JWT_REFRESH_SECRET=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`, `SEED_ADMIN_EMAIL=admin@local.dev`, `SEED_ADMIN_PASSWORD=admin1234`, `SASCAR_USUARIO=dummy`, `SASCAR_SENHA=dummy`.

---

## Tabela de Arquivos (estado antes do plano)

| Arquivo | Estado | Conteúdo |
| --- | --- | --- |
| `src/domain/veiculosStatus.ts` | untracked | types + `mapPosicaoRowToVeiculoStatus` + `getStatusByVeiculos` |
| `src/domain/veiculos.ts` | modified | `Veiculo.status: VeiculoStatus \| null`; `getVeiculos` enriquece com status via 2ª query |
| `src/graphql/schema.ts` | modified | adiciona `VeiculoStatus` + 5 sub-types + `Veiculo.status` |
| `src/tui/views/veiculosStatusCell.ts` | untracked | `renderStatusCell(row)` |
| `src/tui/views/Veiculos.tsx` | modified | nova coluna `status` entre `placa` e `cliente` |
| `src/tui/api/queries.ts` | modified | `Q_VEICULOS` pede `status { bloqueado, ignicaoLigada, online }` |
| `tests/unit/veiculosStatus.spec.ts` | untracked | 20 unit cases do mapper |
| `tests/integration/veiculosStatus.spec.ts` | untracked | 8 integration cases (2 describes: helper + graphql) |
| `tests/unit/veiculosStatusCell.spec.ts` | untracked | 9 unit cases da cell |
| `CHANGELOG.md` | modified | entrada `feat(graphql): VeiculoStatus` + nota de contagem de testes |
| `README.md` | modified | linha de `veiculos` + linha de `VeiculoStatus` na tabela de types |
| `docs/api.md` | modified | subseção `VeiculoStatus` com tabela de campos |

**Resultado após o plano:** os mesmos 12 arquivos commitados em 5 commits na branch `build/sascar-sdk-pin-v1.1.1`, mais o arquivo de integration test splittado em 2.

---

## Task 0: Validação inicial (read-only)

**Files:** nenhum (somente leitura + diagnóstico).

- [ ] **Step 1: Confirmar estado pré-execução**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git status --short
git log --oneline -1
docker compose ps
```

Esperado: 7 linhas modificadas (`M`) + 5 untracked (`??`), HEAD em `f92b5b3 docs(spec): design retroativo para VeiculoStatus`, containers `app` e `postgres` healthy.

- [ ] **Step 2: Rodar typecheck**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
```

Esperado: exit 0. Se falhar, registrar a primeira linha do erro e seguir para Task 0.5.

- [ ] **Step 3: Rodar suite de backend (sem TUI Ink)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npm test -- --testPathIgnorePatterns="tui"
```

Esperado: 21 suites / 124 tests passando (3 novas suites do VeiculoStatus já inclusas). Se falhar, registrar a primeira falha e seguir para Task 0.5.

- [ ] **Step 4: Rodar suite completa (incluindo TUI Ink)**

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

Esperado: 52 suites / 172 tests passando. Se falhar, registrar a primeira falha e seguir para Task 0.5.

- [ ] **Step 5: Rodar lint**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run lint
```

Esperado: exit 0 (warnings pré-existentes do `no-explicit-any` já estavam). Se houver **novo** erro, seguir para Task 0.5.

- [ ] **Step 6: Smoke test contra o container**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
TOKEN=$(curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { login(email:\"admin@local.dev\", password:\"admin1234\") { accessToken } }"}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ veiculos(quantidade: 5) { idVeiculo placa status { bloqueado ignicaoLigada online idadeSegundos } } }"}'
```

Esperado: JSON com `data.veiculos` array; cada item com `placa` e `status` (object com `bloqueado`/`ignicaoLigada`/`online`/`idadeSegundos`, ou `null` se o veículo nunca teve posição). Sem `errors`. Se falhar, registrar o erro e seguir para Task 0.5.

---

## Task 0.5: Triage de falhas (só executar se Task 0 reportou falha)

**Files:** conforme diagnóstico.

Padrão de correção: o trabalho está escrito, então a maioria das falhas é por ambiente (containers down, env vars faltando, dependência não instalada). Erros de lógica são improváveis porque cada suite nova já tem 17-20 casos e foi escrita para passar com a impl atual.

- [ ] **Step 1: Classificar a falha**

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| `Cannot connect to database` / `ECONNREFUSED 5432` | container postgres down | `docker compose up -d postgres` e re-rodar |
| `Cannot find module 'sascar-sdk'` | `node_modules` não instalado ou `sascar-sdk` não buildado | `npm install && cd node_modules/sascar-sdk && npm run build && cd ../..` |
| `JWT_ACCESS_SECRET must be defined` | env não exportado | re-exportar (ver Pré-condições) |
| Erro TS em `src/domain/veiculos.ts` ou `src/graphql/schema.ts` | divergência entre impl e schema | reler o erro; o ajuste é mínimo (1-2 linhas). NÃO reescrever a feature. |
| Test suite vermelho em um único `it` com mensagem inesperada | bug no impl; cobrir com novo teste falhendo primeiro, depois corrigir o impl | sub-task TDD abaixo |
| Lint: novo `no-unused-vars` ou `no-explicit-any` | variável não usada no código novo | adicionar `// eslint-disable-next-line ...` na linha OU remover a variável |

- [ ] **Step 2 (sub-task TDD — só se Step 1 indicou bug de lógica): Escrever teste falhando**

Criar ou editar o arquivo de teste correspondente (já existem os arquivos). Adicionar o `it` que cobre o caso faltando. Rodar para confirmar que falha. NÃO commitar ainda.

- [ ] **Step 3 (sub-task TDD): Corrigir o impl**

Modificar o código em `src/domain/veiculosStatus.ts` ou onde for. Rodar o teste até passar.

- [ ] **Step 4 (sub-task TDD): Rodar suite afetada inteira + typecheck + lint**

Confirmar que a correção não regrediu nada. NÃO commitar — o commit virá na Task correspondente do plano.

- [ ] **Step 5: Re-rodar Task 0 do início**

Confirmar que tudo passa após a correção. Prosseguir para Task 1.

---

## Task 1: Commit 1 — `feat(domain): veiculosStatus layer + 20 unit tests`

**Files:**
- Create: `src/domain/veiculosStatus.ts` (todo o conteúdo atual)
- Create: `tests/unit/veiculosStatus.spec.ts` (todo o conteúdo atual)

- [ ] **Step 1: Verificar que o conteúdo está correto (read-only)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
wc -l src/domain/veiculosStatus.ts tests/unit/veiculosStatus.spec.ts
grep -c '^  it(' tests/unit/veiculosStatus.spec.ts
```

Esperado: `src/domain/veiculosStatus.ts` com ~144 linhas, `tests/unit/veiculosStatus.spec.ts` com ~212 linhas, e o grep retornando 20 (número de `it`).

- [ ] **Step 2: Rodar o unit test isolado para confirmar verde**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npx jest tests/unit/veiculosStatus.spec.ts
```

Esperado: 20 passing, 0 failing.

- [ ] **Step 3: Rodar typecheck (sanity)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
```

Esperado: exit 0.

- [ ] **Step 4: Stage e commit**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add src/domain/veiculosStatus.ts tests/unit/veiculosStatus.spec.ts
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "feat(domain): veiculosStatus layer (types + mapper + getStatusByVeiculos) + 20 unit tests

- src/domain/veiculosStatus.ts: 6 types (Localizacao, Combustivel, Sensores,
  AlarmeUltimaMensagem, Alarme, VeiculoStatus) + 2 helpers (toBool, toIntOrNull,
  toStrOrNull) + mapPosicaoRowToVeiculoStatus (puro) + getStatusByVeiculos
  (1 query batched com DISTINCT ON para N veiculos).
- tests/unit/veiculosStatus.spec.ts: 20 unit cases cobrindo cada campo do
  mapper, online boundary (10min exato/dentro/fora), null/ausente para
  sub-types opcionais, atualizadoEm/idadeSegundos derivados de data_posicao."
git log --oneline -1
```

Esperado: novo commit no topo do log.

---

## Task 2: Commit 2 — `test(domain): getStatusByVeiculos — 6 integration cases`

**Files:**
- Create: `tests/integration/veiculosStatus-helper.spec.ts` (split do `tests/integration/veiculosStatus.spec.ts`, primeiro describe block)
- Delete: `tests/integration/veiculosStatus.spec.ts` (substituído pelos 2 novos)

- [ ] **Step 1: Criar o novo arquivo `tests/integration/veiculosStatus-helper.spec.ts` com o primeiro describe block (linhas 1-185 do original)**

Conteúdo exato (copiar de `tests/integration/veiculosStatus.spec.ts` linhas 1-185, manter todo o conteúdo verbatim — o describe `'getStatusByVeiculos (integration)'`):

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { getStatusByVeiculos } from '../../src/domain/veiculosStatus';
import type { AppContext } from '../../src/context';

const FIXED_NOW = new Date('2026-06-18T12:00:00.000Z');

function makeCtx(pool: Pool): AppContext {
  return {
    user: null,
    logger: console as unknown as any,
    db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
    orchestrator: {} as any,
  };
}

async function insertPosicao(
  pool: Pool,
  args: {
    idVeiculo: number;
    idPacote: string;
    dataPosicao: string;
    ignicao?: number | null;
    bloqueio?: number;
    raw?: Record<string, unknown>;
  },
): Promise<void> {
  const raw = JSON.stringify(args.raw ?? {});
  await pool.query(
    `INSERT INTO posicoes
      (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, raw, synced_via)
     VALUES ($1, $2, $3, $3, -23.5, -46.6, 60, $4, $5::jsonb, 'graphql')`,
    [args.idPacote, args.idVeiculo, args.dataPosicao, args.ignicao ?? null, raw],
  );
}

describe('getStatusByVeiculos (integration)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeEach(async () => {
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('lista vazia retorna Map vazio', async () => {
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [], FIXED_NOW);
    expect(result.size).toBe(0);
  });

  it('retorna status de um único veículo com posição', async () => {
    await insertPosicao(pool, {
      idVeiculo: 100,
      idPacote: '1',
      dataPosicao: '2026-06-18T11:55:00.000Z',
      ignicao: 1,
      raw: { bloqueio: 1, gps: 1, jamming: 0 },
    });
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [100], FIXED_NOW);
    expect(result.size).toBe(1);
    const s = result.get(100);
    expect(s).toBeDefined();
    expect(s?.bloqueado).toBe(true);
    expect(s?.ignicaoLigada).toBe(true);
    expect(s?.online).toBe(true);
  });

  it('retorna status de múltiplos veículos em uma única chamada (1 query)', async () => {
    await insertPosicao(pool, {
      idVeiculo: 200,
      idPacote: '1',
      dataPosicao: '2026-06-18T11:55:00.000Z',
      ignicao: 0,
      raw: { bloqueio: 0 },
    });
    await insertPosicao(pool, {
      idVeiculo: 201,
      idPacote: '2',
      dataPosicao: '2026-06-18T11:50:00.000Z',
      ignicao: 1,
      raw: { bloqueio: 1 },
    });
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [200, 201], FIXED_NOW);
    expect(result.size).toBe(2);
    expect(result.get(200)?.bloqueado).toBe(false);
    expect(result.get(200)?.ignicaoLigada).toBe(false);
    expect(result.get(201)?.bloqueado).toBe(true);
    expect(result.get(201)?.ignicaoLigada).toBe(true);
  });

  it('não inclui veículo que não tem posições em posicoes', async () => {
    await insertPosicao(pool, {
      idVeiculo: 300,
      idPacote: '1',
      dataPosicao: '2026-06-18T11:55:00.000Z',
    });
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [300, 999], FIXED_NOW);
    expect(result.size).toBe(1);
    expect(result.has(999)).toBe(false);
  });

  it('retorna status do pacote mais recente quando há múltiplos', async () => {
    await insertPosicao(pool, {
      idVeiculo: 400,
      idPacote: '1',
      dataPosicao: '2026-06-18T10:00:00.000Z',
      ignicao: 0,
      raw: { bloqueio: 0 },
    });
    await insertPosicao(pool, {
      idVeiculo: 400,
      idPacote: '2',
      dataPosicao: '2026-06-18T11:55:00.000Z',
      ignicao: 1,
      raw: { bloqueio: 1 },
    });
    await insertPosicao(pool, {
      idVeiculo: 400,
      idPacote: '3',
      dataPosicao: '2026-06-18T11:30:00.000Z',
      ignicao: 0,
      raw: { bloqueio: 0 },
    });
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [400], FIXED_NOW);
    const s = result.get(400);
    expect(s?.ignicaoLigada).toBe(true);
    expect(s?.bloqueado).toBe(true);
    expect(s?.atualizadoEm.toISOString()).toBe('2026-06-18T11:55:00.000Z');
  });

  it('extrai campos do JSONB raw corretamente', async () => {
    await insertPosicao(pool, {
      idVeiculo: 500,
      idPacote: '1',
      dataPosicao: '2026-06-18T11:55:00.000Z',
      ignicao: 1,
      raw: {
        bloqueio: 1,
        gps: 0,
        jamming: 1,
        nivelCombustivel: '42',
        litrometro: '15.5',
        tensao: 13.2,
        rpm: 1800,
        temperatura1: 25,
        temperatura2: 26,
        temperatura3: 27,
        statusAncora: 3,
        pontoEntrada: 1,
        pontoSaida: 0,
        nomeMensagem: 'ALERTA',
        conteudoMensagem: 'Jamming detectado',
        textoMensagem: '',
      },
    });
    const ctx = makeCtx(pool);
    const result = await getStatusByVeiculos(ctx, [500], FIXED_NOW);
    const s = result.get(500);
    expect(s?.gps).toBe(false);
    expect(s?.jamming).toBe(true);
    expect(s?.combustivel).toEqual({ nivel: '42', litrometro: '15.5' });
    expect(s?.sensores).toEqual({
      tensao: 13.2,
      rpm: 1800,
      temperatura1: 25,
      temperatura2: 26,
      temperatura3: 27,
    });
    expect(s?.alarme).toEqual({
      statusAncora: 3,
      pontoEntrada: true,
      pontoSaida: false,
      ultimaMensagem: { nome: 'ALERTA', conteudo: 'Jamming detectado', texto: '' },
    });
  });
});
```

- [ ] **Step 2: Rodar o novo spec para confirmar verde**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
npx jest tests/integration/veiculosStatus-helper.spec.ts
```

Esperado: 6 passing, 0 failing.

- [ ] **Step 3: Stage e commit (note: NÃO vamos deletar o original ainda — isso virá no Commit 3)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add tests/integration/veiculosStatus-helper.spec.ts
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "test(domain): getStatusByVeiculos — 6 integration cases

Cobre: lista vazia, 1 veículo, N veículos em 1 query (DISTINCT ON),
veículo sem posição omitido do Map, pacote mais recente escolhido quando
há múltiplos, mapeamento de JSONB raw (combustivel, sensores, alarme)."
```

Esperado: novo commit. `git status` ainda mostra `tests/integration/veiculosStatus.spec.ts` como untracked (esse arquivo será tratado nos próximos commits).

---

## Task 3: Commit 3 — `feat(graphql): VeiculoStatus schema + veiculos enrichment + 2 integration tests`

**Files:**
- Modify: `src/graphql/schema.ts` (adiciona `Veiculo.status` e 6 sub-types)
- Modify: `src/domain/veiculos.ts` (interface `Veiculo.status` + `getVeiculos` enriquece com 2ª query)
- Create: `tests/integration/veiculosStatus-graphql.spec.ts` (split do `tests/integration/veiculosStatus.spec.ts`, segundo describe block)
- Delete: `tests/integration/veiculosStatus.spec.ts` (substituído pelos 2 novos)

- [ ] **Step 1: Criar o novo arquivo `tests/integration/veiculosStatus-graphql.spec.ts` com o segundo describe block (linhas 187-262 do original)**

Conteúdo exato (copiar de `tests/integration/veiculosStatus.spec.ts` linhas 187-262, manter verbatim — o describe `'Query.veiculos { status } (integration)'`):

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { buildTestServer } from '../helpers/server';

async function insertPosicao(
  pool: Pool,
  args: {
    idVeiculo: number;
    idPacote: string;
    dataPosicao: string;
    ignicao?: number | null;
    bloqueio?: number;
    raw?: Record<string, unknown>;
  },
): Promise<void> {
  const raw = JSON.stringify(args.raw ?? {});
  await pool.query(
    `INSERT INTO posicoes
      (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, raw, synced_via)
     VALUES ($1, $2, $3, $3, -23.5, -46.6, 60, $4, $5::jsonb, 'graphql')`,
    [args.idPacote, args.idVeiculo, args.dataPosicao, args.ignicao ?? null, raw],
  );
}

describe('Query.veiculos { status } (integration)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeEach(async () => {
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.query('DELETE FROM veiculos_cache');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('cada Veiculo retornado traz status derivado do último pacote de posição', async () => {
    await pool.query(
      `INSERT INTO veiculos_cache (id_veiculo, placa, id_cliente, descricao, raw, fetched_at, expires_at)
       VALUES (700, 'XYZ1234', 1, 'Caminhão teste', '{}'::jsonb, now(), now() + interval '1 day')`,
    );
    await insertPosicao(pool, {
      idVeiculo: 700,
      idPacote: '1',
      dataPosicao: '2026-06-18T11:55:00.000Z',
      ignicao: 1,
      raw: { bloqueio: 1, gps: 1, jamming: 0 },
    });

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `query {
        veiculos {
          idVeiculo
          placa
          status {
            bloqueado
            ignicaoLigada
            online
            atualizadoEm
            idadeSegundos
            localizacao { latitude longitude }
          }
        }
      }`,
    });

    expect(res.errors).toBeUndefined();
    const veiculos = (res.data as any).veiculos;
    const v = veiculos.find((x: any) => x.idVeiculo === 700);
    expect(v).toBeDefined();
    expect(v.placa).toBe('XYZ1234');
    expect(v.status).toBeDefined();
    expect(v.status.bloqueado).toBe(true);
    expect(v.status.ignicaoLigada).toBe(true);
    expect(v.status.online).toBe(true);
    expect(v.status.atualizadoEm).toBe('2026-06-18T11:55:00.000Z');
    expect(v.status.idadeSegundos).toBeGreaterThanOrEqual(0);
    expect(v.status.localizacao.latitude).toBe(-23.5);
    expect(v.status.localizacao.longitude).toBe(-46.6);
  });

  it('veículo sem posições em posicoes retorna status null sem quebrar a query', async () => {
    await pool.query(
      `INSERT INTO veiculos_cache (id_veiculo, placa, raw, fetched_at, expires_at)
       VALUES (800, 'ABC9999', '{}'::jsonb, now(), now() + interval '1 day')`,
    );

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `query { veiculos { idVeiculo status { bloqueado } } }`,
    });

    expect(res.errors).toBeUndefined();
    const v = (res.data as any).veiculos.find((x: any) => x.idVeiculo === 800);
    expect(v).toBeDefined();
    expect(v.status).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que `src/graphql/schema.ts` e `src/domain/veiculos.ts` já têm as mudanças (read-only)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git diff HEAD -- src/graphql/schema.ts src/domain/veiculos.ts | head -100
```

Esperado: ver as adições (não reescrever os arquivos — eles já estão modificados no working tree).

- [ ] **Step 3: Rodar typecheck (sanity)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
```

Esperado: exit 0.

- [ ] **Step 4: Rodar ambos os novos specs para confirmar verde**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/veiculosStatus-graphql.spec.ts tests/integration/veiculosStatus-helper.spec.ts
```

Esperado: 8 passing, 0 failing (6 do helper + 2 do graphql).

- [ ] **Step 5: Stage e commit (inclui remoção do arquivo original e adição dos 2 novos)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add -A tests/integration/veiculosStatus.spec.ts tests/integration/veiculosStatus-helper.spec.ts tests/integration/veiculosStatus-graphql.spec.ts
git add src/graphql/schema.ts src/domain/veiculos.ts
git status --short
```

Esperado: ver `M src/graphql/schema.ts`, `M src/domain/veiculos.ts`, `A tests/integration/veiculosStatus-helper.spec.ts` (já committed no commit anterior — não deve aparecer), `?? tests/integration/veiculosStatus-graphql.spec.ts` (novo), e nada sobre `tests/integration/veiculosStatus.spec.ts` (já removido via `git add -A`).

- [ ] **Step 6: Confirmar o que vai no commit (read-only)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git diff --cached --stat
```

Esperado: 3 entries — `src/graphql/schema.ts` (modified), `src/domain/veiculos.ts` (modified), `tests/integration/veiculosStatus-graphql.spec.ts` (new). NÃO deve aparecer `tests/integration/veiculosStatus.spec.ts` nem `tests/integration/veiculosStatus-helper.spec.ts` (o primeiro foi removido pelo `git add -A` antes do commit, e o segundo já está committed no commit anterior).

- [ ] **Step 7: Commit**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "feat(graphql): VeiculoStatus schema + veiculos enrichment + 2 integration tests

- src/graphql/schema.ts: adiciona VeiculoStatus + 5 sub-types
  (Localizacao, Combustivel, Sensores, Alarme, AlarmeUltimaMensagem)
  + Veiculo.status: VeiculoStatus.
- src/domain/veiculos.ts: interface Veiculo ganha status: VeiculoStatus | null;
  getVeiculos agora roda 1 query batched extra (DISTINCT ON) e enriquece
  cada item com o status derivado do último pacote posicoes.
- tests/integration/veiculosStatus-graphql.spec.ts: 2 integration cases
  (cobre veículo com posição retorna status populado; veículo sem
  posição retorna status: null sem quebrar a query).
- tests/integration/veiculosStatus.spec.ts: removido (conteúdo migrado
  para veiculosStatus-helper.spec.ts no commit anterior e
  veiculosStatus-graphql.spec.ts neste commit)."
```

Esperado: novo commit.

---

## Task 4: Commit 4 — `feat(tui): veiculosStatusCell + status column + Q_VEICULOS + 9 unit tests`

**Files:**
- Create: `src/tui/views/veiculosStatusCell.ts`
- Create: `tests/unit/veiculosStatusCell.spec.ts`
- Modify: `src/tui/views/Veiculos.tsx`
- Modify: `src/tui/api/queries.ts`

- [ ] **Step 1: Verificar conteúdo (read-only)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
wc -l src/tui/views/veiculosStatusCell.ts tests/unit/veiculosStatusCell.spec.ts
grep -c '^  it(' tests/unit/veiculosStatusCell.spec.ts
git diff HEAD -- src/tui/views/Veiculos.tsx src/tui/api/queries.ts
```

Esperado: cell ~16 linhas, test ~67 linhas, 9 `it` blocks, diffs mostram adição da coluna e da fragment de query.

- [ ] **Step 2: Rodar unit test isolado para confirmar verde**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npx jest tests/unit/veiculosStatusCell.spec.ts
```

Esperado: 9 passing, 0 failing.

- [ ] **Step 3: Rodar typecheck (sanity)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
```

Esperado: exit 0.

- [ ] **Step 4: Stage e commit**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add src/tui/views/veiculosStatusCell.ts tests/unit/veiculosStatusCell.spec.ts src/tui/views/Veiculos.tsx src/tui/api/queries.ts
git status --short
```

Esperado: 4 entries — `?? src/tui/views/veiculosStatusCell.ts` agora como `A`, `?? tests/unit/veiculosStatusCell.spec.ts` como `A`, `M src/tui/views/Veiculos.tsx` (já era), `M src/tui/api/queries.ts` (já era).

- [ ] **Step 5: Confirmar staged (read-only)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git diff --cached --stat
```

Esperado: 4 entries correspondentes aos 4 arquivos.

- [ ] **Step 6: Commit**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "feat(tui): veiculosStatusCell + status column + Q_VEICULOS extension

- src/tui/views/veiculosStatusCell.ts: renderStatusCell(row) — badges
  ASCII: [B] bloqueado, [I] ignição, [+] online, combinações, [ ]
  quando status vivo com tudo false, '—' sem status.
- src/tui/views/Veiculos.tsx: nova coluna 'status' entre 'placa' e
  'cliente', renderizada via renderStatusCell.
- src/tui/api/queries.ts: Q_VEICULOS pede status { bloqueado,
  ignicaoLigada, online } (apenas as 3 flags que a cell consome).
- tests/unit/veiculosStatusCell.spec.ts: 9 unit cases cobrindo cada
  combinação de flags e os 2 casos de ausência (null/undefined → '—')."
```

Esperado: novo commit.

---

## Task 5: Commit 5 — `docs: CHANGELOG + README + api.md para VeiculoStatus`

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/api.md`

- [ ] **Step 1: Verificar diffs (read-only)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git diff HEAD -- CHANGELOG.md README.md docs/api.md | head -50
```

Esperado: ver entrada `feat(graphql): New VeiculoStatus type...` em CHANGELOG, adições nas tabelas em README e api.md.

- [ ] **Step 2: Rodar suite completa (regression check final)**

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

Esperado: 52 suites / 172 tests passando.

- [ ] **Step 3: Rodar lint final**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run lint
```

Esperado: exit 0.

- [ ] **Step 4: Stage e commit**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add CHANGELOG.md README.md docs/api.md
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "docs: CHANGELOG + README + api.md para VeiculoStatus

- CHANGELOG.md [Unreleased] Added: feat(graphql) New VeiculoStatus
  type + Veiculo.status field (resumo do sub-type, heurística 10min,
  mecanismo 1 query batched, badges TUI). [Unreleased] Notes:
  contagem de testes atualizada (51/172, +37 do VeiculoStatus).
- README.md: linha de 'veiculos' na tabela de queries menciona
  'status vivo (último pacote posicoes)'. Tabela de types ganha
  Veiculo.status e nova linha VeiculoStatus.
- docs/api.md: seção de Veiculo lista 'status: VeiculoStatus' na
  lista de campos; subseção nova 'VeiculoStatus' com tabela de
  campos + nota sobre o mecanismo (1 query batched, sem N+1,
  sem chamada Sascar extra)."
```

Esperado: novo commit.

---

## Task 6: Verificação final

- [ ] **Step 1: Confirmar os 5 commits no log**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git log --oneline f92b5b3..HEAD
```

Esperado: 5 commits (Tasks 1, 2, 3, 4, 5).

- [ ] **Step 2: Confirmar que não restou nada sujo no working tree**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git status
```

Esperado: `nothing to commit, working tree clean`.

- [ ] **Step 3: Smoke test final contra o container**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
TOKEN=$(curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { login(email:\"admin@local.dev\", password:\"admin1234\") { accessToken } }"}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ veiculos(quantidade: 3) { idVeiculo placa status { bloqueado ignicaoLigada online idadeSegundos atualizadoEm } } }"}' | head -c 800
```

Esperado: JSON com `data.veiculos` (pode estar vazio se a tabela `veiculos_cache` está vazia no container — está OK, contanto que `errors` seja `undefined` e a estrutura da query responda corretamente).

- [ ] **Step 4: Resumo final para o usuário**

Confirmar via `git log --oneline f92b5b3..HEAD` que os 5 commits foram criados, e reportar:
- Total de novos testes: 37 (20 unit domain + 6 integration helper + 2 integration graphql + 9 unit tui)
- Total de suites: 48 backend + 3 tui = 51 (vs 45 antes desta sessão)
- Arquivos novos: 4 (veiculosStatus.ts, veiculosStatusCell.ts, veiculosStatus-helper.spec.ts, veiculosStatus-graphql.spec.ts)
- Arquivos modificados: 5 (veiculos.ts, schema.ts, Veiculos.tsx, queries.ts, CHANGELOG.md, README.md, api.md — alguns modificados foram ajustados via `git add -A`)
- Spec retroativa: `docs/superpowers/specs/2026-06-18-veiculos-status-design.md` (commit `f92b5b3`)

**Não rodar `git push` sem confirmação explícita do usuário.**

---

## Resumo das mudanças

| Commit | Arquivos | Linhas | Tipo |
| --- | --- | --- | --- |
| 1 — domain layer | `src/domain/veiculosStatus.ts`, `tests/unit/veiculosStatus.spec.ts` | ~356 (144+212) | feat + test |
| 2 — domain integration | `tests/integration/veiculosStatus-helper.spec.ts` | ~185 | test |
| 3 — graphql | `src/graphql/schema.ts`, `src/domain/veiculos.ts`, `tests/integration/veiculosStatus-graphql.spec.ts`; remove `tests/integration/veiculosStatus.spec.ts` | ~96+12+77+(-262) | feat + test |
| 4 — tui | `src/tui/views/veiculosStatusCell.ts`, `tests/unit/veiculosStatusCell.spec.ts`, `src/tui/views/Veiculos.tsx`, `src/tui/api/queries.ts` | ~16+67+2+5 | feat + test |
| 5 — docs | `CHANGELOG.md`, `README.md`, `docs/api.md` | 3+5+16 | docs |

**Fora do escopo:** push para `origin`, merge para `main`, refactor do `cachedQuery` (Known Issue #6), paralelização do `getPosicoesRecentes` (Known Issue #5), telemetria histórica estruturada (Follow-up na spec), índice composto em `posicoes` (Follow-up na spec).

---

## Self-Review (rodar antes de executar)

1. **Spec coverage:**
   - Seção 1 (`src/domain/veiculosStatus.ts` novo) → Task 1 ✅
   - Seção 2 (`src/domain/veiculos.ts` modificado) → Task 3 ✅
   - Seção 3 (`src/graphql/schema.ts` modificado) → Task 3 ✅
   - Seção 4 (`src/tui/views/veiculosStatusCell.ts` novo) → Task 4 ✅
   - Seção 5 (`src/tui/views/Veiculos.tsx` modificado) → Task 4 ✅
   - Seção 6 (`src/tui/api/queries.ts` modificado) → Task 4 ✅
   - Seção 7 (`docs/api.md` modificado) → Task 5 ✅
   - Seção 8 (`README.md` modificado) → Task 5 ✅
   - Seção 9 (`CHANGELOG.md` modificado) → Task 5 ✅
   - Testes (4 suites, 37 casos) → Tasks 1, 2, 3, 4 ✅

2. **Placeholder scan:** nenhum "TBD" / "TODO" / "fix later" / "add appropriate error handling" no plano. Cada step tem comandos exatos ou código verbatim.

3. **Type consistency:**
   - `getStatusByVeiculos(ctx, ids, now?)` referenciado consistentemente nas Tasks 1, 2, 3.
   - `mapPosicaoRowToVeiculoStatus(row, now?)` apenas em Task 1 (não referenciado em outras tasks — está isolado).
   - `renderStatusCell(row)` em Task 4.
   - `VeiculoStatus`, `Localizacao`, `Combustivel`, `Sensores`, `Alarme`, `AlarmeUltimaMensagem` types referenciados consistentemente em schema, domain e tests.

4. **Commit ordering:** cada commit é verde antes de avançar. Task 0 + 0.5 cobre falhas. Tasks 1→2→3→4→5 cada uma assume que as anteriores passaram (verificado via `npm test` ou subset de jest por step).
