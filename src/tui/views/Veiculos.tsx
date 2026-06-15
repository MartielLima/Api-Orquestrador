import React from 'react';
import { CadastroList, type CadastroColumn } from './CadastroList';
import { formatDate } from '../lib/format';

const columns: CadastroColumn[] = [
  { key: 'idVeiculo', label: 'id', render: (r) => String(r.idVeiculo ?? '—') },
  { key: 'placa', label: 'placa', render: (r) => String(r.placa ?? '—') },
  { key: 'idCliente', label: 'cliente', render: (r) => (r.idCliente == null ? '—' : String(r.idCliente)) },
  { key: 'descricao', label: 'descrição', render: (r) => String(r.descricao ?? '—') },
  { key: 'fetchedAt', label: 'fetched', render: (r) => formatDate(String(r.fetchedAt ?? '')) },
];

export function VeiculosView(): React.ReactElement {
  return <CadastroList title="Veículos" query={{ kind: 'veiculos', idField: 'idVeiculo' }} columns={columns} emptyMessage="nenhum veículo" />;
}
