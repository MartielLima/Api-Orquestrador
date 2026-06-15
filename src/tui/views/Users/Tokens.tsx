import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { Table } from '../../components/Table';
import { formatDate } from '../../lib/format';
import { Confirm } from '../../components/Confirm';
import type { UserRow, RefreshTokenRow } from './types';

export interface TokensProps {
  user: UserRow;
  tokens: RefreshTokenRow[];
  loading: boolean;
  onRevoke: (tokenId: string) => Promise<void>;
  onBack: () => void;
}

export function Tokens({ user, tokens, loading, onRevoke, onBack }: TokensProps): React.ReactElement {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [selected, setSelected] = useState<number>(0);
  const [revoking, setRevoking] = useState(false);

  useInput((input, key) => {
    if (confirmId || revoking) return;
    if (key.escape || input === 'q') { onBack(); return; }
    if (input === 'r' && tokens.length > 0) {
      const t = tokens[selected];
      if (t) setConfirmId(t.id);
      return;
    }
    if (key.upArrow) {
      setSelected((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelected((i) => Math.min(Math.max(0, tokens.length - 1), i + 1));
      return;
    }
  });

  const handleConfirmRevoke = async (): Promise<void> => {
    if (!confirmId) return;
    setRevoking(true);
    try {
      await onRevoke(confirmId);
    } finally {
      setRevoking(false);
      setConfirmId(null);
    }
  };

  if (loading) {
    return (
      <Modal title={`Tokens de ${user.email}`} width={80}>
        <Spinner label="carregando tokens..." />
      </Modal>
    );
  }

  return (
    <Modal title={`Tokens de ${user.email}`} width={80}>
      <Box flexDirection="column">
        {tokens.length === 0 ? (
          <Text dimColor>nenhum refresh token ativo</Text>
        ) : (
          <Table
            data={tokens.map((t, i) => ({
              id: t.id,
              created: formatDate(t.createdAt),
              expires: formatDate(t.expiresAt),
              revoked: t.revokedAt ? formatDate(t.revokedAt) : '—',
              marker: i === selected ? '▸' : ' ',
            }))}
          />
        )}
        <Box marginTop={1}>
          <Text color="yellow">[x] revogar selecionado</Text>
          <Text>  </Text>
          <Text dimColor>[q/Esc] voltar</Text>
        </Box>
      </Box>
      {confirmId ? (
        <Modal title="Revogar token?" width={50}>
          <Confirm
            message={`Tem certeza que quer revogar este refresh token?`}
            onConfirm={() => { void handleConfirmRevoke(); }}
            onCancel={() => setConfirmId(null)}
          />
        </Modal>
      ) : null}
    </Modal>
  );
}
