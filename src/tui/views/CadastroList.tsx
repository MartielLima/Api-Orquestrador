import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../components/Table';
import { Spinner } from '../components/Spinner';
import { Field } from '../components/Form';
import { DetailModal } from '../components/DetailModal';
import { useApi } from '../hooks/useApi';
import { useInterval } from '../hooks/useInterval';
import { useToast } from '../hooks/useToast';
import { formatDate, formatRelative } from '../lib/format';
import { formatGraphQLError } from '../lib/formatError';
import { Q_CLIENTES, Q_VEICULOS, Q_MOTORISTAS } from '../api/queries';

export type CadastroQuery =
  | { kind: 'clientes'; idField: 'idCliente' }
  | { kind: 'veiculos'; idField: 'idVeiculo' }
  | { kind: 'motoristas'; idField: 'idMotorista' };

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

const QUERY_KEY = {
  clientes: 'clientes',
  veiculos: 'veiculos',
  motoristas: 'motoristas',
} as const;

export function CadastroList({ title, query, columns, pollMs = 60_000, emptyMessage }: Props): React.ReactElement {
  const { api } = useApi();
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [selected, setSelected] = useState<number>(0);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [filterMode, setFilterMode] = useState<boolean>(false);
  const [filterInput, setFilterInput] = useState<string>('');
  const [filterValue, setFilterValue] = useState<string>('');

  const load = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const variables: Record<string, unknown> = {};
      if (filterValue.trim()) {
        const n = Number.parseInt(filterValue, 10);
        if (Number.isFinite(n)) variables[query.idField] = n;
      }
      const data = await api.request<{ [k: string]: Record<string, unknown>[] }>(
        QUERIES[query.kind],
        variables,
      );
      setRows(data[QUERY_KEY[query.kind]] ?? []);
      setLastSync(new Date());
    } catch (e) {
      const msg = formatGraphQLError(e);
      setError(msg);
      toast.error(`erro: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [api, query, filterValue, toast]);

  useEffect(() => { void load(); }, [load]);
  useInterval(() => { void load(); }, pollMs);

  useInput((input, key) => {
    if (detail) {
      if (key.escape || input === 'q' || key.return) setDetail(null);
      return;
    }
    if (filterMode) {
      if (key.escape) { setFilterMode(false); setFilterInput(''); return; }
      if (key.return) {
        setFilterValue(filterInput.trim());
        setFilterMode(false);
        return;
      }
      return;
    }
    if (input === 'r') { void load(); return; }
    if (input === 'f') { setFilterMode(true); setFilterInput(filterValue); return; }
    if (input === 'x') { setFilterValue(''); setFilterInput(''); return; }
    if (rows.length === 0) return;
    if (key.upArrow) { setSelected((i) => Math.max(0, i - 1)); return; }
    if (key.downArrow) { setSelected((i) => Math.min(rows.length - 1, i + 1)); return; }
    if (key.return) {
      const r = rows[selected];
      if (r) setDetail(r);
    }
  });

  const tableData = React.useMemo(
    () => rows.map((r, i) => {
      const out: Record<string, string> = { marker: i === selected ? '▸' : ' ' };
      for (const c of columns) out[c.key] = c.render(r);
      return out;
    }),
    [rows, selected, columns],
  );

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
          {filterValue ? ` · filtro: ${query.idField}=${filterValue}` : ''}
        </Text>
      </Box>
      {filterMode ? (
        <Box marginBottom={1}>
          <Text color="yellow">filtro {query.idField}: </Text>
          <Field label="" value={filterInput} onChange={setFilterInput} onSubmit={() => { setFilterValue(filterInput.trim()); setFilterMode(false); }} focus />
          <Text dimColor>  [Enter] aplicar · [Esc] cancelar</Text>
        </Box>
      ) : null}
      {rows.length === 0 ? (
        <Text dimColor>{emptyMessage ?? `nenhum ${title.toLowerCase()}`}</Text>
      ) : (
        <Table data={tableData} />
      )}
      {detail ? <DetailModal title={`${title} — detalhe`} data={detail} onClose={() => setDetail(null)} /> : null}
    </Box>
  );
}
