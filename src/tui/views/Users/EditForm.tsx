import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../../components/Modal';
import { updateUserInputRule, type UpdateUserInput } from '../../lib/validators';
import type { UserRow } from './types';

export interface EditFormProps {
  user: UserRow;
  isSelf: boolean;
  onSubmit: (input: UpdateUserInput) => Promise<void>;
  onCancel: () => void;
}

export function EditForm({ user, isSelf, onSubmit, onCancel }: EditFormProps): React.ReactElement {
  const [role, setRole] = useState<'admin' | 'user'>(user.role);
  const [active, setActive] = useState<boolean>(user.active);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useInput((input, key) => {
    if (submitting) return;
    if (key.escape) { onCancel(); return; }
    if (key.leftArrow || key.rightArrow) {
      setRole((r) => (r === 'admin' ? 'user' : 'admin'));
      return;
    }
    if (input === 'a' && !isSelf) {
      setActive((v) => !v);
      return;
    }
    if (key.return) {
      void handleSubmit();
    }
  });

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    const input: UpdateUserInput = { role, active };
    const parsed = updateUserInputRule.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'entrada inválida');
      return;
    }
    if (isSelf) {
      if (parsed.data.role && parsed.data.role !== 'admin') {
        setError('você não pode rebaixar a si mesmo para user');
        return;
      }
      if (parsed.data.active === false) {
        setError('você não pode desativar a si mesmo');
        return;
      }
    }
    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Editar ${user.email}`} width={60}>
      <Box flexDirection="column">
        <Text dimColor>Email: {user.email}</Text>
        <Box marginTop={1} marginBottom={1}>
          <Text>
            Role:{' '}
            <Text inverse={role === 'admin'} color="red">{role === 'admin' ? '▸ admin' : 'admin'}</Text>
            <Text>  </Text>
            <Text inverse={role === 'user'} color="cyan">{role === 'user' ? '▸ user' : 'user'}</Text>
            <Text dimColor>  (←/→ alterna)</Text>
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text>
            Active:{' '}
            <Text inverse color={active ? 'green' : 'gray'}>{active ? '▸ ON' : 'OFF'}</Text>
            <Text dimColor>  {isSelf ? '(você não pode se desativar)' : '(pressione a para alternar)'}</Text>
          </Text>
        </Box>
        {isSelf ? <Text color="yellow">⚠ Editando o próprio usuário — mudanças de role/active são restritas.</Text> : null}
        {error ? <Box marginBottom={1}><Text color="red">✗ {error}</Text></Box> : null}
        {submitting ? (
          <Text color="cyan">⠋ salvando...</Text>
        ) : (
          <Box marginTop={1}>
            <Text color="green">[Enter] salvar</Text>
            <Text>  </Text>
            <Text color="red">[Esc] cancelar</Text>
          </Box>
        )}
      </Box>
    </Modal>
  );
}
