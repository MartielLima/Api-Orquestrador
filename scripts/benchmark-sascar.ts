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
  group: 'blackbox' | 'can' | 'history';
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
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Variáveis faltando: ${missing.join(', ')}`);
  }
}

async function time<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  const durationMs = Date.now() - start;
  return { result, durationMs };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function startOfWeek(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function fmtSascar(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function fmtShort(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

function formatTable(rows: OperationResult[]): string {
  const lines: string[] = [];
  const header = ['Grupo', 'Veículo', 'Detalhe', 'Duração', 'Status'];
  const widths = [10, 8, 35, 10, 8];
  const pad = (s: string, w: number) => (s.length > w ? s.slice(0, w - 1) + '…' : s.padEnd(w));

  lines.push(chalk.bold('┌' + '─'.repeat(widths.reduce((a, b) => a + b + 3, 1)) + '┐'));
  lines.push(
    chalk.bold('│') +
      ' ' +
      header.map((h, i) => chalk.cyan(pad(h, widths[i]))).join(' │ ') +
      ' │',
  );
  lines.push(chalk.bold('├' + '─'.repeat(widths.reduce((a, b) => a + b + 3, 1)) + '┤'));

  let lastGroup = '';
  for (const r of rows) {
    if (lastGroup && r.group !== lastGroup) {
      lines.push('├' + '─'.repeat(widths.reduce((a, b) => a + b + 3, 1)) + '┤');
    }
    lastGroup = r.group;
    const cells = [
      pad(r.group, widths[0]),
      pad(String(r.vehicle), widths[1]),
      pad(r.detail, widths[2]),
      pad(`${r.durationMs}ms`, widths[3]),
      r.status === 'ok'
        ? chalk.green(pad('ok', widths[4]))
        : chalk.red(pad('err', widths[4])),
    ];
    lines.push('│ ' + cells.join(' │ ') + ' │');
  }
  lines.push('└' + '─'.repeat(widths.reduce((a, b) => a + b + 3, 1)) + '┘');
  return lines.join('\n');
}

interface GroupTotal {
  group: string;
  count: number;
  errors: number;
  totalMs: number;
  avgMs: number;
}

function groupTotals(rows: OperationResult[]): GroupTotal[] {
  const groups = new Map<string, OperationResult[]>();
  for (const r of rows) {
    if (!groups.has(r.group)) groups.set(r.group, []);
    groups.get(r.group)!.push(r);
  }
  const totals: GroupTotal[] = [];
  for (const [group, items] of groups) {
    const okItems = items.filter((i) => i.status === 'ok');
    const totalMs = okItems.reduce((s, i) => s + i.durationMs, 0);
    totals.push({
      group,
      count: items.length,
      errors: items.length - okItems.length,
      totalMs,
      avgMs: okItems.length > 0 ? totalMs / okItems.length : 0,
    });
  }
  return totals;
}

function formatTotals(totals: GroupTotal[]): string {
  const lines: string[] = ['', chalk.bold('Totais por grupo:')];
  for (const t of totals) {
    lines.push(
      `  ${chalk.cyan(t.group)}: ${t.count} chamadas, ${t.errors} err, ${t.totalMs}ms total, ${Math.round(t.avgMs)}ms avg`,
    );
  }
  const totalMs = totals.reduce((s, t) => s + t.totalMs, 0);
  const totalCount = totals.reduce((s, t) => s + t.count, 0);
  const totalErr = totals.reduce((s, t) => s + t.errors, 0);
  lines.push(
    chalk.bold(`\nTotal geral: ${totalCount} chamadas, ${totalErr} err, ${totalMs}ms total`),
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  validateConfig(cfg);

  console.log(chalk.bold(`\n=== Sascar Benchmark ===\n`));
  console.log(chalk.gray(`Veículos: até ${cfg.vehicleLimit}`));
  console.log(chalk.gray(`Blackbox: últimos ${cfg.blackboxDaysBack} dias (janelas de 10min)`));
  console.log(chalk.gray(`Posições: últimos ${cfg.historyDaysBack} dias`));

  const sascar = buildSascarClient({
    usuario: cfg.sascarUsuario,
    senha: cfg.sascarSenha,
    wsdlUrl: cfg.sascarWsdlUrl,
  });
  const orch = new SascarOrchestrator(sascar);
  const pool = new Pool({ connectionString: cfg.databaseUrl });

  const { rows: vehicles } = await pool.query<{ id_veiculo: number; placa: string }>(
    `SELECT id_veiculo, placa FROM veiculos_cache ORDER BY id_veiculo LIMIT $1`,
    [cfg.vehicleLimit],
  );
  console.log(chalk.cyan(`\nCarregados ${vehicles.length} veículos do cache.\n`));

  const results: OperationResult[] = [];
  const now = new Date();

  console.log(chalk.bold(`[Grupo 1] Blackbox desde início da semana`));
  const blackboxStart = new Date(now.getTime() - cfg.blackboxDaysBack * 24 * 60 * 60 * 1000);
  const totalWindows = Math.ceil((now.getTime() - blackboxStart.getTime()) / (10 * 60 * 1000));
  console.log(
    chalk.gray(`  ${totalWindows} janelas de 10min desde ${blackboxStart.toISOString()}\n`),
  );
  for (const v of vehicles) {
    for (let i = 0; i < totalWindows; i++) {
      const ws = new Date(blackboxStart.getTime() + i * 10 * 60 * 1000);
      const we = new Date(Math.min(ws.getTime() + 10 * 60 * 1000, now.getTime()));
      try {
        const { durationMs } = await time(() =>
          orch.call('solicitarEventosCaixaPreta', [
            v.id_veiculo,
            v.placa,
            fmtSascar(ws),
            fmtSascar(we),
          ]),
        );
        results.push({
          group: 'blackbox',
          vehicle: v.id_veiculo,
          detail: `${fmtShort(ws)} - ${fmtShort(we)}`,
          durationMs,
          status: 'ok',
        });
        process.stdout.write(chalk.green('.'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          group: 'blackbox',
          vehicle: v.id_veiculo,
          detail: `${fmtShort(ws)} - ${fmtShort(we)}`,
          durationMs: 0,
          status: 'error',
          error: msg,
        });
        process.stdout.write(chalk.red('E'));
      }
    }
  }
  console.log();

  console.log(chalk.bold(`\n[Grupo 2] CAN bus (obterDadosAdicionais)`));
  for (const v of vehicles) {
    try {
      const { result, durationMs } = await time(() =>
        orch.call('obterDadosAdicionais', [v.id_veiculo]),
      );
      const count = Array.isArray(result) ? result.length : 0;
      results.push({
        group: 'can',
        vehicle: v.id_veiculo,
        detail: 'dados adicionais',
        durationMs,
        status: 'ok',
        count,
      });
      process.stdout.write(chalk.green('.'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        group: 'can',
        vehicle: v.id_veiculo,
        detail: 'dados adicionais',
        durationMs: 0,
        status: 'error',
        error: msg,
      });
      process.stdout.write(chalk.red('E'));
    }
  }
  console.log();

  console.log(chalk.bold(`\n[Grupo 3] Posições históricas (mês passado)`));
  const historyStart = new Date(now.getTime() - cfg.historyDaysBack * 24 * 60 * 60 * 1000);
  for (const v of vehicles) {
    try {
      const { result, durationMs } = await time(() =>
        orch.call('obterPacotePosicaoHistorico', [
          fmtSascar(historyStart),
          fmtSascar(now),
          v.id_veiculo,
        ]),
      );
      const count = Array.isArray(result) ? result.length : 0;
      results.push({
        group: 'history',
        vehicle: v.id_veiculo,
        detail: `${cfg.historyDaysBack} dias`,
        durationMs,
        status: 'ok',
        count,
      });
      process.stdout.write(chalk.green('.'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        group: 'history',
        vehicle: v.id_veiculo,
        detail: `${cfg.historyDaysBack} dias`,
        durationMs: 0,
        status: 'error',
        error: msg,
      });
      process.stdout.write(chalk.red('E'));
    }
  }
  console.log();

  console.log('\n' + formatTable(results));
  console.log(formatTotals(groupTotals(results)));

  const reportDir = join(process.cwd(), 'reports');
  mkdirSync(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = join(reportDir, `benchmark-sascar-${ts}.txt`);
  const reportContent = stripAnsi(formatTable(results) + '\n' + formatTotals(groupTotals(results)));
  writeFileSync(reportPath, reportContent);
  console.log(chalk.gray(`\nRelatório salvo em: ${reportPath}\n`));

  await pool.end();
}

main().catch((err) => {
  console.error(chalk.red('Erro fatal:'), err);
  process.exit(1);
});
