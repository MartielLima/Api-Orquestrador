import React from 'react';
import { CadastroList, type CadastroColumn } from './CadastroList';
import { formatDate } from '../lib/format';

const columns: CadastroColumn[] = [
  { key: 'idMotorista', label: 'id', render: (r) => String(r.idMotorista ?? '—') },
  { key: 'nome', label: 'nome', render: (r) => String(r.nome ?? '—') },
  { key: 'tipoDocumento', label: 'doc', render: (r) => String(r.tipoDocumento ?? '—') },
  { key: 'fetchedAt', label: 'fetched', render: (r) => formatDate(String(r.fetchedAt ?? '')) },
];

export function MotoristasView(): React.ReactElement {
  return <CadastroList title="Motoristas" query={{ kind: 'motoristas', idField: 'idMotorista' }} columns={columns} emptyMessage="nenhum motorista" />;
}
