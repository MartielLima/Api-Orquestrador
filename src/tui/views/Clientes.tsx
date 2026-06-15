import React from 'react';
import { CadastroList, type CadastroColumn } from './CadastroList';
import { formatDate } from '../lib/format';

const columns: CadastroColumn[] = [
  { key: 'idCliente', label: 'id', render: (r) => String(r.idCliente ?? '—') },
  { key: 'doc', label: 'CNPJ/CPF', render: (r) => String(r.cnpj ?? r.cpf ?? '—') },
  { key: 'nome', label: 'nome', render: (r) => String(r.nome ?? '—') },
  { key: 'fetchedAt', label: 'fetched', render: (r) => formatDate(String(r.fetchedAt ?? '')) },
];

export function ClientesView(): React.ReactElement {
  return <CadastroList title="Clientes" query={{ kind: 'clientes', idField: 'idCliente' }} columns={columns} emptyMessage="nenhum cliente" />;
}
