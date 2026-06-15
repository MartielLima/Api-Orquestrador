import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../components/Table';
import { Spinner } from '../components/Spinner';
import { useApi } from '../hooks/useApi';
import { useInterval } from '../hooks/useInterval';
import { formatRelative } from '../lib/format';
import { Q_REQUEST_LOG } from '../api/queries';

interface LogEntry {
  id: string;
  method: string;
  source: string;
  status: string;
  cacheHit: boolean;
  latencyMs: number | null;
  createdAt: string;
  error: string | null;
}

type StatusFilter = 'all' | 'ok' | 'error';
const METHODS = ['all', 'obterClientesV2', 'obterVeiculos', 'obterMotoristas', 'obterPosicoes', 'obterDeltaTelemetria'];

export function LogsView(): React.ReactElement {
  const { api } = useApi();
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [follow, setFollow] = useState<boolean>(true);
  const [limit] = useState<number>(100);

  const load = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const data = await api.request<{ requestLog: LogEntry[] }>(Q_REQUEST_LOG, {
        limit,
        method: method === 'all' ? undefined : method,
      });
      let r = data.requestLog;
      if (status !== 'all') r = r.filter((x: LogEntry) => x.status === status);
      setRows(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api, limit, method, status]);

  useEffect(() => { void load(); }, [load]);
  useInterval(() => { if (follow) void load(); }, 2000);

  useInput((input, key) => {
    if (input === 'r' || input === 's') { void load(); return; }
    if (input === 's' && !key.ctrl) setFollow((f) => !f);
    if (input === 'x') { setMethod('all'); setStatus('all'); }
    if (input === 'm') {
      const idx = METHODS.indexOf(method);
      setMethod(METHODS[(idx + 1) % METHODS.length]!);
      return;
    }
    if (input === 'f') {
      setStatus((s) => (s === 'all' ? 'ok' : s === 'ok' ? 'error' : 'all'));
    }
  });

  if (loading && rows.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}><Text bold color="cyan">Logs</Text></Box>
        <Spinner label="carregando..." />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">Logs</Text>
        <Text dimColor>
          {rows.length} entries · {follow ? 'follow ON' : 'follow OFF'} · auto-refresh 2s
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>filtros: </Text>
        <Text>method=<Text color="cyan">{method}</Text></Text>
        <Text> · </Text>
        <Text>status=<Text color="cyan">{status}</Text></Text>
        <Text dimColor>  ([m]ethod, [f]status, [s]follow, [x]clear, [r]efresh)</Text>
      </Box>
      {error ? <Text color="red">✗ {error}</Text> : null}
      {rows.length === 0 ? (
        <Text dimColor>nenhum log no recorte</Text>
      ) : (
        <Table
          data={rows.slice(0, 200).map((e) => ({
            when: formatRelative(e.createdAt),
            method: e.method,
            source: e.source,
            status: e.status,
            cache: e.cacheHit ? 'HIT' : 'miss',
            ms: e.latencyMs == null ? '—' : String(e.latencyMs),
            error: e.error ?? '',
          }))}
        />
      )}
    </Box>
  );
}
