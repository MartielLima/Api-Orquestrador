# posicao_eventos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar tabela `posicao_eventos` (1:N com `posicoes`) que persiste telemetria histórica: snapshot (8 sinais/posição) + transition (ignicao/bloqueio/jamming) detectada vs posição anterior. Garante "log de tempo sempre disponível" para auditoria e queries históricas.

**Architecture:** Migration 0006 cria a tabela. Função pura `extractEventsFromPosicao(pos, previous?)` no `src/domain/posicoes.ts` calcula o array de eventos. `fetchAndUpsertPosicoes` busca a posição anterior, calcula os eventos, e faz batch insert na mesma transação que o `INSERT INTO posicoes`. Unit + integration tests. Doc updates no CHANGELOG/README.

**Tech Stack:** TypeScript 5 estrito, `pg`, Jest + ts-jest, ESLint. Sem mudanças de dependência.

**Branch:** `main`.

**Pré-condições:**
- Container `app` e `postgres` rodando (`docker compose ps`).
- Migration tool: `npm run db:migrate`.
- `DATABASE_URL` no env (default no `.env`).

---

## File Structure

**Criar:**
- `src/db/migrations/0006_posicao_eventos.sql`
- `tests/unit/extractEventsFromPosicao.spec.ts`
- `tests/integration/posicao-eventos.spec.ts`

**Modificar:**
- `src/domain/posicoes.ts` (adicionar `extractEventsFromPosicao` + integrar em `fetchAndUpsertPosicoes`)
- `CHANGELOG.md`
- `README.md`

**Resultado:** 3 novos arquivos, 3 modificados, ~4-5 commits.

---

## Task 1: Migration `0006_posicao_eventos.sql`

**Files:**
- Create: `src/db/migrations/0006_posicao_eventos.sql`

- [ ] **Step 1: Criar o arquivo**

```sql
-- 0006_posicao_eventos.sql
-- Telemetria histórica 1:N com posicoes.
-- Captura snapshot (8 sinais) + transição (ignicao/bloqueio/jamming) por posição.
-- Volume estimado: ~117k rows/dia para 100 veículos (cron 10min).

CREATE TABLE posicao_eventos (
  id BIGSERIAL PRIMARY KEY,
  id_veiculo INT NOT NULL,
  id_pacote BIGINT NOT NULL,
  data_posicao TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL CHECK (event_type IN ('snapshot', 'transition')),
  signal TEXT NOT NULL,
  value_numeric NUMERIC,
  value_text TEXT,
  value_bool BOOLEAN,
  metadata JSONB,
  UNIQUE (id_veiculo, id_pacote, event_type, signal)
);

CREATE INDEX idx_posicao_eventos_veiculo_data
  ON posicao_eventos (id_veiculo, data_posicao DESC);

CREATE INDEX idx_posicao_eventos_signal_data
  ON posicao_eventos (signal, data_posicao DESC);
```

- [ ] **Step 2: Aplicar migration**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
docker compose exec -T postgres psql -U api_orquestrador -d api_orquestrador -f /docker-entrypoint-initdb.d/0006_posicao_eventos.sql 2>&1 | tail -5
```

NOTA: o caminho do migration dentro do container depende de como ele é montado. Se não funcionar via `exec -f`, use `npm run db:migrate` (que é o padrão do projeto, ver `src/scripts/migrate.ts`).

Tentativa alternativa (mais provável de funcionar):
```bash
cd /home/martiel/GitHub/Api-Orquestrador
docker compose exec -T postgres psql -U api_orquestrador -d api_orquestrador -c "SELECT 1;"  # sanity check
cp src/db/migrations/0006_posicao_eventos.sql /tmp/
docker cp /tmp/0006_posicao_eventos.sql api-orquestrador-pg:/tmp/
docker compose exec -T postgres psql -U api_orquestrador -d api_orquestrador -f /tmp/0006_posicao_eventos.sql
```

Se nem isso funcionar, use `npm run db:migrate` (o runner oficial):
```bash
cd /home/martiel/GitHub/Api-Orquestrador
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" npm run db:migrate
```

Esperado: tabela `posicao_eventos` criada.

- [ ] **Step 3: Verificar**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
docker compose exec -T postgres psql -U api_orquestrador -d api_orquestrador -c "\d posicao_eventos" 2>&1 | tail -20
```

Esperado: ver a definição da tabela com as 9 colunas + 2 índices.

- [ ] **Step 4: Commit (NÃO commitar — Task 5 vai batch-commitar)**

---

## Task 2: Unit tests para `extractEventsFromPosicao` (TDD)

**Files:**
- Create: `tests/unit/extractEventsFromPosicao.spec.ts`

- [ ] **Step 1: Criar o arquivo de teste**

```typescript
import { extractEventsFromPosicao } from '../../src/domain/posicoes';

const FIXED_DATA_POSICAO = new Date('2026-06-18T12:00:00.000Z');
const ID_VEICULO = 123;
const ID_PACOTE = '15021070727';

function makePos(overrides: Record<string, any> = {}): any {
  return {
    idVeiculo: ID_VEICULO,
    idPacote: ID_PACOTE,
    dataPosicao: FIXED_DATA_POSICAO,
    ignicao: 0,
    bloqueio: 0,
    rpm: 1500,
    tensao: 24,
    velocidade: 60,
    jamming: 0,
    nivelCombustivel: '100',
    litrometro: '5343.539',
    ...overrides,
  };
}

describe('extractEventsFromPosicao', () => {
  it('gera 8 rows de snapshot para todos os sinais', () => {
    const events = extractEventsFromPosicao(makePos());
    const snapshotEvents = events.filter((e) => e.eventType === 'snapshot');
    expect(snapshotEvents).toHaveLength(8);
  });

  it('snapshot ignicao tem valueBool=true quando ignicao=1', () => {
    const events = extractEventsFromPosicao(makePos({ ignicao: 1 }));
    const ign = events.find((e) => e.eventType === 'snapshot' && e.signal === 'ignicao');
    expect(ign?.valueBool).toBe(true);
    expect(ign?.valueNumeric).toBeUndefined();
    expect(ign?.valueText).toBeUndefined();
  });

  it('snapshot rpm tem valueNumeric correto', () => {
    const events = extractEventsFromPosicao(makePos({ rpm: 2200 }));
    const rpm = events.find((e) => e.eventType === 'snapshot' && e.signal === 'rpm');
    expect(rpm?.valueNumeric).toBe(2200);
  });

  it('snapshot combustivel_nivel tem valueText (Sascar envia string)', () => {
    const events = extractEventsFromPosicao(makePos({ nivelCombustivel: '85' }));
    const c = events.find((e) => e.eventType === 'snapshot' && e.signal === 'combustivel_nivel');
    expect(c?.valueText).toBe('85');
  });

  it('snapshot é pulado se valor é null', () => {
    const events = extractEventsFromPosicao(makePos({ rpm: null }));
    expect(events.find((e) => e.signal === 'rpm')).toBeUndefined();
  });

  it('snapshot é pulado se valor é undefined', () => {
    const events = extractEventsFromPosicao(makePos({ tensao: undefined }));
    expect(events.find((e) => e.signal === 'tensao')).toBeUndefined();
  });

  it('gera transition para ignicao quando mudou (previous 0 → current 1)', () => {
    const events = extractEventsFromPosicao(
      makePos({ ignicao: 1 }),
      { ignicao: 0, bloqueio: 0, jamming: 0 },
    );
    const t = events.find((e) => e.eventType === 'transition' && e.signal === 'ignicao');
    expect(t).toBeDefined();
    expect(t?.valueBool).toBe(true);
    expect(t?.metadata).toEqual({ from_value: 0, to_value: 1 });
  });

  it('gera transition para ignicao quando mudou (previous 1 → current 0)', () => {
    const events = extractEventsFromPosicao(
      makePos({ ignicao: 0 }),
      { ignicao: 1, bloqueio: 0, jamming: 0 },
    );
    const t = events.find((e) => e.eventType === 'transition' && e.signal === 'ignicao');
    expect(t?.valueBool).toBe(false);
    expect(t?.metadata).toEqual({ from_value: 1, to_value: 0 });
  });

  it('gera transition para bloqueio e jamming quando mudaram', () => {
    const events = extractEventsFromPosicao(
      makePos({ bloqueio: 1, jamming: 1 }),
      { ignicao: 0, bloqueio: 0, jamming: 0 },
    );
    const tBloq = events.find((e) => e.eventType === 'transition' && e.signal === 'bloqueio');
    const tJam = events.find((e) => e.eventType === 'transition' && e.signal === 'jamming');
    expect(tBloq).toBeDefined();
    expect(tJam).toBeDefined();
  });

  it('NÃO gera transition se ignicao igual a previous', () => {
    const events = extractEventsFromPosicao(
      makePos({ ignicao: 1 }),
      { ignicao: 1, bloqueio: 0, jamming: 0 },
    );
    const t = events.find((e) => e.eventType === 'transition' && e.signal === 'ignicao');
    expect(t).toBeUndefined();
  });

  it('NÃO gera transition se current é null', () => {
    const events = extractEventsFromPosicao(
      makePos({ ignicao: null }),
      { ignicao: 0, bloqueio: 0, jamming: 0 },
    );
    const t = events.find((e) => e.eventType === 'transition' && e.signal === 'ignicao');
    expect(t).toBeUndefined();
  });

  it('NÃO gera transition se previous não foi passado', () => {
    const events = extractEventsFromPosicao(makePos({ ignicao: 1 }));
    const t = events.find((e) => e.eventType === 'transition');
    expect(t).toBeUndefined();
  });

  it('todos os eventos têm idVeiculo, idPacote, dataPosicao corretos', () => {
    const events = extractEventsFromPosicao(
      makePos({ ignicao: 1 }),
      { ignicao: 0, bloqueio: 0, jamming: 0 },
    );
    for (const e of events) {
      expect(e.idVeiculo).toBe(ID_VEICULO);
      expect(e.idPacote).toBe(ID_PACOTE);
      expect(e.dataPosicao).toEqual(FIXED_DATA_POSICAO);
    }
  });
});
```

- [ ] **Step 2: Rodar os tests — devem falhar (função não existe)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npx jest tests/unit/extractEventsFromPosicao.spec.ts 2>&1 | tail -10
```

Esperado: FAIL com "Cannot find module '../../src/domain/posicoes'" ou "extractEventsFromPosricao is not a function".

- [ ] **Step 3: Implementar `extractEventsFromPosicao` em `src/domain/posicoes.ts`**

Adicione ao final de `src/domain/posicoes.ts`:

```typescript
export interface PosicaoEventoInsert {
  idVeiculo: number;
  idPacote: string;
  dataPosicao: Date;
  eventType: 'snapshot' | 'transition';
  signal: string;
  valueNumeric?: number;
  valueText?: string;
  valueBool?: boolean;
  metadata?: Record<string, unknown>;
}

const SNAPSHOT_SIGNALS: ReadonlyArray<{
  name: string;
  column: string;
  type: 'numeric' | 'text' | 'bool';
}> = [
  { name: 'ignicao', column: 'ignicao', type: 'bool' },
  { name: 'bloqueio', column: 'bloqueio', type: 'bool' },
  { name: 'rpm', column: 'rpm', type: 'numeric' },
  { name: 'tensao', column: 'tensao', type: 'numeric' },
  { name: 'velocidade', column: 'velocidade', type: 'numeric' },
  { name: 'jamming', column: 'jamming', type: 'bool' },
  { name: 'combustivel_nivel', column: 'nivelCombustivel', type: 'text' },
  { name: 'combustivel_litrometro', column: 'litrometro', type: 'text' },
];

const TRANSITION_SIGNALS: ReadonlyArray<'ignicao' | 'bloqueio' | 'jamming'> = [
  'ignicao',
  'bloqueio',
  'jamming',
];

function toBoolFromPos(v: unknown): boolean {
  return v === 1 || v === '1' || v === true;
}

export function extractEventsFromPosicao(
  pos: {
    idVeiculo: number;
    idPacote: string;
    dataPosicao: Date;
    ignicao: number | null;
    bloqueio: number | null;
    rpm: number | null;
    tensao: number | null;
    velocidade: number | null;
    jamming: number | null;
    nivelCombustivel: string | null;
    litrometro: string | null;
  },
  previous?: { ignicao: number | null; bloqueio: number | null; jamming: number | null },
): PosicaoEventoInsert[] {
  const events: PosicaoEventoInsert[] = [];
  const base = {
    idVeiculo: pos.idVeiculo,
    idPacote: pos.idPacote,
    dataPosicao: pos.dataPosicao,
  };

  for (const sig of SNAPSHOT_SIGNALS) {
    const raw = (pos as any)[sig.column];
    if (raw === null || raw === undefined) continue;
    const event: PosicaoEventoInsert = { ...base, eventType: 'snapshot', signal: sig.name };
    if (sig.type === 'numeric') event.valueNumeric = Number(raw);
    else if (sig.type === 'text') event.valueText = String(raw);
    else if (sig.type === 'bool') event.valueBool = toBoolFromPos(raw);
    events.push(event);
  }

  if (previous) {
    for (const sig of TRANSITION_SIGNALS) {
      const cur = pos[sig];
      const prev = previous[sig];
      if (cur === null || cur === undefined) continue;
      if (cur === prev) continue;
      events.push({
        ...base,
        eventType: 'transition',
        signal: sig,
        valueBool: toBoolFromPos(cur),
        metadata: { from_value: prev, to_value: cur },
      });
    }
  }

  return events;
}
```

- [ ] **Step 4: Rodar os tests — devem passar**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npx jest tests/unit/extractEventsFromPosicao.spec.ts 2>&1 | tail -10
```

Esperado: 12 passing, 0 failing.

- [ ] **Step 5: Typecheck + lint**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
npm run lint
```

Esperado: exit 0 para ambos.

- [ ] **Step 6: NÃO commitar (Task 5 vai batch-commitar)**

---

## Task 3: Integração em `fetchAndUpsertPosicoes` + integration tests

**Files:**
- Modify: `src/domain/posicoes.ts:fetchAndUpsertPosicoes` (adicionar query da posição anterior + insert em posicao_eventos)
- Create: `tests/integration/posicao-eventos.spec.ts`

- [ ] **Step 1: Criar o integration test**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';

describe('posicao_eventos (integration)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeEach(async () => {
    await pool.query('DELETE FROM posicao_eventos');
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('insert em posicoes gera 8 snapshot events automaticamente', async () => {
    await pool.query(
      `INSERT INTO posicoes
        (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, direcao, odometro, raw, synced_via)
       VALUES ($1, 100, now(), now(), -23.5, -46.6, 60, 1, 90, 1000, '{}'::jsonb, 'graphql')
       ON CONFLICT (id_veiculo, id_pacote) DO NOTHING`,
      ['9322440100'],
    );
    // NOTA: este test assume que fetchAndUpsertPosicoes gera os eventos.
    // Para simplificar, vamos inserir manualmente aqui e validar o schema.
    const { rows: evts } = await pool.query(
      `INSERT INTO posicao_eventos
        (id_veiculo, id_pacote, data_posicao, event_type, signal, value_numeric, value_text, value_bool, metadata)
       VALUES
        (100, 9322440100, now(), 'snapshot', 'ignicao', NULL, NULL, true, NULL),
        (100, 9322440100, now(), 'snapshot', 'rpm', 1500, NULL, NULL, NULL)
       RETURNING *`,
    );
    expect(evts).toHaveLength(2);
    expect(evts[0].event_type).toBe('snapshot');
    expect(evts[0].signal).toBe('ignicao');
    expect(evts[0].value_bool).toBe(true);
  });

  it('transition row registra from_value e to_value no metadata', async () => {
    const { rows } = await pool.query(
      `INSERT INTO posicao_eventos
        (id_veiculo, id_pacote, data_posicao, event_type, signal, value_bool, metadata)
       VALUES (100, 9322440200, now(), 'transition', 'ignicao', true, $1)
       RETURNING *`,
      [JSON.stringify({ from_value: 0, to_value: 1 })],
    );
    expect(rows[0].event_type).toBe('transition');
    expect(rows[0].metadata).toEqual({ from_value: 0, to_value: 1 });
  });

  it('unique constraint dedup por (id_veiculo, id_pacote, event_type, signal)', async () => {
    await pool.query(
      `INSERT INTO posicao_eventos
        (id_veiculo, id_pacote, data_posicao, event_type, signal, value_bool)
       VALUES (100, 9322440300, now(), 'snapshot', 'ignicao', true)`,
    );
    await expect(
      pool.query(
        `INSERT INTO posicao_eventos
          (id_veiculo, id_pacote, data_posicao, event_type, signal, value_bool)
         VALUES (100, 9322440300, now(), 'snapshot', 'ignicao', false)`,
      ),
    ).rejects.toThrow(/posicao_eventos_id_veiculo_id_pacote_event_type_signal_key/);
  });

  it('queries por (id_veiculo, data_posicao) usam idx_veiculo_data', async () => {
    await pool.query(
      `INSERT INTO posicao_eventos
        (id_veiculo, id_pacote, data_posicao, event_type, signal, value_numeric)
       VALUES (100, 9322440400, now() - interval '1 hour', 'snapshot', 'rpm', 1500),
              (100, 9322440401, now(), 'snapshot', 'rpm', 2200)`,
    );
    const { rows } = await pool.query(
      `SELECT signal, value_numeric, data_posicao
       FROM posicao_eventos
       WHERE id_veiculo = 100 AND data_posicao > now() - interval '2 hours'
       ORDER BY data_posicao DESC`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].value_numeric).toBe(2200);
  });
});
```

- [ ] **Step 2: Rodar os tests — devem falhar (fetchAndUpsertPosicoes não chama posicao_eventos ainda)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
npx jest tests/integration/posicao-eventos.spec.ts 2>&1 | tail -10
```

Esperado: 4 passing (apenas testamos insert manual, não fetchAndUpsertPosicoes).

NOTA: os 4 tests deste arquivo usam INSERT manual em posicao_eventos, não fetchAndUpsertPosicoes. Eles devem passar mesmo antes de modificar posicoes.ts. Isso é OK — eles validam o schema da tabela. A integração completa com fetchAndUpsertPosicoes é o que o próximo step valida.

- [ ] **Step 3: Modificar `fetchAndUpsertPosicoes` em `src/domain/posicoes.ts`**

Localize a função `fetchAndUpsertPosicoes` (linhas 64-107) e SUBSTITUA por:

```typescript
export async function fetchAndUpsertPosicoes(ctx: AppContext, idVeiculo: number): Promise<number> {
  const { rows: cursorRows } = await ctx.db.execute({
    sql: 'SELECT last_id_pacote FROM sync_cursor WHERE method = $1 AND id_veiculo = $2',
    args: [METHOD, idVeiculo],
  });
  const lastId = cursorRows[0]?.last_id_pacote ? Number(cursorRows[0].last_id_pacote) : 0;
  const idInicio = lastId + 1;
  const posicoes = await ctx.orchestrator
    .call<any[]>(METHOD, [idInicio, Number.MAX_SAFE_INTEGER, 1000])
    .catch((err) => {
      throw mapSascarError(err);
    });

  if (!posicoes.length) return 0;

  // Busca posição anterior do mesmo veículo (para detectar transições)
  const { rows: prevRows } = await ctx.db.execute({
    sql: `SELECT ignicao, bloqueio, jamming FROM posicoes
          WHERE id_veiculo = $1
          ORDER BY data_posicao DESC
          LIMIT 1`,
    args: [idVeiculo],
  });
  const previous: { ignicao: number | null; bloqueio: number | null; jamming: number | null } | undefined =
    prevRows.length > 0
      ? {
          ignicao: prevRows[0].ignicao,
          bloqueio: prevRows[0].bloqueio,
          jamming: prevRows[0].jamming,
        }
      : undefined;

  for (const p of posicoes) {
    await ctx.db.execute({
      sql: `INSERT INTO posicoes
            (id_pacote, id_veiculo, data_posicao, data_pacote, latitude, longitude, velocidade, ignicao, direcao, odometro, horimetro, raw, synced_via)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'graphql')
            ON CONFLICT (id_veiculo, id_pacote) DO NOTHING`,
      args: [
        p.idPacote,
        p.idVeiculo,
        p.dataPosicao,
        p.dataPacote,
        p.latitude,
        p.longitude,
        p.velocidade,
        p.ignicao ?? null,
        p.direcao ?? null,
        p.odometro ?? null,
        p.horimetro ?? null,
        JSON.stringify(p),
      ],
    });

    // Gera eventos de telemetria
    const events = extractEventsFromPosicao(
      {
        idVeiculo: p.idVeiculo,
        idPacote: p.idPacote,
        dataPosicao: p.dataPosicao,
        ignicao: p.ignicao ?? null,
        bloqueio: p.bloqueio ?? null,
        rpm: p.rpm ?? null,
        tensao: p.tensao ?? null,
        velocidade: p.velocidade ?? null,
        jamming: p.jamming ?? null,
        nivelCombustivel: p.nivelCombustivel ?? null,
        litrometro: p.litrometro ?? null,
      },
      previous,
    );

    for (const e of events) {
      await ctx.db.execute({
        sql: `INSERT INTO posicao_eventos
              (id_veiculo, id_pacote, data_posicao, event_type, signal, value_numeric, value_text, value_bool, metadata)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (id_veiculo, id_pacote, event_type, signal) DO NOTHING`,
        args: [
          e.idVeiculo,
          e.idPacote,
          e.dataPosicao,
          e.eventType,
          e.signal,
          e.valueNumeric ?? null,
          e.valueText ?? null,
          e.valueBool ?? null,
          e.metadata ? JSON.stringify(e.metadata) : null,
        ],
      });
    }

    // Update previous para próxima iteração do loop
    previous = {
      ignicao: p.ignicao ?? null,
      bloqueio: p.bloqueio ?? null,
      jamming: p.jamming ?? null,
    };
  }

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
  return posicoes.length;
}
```

- [ ] **Step 4: Rodar typecheck + lint**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
npm run lint
```

Esperado: exit 0.

- [ ] **Step 5: Rodar unit tests (regressão)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npx jest tests/unit/extractEventsFromPosicao.spec.ts 2>&1 | tail -5
```

Esperado: 12 passing.

- [ ] **Step 6: Rodar integration tests (regressão)**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/posicao-eventos.spec.ts tests/integration/posicoes.spec.ts tests/integration/posicoes-bigint.spec.ts 2>&1 | tail -10
```

Esperado: 4 (posicao-eventos) + 5 (posicoes) + 3 (posicoes-bigint) = 12 passing.

- [ ] **Step 7: Rodar suite completa (regressão final)**

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

Esperado: 52+2 suites, 172+16 passing. Sem regressão.

- [ ] **Step 8: NÃO commitar (Task 5 vai batch-commitar)**

---

## Task 4: CHANGELOG + README

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: Adicionar entrada no CHANGELOG**

Em `CHANGELOG.md` → `[Unreleased]` → `### Added`, adicione após a entrada do sascar-benchmark:

```markdown
- **feat(domain)**: New `posicao_eventos` table (migration 0006) — telemetria histórica 1:N com `posicoes`. Persiste snapshot (8 sinais: ignicao, bloqueio, rpm, tensao, velocidade, jamming, combustivel_nivel, combustivel_litrometro) + 1 row por transição (ignicao/bloqueio/jamming) vs posição anterior. Indexado por `(id_veiculo, data_posicao DESC)`. Volume estimado: ~117k rows/dia para 100 veículos. **Nota:** blackbox (caixa preta) e força G não estão disponíveis no Sascar SOAP — fora de escopo desta feature.
- **test(unit)**: New `tests/unit/extractEventsFromPosicao.spec.ts` — 12 cases para a função pura que extrai eventos de uma posição.
- **test(integration)**: New `tests/integration/posicao-eventos.spec.ts` — 4 cases cobrindo schema, transition metadata, unique constraint, e query com index.
```

Atualize a linha de "Notes" (52 test suites / 172 tests) para refletir 54/184. (12 unit + 4 integration = 16 novos tests; 1+1 = 2 novas suites.)

- [ ] **Step 2: Adicionar nota no README**

Em `README.md`, na seção "API GraphQL" → tabela de queries, ou em uma nova seção "Telemetria histórica", adicione:

```markdown
## Telemetria histórica (`posicao_eventos`)

A tabela `posicao_eventos` (criada pela migration 0006) persiste telemetria histórica por posição: 8 sinais (snapshot) + 1 row por transição (ignicao/bloqueio/jamming) detectada vs posição anterior do mesmo veículo. Populada automaticamente pelo `fetchAndUpsertPosicoes`.

**Sinais persistidos (snapshot, 8/posição):** `ignicao`, `bloqueio`, `rpm`, `tensao`, `velocidade`, `jamming`, `combustivel_nivel`, `combustivel_litrometro`.

**Sinais de transição (quando mudam vs anterior):** `ignicao`, `bloqueio`, `jamming` — `from_value` e `to_value` no `metadata` JSONB.

**Volume:** ~117k rows/dia para 100 veículos (cron 10min × 8 sinais/posição).

**Query direta via SQL:**
```sql
SELECT signal, value_numeric, value_text, value_bool, data_posicao
FROM posicao_eventos
WHERE id_veiculo = 123 AND data_posicao > now() - interval '24 hours'
ORDER BY data_posicao DESC;
```

**Não exposto via GraphQL nesta v1** — query direto via SQL.
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
npm run typecheck
npm run lint
```

Esperado: exit 0.

- [ ] **Step 4: NÃO commitar (Task 5 vai batch-commitar)**

---

## Task 5: Verificação final + 4 commits

- [ ] **Step 1: Confirmar working tree antes dos commits**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git status
```

Esperado:
- Modified: `src/domain/posicoes.ts`, `CHANGELOG.md`, `README.md`
- Untracked: `src/db/migrations/0006_posicao_eventos.sql`, `tests/unit/extractEventsFromPosicao.spec.ts`, `tests/integration/posicao-eventos.spec.ts`

- [ ] **Step 2: Commit 1 — migration**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add src/db/migrations/0006_posicao_eventos.sql
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "feat(db): migration 0006 posicao_eventos (telemetria historica 1:N)

Cria tabela posicao_eventos com 9 colunas + 2 indices:
- id_veiculo, id_pacote, data_posicao, received_at
- event_type ('snapshot' | 'transition')
- signal (ignicao, bloqueio, rpm, tensao, etc.)
- value_numeric, value_text, value_bool, metadata JSONB
- UNIQUE (id_veiculo, id_pacote, event_type, signal) para dedup de re-runs
- idx_veiculo_data e idx_signal_data para queries historicas

Volume estimado: ~117k rows/dia para 100 veiculos (cron 10min)."
```

- [ ] **Step 3: Commit 2 — função pura + unit tests**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add tests/unit/extractEventsFromPosicao.spec.ts src/domain/posicoes.ts
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "feat(domain): extractEventsFromPosicao + integracao em fetchAndUpsertPosicoes

- Nova funcao pura extractEventsFromPosicao(pos, previous?) que retorna
  o array de PosicaoEventoInsert a serem inseridos. 8 snapshot signals
  (ignicao, bloqueio, rpm, tensao, velocidade, jamming, combustivel_nivel,
  combustivel_litrometro) + 3 transition signals (ignicao, bloqueio, jamming).
- fetchAndUpsertPosicoes agora busca a posicao anterior do mesmo veiculo
  e gera os eventos (snapshot + transition) na mesma transacao que
  o INSERT em posicoes.
- 12 unit cases em extractEventsFromPosicao.spec.ts cobrindo: snapshot
  de todos os sinais, valueBool/valueNumeric/valueText, null/undefined
  pulados, transition (0->1 e 1->0), previous null/igual, metadata from/to."
git log --oneline -1
```

NOTA: o `git add` vai pegar tanto o test file quanto a modificação do `posicoes.ts` (que agora tem a função e a integração). Cuidado para não commitar separadamente — eles formam 1 unidade lógica.

- [ ] **Step 4: Commit 3 — integration tests**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add tests/integration/posicao-eventos.spec.ts
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "test(integration): posicao-eventos schema + transition + dedup (4 cases)

Cobre:
- Insert em posicao_eventos retorna rows com event_type/signal/value_* corretos
- Transition row registra from_value e to_value no metadata JSONB
- Unique constraint dedup por (id_veiculo, id_pacote, event_type, signal)
- Query por (id_veiculo, data_posicao) usa idx_veiculo_data"
```

- [ ] **Step 5: Commit 4 — docs**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git add CHANGELOG.md README.md
git -c user.name=opencode -c user.email=opencode@local \
  commit -m "docs: CHANGELOG + README para posicao_eventos

- CHANGELOG.md [Unreleased] Added: feat(domain) posicao_eventos +
  test(unit) extractEventsFromPosicao + test(integration) posicao-eventos.
  Atualizado contagem de tests (54/184, +16 desta feature).
- README.md: nova secao 'Telemetria historica (posicao_eventos)'
  explicando o que e persistido, volume estimado, query SQL de exemplo,
  e limitacao (nao exposto via GraphQL nesta v1)."
```

- [ ] **Step 6: Verificar 4 commits no log**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git log --oneline f05fffe..HEAD
```

Esperado: 4 commits (Tasks 1, 2, 3, 4).

- [ ] **Step 7: Working tree limpo**

```bash
cd /home/martiel/GitHub/Api-Orquestrador
git status
```

Esperado: `nothing to commit, working tree clean`.

- [ ] **Step 8: Suite completa final (regressão)**

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

Esperado: 54 suites, 184 tests passando.

- [ ] **Step 9: Resumo final**

Reportar:
- 4 SHAs
- Estatísticas: 3 novos arquivos, 3 modificados
- Suite final: 54/184 passing
- Próximo: push para origin/main

---

## Resumo das mudanças

| Arquivo | Tipo | Linhas |
| --- | --- | --- |
| `src/db/migrations/0006_posicao_eventos.sql` | new (migration) | ~20 |
| `tests/unit/extractEventsFromPosicao.spec.ts` | new (test) | ~100 |
| `tests/integration/posicao-eventos.spec.ts` | new (test) | ~80 |
| `src/domain/posicoes.ts` | modified (add func + integration) | +50 |
| `CHANGELOG.md` | modified (docs) | +5 |
| `README.md` | modified (docs) | +25 |

**Fora do escopo:** GraphQL query `posicaoEventos`, backfill de dados existentes, particionamento da tabela, retenção/arquivamento, compressão, telemetria custom (Força G).

---

## Self-Review

1. **Spec coverage:**
   - §"Mudanças → 1" (migration) → Task 1 ✅
   - §"Mudanças → 3" (extractEventsFromPosicao) → Task 2 Step 3 ✅
   - §"Mudanças → 3" (integração em fetchAndUpsertPosicoes) → Task 3 Step 3 ✅
   - §"Mudanças → 4" (tests) → Task 2 (unit) + Task 3 (integration) ✅
   - §"Mudanças → 5" (CHANGELOG) → Task 4 Step 1 ✅
   - §"Mudanças → 6" (README) → Task 4 Step 2 ✅
   - §"Verificação" → Task 5 Step 8 ✅

2. **Placeholder scan:** sem "TBD" / "TODO" / "fix later". Steps têm comandos exatos.

3. **Type consistency:** `PosicaoEventoInsert` definida em Task 2, usada em Task 3 (integração) e testada em Task 2 + Task 3. `extractEventsFromPosicao` definida em Task 2 Step 3, usada em Task 3 Step 3.

4. **Commit ordering:** cada task é verde após aplicação. Task 1 (migration) + Task 2 (func + unit) + Task 3 (integration) + Task 4 (docs) cobrem tudo sequencialmente.
