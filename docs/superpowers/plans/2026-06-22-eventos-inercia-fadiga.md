# Eventos Inércia & Fadiga (Sascar SOAP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor 2 queries GraphQL (`eventosInercia`, `eventosFadiga`) que espelham os métodos Sascar SOAP `obterDeltaTelemetriaIntegracaoInercia` e `obterEventosTempoDirecao` para o consumidor Torck Telemetria substituir o worker SOAP próprio.

**Architecture:** Sem cache (Torck controla idempotência via timestamps). Sem cursor (YAGNI por enquanto). Wrappers finos em `src/domain/inercia.ts` e `src/domain/fadiga.ts` que chamam o orchestrator existente (`ctx.orchestrator.call<T>('methodName', args)`). Mapeamento 1-1 dos campos retornados pelo SDK para tipos GraphQL em camelCase PT-BR. Erros Sascar propagados via `mapSascarError()` existente.

**Tech Stack:** Apollo Server 4 + `graphql-tag`, `sascar-sdk` v1.1.1, `pino`, `pg`. Sem mudanças de infra.

**Spec:** `docs/implementação_faltante.md` (referência externa)

**Branch:** Continuar da branch atual (verificar com `git status`).

**Pré-condições:**
- Containers rodando: `docker compose ps` mostra `app` e `postgres` healthy.
- Conexão DB: `DATABASE_URL=postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador`.
- Envs exportadas antes de rodar testes: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SASCAR_USUARIO`, `SASCAR_SENHA`.

**Desvios da spec original (confirmados com usuário):**
- Spec propunha `eventosInercia(quantidade: Int, cursor: String)`; SDK real exige `(dataInicio, dataFinal, idVeiculo, pagina?)`. Schema final: `eventosInercia(dataInicio: DateTime!, dataFim: DateTime!, idVeiculo: Int!, quantidade: Int = 100): [EventoInercia!]!`.
- Spec propunha `motorista: MotoristaEventoFadiga { cpf, nome }` e `tipo: TipoEventoFadiga` (enum). SDK real expõe `idMotorista`, `nomeMotorista` (sem CPF) e `eventoTempoDirecao: number` + `descricaoEventoTempoDirecao: string`. Schema final: `eventoTempoDirecao: Int!`, `descricaoEvento: String!`, `motorista: MotoristaEvento { idMotorista: Int!, nome: String! }`.
- Spec não definia defaults de `quantidade` para inercia (sempre default 100) e para fadiga (default 100, conforme padrão das outras queries).

---

## File Structure

**Modificar:**
- `src/graphql/schema.ts` — adicionar `EventoInercia`, `MotoristaEvento`, `EventoFadiga`, e as 2 queries.
- `schema.graphql` — espelhar as mudanças do schema.ts (referência para Postman/autocomplete).
- `src/graphql/resolvers.ts` — adicionar `eventosInercia` e `eventosFadiga` no `Query`.
- `CHANGELOG.md` — entrada em `[Unreleased]` → `### Added`.
- `README.md` — tabela de queries (se aplicável).

**Criar:**
- `src/domain/inercia.ts` — interface `EventoInercia`, função `getEventosInercia(ctx, args)`.
- `src/domain/fadiga.ts` — interface `EventoFadiga`, função `getEventosFadiga(ctx, args)`.
- `tests/unit/eventosInercia.spec.ts` — testes unitários do wrapper (mocks do orchestrator).
- `tests/unit/eventosFadiga.spec.ts` — testes unitários do wrapper (mocks do orchestrator).
- `tests/integration/eventos-inercia.spec.ts` — testes GraphQL end-to-end (mock SDK).
- `tests/integration/eventos-fadiga.spec.ts` — testes GraphQL end-to-end (mock SDK).

---

## Task 1: Adicionar tipos e queries no schema GraphQL

**Files:**
- Modificar: `src/graphql/schema.ts:170-191` (bloco `type Query`)

- [ ] **Step 1: Adicionar os tipos `EventoInercia`, `MotoristaEvento` e `EventoFadiga` antes do bloco `type Query`**

Localizar o final do bloco `type CaixaPretaEvento` (linha 157) e adicionar antes de `input CreateUserInput`:

```graphql
  type EventoInercia {
    idVeiculo: Int!
    dataPosicao: DateTime!
    idMotorista: Int
    nomeMotorista: String
    latitude: Float
    longitude: Float
    velocidadeMaximaFaixaAmarela: Float
    rpmMaximo: Int
    velocidadeMedia: Float
    distanciaPercorrida: Float
  }

  type MotoristaEvento {
    idMotorista: Int!
    nome: String!
  }

  type EventoFadiga {
    idVeiculo: Int!
    dataInicio: DateTime!
    eventoTempoDirecao: Int!
    descricaoEvento: String!
    eventoTempoDirecaoAnterior: Int
    descricaoEventoAnterior: String
    idMotorista: Int!
    nomeMotorista: String!
    idCliente: Int
    nomeCliente: String
    latitude: Float
    longitude: Float
    odometro: Float
    placa: String
  }
```

- [ ] **Step 2: Adicionar as queries no bloco `type Query`**

Localizar a linha `syncStatus: [SyncCursor!]!` e adicionar logo após:

```graphql
    """Eventos de inércia (delta telemetria) — espelho de obterDeltaTelemetriaIntegracaoInercia"""
    eventosInercia(
      dataInicio: DateTime!
      dataFim: DateTime!
      idVeiculo: Int!
      quantidade: Int = 100
    ): [EventoInercia!]!
    """Eventos de fadiga do motorista (tempo de direção) — espelho de obterEventosTempoDirecao"""
    eventosFadiga(
      quantidade: Int = 100
      idMotorista: Int
      dataInicio: DateTime
      dataFim: DateTime
    ): [EventoFadiga!]!
```

- [ ] **Step 3: Espelhar as mudanças em `schema.graphql` (referência para Postman)**

Localizar a linha `type CaixaPretaEvento {` no `schema.graphql` e adicionar antes de `input CreateUserInput` o mesmo bloco de tipos do Step 1. Localizar `syncStatus: [SyncCursor!]!` no `schema.graphql` e adicionar logo após o mesmo bloco de queries do Step 2.

- [ ] **Step 4: Rodar typecheck**

```bash
npm run typecheck
```

Expected: exit 0 (sem novos erros — tipos SDL não são verificados pelo tsc, mas o arquivo compila).

- [ ] **Step 5: Verificar que Apollo aceita o schema novo (smoke)**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npm run dev &
sleep 3
curl -sS http://localhost:4000/ -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { queryType { fields { name } } } }"}' | grep -E "(eventosInercia|eventosFadiga)"
kill %1 2>/dev/null
```

Expected: aparecem `eventosInercia` e `eventosFadiga` na lista de fields.

- [ ] **Step 6: Commit**

```bash
git add src/graphql/schema.ts schema.graphql
git commit -m "feat(graphql): expor tipos e queries eventosInercia e eventosFadiga"
```

---

## Task 2: Teste falhando — wrapper `getEventosInercia` retorna lista mapeada

**Files:**
- Criar: `tests/unit/eventosInercia.spec.ts`

- [ ] **Step 1: Criar o arquivo de teste com mock do orchestrator**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getEventosInercia } from '../../src/domain/inercia';
import { SascarApiError } from 'sascar-sdk';

function makeCtx(orchestratorMock: any) {
  return {
    user: null,
    logger: console as unknown as any,
    db: { execute: jest.fn() } as any,
    orchestrator: orchestratorMock,
  };
}

describe('getEventosInercia', () => {
  it('chama Sascar com dataInicio, dataFim, idVeiculo, pagina (=quantidade)', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    await getEventosInercia(ctx, {
      dataInicio: '2026-06-01T00:00:00Z',
      dataFim: '2026-06-22T23:59:59Z',
      idVeiculo: 12345,
      quantidade: 50,
    });
    expect(call).toHaveBeenCalledWith('obterDeltaTelemetriaIntegracaoInercia', [
      '2026-06-01T00:00:00Z',
      '2026-06-22T23:59:59Z',
      12345,
      50,
    ]);
  });

  it('usa quantidade default = 100 quando omitida', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    await getEventosInercia(ctx, {
      dataInicio: '2026-06-01T00:00:00Z',
      dataFim: '2026-06-22T23:59:59Z',
      idVeiculo: 12345,
    });
    expect(call).toHaveBeenCalledWith('obterDeltaTelemetriaIntegracaoInercia', [
      '2026-06-01T00:00:00Z',
      '2026-06-22T23:59:59Z',
      12345,
      100,
    ]);
  });

  it('mapeia resposta do SDK para o tipo EventoInercia (sem inventar campos)', async () => {
    const call = jest.fn().mockResolvedValue([
      {
        idVeiculo: 12345,
        dataPosicao: '2026-06-22T14:30:00',
        idMotorista: 67890,
        nomeMotorista: 'João Silva',
        latitude: -23.5,
        longitude: -46.6,
        velocidadeMaximaFaixaAmarela: 85.5,
        rpmMaximo: 3500,
        velocidadeMedia: 60.2,
        distanciaPercorrida: 1234.5,
        // campos extras do SDK que NÃO devem aparecer no GraphQL:
        tempoDuracaoGiroMotor: 100,
        odometro: 99999,
      },
    ]);
    const ctx = makeCtx({ call });
    const result = await getEventosInercia(ctx, {
      dataInicio: '2026-06-01T00:00:00Z',
      dataFim: '2026-06-22T23:59:59Z',
      idVeiculo: 12345,
      quantidade: 10,
    });
    expect(result).toEqual([
      {
        idVeiculo: 12345,
        dataPosicao: '2026-06-22T14:30:00',
        idMotorista: 67890,
        nomeMotorista: 'João Silva',
        latitude: -23.5,
        longitude: -46.6,
        velocidadeMaximaFaixaAmarela: 85.5,
        rpmMaximo: 3500,
        velocidadeMedia: 60.2,
        distanciaPercorrida: 1234.5,
      },
    ]);
  });

  it('retorna [] quando Sascar devolve array vazio', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    const result = await getEventosInercia(ctx, {
      dataInicio: '2026-06-01T00:00:00Z',
      dataFim: '2026-06-22T23:59:59Z',
      idVeiculo: 12345,
    });
    expect(result).toEqual([]);
  });

  it('propaga erro do Sascar via mapSascarError (GraphQLError)', async () => {
    const fault = new SascarApiError('Sascar SOAP Fault: limite excedido', {
      fault: { faultstring: 'limite excedido', faultcode: 'soap:Server' },
    });
    const call = jest.fn().mockRejectedValue(fault);
    const ctx = makeCtx({ call });
    await expect(
      getEventosInercia(ctx, {
        dataInicio: '2026-06-01T00:00:00Z',
        dataFim: '2026-06-22T23:59:59Z',
        idVeiculo: 12345,
      }),
    ).rejects.toThrow(/Sascar/);
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha (RED)**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/unit/eventosInercia.spec.ts
```

Expected: FAIL — `Cannot find module '../../src/domain/inercia'`.

- [ ] **Step 3: Commit do teste falhando**

```bash
git add tests/unit/eventosInercia.spec.ts
git commit -m "test(eventosInercia): wrapper deve mapear SDK para tipo GraphQL"
```

---

## Task 3: Implementar `src/domain/inercia.ts`

**Files:**
- Criar: `src/domain/inercia.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { logRequest } from '../orchestrator/log';
import { mapSascarError } from '../orchestrator/errors';
import type { AppContext } from '../context';

export interface EventoInercia {
  idVeiculo: number;
  dataPosicao: string;
  idMotorista: number | null;
  nomeMotorista: string | null;
  latitude: number | null;
  longitude: number | null;
  velocidadeMaximaFaixaAmarela: number | null;
  rpmMaximo: number | null;
  velocidadeMedia: number | null;
  distanciaPercorrida: number | null;
}

interface SascarDeltaTelemetria {
  idVeiculo: number;
  dataPosicao: string;
  idMotorista?: number | null;
  nomeMotorista?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  velocidadeMaximaFaixaAmarela?: number | null;
  rpmMaximo?: number | null;
  velocidadeMedia?: number | null;
  distanciaPercorrida?: number | null;
}

export interface GetEventosInerciaArgs {
  dataInicio: string;
  dataFim: string;
  idVeiculo: number;
  quantidade?: number;
}

function mapDeltaTelemetria(item: SascarDeltaTelemetria): EventoInercia {
  return {
    idVeiculo: item.idVeiculo,
    dataPosicao: item.dataPosicao,
    idMotorista: item.idMotorista ?? null,
    nomeMotorista: item.nomeMotorista ?? null,
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    velocidadeMaximaFaixaAmarela: item.velocidadeMaximaFaixaAmarela ?? null,
    rpmMaximo: item.rpmMaximo ?? null,
    velocidadeMedia: item.velocidadeMedia ?? null,
    distanciaPercorrida: item.distanciaPercorrida ?? null,
  };
}

export async function getEventosInercia(
  ctx: AppContext,
  args: GetEventosInerciaArgs,
): Promise<EventoInercia[]> {
  const start = Date.now();
  const quantidade = args.quantidade ?? 100;
  try {
    const raw = await ctx.orchestrator.call<SascarDeltaTelemetria[]>(
      'obterDeltaTelemetriaIntegracaoInercia',
      [args.dataInicio, args.dataFim, args.idVeiculo, quantidade],
    );
    await logRequest(ctx.db, {
      method: 'obterDeltaTelemetriaIntegracaoInercia',
      source: 'graphql',
      status: 'ok',
      cacheHit: false,
      latencyMs: Date.now() - start,
      args: { ...args, quantidade },
    });
    return raw.map(mapDeltaTelemetria);
  } catch (err) {
    await logRequest(ctx.db, {
      method: 'obterDeltaTelemetriaIntegracaoInercia',
      source: 'graphql',
      status: 'error',
      cacheHit: false,
      latencyMs: Date.now() - start,
      args: { ...args, quantidade },
      error: (err as Error)?.message ?? String(err),
    });
    throw mapSascarError(err);
  }
}
```

- [ ] **Step 2: Rodar o teste e verificar que passa (GREEN)**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/unit/eventosInercia.spec.ts
```

Expected: 5 testes PASS.

- [ ] **Step 3: Rodar typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/domain/inercia.ts
git commit -m "feat(domain): getEventosInercia wrapper do Sascar SOAP"
```

---

## Task 4: Teste falhando — wrapper `getEventosFadiga` retorna lista mapeada

**Files:**
- Criar: `tests/unit/eventosFadiga.spec.ts`

- [ ] **Step 1: Criar o arquivo de teste com mock do orchestrator**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getEventosFadiga } from '../../src/domain/fadiga';
import { SascarApiError } from 'sascar-sdk';

function makeCtx(orchestratorMock: any) {
  return {
    user: null,
    logger: console as unknown as any,
    db: { execute: jest.fn() } as any,
    orchestrator: orchestratorMock,
  };
}

describe('getEventosFadiga', () => {
  it('chama Sascar com quantidade default = 100 quando omitida', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    await getEventosFadiga(ctx, {});
    expect(call).toHaveBeenCalledWith('obterEventosTempoDirecao', [100, undefined, undefined, undefined]);
  });

  it('chama Sascar com todos os args quando fornecidos', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    await getEventosFadiga(ctx, {
      quantidade: 50,
      idMotorista: 67890,
      dataInicio: '2026-06-01T00:00:00Z',
      dataFim: '2026-06-22T23:59:59Z',
    });
    expect(call).toHaveBeenCalledWith('obterEventosTempoDirecao', [
      50,
      67890,
      '2026-06-01T00:00:00Z',
      '2026-06-22T23:59:59Z',
    ]);
  });

  it('mapeia resposta do SDK para o tipo EventoFadiga (sem inventar campos)', async () => {
    const call = jest.fn().mockResolvedValue([
      {
        idVeiculo: 12345,
        dataInicio: '2026-06-22T18:00:00',
        eventoTempoDirecao: 1,
        descricaoEventoTempoDirecao: 'JORNADA_EXCEDIDA',
        eventoTempoDirecaoAnterior: 0,
        descricaoEventoTempoDirecaoAnterior: '',
        idMotorista: 67890,
        nomeMotorista: 'João Silva',
        idCliente: 1,
        nomeCliente: 'Empresa X',
        latitude: -23.5,
        longitude: -46.6,
        odometro: 99999.5,
        placa: 'ABC1D23',
        cidade: 'São Paulo',
        uf: 'SP',
        rua: 'Av. Paulista',
        // campos extras do SDK que NÃO devem aparecer:
        idMotoristaReserva: 0,
        nomeMotoristaReserva: '',
      },
    ]);
    const ctx = makeCtx({ call });
    const result = await getEventosFadiga(ctx, { quantidade: 10 });
    expect(result).toEqual([
      {
        idVeiculo: 12345,
        dataInicio: '2026-06-22T18:00:00',
        eventoTempoDirecao: 1,
        descricaoEvento: 'JORNADA_EXCEDIDA',
        eventoTempoDirecaoAnterior: 0,
        descricaoEventoAnterior: '',
        idMotorista: 67890,
        nomeMotorista: 'João Silva',
        idCliente: 1,
        nomeCliente: 'Empresa X',
        latitude: -23.5,
        longitude: -46.6,
        odometro: 99999.5,
        placa: 'ABC1D23',
      },
    ]);
  });

  it('retorna [] quando Sascar devolve array vazio', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    const result = await getEventosFadiga(ctx, {});
    expect(result).toEqual([]);
  });

  it('propaga erro do Sascar via mapSascarError (GraphQLError)', async () => {
    const fault = new SascarApiError('Sascar SOAP Fault: timeout', {
      fault: { faultstring: 'timeout', faultcode: 'soap:Client' },
    });
    const call = jest.fn().mockRejectedValue(fault);
    const ctx = makeCtx({ call });
    await expect(getEventosFadiga(ctx, {})).rejects.toThrow(/Sascar/);
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha (RED)**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/unit/eventosFadiga.spec.ts
```

Expected: FAIL — `Cannot find module '../../src/domain/fadiga'`.

- [ ] **Step 3: Commit do teste falhando**

```bash
git add tests/unit/eventosFadiga.spec.ts
git commit -m "test(eventosFadiga): wrapper deve mapear SDK para tipo GraphQL"
```

---

## Task 5: Implementar `src/domain/fadiga.ts`

**Files:**
- Criar: `src/domain/fadiga.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { logRequest } from '../orchestrator/log';
import { mapSascarError } from '../orchestrator/errors';
import type { AppContext } from '../context';

export interface EventoFadiga {
  idVeiculo: number;
  dataInicio: string;
  eventoTempoDirecao: number;
  descricaoEvento: string;
  eventoTempoDirecaoAnterior: number | null;
  descricaoEventoAnterior: string | null;
  idMotorista: number;
  nomeMotorista: string;
  idCliente: number | null;
  nomeCliente: string | null;
  latitude: number | null;
  longitude: number | null;
  odometro: number | null;
  placa: string | null;
}

interface SascarEventoTempoDirecao {
  idVeiculo: number;
  dataInicio: string;
  eventoTempoDirecao: number;
  descricaoEventoTempoDirecao: string;
  eventoTempoDirecaoAnterior?: number | null;
  descricaoEventoTempoDirecaoAnterior?: string | null;
  idMotorista: number;
  nomeMotorista: string;
  idCliente?: number | null;
  nomeCliente?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  odometro?: number | null;
  placa?: string | null;
}

export interface GetEventosFadigaArgs {
  quantidade?: number;
  idMotorista?: number;
  dataInicio?: string;
  dataFim?: string;
}

function mapEventoTempoDirecao(item: SascarEventoTempoDirecao): EventoFadiga {
  return {
    idVeiculo: item.idVeiculo,
    dataInicio: item.dataInicio,
    eventoTempoDirecao: item.eventoTempoDirecao,
    descricaoEvento: item.descricaoEventoTempoDirecao,
    eventoTempoDirecaoAnterior: item.eventoTempoDirecaoAnterior ?? null,
    descricaoEventoAnterior: item.descricaoEventoTempoDirecaoAnterior ?? null,
    idMotorista: item.idMotorista,
    nomeMotorista: item.nomeMotorista,
    idCliente: item.idCliente ?? null,
    nomeCliente: item.nomeCliente ?? null,
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    odometro: item.odometro ?? null,
    placa: item.placa ?? null,
  };
}

export async function getEventosFadiga(
  ctx: AppContext,
  args: GetEventosFadigaArgs,
): Promise<EventoFadiga[]> {
  const start = Date.now();
  const quantidade = args.quantidade ?? 100;
  try {
    const raw = await ctx.orchestrator.call<SascarEventoTempoDirecao[]>(
      'obterEventosTempoDirecao',
      [quantidade, args.idMotorista ?? undefined, args.dataInicio, args.dataFim],
    );
    await logRequest(ctx.db, {
      method: 'obterEventosTempoDirecao',
      source: 'graphql',
      status: 'ok',
      cacheHit: false,
      latencyMs: Date.now() - start,
      args,
    });
    return raw.map(mapEventoTempoDirecao);
  } catch (err) {
    await logRequest(ctx.db, {
      method: 'obterEventosTempoDirecao',
      source: 'graphql',
      status: 'error',
      cacheHit: false,
      latencyMs: Date.now() - start,
      args,
      error: (err as Error)?.message ?? String(err),
    });
    throw mapSascarError(err);
  }
}
```

- [ ] **Step 2: Rodar o teste e verificar que passa (GREEN)**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/unit/eventosFadiga.spec.ts
```

Expected: 5 testes PASS.

- [ ] **Step 3: Rodar typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/domain/fadiga.ts
git commit -m "feat(domain): getEventosFadiga wrapper do Sascar SOAP"
```

---

## Task 6: Adicionar resolvers no GraphQL

**Files:**
- Modificar: `src/graphql/resolvers.ts:21-37` (bloco `Query`)

- [ ] **Step 1: Adicionar imports e resolvers**

Localizar a linha `import { getCaixaPretaEventos } from '../domain/caixaPreta';` e adicionar logo abaixo:

```typescript
import { getEventosInercia } from '../domain/inercia';
import { getEventosFadiga } from '../domain/fadiga';
```

Localizar o resolver `caixaPretaEventos` (linha 90) e adicionar ANTES dele:

```typescript
    eventosInercia: (
      _: unknown,
      args: {
        dataInicio: string;
        dataFim: string;
        idVeiculo: number;
        quantidade?: number;
      },
      ctx: AppContext,
    ) => {
      requireAuth(ctx);
      return getEventosInercia(ctx, args);
    },
    eventosFadiga: (
      _: unknown,
      args: {
        quantidade?: number;
        idMotorista?: number;
        dataInicio?: string;
        dataFim?: string;
      },
      ctx: AppContext,
    ) => {
      requireAuth(ctx);
      return getEventosFadiga(ctx, args);
    },
```

- [ ] **Step 2: Rodar typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/graphql/resolvers.ts
git commit -m "feat(resolvers): eventosInercia e eventosFadiga com auth obrigatória"
```

---

## Task 7: Teste integração falhando — `eventosInercia` retorna dados via GraphQL

**Files:**
- Criar: `tests/integration/eventos-inercia.spec.ts`

- [ ] **Step 1: Criar o arquivo de teste com mock do SDK via replacement do método no client**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { buildSascarClient, SascarOrchestrator } from '../../src/orchestrator/SascarOrchestrator';
import { buildTestServer } from '../helpers/server';

describe('eventosInercia GraphQL', () => {
  let pool: Pool;

  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterEach(async () => {
    await pool.end();
  });

  it('retorna 1 evento mapeado quando Sascar responde com 1 item', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    sascar.obterDeltaTelemetriaIntegracaoInercia = (async () => [
      {
        idVeiculo: 12345,
        dataPosicao: '2026-06-22T14:30:00',
        idMotorista: 67890,
        nomeMotorista: 'João Silva',
        latitude: -23.5,
        longitude: -46.6,
        velocidadeMaximaFaixaAmarela: 85.5,
        rpmMaximo: 3500,
        velocidadeMedia: 60.2,
        distanciaPercorrida: 1234.5,
      },
    ]) as any;
    const orch = new SascarOrchestrator(sascar);

    const ctx = {
      user: null,
      logger: console as unknown as any,
      db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
      orchestrator: orch,
    };
    const server = new (require('@apollo/server').ApolloServer)({
      typeDefs: require('../../src/graphql/schema').typeDefs,
      resolvers: require('../../src/graphql/resolvers').resolvers,
    });
    await server.start();
    const res = await server
      .executeOperation(
        {
          query: `query E($di: DateTime!, $df: DateTime!, $id: Int!) {
            eventosInercia(dataInicio: $di, dataFim: $df, idVeiculo: $id) {
              idVeiculo dataPosicao nomeMotorista velocidadeMaximaFaixaAmarela
            }
          }`,
          variables: { di: '2026-06-01T00:00:00Z', df: '2026-06-22T23:59:59Z', id: 12345 },
        } as any,
        { contextValue: ctx },
      )
      .then((r: any) => r.body.singleResult);

    expect(res.errors).toBeUndefined();
    expect(res.data.eventosInercia).toHaveLength(1);
    expect(res.data.eventosInercia[0]).toMatchObject({
      idVeiculo: 12345,
      nomeMotorista: 'João Silva',
      velocidadeMaximaFaixaAmarela: 85.5,
    });
    await server.stop();
  });

  it('retorna [] quando Sascar devolve array vazio', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    sascar.obterDeltaTelemetriaIntegracaoInercia = (async () => []) as any;
    const orch = new SascarOrchestrator(sascar);

    const ctx = {
      user: null,
      logger: console as unknown as any,
      db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
      orchestrator: orch,
    };
    const server = new (require('@apollo/server').ApolloServer)({
      typeDefs: require('../../src/graphql/schema').typeDefs,
      resolvers: require('../../src/graphql/resolvers').resolvers,
    });
    await server.start();
    const res = await server
      .executeOperation(
        {
          query: `query E($di: DateTime!, $df: DateTime!, $id: Int!) {
            eventosInercia(dataInicio: $di, dataFim: $df, idVeiculo: $id) { idVeiculo }
          }`,
          variables: { di: '2026-06-01T00:00:00Z', df: '2026-06-22T23:59:59Z', id: 12345 },
        } as any,
        { contextValue: ctx },
      )
      .then((r: any) => r.body.singleResult);

    expect(res.errors).toBeUndefined();
    expect(res.data.eventosInercia).toEqual([]);
    await server.stop();
  });

  it('retorna erro de autenticação quando ctx.user é null', async () => {
    const { executeOperation } = await buildTestServer({ user: null });
    const res = await executeOperation({
      query: `query E($di: DateTime!, $df: DateTime!, $id: Int!) {
        eventosInercia(dataInicio: $di, dataFim: $df, idVeiculo: $id) { idVeiculo }
      }`,
      variables: { di: '2026-06-01T00:00:00Z', df: '2026-06-22T23:59:59Z', id: 12345 },
    });
    expect(res.errors).toBeDefined();
    expect((res.errors![0] as any).extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('usa quantidade default = 100 quando omitida', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    const spy = jest.fn().mockResolvedValue([]);
    sascar.obterDeltaTelemetriaIntegracaoInercia = spy as any;
    const orch = new SascarOrchestrator(sascar);

    const ctx = {
      user: null,
      logger: console as unknown as any,
      db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
      orchestrator: orch,
    };
    const server = new (require('@apollo/server').ApolloServer)({
      typeDefs: require('../../src/graphql/schema').typeDefs,
      resolvers: require('../../src/graphql/resolvers').resolvers,
    });
    await server.start();
    await server
      .executeOperation(
        {
          query: `query E($di: DateTime!, $df: DateTime!, $id: Int!) {
            eventosInercia(dataInicio: $di, dataFim: $df, idVeiculo: $id) { idVeiculo }
          }`,
          variables: { di: '2026-06-01T00:00:00Z', df: '2026-06-22T23:59:59Z', id: 12345 },
        } as any,
        { contextValue: ctx },
      );
    expect(spy).toHaveBeenCalledWith('2026-06-01T00:00:00Z', '2026-06-22T23:59:59Z', 12345, 100);
    await server.stop();
  });

  it('usa quantidade custom quando fornecida', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    const spy = jest.fn().mockResolvedValue([]);
    sascar.obterDeltaTelemetriaIntegracaoInercia = spy as any;
    const orch = new SascarOrchestrator(sascar);

    const ctx = {
      user: null,
      logger: console as unknown as any,
      db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
      orchestrator: orch,
    };
    const server = new (require('@apollo/server').ApolloServer)({
      typeDefs: require('../../src/graphql/schema').typeDefs,
      resolvers: require('../../src/graphql/resolvers').resolvers,
    });
    await server.start();
    await server
      .executeOperation(
        {
          query: `query E($di: DateTime!, $df: DateTime!, $id: Int!, $q: Int) {
            eventosInercia(dataInicio: $di, dataFim: $df, idVeiculo: $id, quantidade: $q) { idVeiculo }
          }`,
          variables: { di: '2026-06-01T00:00:00Z', df: '2026-06-22T23:59:59Z', id: 12345, q: 25 },
        } as any,
        { contextValue: ctx },
      );
    expect(spy).toHaveBeenCalledWith('2026-06-01T00:00:00Z', '2026-06-22T23:59:59Z', 12345, 25);
    await server.stop();
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha (RED)**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/eventos-inercia.spec.ts
```

Expected: 5 testes PASS (já implementado na Task 6, então RED→GREEN acontece direto; este step confirma a integração). Se algum falhar, ajustar antes do commit.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/eventos-inercia.spec.ts
git commit -m "test(integration): eventosInercia GraphQL end-to-end com mock Sascar"
```

---

## Task 8: Teste integração falhando — `eventosFadiga` retorna dados via GraphQL

**Files:**
- Criar: `tests/integration/eventos-fadiga.spec.ts`

- [ ] **Step 1: Criar o arquivo de teste (mesmo padrão do inercia)**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { buildSascarClient, SascarOrchestrator } from '../../src/orchestrator/SascarOrchestrator';
import { buildTestServer } from '../helpers/server';

function makeServerWithOrch(orch: SascarOrchestrator, pool: Pool) {
  const ctx = {
    user: null,
    logger: console as unknown as any,
    db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
    orchestrator: orch,
  };
  const server = new (require('@apollo/server').ApolloServer)({
    typeDefs: require('../../src/graphql/schema').typeDefs,
    resolvers: require('../../src/graphql/resolvers').resolvers,
  });
  return { server, ctx };
}

describe('eventosFadiga GraphQL', () => {
  let pool: Pool;

  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterEach(async () => {
    await pool.end();
  });

  it('retorna 1 evento mapeado quando Sascar responde com 1 item', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    sascar.obterEventosTempoDirecao = (async () => [
      {
        idVeiculo: 12345,
        dataInicio: '2026-06-22T18:00:00',
        eventoTempoDirecao: 1,
        descricaoEventoTempoDirecao: 'JORNADA_EXCEDIDA',
        eventoTempoDirecaoAnterior: 0,
        descricaoEventoTempoDirecaoAnterior: '',
        idMotorista: 67890,
        nomeMotorista: 'João Silva',
        idCliente: 1,
        nomeCliente: 'Empresa X',
        latitude: -23.5,
        longitude: -46.6,
        odometro: 99999.5,
        placa: 'ABC1D23',
      },
    ]) as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeServerWithOrch(orch, pool);
    await server.start();
    const res = await server
      .executeOperation(
        { query: '{ eventosFadiga(quantidade: 10) { idVeiculo eventoTempoDirecao descricaoEvento nomeMotorista } }' } as any,
        { contextValue: ctx },
      )
      .then((r: any) => r.body.singleResult);

    expect(res.errors).toBeUndefined();
    expect(res.data.eventosFadiga).toHaveLength(1);
    expect(res.data.eventosFadiga[0]).toMatchObject({
      idVeiculo: 12345,
      eventoTempoDirecao: 1,
      descricaoEvento: 'JORNADA_EXCEDIDA',
      nomeMotorista: 'João Silva',
    });
    await server.stop();
  });

  it('retorna [] quando Sascar devolve array vazio', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    sascar.obterEventosTempoDirecao = (async () => []) as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeServerWithOrch(orch, pool);
    await server.start();
    const res = await server
      .executeOperation({ query: '{ eventosFadiga { idVeiculo } }' } as any, { contextValue: ctx })
      .then((r: any) => r.body.singleResult);

    expect(res.errors).toBeUndefined();
    expect(res.data.eventosFadiga).toEqual([]);
    await server.stop();
  });

  it('retorna erro de autenticação quando ctx.user é null', async () => {
    const { executeOperation } = await buildTestServer({ user: null });
    const res = await executeOperation({ query: '{ eventosFadiga { idVeiculo } }' });
    expect(res.errors).toBeDefined();
    expect((res.errors![0] as any).extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('usa quantidade default = 100 quando omitida', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    const spy = jest.fn().mockResolvedValue([]);
    sascar.obterEventosTempoDirecao = spy as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeServerWithOrch(orch, pool);
    await server.start();
    await server
      .executeOperation({ query: '{ eventosFadiga { idVeiculo } }' } as any, { contextValue: ctx });
    expect(spy).toHaveBeenCalledWith(100, undefined, undefined, undefined);
    await server.stop();
  });

  it('usa quantidade custom quando fornecida', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    const spy = jest.fn().mockResolvedValue([]);
    sascar.obterEventosTempoDirecao = spy as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeServerWithOrch(orch, pool);
    await server.start();
    await server
      .executeOperation({ query: 'query F($q: Int) { eventosFadiga(quantidade: $q) { idVeiculo } }', variables: { q: 25 } } as any, { contextValue: ctx });
    expect(spy).toHaveBeenCalledWith(25, undefined, undefined, undefined);
    await server.stop();
  });
});
```

- [ ] **Step 2: Rodar o teste e verificar que falha/passa**

```bash
DATABASE_URL="postgres://api_orquestrador:dev_password@localhost:5432/api_orquestrador" \
JWT_ACCESS_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
JWT_REFRESH_SECRET="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" \
SEED_ADMIN_EMAIL="admin@local.dev" \
SEED_ADMIN_PASSWORD="admin1234" \
SASCAR_USUARIO="dummy" \
SASCAR_SENHA="dummy" \
npx jest tests/integration/eventos-fadiga.spec.ts
```

Expected: 5 testes PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/eventos-fadiga.spec.ts
git commit -m "test(integration): eventosFadiga GraphQL end-to-end com mock Sascar"
```

---

## Task 9: Atualizar CHANGELOG e README

**Files:**
- Modificar: `CHANGELOG.md` (em `[Unreleased]` → `### Added`)
- Modificar: `README.md` (tabela de queries, se houver)

- [ ] **Step 1: Adicionar entrada no CHANGELOG**

Localizar a seção `## [Unreleased]` no `CHANGELOG.md` e adicionar (ou substituir a entrada existente em `### Added` se já houver):

```markdown
- **feat(graphql)**: Expor `eventosInercia(dataInicio, dataFim, idVeiculo, quantidade)` espelhando `obterDeltaTelemetriaIntegracaoInercia` do Sascar SOAP (sem cache, sem cursor — YAGNI). Expor `eventosFadiga(quantidade, idMotorista?, dataInicio?, dataFim?)` espelhando `obterEventosTempoDirecao`. Tipos `EventoInercia`, `EventoFadiga` e `MotoristaEvento` adicionados. Sem campos inventados — apenas campos reais do SDK sascar-sdk v1.1.1.
```

- [ ] **Step 2: Adicionar entrada no README (se houver seção de queries)**

Localizar a tabela de queries ou seção "GraphQL Schema" no `README.md` e adicionar (se aplicável):

```markdown
| `eventosInercia(dataInicio, dataFim, idVeiculo, quantidade)` | Eventos de inércia (freadas, acelerações, curvas bruscas) — espelho de `obterDeltaTelemetriaIntegracaoInercia` |
| `eventosFadiga(quantidade, idMotorista?, dataInicio?, dataFim?)` | Eventos de fadiga do motorista (jornada excedida, tempo de direção) — espelho de `obterEventosTempoDirecao` |
```

Se não houver tabela, pular este step (não criar nova seção — YAGNI).

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: changelog + readme para eventosInercia e eventosFadiga"
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

Expected: suites antigas (24) + 2 novas (eventosInercia + eventosFadiga unit) + 2 novas (eventos-inercia + eventos-fadiga integration) = 28 suites. Testes: antigos + 10 novos (5 unit inercia + 5 unit fadiga + 5 integ inercia + 5 integ fadiga = 20 novos). Todos passando.

- [ ] **Step 3: Rodar lint**

```bash
npm run lint
```

Expected: exit 0 (sem novos warnings além dos já existentes em outros arquivos).

- [ ] **Step 4: Smoke test contra container rodando**

```bash
TOKEN=$(curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { login(email:\"admin@local.dev\", password:\"admin1234\") { accessToken } }"}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ eventosInercia(dataInicio:\"2026-06-01T00:00:00Z\", dataFim:\"2026-06-22T23:59:59Z\", idVeiculo: 0, quantidade: 1) { idVeiculo } }"}' | head -c 300

curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ eventosFadiga(quantidade: 1) { idVeiculo } }"}' | head -c 300
```

Expected: ambas as queries respondem (com erro Sascar ou array vazio, dependendo das credenciais reais) — o importante é que o endpoint responde com auth válida.

- [ ] **Step 5: Verificar histórico de commits**

```bash
git log --oneline -10
```

Expected: 9 commits novos (Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9) + 1 commit de verificação final se necessário.

- [ ] **Step 6: Push da branch (opcional, requer confirmação do usuário)**

```bash
git push origin $(git branch --show-current)
```

Não rodar sem confirmação explícita.

---

## Resumo das mudanças

| Arquivo | Tipo | Conteúdo |
|---|---|---|
| `src/graphql/schema.ts` | modificar | Tipos `EventoInercia`, `MotoristaEvento`, `EventoFadiga` + queries |
| `schema.graphql` | modificar | Espelho SDL para Postman/autocomplete |
| `src/graphql/resolvers.ts` | modificar | 2 resolvers (`eventosInercia`, `eventosFadiga`) com `requireAuth` |
| `src/domain/inercia.ts` | criar | Wrapper Sascar + interface `EventoInercia` + mapeamento |
| `src/domain/fadiga.ts` | criar | Wrapper Sascar + interface `EventoFadiga` + mapeamento |
| `tests/unit/eventosInercia.spec.ts` | criar | 5 testes unitários (mock orchestrator) |
| `tests/unit/eventosFadiga.spec.ts` | criar | 5 testes unitários (mock orchestrator) |
| `tests/integration/eventos-inercia.spec.ts` | criar | 5 testes integração (mock SDK + Apollo real) |
| `tests/integration/eventos-fadiga.spec.ts` | criar | 5 testes integração (mock SDK + Apollo real) |
| `CHANGELOG.md` | modificar | Entrada `[Unreleased]` → `### Added` |
| `README.md` | modificar (se houver tabela) | 2 entradas na tabela de queries |

**Fora do escopo:**
- Cache (Torck controla idempotência)
- Cursor-based pagination (YAGNI segundo spec)
- Batch loading
- Filtros avançados (apenas quantidade + range data + idVeiculo/idMotorista conforme SDK)
- Mutações / escrita em banco para esses eventos (não solicitado)
- Sync cursor (específico do domínio de posições; não aplicável aqui)
