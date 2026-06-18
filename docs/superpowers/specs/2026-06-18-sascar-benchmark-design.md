# Sascar Benchmark Script — design

**Data:** 2026-06-18
**Escopo:** feature — adiciona `scripts/benchmark-sascar.ts` (script de benchmark/perf one-shot) e `tests/integration/sascar-benchmark.spec.ts` (smoke test gated). Mede o tempo de chamadas Sascar reais em 3 grupos: blackbox, CAN bus, posições históricas.
**Relacionado:** complementa `tests/integration/sascar-real.spec.ts` (que valida o pipeline de cache/posições). Este benchmark é sobre extração massiva de dados com medição de tempo.

## Contexto

O `sascar-real.spec.ts` validou que o pipeline SDK → orchestrator → DB → GraphQL funciona. Mas **não mediu** o tempo de chamadas SOAP em escala, nem cobriu os endpoints de blackbox/CAN bus/histórico.

Para estimar viabilidade de features que dependem de Sascar (ex: dashboard de eventos de caixa preta, alerta de jamming, relatório mensal de quilometragem), precisamos de dados reais sobre:
- Latência de cada método Sascar
- Custo de iterar por N veículos
- Custo de iterar por N janelas temporais (especialmente para blackbox, que é limitado a 10min por chamada)

A `sascar-sdk` expõe os métodos relevantes:
- `solicitarEventosCaixaPreta(idVeiculo, placa, dataPosicaoInicial, dataPosicaoFinal)` — blackbox, **janela máxima de 10min por chamada** (per `sascar-sdk/README.md`).
- `obterDadosAdicionais(idVeiculo)` — telemetria/atuadores (cobre "operações geral da cam" = CAN bus + dados adicionais do veículo).
- `obterPacotePosicaoHistorico(dataInicio, dataFinal, idVeiculo)` — posições históricas (range arbitrário).

A `SascarOrchestrator` serializa 1 chamada/vez/credencial via `AsyncQueue`, então o tempo total é linear com o número de chamadas.

## Decisão de escopo (com o usuário)

**3 grupos de testes, todos com iter sobre TODOS os veículos do `veiculos_cache`:**

1. **Grupo 1: Blackbox desde início da semana.** Para cada veículo, itera janelas de 10min desde `Monday 00:00 UTC` da semana atual até `now`. Cada janela = 1 chamada `solicitarEventosCaixaPorRange` (ou similar) com `dataPosicaoInicial` e `dataPosicaoFinal`. Para 1 veículo, ~1008 janelas; para N veículos, N × 1008 chamadas.
2. **Grupo 2: CAN bus.** Para cada veículo, 1 chamada `obterDadosAdicionais(idVeiculo)`. Cobre telemetria/atuadores da CAN.
3. **Grupo 3: Posições do mês passado até hoje.** Para cada veículo, 1 chamada `obterPacotePosicaoHistorico(dataInicio=1st of last month UTC, dataFim=now UTC, idVeiculo)`. Pode retornar centenas de posições por veículo.

**Configurabilidade via env vars** (evita o caso impossível de 50k+ chamadas no primeiro run):
- `BENCHMARK_VEHICLE_LIMIT` (default 5) — limita N de veículos.
- `BENCHMARK_DAYS_BACK` (default 7) — range do Grupo 1 (blackbox).
- `BENCHMARK_MONTH_DAYS_BACK` (default 35) — range do Grupo 3 (posições históricas; ~5 semanas cobre o "mês passado").

**Dois entregáveis:**
- `scripts/benchmark-sascar.ts` (one-shot, fora do test suite) — script CLI.
- `tests/integration/sascar-benchmark.spec.ts` (smoke test gated por `RUN_BENCHMARK_SMOKE=1`) — valida pipeline com 1 veículo × 1 janela.

**Saída:** console table com `chalk` para cores + arquivo de texto em `reports/benchmark-sascar-YYYY-MM-DD-HHMMSS.txt`.

Justificativas:
- **Env vars limitam o custo** mas mantêm a possibilidade de "rodar tudo" setando limites altos.
- **Smoke test gated** evita custo no CI; só roda manualmente.
- **Console + arquivo** dão o melhor de 2 mundos: inspeção imediata (console) e preservação (arquivo).
- **Sem asserts no smoke test** — só valida que retorna dados, não mede tempo (que é o propósito do script).

## Mudanças

### 1. `scripts/benchmark-sascar.ts` (novo)

Script CLI standalone. Não usa Jest. Estrutura:

```typescript
#!/usr/bin/env node
/* eslint-disable no-console */
import { Pool } from 'pg';
import chalk from 'chalk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSascarClient, SascarOrchestrator } from '../src/orchestrator/SascarOrchestrator';

interface BenchmarkConfig {
  vehicleLimit: number;
  blackboxDaysBack: number;
  historyDaysBack: number;
  sascarUsuario: string;
  sascarSenha: string;
  sascarWsdlUrl: string;
  databaseUrl: string;
}

interface OperationResult {
  group: string;
  vehicle: number;
  detail: string;
  durationMs: number;
  status: 'ok' | 'error';
  error?: string;
  count?: number;
}

function loadConfig(): BenchmarkConfig {
  return {
    vehicleLimit: Number(process.env.BENCHMARK_VEHICLE_LIMIT ?? 5),
    blackboxDaysBack: Number(process.env.BENCHMARK_DAYS_BACK ?? 7),
    historyDaysBack: Number(process.env.BENCHMARK_MONTH_DAYS_BACK ?? 35),
    sascarUsuario: process.env.SASCAR_USUARIO ?? '',
    sascarSenha: process.env.SASCAR_SENHA ?? '',
    sascarWsdlUrl: process.env.SASCAR_WSDL_URL ?? '',
    databaseUrl: process.env.DATABASE_URL ?? '',
  };
}

function validateConfig(cfg: BenchmarkConfig): void {
  const missing = [
    ['SASCAR_USUARIO', cfg.sascarUsuario],
    ['SASCAR_SENHA', cfg.sascarSenha],
    ['SASCAR_WSDL_URL', cfg.sascarWsdlUrl],
    ['DATABASE_URL', cfg.databaseUrl],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Variáveis faltando: ${missing.join(', ')}`);
  }
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  const durationMs = Date.now() - start;
  return { result, durationMs };
}

function round(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function formatTable(rows: OperationResult[]): string {
  // Tabela formatada com chalk
  // ...
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  validateConfig(cfg);
  
  console.log(chalk.bold(`\n=== Sascar Benchmark ===\n`));
  console.log(chalk.gray(`Veículos: até ${cfg.vehicleLimit}`));
  console.log(chalk.gray(`Blackbox: últimos ${cfg.blackboxDaysBack} dias (janelas de 10min)`));
  console.log(chalk.gray(`Posições: últimos ${cfg.historyDaysBack} dias\n`));
  
  const sascar = buildSascarClient({
    usuario: cfg.sascarUsuario,
    senha: cfg.sascarSenha,
    wsdlUrl: cfg.sascarWsdlUrl,
  });
  const orch = new SascarOrchestrator(sascar);
  const pool = new Pool({ connectionString: cfg.databaseUrl });
  
  // Carrega veículos do cache
  const { rows: vehicles } = await pool.query<{ id_veiculo: number; placa: string }>(
    `SELECT id_veiculo, placa FROM veiculos_cache ORDER BY id_veiculo LIMIT $1`,
    [cfg.vehicleLimit],
  );
  console.log(chalk.cyan(`Carregados ${vehicles.length} veículos do cache.\n`));
  
  const results: OperationResult[] = [];
  
  // ====== Grupo 1: Blackbox desde início da semana ======
  console.log(chalk.bold(`\n[Grupo 1] Blackbox desde início da semana\n`));
  const weekStart = startOfWeek(); // Monday 00:00 UTC
  const now = new Date();
  const totalWindows = Math.ceil((now.getTime() - weekStart.getTime()) / (10 * 60 * 1000));
  console.log(chalk.gray(`${totalWindows} janelas de 10min desde ${weekStart.toISOString()}\n`));
  
  for (const v of vehicles) {
    for (let i = 0; i < totalWindows; i++) {
      const windowStart = new Date(weekStart.getTime() + i * 10 * 60 * 1000);
      const windowEnd = new Date(Math.min(windowStart.getTime() + 10 * 60 * 1000, now.getTime()));
      try {
        const { durationMs } = await time('blackbox', () =>
          orch.call('solicitarEventosCaixaPreta', [v.id_veiculo, v.placa, fmtSascar(windowStart), fmtSascar(windowEnd)]),
        );
        results.push({ group: 'blackbox', vehicle: v.id_veiculo, detail: `${fmtShort(windowStart)} - ${fmtShort(windowEnd)}`, durationMs, status: 'ok' });
        process.stdout.write(chalk.green('.'));
      } catch (err: any) {
        results.push({ group: 'blackbox', vehicle: v.id_veiculo, detail: `${fmtShort(windowStart)} - ${fmtShort(windowEnd)}`, durationMs: 0, status: 'error', error: err.message });
        process.stdout.write(chalk.red('E'));
      }
    }
  }
  console.log();
  
  // ====== Grupo 2: CAN bus (obterDadosAdicionais) ======
  console.log(chalk.bold(`\n[Grupo 2] CAN bus (obterDadosAdicionais)\n`));
  for (const v of vehicles) {
    try {
      const { result, durationMs } = await time('can', () =>
        orch.call('obterDadosAdicionais', [v.id_veiculo]),
      );
      const count = Array.isArray(result) ? result.length : 0;
      results.push({ group: 'can', vehicle: v.id_veiculo, detail: 'dados adicionais', durationMs, status: 'ok', count });
      process.stdout.write(chalk.green('.'));
    } catch (err: any) {
      results.push({ group: 'can', vehicle: v.id_veiculo, detail: 'dados adicionais', durationMs: 0, status: 'error', error: err.message });
      process.stdout.write(chalk.red('E'));
    }
  }
  console.log();
  
  // ====== Grupo 3: Posições do mês passado ======
  console.log(chalk.bold(`\n[Grupo 3] Posições históricas (mês passado)\n`));
  const historyStart = new Date(now.getTime() - cfg.historyDaysBack * 24 * 60 * 60 * 1000);
  for (const v of vehicles) {
    try {
      const { result, durationMs } = await time('history', () =>
        orch.call('obterPacotePosicaoHistorico', [fmtSascar(historyStart), fmtSascar(now), v.id_veiculo]),
      );
      const count = Array.isArray(result) ? result.length : 0;
      results.push({ group: 'history', vehicle: v.id_veiculo, detail: `${cfg.historyDaysBack} dias`, durationMs, status: 'ok', count });
      process.stdout.write(chalk.green('.'));
    } catch (err: any) {
      results.push({ group: 'history', vehicle: v.id_veiculo, detail: `${cfg.historyDaysBack} dias`, durationMs: 0, status: 'error', error: err.message });
      process.stdout.write(chalk.red('E'));
    }
  }
  console.log();
  
  // ====== Relatório ======
  console.log(formatTable(results));
  const totalsByGroup = groupTotals(results);
  console.log(formatTotals(totalsByGroup));
  
  // Salva em arquivo
  const reportDir = join(process.cwd(), 'reports');
  mkdirSync(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = join(reportDir, `benchmark-sascar-${ts}.txt`);
  writeFileSync(reportPath, stripAnsi(formatTable(results) + '\n\n' + formatTotals(totalsByGroup)));
  console.log(chalk.gray(`\nRelatório salvo em: ${reportPath}\n`));
  
  await pool.end();
}

main().catch((err) => {
  console.error(chalk.red('Erro fatal:'), err);
  process.exit(1);
});
```

Estrutura de output (console):
```
=== Sascar Benchmark ===
Veículos: até 5
Blackbox: últimos 7 dias (janelas de 10min)
Posições: últimos 35 dias

Carregados 5 veículos do cache.

[Grupo 1] Blackbox desde início da semana
1008 janelas de 10min desde 2026-06-16T00:00:00Z

[Grupo 2] CAN bus (obterDadosAdicionais)
.....

[Grupo 3] Posições históricas (mês passado)
.....

┌─────────────┬──────────┬─────────────────────────────────────┬──────────┬────────┐
│ Grupo       │ Veículo  │ Detalhe                            │ Duração  │ Status │
├─────────────┼──────────┼─────────────────────────────────────┼──────────┼────────┤
│ blackbox    │ 100      │ 2026-06-16 00:00 - 2026-06-16 00:10│ 1234ms   │ ok     │
│ blackbox    │ 100      │ 2026-06-16 00:10 - 2026-06-16 00:20│ 1456ms   │ ok     │
│ ...                                                                          │
├─────────────┼──────────┼─────────────────────────────────────┼──────────┼────────┤
│ can         │ 100      │ dados adicionais                   │ 234ms    │ ok     │
│ can         │ 200      │ dados adicionais                   │ 198ms    │ ok     │
│ ...                                                                          │
├─────────────┼──────────┼─────────────────────────────────────┼──────────┼────────┤
│ history     │ 100      │ 35 dias                             │ 5678ms   │ ok     │
│ ...                                                                          │
└─────────────┴──────────┴─────────────────────────────────────┴──────────┴────────┘

Totais por grupo:
  blackbox: 5030 chamadas, 5 err, 1234ms total, 245ms avg
  can:      5 chamadas, 0 err, 1234ms total, 246ms avg
  history:  5 chamadas, 0 err, 28390ms total, 5678ms avg

Total geral: 5040 chamadas, 5 err, 30858ms total
```

### 2. `tests/integration/sascar-benchmark.spec.ts` (novo)

Smoke test gated. Roda só com `RUN_BENCHMARK_SMOKE=1`. Valida pipeline com 1 veículo × 1 janela:

```typescript
import { Pool } from 'pg';

const runSmoke = process.env.RUN_BENCHMARK_SMOKE === '1';
const describeIf = runSmoke ? describe : describe.skip;

describeIf('Sascar benchmark smoke (gated by RUN_BENCHMARK_SMOKE=1)', () => {
  let pool: Pool;
  let ctx: any;
  let sascarMod: any;
  let getVeiculos: any;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    sascarMod = await import('../../src/orchestrator/SascarOrchestrator');
    const veiculosMod = await import('../../src/domain/veiculos');
    getVeiculos = veiculosMod.getVeiculos;
    const sascar = sascarMod.buildSascarClient({
      usuario: process.env.SASCAR_USUARIO!,
      senha: process.env.SASCAR_SENHA!,
      wsdlUrl: process.env.SASCAR_WSDL_URL!,
    });
    const orch = new sascarMod.SascarOrchestrator(sascar);
    ctx = {
      user: null,
      logger: console as any,
      db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
      orchestrator: orch,
    };
  });

  afterAll(async () => {
    await pool.end();
  });

  it('blackbox: 1 veículo, 1 janela retorna dados', async () => {
    await getVeiculos(ctx, { quantidade: 1 });
    const { rows: vrows } = await pool.query('SELECT id_veiculo, placa FROM veiculos_cache LIMIT 1');
    if (vrows.length === 0) throw new Error('Nenhum veículo no cache');
    const { id_veiculo, placa } = vrows[0];

    const now = new Date();
    const windowStart = new Date(now.getTime() - 10 * 60 * 1000);
    const result = await ctx.orchestrator.call('solicitarEventosCaixaPreta', [id_veiculo, placa, fmtSascar(windowStart), fmtSascar(now)]);
    expect(result).toBeDefined();
  });

  it('can bus: 1 veículo retorna dados adicionais', async () => {
    const { rows: vrows } = await pool.query('SELECT id_veiculo FROM veiculos_cache LIMIT 1');
    if (vrows.length === 0) throw new Error('Nenhum veículo no cache');
    const { id_veiculo } = vrows[0];

    const result = await ctx.orchestrator.call('obterDadosAdicionais', [id_veiculo]);
    expect(result).toBeDefined();
  });

  it('history: 1 veículo retorna posições', async () => {
    const { rows: vrows } = await pool.query('SELECT id_veiculo FROM veiculos_cache LIMIT 1');
    if (vrows.length === 0) throw new Error('Nenhum veículo no cache');
    const { id_veiculo } = vrows[0];

    const now = new Date();
    const historyStart = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
    const result = await ctx.orchestrator.call('obterPacotePosicaoHistorico', [fmtSascar(historyStart), fmtSascar(now), id_veiculo]);
    expect(result).toBeDefined();
  });
});
```

### 3. `package.json` (modificado)

Adicionar script:
```json
{
  "scripts": {
    "benchmark:sascar": "tsx scripts/benchmark-sascar.ts"
  }
}
```

### 4. `CHANGELOG.md` (modificado)

Adicionar entrada em `[Unreleased]` → `### Added`:

> **feat(scripts)**: New `scripts/benchmark-sascar.ts` — script CLI para benchmark de chamadas Sascar reais em 3 grupos (blackbox desde início da semana, CAN bus, posições do mês passado). Configurável via `BENCHMARK_VEHICLE_LIMIT` (default 5), `BENCHMARK_DAYS_BACK` (default 7), `BENCHMARK_MONTH_DAYS_BACK` (default 35). Imprime tabela no terminal e salva relatório em `reports/benchmark-sascar-*.txt`. Use `npm run benchmark:sascar`.
> **test(integration)**: New `tests/integration/sascar-benchmark.spec.ts` — smoke test gated por `RUN_BENCHMARK_SMOKE=1` que valida 1 veículo × 1 chamada para cada um dos 3 grupos. Por padrão skipped.

### 5. `README.md` (modificado)

Adicionar nota na seção "Testes com Sascar real (gated)":

> **Benchmark massivo:** use `npm run benchmark:sascar` para rodar o benchmark que itera por todos os veículos do `veiculos_cache` em 3 grupos (blackbox, CAN bus, posições históricas). Demorado — começa com `BENCHMARK_VEHICLE_LIMIT=5` (default). Salva relatório em `reports/`.

## Testes

Os entregáveis são o próprio benchmark e o smoke test. Sem cobertura indireta.

## Fora de escopo

- CI integration (precisa secret management).
- Paralelismo de chamadas (Sascar serializa por credencial).
- Compressão de janelas de 10min (cada janela é 1 chamada separada).
- Persistência dos dados retornados (o benchmark mede tempo, não extrai).
- Cancelamento gracioso (Ctrl+C mid-run).

## Riscos

- **Muito lento:** para 50 veículos × 1008 janelas, ~70 horas. Mitigação: `BENCHMARK_VEHICLE_LIMIT=5` por default.
- **Rate limit Sascar:** `SascarOrchestrator.AsyncQueue` serializa 1 chamada/vez/credencial. Sem pressão de rate limit.
- **Credenciais em log:** o logger pode vazar. Mitigação: chalk apenas em `console.log` (não passa pelo logger pino).
- **Arquivo de relatório em `reports/`:** não é commitável (deveria estar no `.gitignore`).

## Verificação

- `npm run typecheck` → exit 0.
- `npm run lint` → exit 0.
- `npm run benchmark:sascar` (com `BENCHMARK_VEHICLE_LIMIT=1`, `BENCHMARK_DAYS_BACK=1`) → roda em <1min, imprime tabela, salva relatório.
- `RUN_BENCHMARK_SMOKE=1 npm test -- sascar-benchmark` → 3 passing.
- `npm test` (sem env var) → sascar-benchmark skipped, sem regressão.

## Follow-up

- Adicionar `reports/` ao `.gitignore`.
- Suporte a `--output json` para parsing programático.
- Adicionar `BENCHMARK_PARALLEL_VEHICLES` (paralelizar entre veículos, mantendo serialização intra-credencial).
- Métricas de Sascar latency/erro dashboards.
