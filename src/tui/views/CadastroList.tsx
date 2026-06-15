import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../components/Table';
import { Spinner } from '../components/Spinner';
import { useApi } from '../hooks/useApi';
import { useInterval } from '../hooks/useInterval';
import { useToast } from '../hooks/useToast';
import { formatDate, formatRelative } from '../lib/format';
import { Q_CLIENTES, Q_VEICULOS, Q_MOTORISTAS } from '../api/queries';

export type CadastroQuery =
  | { kind: 'clientes'; variables?: { quantidade?: number } }
  | { kind: 'veiculos'; variables?: { quantidade?: number } }
  | { kind: 'motoristas'; variables?: { quantidade?: number } };

export interface CadastroColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  render: (row: Record<string, unknown>) => string;
}

interface Props {
  title: string;
  query: CadastroQuery;
  columns: CadastroColumn[];
  pollMs?: number;
  emptyMessage?: string;
}

const QUERIES = {
  clientes: Q_CLIENTES,
  veiculos: Q_VEICULOS,
  motoristas: Q_MOTORISTAS,
} as const;

export function CadastroList({ title, query, columns, pollMs = 60_000, emptyMessage }: Props): React.ReactElement {
  const { api } = useApi();
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const data = await api.request<{ [k: string]: Record<string, unknown>[] }>(
        QUERIES[query.kind],
        query.variables,
      );
      const key = query.kind;
      setRows(data[key] ?? []);
      setLastSync(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error(`erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [api, query, toast]);

  useEffect(() => { void load(); }, [load]);
  useInterval(() => { void load(); }, pollMs);

  useInput((input) => {
    if (input === 'r') { void load(); }
  });

  if (loading && rows.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}><Text bold color="cyan">{title}</Text></Box>
        <Spinner label={`carregando ${title.toLowerCase()}...`} />
      </Box>
    );
  }
  if (error && rows.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}><Text bold color="cyan">{title}</Text></Box>
        <Text color="red">✗ {error}</Text>
        <Text dimColor>[r] tentar novamente</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">{title}</Text>
        <Text dimColor>
          {rows.length} · {lastSync ? `sync ${formatRelative(lastSync)}` : 'nunca'}
        </Text>
      </Box>
      {rows.length === 0 ? (
        <Text dimColor>{emptyMessage ?? `nenhum ${title.toLowerCase()}`}</Text>
      ) : (
        <Table
          data={rows.map((r) => {
            const out: Record<string, string> = {};
            for (const c of columns) out[c.key] = c.render(r);
            return out;
          })}
        />
      )}
    </Box>
  );
}
