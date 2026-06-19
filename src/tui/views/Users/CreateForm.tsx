import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Field } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { passwordStrength } from '../../lib/format';
import {
  emailRule, passwordRule, createUserInputRule, type CreateUserInput,
} from '../../lib/validators';

export interface CreateFormProps {
  onSubmit: (input: CreateUserInput) => Promise<void>;
  onCancel: () => void;
}

type FieldName = 'email' | 'password' | 'confirm' | 'role';

export function CreateForm({ onSubmit, onCancel }: CreateFormProps): React.ReactElement {
  const [focused, setFocused] = useState<FieldName>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useInput((input, key) => {
    if (submitting) return;
    if (key.escape) { onCancel(); return; }
    if (key.tab) {
      const order: FieldName[] = ['email', 'password', 'confirm', 'role'];
      const idx = order.indexOf(focused);
      setFocused(order[(idx + 1) % order.length]!);
      return;
    }
    if (focused === 'role') {
      if (input === 'a' || input === 'A') { setRole('admin'); return; }
      if (input === 'u' || input === 'U') { setRole('user'); return; }
      if (key.leftArrow || key.rightArrow) {
        setRole((r) => (r === 'admin' ? 'user' : 'admin'));
        return;
      }
    }
    if (key.return && focused === 'role') {
      void handleSubmit();
    }
  });

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    if (!emailRule.test(email)) {
      setError('email inválido');
      setFocused('email');
      return;
    }
    if (!passwordRule.test(password)) {
      setError('senha: 8+ chars, com maiúscula, minúscula e dígito');
      setFocused('password');
      return;
    }
    if (password !== confirm) {
      setError('senha e confirmação não conferem');
      setFocused('confirm');
      return;
    }
    const parsed = createUserInputRule.safeParse({ email, password, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'entrada inválida');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  const strength = passwordStrength(password);
  const strengthBar = '█'.repeat(strength.score) + '░'.repeat(4 - strength.score);
  const strengthColor = strength.score >= 3 ? 'green' : strength.score >= 2 ? 'yellow' : 'red';

  return (
    <Modal title="Novo usuário" width={70}>
      <Box flexDirection="column">
        <Field
          label="Email"
          value={email}
          onChange={setEmail}
          onSubmit={() => setFocused('password')}
          placeholder="user@dominio.dev"
          focus={focused === 'email'}
        />
        <Field
          label="Senha"
          value={password}
          onChange={setPassword}
          onSubmit={() => setFocused('confirm')}
          password
          focus={focused === 'password'}
        />
        <Box marginLeft={2} marginBottom={1}>
          <Text color={strengthColor}>[{strengthBar}] {strength.label}</Text>
        </Box>
        <Field
          label="Confirmar senha"
          value={confirm}
          onChange={setConfirm}
          onSubmit={() => setFocused('role')}
          password
          focus={focused === 'confirm'}
        />
        <Box marginBottom={1}>
          <Text>
            Role:{' '}
            <Text inverse={focused === 'role' && role === 'admin'} color="red">
              {role === 'admin' ? '▸ admin' : 'admin'}
            </Text>
            <Text>  </Text>
            <Text inverse={focused === 'role' && role === 'user'} color="cyan">
              {role === 'user' ? '▸ user' : 'user'}
            </Text>
            <Text dimColor>  (←/→ alterna)</Text>
          </Text>
        </Box>
        {error ? <Box marginBottom={1}><Text color="red">✗ {error}</Text></Box> : null}
        {submitting ? <SpinnerRow /> : <Hints onSubmit={handleSubmit} onCancel={onCancel} />}
      </Box>
    </Modal>
  );
}

function SpinnerRow(): React.ReactElement {
  return <Text color="cyan">⠋ criando usuário...</Text>;
}

function Hints({ onSubmit, onCancel }: { onSubmit: () => void | Promise<void>; onCancel: () => void }): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Text color="green">[Enter] criar</Text>
      <Text>  </Text>
      <Text color="red">[Esc] cancelar</Text>
    </Box>
  );
}
