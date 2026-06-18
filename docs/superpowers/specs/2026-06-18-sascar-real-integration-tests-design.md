# Real Sascar Integration Tests — design

**Data:** 2026-06-18
**Escopo:** feature — adiciona `tests/integration/sascar-real.spec.ts`, suite gated por `RUN_REAL_SASCAR_TESTS=1` que bate no Sascar real (não mocka) e valida end-to-end: SDK SOAP → SascarOrchestrator → Postgres → GraphQL.

**Relacionado:** complementa a cobertura existente (todos os 51 suites/170 tests atuais mockam Sascar via `nock` em `posicoes.spec.ts:20` e `posicoes-bigint.spec.ts:31`, ou stub do SDK em `SascarOrchestrator.spec.ts:9`). Esta suite cobre a integração real que fica fora do test suite determinístico.

## Contexto

Os testes atuais se dividem em:
- **Unit** (puros, sem I/O): `mapPosicaoRowToVeiculoStatus`, `renderStatusCell`, `loadConfig`, `SascarOrchestrator` (com stub), `mapSascarError`, password/jwt.
- **Integration backend** (Postgres real, Sascar mockado): cachedQuery, posicoes, posicoes-query, posicoes-bigint, cache, request-log, etc.
- **Integration TUI** (rendering Ink, sem I/O): CadastroList, ViewScaffold, Confirm, StatusBadge.

**Gap:** o caminho Sascar → orchestrator → DB → GraphQL nunca é exercitado end-to-end em CI. Bugs em:
- Schema WSDL do Sascar (campos renomeados, tipos trocados)
- Mapeamento de campos no `sascar-sdk`
- Wire format SOAP (encoding, namespaces)
- Field name conventions (`idEquipamento` vs `id_equipamento`)

...só seriam pegos em produção ou em smoke test manual.

A `.env` já tem credenciais reais (`SASCAR_USUARIO=RMMOTAMULTISATGR`, `SASCAR_SENHA=sascar`) e a API responde (HTTP 200 em `https://sasintegra.sascar.com.br/...`), então a suíte é viável agora.

## Decisão de escopo

**Gated por env var (`RUN_REAL_SASCAR_TESTS=1`).** Por padrão a suite é `describe.skip` — não impacta CI nem devs locais. Roda só quando explicitamente habilitada (ex: smoke job noturno, debug local, validação de release).

Justificativas:
- **Custo:** ~5-10min para 4 testes (1 round-trip SOAP cada + INSERT + query GraphQL). Não cabe no feedback loop de PR.
- **Side effects:** popula `veiculos_cache`/`clientes_cache`/`motoristas_cache`/`posicoes` no DB de dev. Idempotente (cleanup no `beforeEach`), mas se rodar em paralelo com o cron `syncPositions` pode haver contenção.
- **Flakiness:** rede, rate limit do Sascar (1 chamada/vez/credencial, serializado via `SascarOrchestrator.AsyncQueue`), downtime do Sascar.
- **Segurança:** credenciais reais em `.env` (não em CI sem secret management). Local-only por enquanto.

## Mudanças

### 1. `tests/integration/sascar-real.spec.ts` (novo)

Suite gated:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { buildSascarClient, SascarOrchestrator } from '../../src/orchestrator/SascarOrchestrator';
import { getClientes } from '../../src/domain/clientes';
import { getVeiculos } from '../../src/domain/veiculos';
import { getMotoristas } from '../../src/domain/motoristas';
import { fetchAndUpsertPosicoes } from '../../src/domain/posicoes';
import { buildTestServer } from '../helpers/server';

const runReal = process.env.RUN_REAL_SASCAR_TESTS === '1';
const describeIf = runReal ? describe : describe.skip;

// Pula a suite inteira se faltar credencial, mesmo com RUN_REAL_SASCAR_TESTS=1.
const requiredEnv = ['SASCAR_WSDL_URL', 'SASCAR_USUARIO', 'SASCAR_SENHA', 'DATABASE_URL'];
const missingEnv = requiredEnv.filter((k) => !process.env[k]);
const describeIfReady = runReal && missingEnv.length === 0 ? describe : describe.skip;

describeIfReady('Sascar integration real (gated by RUN_REAL_SASCAR_TESTS=1)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sascar = buildSascarClient({
    usuario: process.env.SASCAR_USUARIO!,
    senha: process.env.SASCAR_SENHA!,
    wsdlUrl: process.env.SASCAR_WSDL_URL!,
  });
  const orch = new SascarOrchestrator(sascar);
  const ctx = {
    user: null,
    logger: console as unknown as any,
    db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
    orchestrator: orch,
  } as any;

  beforeEach(async () => {
    await pool.query('DELETE FROM posicoes');
    await pool.query('DELETE FROM sync_cursor');
    await pool.query('DELETE FROM veiculos_cache');
    await pool.query('DELETE FROM clientes_cache');
    await pool.query('DELETE FROM motoristas_cache');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('obterClientesV2 → clientes_cache → Query.clientes', async () => {
    const clientes = await getClientes(ctx, { quantidade: 5 });
    expect(clientes.length).toBeGreaterThan(0);
    expect(clientes[0]).toHaveProperty('idCliente');
    expect(clientes[0]).toHaveProperty('nome');
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM clientes_cache');
    expect(rows[0].c).toBeGreaterThan(0);

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ clientes(quantidade: 5) { idCliente nome } }' });
    expect(res.errors).toBeUndefined();
    expect((res.data as any).clientes.length).toBeGreaterThan(0);
  });

  it('obterVeiculos → veiculos_cache → Query.veiculos { idEquipamento }', async () => {
    const veiculos = await getVeiculos(ctx, { quantidade: 5 });
    expect(veiculos.length).toBeGreaterThan(0);
    expect(veiculos[0]).toHaveProperty('idVeiculo');
    expect(veiculos[0]).toHaveProperty('placa');
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM veiculos_cache');
    expect(rows[0].c).toBeGreaterThan(0);

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: '{ veiculos(quantidade: 5) { idVeiculo placa idEquipamento } }',
    });
    expect(res.errors).toBeUndefined();
    const sample = (res.data as any).veiculos[0];
    // idEquipamento vem como string (BigInt scalar) — pode ser null se rastreador sem chip
    if (sample.idEquipamento !== null) {
      expect(typeof sample.idEquipamento).toBe('string');
    }
  });

  it('obterMotoristas → motoristas_cache → Query.motoristas', async () => {
    const motoristas = await getMotoristas(ctx, { quantidade: 5 });
    expect(motoristas.length).toBeGreaterThan(0);
    expect(motoristas[0]).toHaveProperty('idMotorista');
    expect(motoristas[0]).toHaveProperty('nome');
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM motoristas_cache');
    expect(rows[0].c).toBeGreaterThan(0);

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ motoristas(quantidade: 5) { idMotorista nome } }' });
    expect(res.errors).toBeUndefined();
    expect((res.data as any).motoristas.length).toBeGreaterThan(0);
  });

  it('obterPacotePosicaoPorRangeJSON → posicoes → Veiculo.status via GraphQL', async () => {
    // Pega o primeiro veículo do cache (populado pelo test anterior OU re-popula)
    if ((await pool.query('SELECT COUNT(*)::int AS c FROM veiculos_cache')).rows[0].c === 0) {
      await getVeiculos(ctx, { quantidade: 1 });
    }
    const { rows: vrows } = await pool.query('SELECT id_veiculo FROM veiculos_cache LIMIT 1');
    if (vrows.length === 0) throw new Error('Nenhum veículo retornado pelo Sascar');
    const idVeiculo = vrows[0].id_veiculo;

    await fetchAndUpsertPosicoes(ctx, idVeiculo);
    const { rows: prows } = await pool.query('SELECT COUNT(*)::int AS c FROM posicoes WHERE id_veiculo = $1', [idVeiculo]);
    expect(prows[0].c).toBeGreaterThan(0);

    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({
      query: `query V($id: Int!) {
        veiculos(idVeiculo: $id) {
          idVeiculo
          placa
          status { bloqueado ignicaoLigada online idadeSegundos }
        }
      }`,
      variables: { id: idVeiculo },
    });
    expect(res.errors).toBeUndefined();
    const v = (res.data as any).veiculos[0];
    expect(v).toBeDefined();
    expect(v.status).toBeDefined();
    expect(v.status).toHaveProperty('bloqueado');
    expect(v.status).toHaveProperty('ignicaoLigada');
    expect(v.status).toHaveProperty('online');
  });
});
```

### 2. CHANGELOG (modificado)

Adicionar entrada em `[Unreleased]` → `### Added`:

> **test(integration)**: New `tests/integration/sascar-real.spec.ts` — suite gated por `RUN_REAL_SASCAR_TESTS=1` que bate no Sascar real (não mocka) e valida end-to-end os 4 métodos principais: `obterClientesV2`, `obterVeiculos`, `obterMotoristas`, `obterPacotePosicaoPorRangeJSON`. Por padrão a suite é `describe.skip` — roda só quando explicitamente habilitada (smoke job, debug local, validação de release). Cobertura de ~5-10min.

### 3. README (modificado)

Em "Testes" ou nova seção, adicionar nota:

> **Testes com Sascar real (gated):** o projeto inclui `tests/integration/sascar-real.spec.ts` que bate no Sascar real (sem mock). Por padrão é skipped. Para rodar:
>
> ```bash
> RUN_REAL_SASCAR_TESTS=1 npm test
> ```
>
> Requer credenciais Sascar válidas no `.env` (`SASCAR_USUARIO`, `SASCAR_SENHA`, `SASCAR_WSDL_URL`) e o container postgres rodando. Demora ~5-10min.

## Testes

A suíte adicionada é o próprio teste (não há cobertura indireta). Sem novos unit tests porque o caminho real é o que queremos exercitar.

## Fora de escopo

- Rodar a suite em CI (precisa secret management, fora do escopo local).
- Cobrir os 63 métodos SOAP do Sascar (apenas os 4 mais usados).
- Asserts profundos em cada campo retornado (só spot-checks; asserts profundos ficariam frágeis conforme Sascar evolui schema).
- TUI smoke com Sascar real (precisa rebuild container; fica como follow-up).
- Mocks parametrizados de payload Sascar para testes de regressão (já existem em `posicoes.spec.ts` e `posicoes-bigint.spec.ts` via nock).

## Riscos

- **Downstream breakage:** se Sascar mudar schema e a feature quebrar, a suite detecta. **Mitigação:** roda em smoke job diário, alerta se falhar.
- **Rate limit:** Sascar serializa 1 chamada/vez/credencial. O `SascarOrchestrator.AsyncQueue` garante isso. Sem pressão de rate limit nos 4 testes.
- **Cleanup:** `beforeEach` faz DELETE defensivo. Se 2 runs paralelos, podem conflitar (idempotente no fim, mas com INSERT intermediário). **Mitigação:** documentar que não rodar em paralelo.
- **Credenciais em log:** os logs do Sascar SDK podem vazar credenciais. **Mitigação:** o logger já tem redaction de `senha`/`password` (ver `src/lib/logger.ts`).

## Verificação

- `npm test` (sem env var) → 52+1 suites / 172+4 tests (a nova suite é `describe.skip` por padrão — 4 testes marcados como skipped, suites existentes inalteradas). Sem regressão.
- `RUN_REAL_SASCAR_TESTS=1 npm test` → 53 suites, com a nova suite rodando. Os 4 testes devem passar (assumindo Sascar disponível e credenciais válidas).
- `npm run typecheck` → exit 0.
- `npm run lint` → exit 0.

## Follow-up

- **CI integration:** mover credenciais Sascar para secrets do GitHub Actions; rodar em cron noturno; alertar via Slack/email se falhar. Fora do escopo.
- **Métricas:** adicionar Sascar latency/erro dashboards.
- **TUI smoke:** rebuild container, rodar `npm run tui` com Sascar real, verificar que a coluna `status` renderiza corretamente.
