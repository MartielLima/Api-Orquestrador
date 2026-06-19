import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Form';
import { generatePassword } from '../../lib/passwordGen';
import { resetPasswordRule } from '../../lib/validators';
import type { UserRow } from './types';

export interface ResetPasswordProps {
  user: UserRow;
  onSubmit: (newPassword: string) => Promise<string>;
  onCancel: () => void;
  onDone: (newPassword: string) => void;
}

type Mode = 'random' | 'manual';
type Phase = 'choose' | 'show';

export function ResetPassword({ user, onSubmit, onCancel, onDone }: ResetPasswordProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>('random');
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<Phase>('choose');
  const [generated, setGenerated] = useState<string>(generatePassword());

  useInput((input, key) => {
    if (submitting) return;
    if (key.escape) { onCancel(); return; }
    if (phase === 'show') {
      if (key.return || input === 'c') {
        onDone(generated);
      }
      return;
    }
    if (input === 'a' || input === 'A') { setMode('random'); return; }
    if (input === 'm' || input === 'M') { setMode('manual'); return; }
    if (key.upArrow || key.downArrow) {
      setMode((m) => (m === 'random' ? 'manual' : 'random'));
      return;
    }
    if (key.return) {
      void handleSubmit();
    }
  });

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    const pw = mode === 'random' ? generated : manual;
    const parsed = resetPasswordRule.safeParse({ newPassword: pw });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'senha inválida');
      return;
    }
    setSubmitting(true);
    try {
      const final = await onSubmit(parsed.data.newPassword);
      setGenerated(final);
      setPhase('show');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  if (phase === 'show') {
    return (
      <Modal title="Senha redefinida" width={70}>
        <Box flexDirection="column">
          <Text color="yellow" bold>⚠ Esta senha será exibida APENAS UMA VEZ. Anote agora.</Text>
          <Box marginTop={1} marginBottom={1} borderStyle="round" paddingX={1}>
            <Text color="cyan" bold>{generated}</Text>
          </Box>
          <Text dimColor>Pressione [Enter] ou [c] para confirmar que anotou.</Text>
        </Box>
      </Modal>
    );
  }

  return (
    <Modal title={`Resetar senha de ${user.email}`} width={70}>
      <Box flexDirection="column">
        <Text color="yellow" bold>⚠ A senha será exibida APENAS UMA VEZ após redefinir. Anote antes de fechar.</Text>
        <Box marginTop={1} marginBottom={1}>
          <Text>
            <Text inverse={mode === 'random'} color="cyan">
              {mode === 'random' ? '▸ aleatória (16 chars)' : 'aleatória (16 chars)'}
            </Text>
            <Text>  </Text>
            <Text inverse={mode === 'manual'} color="cyan">
              {mode === 'manual' ? '▸ manual' : 'manual'}
            </Text>
            <Text dimColor>  (a/m ou ↑/↓)</Text>
          </Text>
        </Box>
        {mode === 'random' ? (
          <Box marginBottom={1}>
            <Text dimColor>Prévia: </Text>
            <Text>{generated}</Text>
          </Box>
        ) : (
          <Field
            label="Nova senha"
            value={manual}
            onChange={setManual}
            password
            placeholder="8+ chars, maiúscula, minúscula, dígito"
            focus
          />
        )}
        {error ? <Box marginBottom={1}><Text color="red">✗ {error}</Text></Box> : null}
        {submitting ? (
          <Text color="cyan">⠋ redefinindo...</Text>
        ) : (
          <Box marginTop={1}>
            <Text color="green">[Enter] redefinir</Text>
            <Text>  </Text>
            <Text color="red">[Esc] cancelar</Text>
          </Box>
        )}
      </Box>
    </Modal>
  );
}
