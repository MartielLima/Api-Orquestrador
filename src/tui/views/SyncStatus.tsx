import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../components/Table';
import { Spinner } from '../components/Spinner';
import { useApi } from '../hooks/useApi';
import { useInterval } from '../hooks/useInterval';
import { formatRelative } from '../lib/format';
import { Q_SYNC_STATUS } from '../api/queries';

interface SyncRow {
  method: string;
  idVeiculo: number;
  lastIdPacote: number | null;
  lastSyncedAt: string;
}

export function SyncStatusView(): React.ReactElement {
  const { api } = useApi();
  const [rows, setRows] = useState<SyncRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const data = await api.request<{ syncStatus: SyncRow[] }>(Q_SYNC_STATUS);
      setRows(data.syncStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);
  useInterval(() => { void load(); }, 10_000);

  useInput((input) => { if (input === 'r') void load(); });

  if (loading) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}><Text bold color="cyan">Sync status</Text></Box>
        <Spinner label="carregando..." />
      </Box>
    );
  }
  if (error) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}><Text bold color="cyan">Sync status</Text></Box>
        <Text color="red">✗ {error}</Text>
        <Text dimColor>[r] tentar novamente</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">Sync status</Text>
        <Text dimColor>{rows.length} cursor(es) · auto-refresh 10s</Text>
      </Box>
      {rows.length === 0 ? (
        <Text dimColor>nenhum cursor registrado</Text>
      ) : (
        <Table
          data={rows.map((r) => ({
            method: r.method,
            idVeiculo: String(r.idVeiculo),
            lastIdPacote: r.lastIdPacote == null ? '—' : String(r.lastIdPacote),
            lastSyncedAt: formatRelative(r.lastSyncedAt),
          }))}
        />
      )}
    </Box>
  );
}
