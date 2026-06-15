import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../components/Table';
import { Spinner } from '../components/Spinner';
import { Field } from '../components/Form';
import { useApi } from '../hooks/useApi';
import { useInterval } from '../hooks/useInterval';
import { Q_POSICOES_RECENTES, Q_POSICOES_POR_VEICULO } from '../api/queries';

type Tab = 'recentes' | 'porVeiculo';

interface PosicaoRow {
  idPacote: number;
  idVeiculo: number;
  dataPosicao: string;
  velocidade: number;
  latitude: number;
  longitude: number;
  ignicao?: number | null;
}

const DEFAULT_QUANTIDADE = '100';

export function PosicoesView(): React.ReactElement {
  const { api } = useApi();
  const [tab, setTab] = useState<Tab>('recentes');
  const [quantidade, setQuantidade] = useState<string>(DEFAULT_QUANTIDADE);
  const [idVeiculo, setIdVeiculo] = useState<string>('');
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');
  const [rows, setRows] = useState<PosicaoRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const n = Number.parseInt(quantidade, 10);
      if (tab === 'recentes') {
        const data = await api.request<{ posicoesRecentes: PosicaoRow[] }>(Q_POSICOES_RECENTES, { quantidade: Number.isFinite(n) ? n : 1000 });
        setRows(data.posicoesRecentes);
      } else {
        const id = Number.parseInt(idVeiculo, 10);
        if (!Number.isFinite(id) || !dataInicio || !dataFim) {
          setError('preencha idVeiculo, dataInicio e dataFim (ISO 8601)');
          setRows([]);
          return;
        }
        const data = await api.request<{ posicoesPorVeiculo: PosicaoRow[] }>(Q_POSICOES_POR_VEICULO, { idVeiculo: id, dataInicio, dataFim });
        setRows(data.posicoesPorVeiculo);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api, tab, quantidade, idVeiculo, dataInicio, dataFim]);

  useEffect(() => { void load(); }, [load]);
  useInterval(() => { void load(); }, tab === 'recentes' ? 30_000 : 60_000);

  useInput((input, key) => {
    if (input === 'r') { void load(); return; }
    if (key.tab) {
      setTab((t) => (t === 'recentes' ? 'porVeiculo' : 'recentes'));
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">Posições</Text>
        <Text>
          <Text inverse={tab === 'recentes'} color="cyan">{tab === 'recentes' ? '▸ recentes' : 'recentes'}</Text>
          <Text> | </Text>
          <Text inverse={tab === 'porVeiculo'} color="cyan">{tab === 'porVeiculo' ? '▸ por veículo' : 'por veículo'}</Text>
          <Text dimColor>  (Tab alterna)</Text>
        </Text>
      </Box>
      {tab === 'recentes' ? (
        <Box marginBottom={1}>
          <Text dimColor>quantidade: </Text>
          <Field label="" value={quantidade} onChange={setQuantidade} onSubmit={() => void load()} />
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1}>
          <Field label="idVeiculo" value={idVeiculo} onChange={setIdVeiculo} onSubmit={() => void load()} />
          <Field label="dataInicio (ISO)" value={dataInicio} onChange={setDataInicio} onSubmit={() => void load()} />
          <Field label="dataFim (ISO)" value={dataFim} onChange={setDataFim} onSubmit={() => void load()} />
        </Box>
      )}
      {loading ? (
        <Spinner label="carregando..." />
      ) : error ? (
        <Text color="red">✗ {error}</Text>
      ) : rows.length === 0 ? (
        <Text dimColor>nenhuma posição no recorte</Text>
      ) : (
        <Table
          data={rows.slice(0, 200).map((p) => ({
            idPacote: String(p.idPacote),
            idVeiculo: String(p.idVeiculo),
            dataPosicao: String(p.dataPosicao).slice(0, 19).replace('T', ' '),
            vel: p.velocidade == null ? '—' : `${Number(p.velocidade).toFixed(0)}`,
            lat: p.latitude == null ? '—' : Number(p.latitude).toFixed(5),
            lng: p.longitude == null ? '—' : Number(p.longitude).toFixed(5),
            ign: p.ignicao == null ? '—' : String(p.ignicao),
          }))}
        />
      )}
      <Text dimColor>mostrando até 200 linhas (de {rows.length})</Text>
    </Box>
  );
}
