import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Table } from '../../components/Table';
import { Spinner } from '../../components/Spinner';
import { Confirm } from '../../components/Confirm';
import { DetailModal } from '../../components/DetailModal';
import { useApi } from '../../hooks/useApi';
import { useInterval } from '../../hooks/useInterval';
import { useToast } from '../../hooks/useToast';
import { formatRelative } from '../../lib/format';
import { formatGraphQLError } from '../../lib/formatError';
import { Q_USERS, M_CREATE_USER, M_UPDATE_USER, M_RESET_PASSWORD, M_REVOKE_TOKEN, Q_REFRESH_TOKENS, M_DELETE_USER } from '../../api/queries';
import { CreateForm } from './CreateForm';
import { EditForm } from './EditForm';
import { ResetPassword } from './ResetPassword';
import { Tokens } from './Tokens';
import type { UserRow, RefreshTokenRow } from './types';

type Modal = 'create' | 'edit' | 'reset' | 'tokens' | null;
type SortKey = 'email' | 'role' | 'createdAt';
const SORT_KEYS: SortKey[] = ['email', 'role', 'createdAt'];

export function UsersView(): React.ReactElement {
  const { api, user: currentUser } = useApi();
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number>(0);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [modal, setModal] = useState<Modal>(null);
  const [confirm, setConfirm] = useState<{ kind: 'toggleActive' | 'deleteUser'; user: UserRow } | null>(null);
  const [tokens, setTokens] = useState<RefreshTokenRow[]>([]);
  const [tokensLoading, setTokensLoading] = useState<boolean>(false);
  const [detail, setDetail] = useState<UserRow | null>(null);

  const loadUsers = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const data = await api.request<{ users: UserRow[] }>(Q_USERS);
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);
  useInterval(() => { void loadUsers(); }, 30_000);

  const selectedUser = users[selected] ?? null;

  const refreshTokens = useCallback(async (userId: string): Promise<void> => {
    setTokensLoading(true);
    try {
      const data = await api.request<{ refreshTokens: RefreshTokenRow[] }>(Q_REFRESH_TOKENS, { userId });
      setTokens(data.refreshTokens);
    } catch (e) {
      toast.error(`erro ao listar tokens: ${formatGraphQLError(e)}`);
    } finally {
      setTokensLoading(false);
    }
  }, [api, toast]);

  useInput((input, key) => {
    if (modal || confirm) return;
    if (input === 'r') { void loadUsers(); return; }
    if (input === 'n') { setModal('create'); return; }
    if (input === 's') {
      const idx = SORT_KEYS.indexOf(sortKey);
      const next = SORT_KEYS[(idx + 1) % SORT_KEYS.length]!;
      setSortKey(next);
      if (next === sortKey) setSortAsc((a) => !a);
      return;
    }
    if (!selectedUser) return;
    if (input === 'e') { setModal('edit'); return; }
    if (input === 'a') {
      if (selectedUser.id === currentUser.id) {
        toast.error('você não pode desativar a si mesmo');
        return;
      }
      setConfirm({ kind: 'toggleActive', user: selectedUser });
      return;
    }
    if (input === 'p') { setModal('reset'); return; }
    if (input === 'd') {
      if (!selectedUser) return;
      if (selectedUser.id === currentUser.id) {
        toast.error('você não pode remover a si mesmo');
        return;
      }
      setConfirm({ kind: 'deleteUser', user: selectedUser });
      return;
    }
    if (input === 't') {
      setModal('tokens');
      void refreshTokens(selectedUser.id);
      return;
    }
    if (key.upArrow) { setSelected((i) => Math.max(0, i - 1)); return; }
    if (key.downArrow) { setSelected((i) => Math.min(users.length - 1, i + 1)); return; }
    if (key.return && selectedUser) { setDetail(selectedUser); return; }
  });

  const sortedUsers = React.useMemo(
    () => [...users].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    }),
    [users, sortKey, sortAsc],
  );

  const tableData = React.useMemo(
    () => sortedUsers.map((u, i) => ({
      marker: i === selected ? '▸' : ' ',
      email: u.email,
      role: u.role,
      active: u.active ? 'ON' : 'OFF',
      criado: formatRelative(u.createdAt),
    })),
    [sortedUsers, selected],
  );

  const handleCreate = async (input: { email: string; password: string; role: 'admin' | 'user' }): Promise<void> => {
    await api.request(M_CREATE_USER, { input });
    toast.success(`usuário ${input.email} criado`);
    setModal(null);
    await loadUsers();
  };

  const handleEdit = async (input: { role?: 'admin' | 'user'; active?: boolean }): Promise<void> => {
    if (!selectedUser) return;
    await api.request(M_UPDATE_USER, { id: selectedUser.id, input });
    toast.success(`usuário ${selectedUser.email} atualizado`);
    setModal(null);
    await loadUsers();
  };

  const handleReset = async (newPassword: string): Promise<string> => {
    if (!selectedUser) throw new Error('no user selected');
    await api.request(M_RESET_PASSWORD, { id: selectedUser.id, newPassword });
    return newPassword;
  };

  const handleToggleActiveConfirm = async (): Promise<void> => {
    if (!confirm || confirm.kind !== 'toggleActive') return;
    const u = confirm.user;
    const nextActive = !u.active;
    try {
      await api.request(M_UPDATE_USER, { id: u.id, input: { active: nextActive } });
      toast.success(`${u.email} agora está ${nextActive ? 'ativo' : 'inativo'}`);
      await loadUsers();
    } catch (e) {
      toast.error(`erro: ${formatGraphQLError(e)}`);
    } finally {
      setConfirm(null);
    }
  };

  const handleRevoke = async (tokenId: string): Promise<void> => {
    try {
      await api.request(M_REVOKE_TOKEN, { id: tokenId });
      toast.success('token revogado');
      if (selectedUser) await refreshTokens(selectedUser.id);
    } catch (e) {
      toast.error(`erro: ${formatGraphQLError(e)}`);
    }
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!confirm || confirm.kind !== 'deleteUser') return;
    const u = confirm.user;
    try {
      await api.request(M_DELETE_USER, { id: u.id });
      toast.success(`usuário ${u.email} removido`);
      await loadUsers();
    } catch (e) {
      toast.error(`erro: ${formatGraphQLError(e)}`);
    } finally {
      setConfirm(null);
    }
  };

  if (loading && users.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}><Text bold color="cyan">Usuários</Text></Box>
        <Spinner label="carregando usuários..." />
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}><Text bold color="cyan">Usuários</Text></Box>
        <Text color="red">✗ {error}</Text>
        <Text dimColor>pressione [r] para tentar novamente</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">Usuários</Text>
        <Text dimColor>
          {users.length} usuário{users.length !== 1 ? 's' : ''} · ordenado por {sortKey} {sortAsc ? '↑' : '↓'}
        </Text>
      </Box>
      {users.length === 0 ? (
        <Text dimColor>nenhum usuário — pressione [n] para criar</Text>
      ) : (
        <Table data={tableData} />
      )}
      {modal === 'create' ? (
        <CreateForm onSubmit={handleCreate} onCancel={() => setModal(null)} />
      ) : null}
      {modal === 'edit' && selectedUser ? (
        <EditForm
          user={selectedUser}
          isSelf={selectedUser.id === currentUser.id}
          onSubmit={handleEdit}
          onCancel={() => setModal(null)}
        />
      ) : null}
      {modal === 'reset' && selectedUser ? (
        <ResetPassword
          user={selectedUser}
          onSubmit={handleReset}
          onCancel={() => setModal(null)}
          onDone={() => { setModal(null); void loadUsers(); }}
        />
      ) : null}
      {modal === 'tokens' && selectedUser ? (
        <Tokens
          user={selectedUser}
          tokens={tokens}
          loading={tokensLoading}
          onRevoke={handleRevoke}
          onBack={() => setModal(null)}
        />
      ) : null}
      {confirm?.kind === 'toggleActive' ? (
        <Confirm
          message={`${confirm.user.active ? 'Desativar' : 'Ativar'} ${confirm.user.email}? ${confirm.user.active ? 'Ele não conseguirá mais logar.' : 'Ele voltará a poder logar.'}`}
          onConfirm={() => { void handleToggleActiveConfirm(); }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {confirm?.kind === 'deleteUser' ? (
        <Confirm
          message={`Remover ${confirm.user.email}? Os refresh tokens deste usuário também serão removidos. Esta ação não pode ser desfeita.`}
          onConfirm={() => { void handleDeleteConfirm(); }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {detail ? <DetailModal title={`Usuário — ${detail.email}`} data={detail as unknown as Record<string, unknown>} onClose={() => setDetail(null)} /> : null}
    </Box>
  );
}
