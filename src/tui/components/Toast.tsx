import React, { useEffect } from 'react';
import { Text, Box } from 'ink';

export type ToastKind = 'success' | 'error' | 'info';

interface Props {
  kind: ToastKind;
  message: string;
  ttl?: number;
  onDone: () => void;
}

const COLORS: Record<ToastKind, string> = {
  success: 'green',
  error: 'red',
  info: 'cyan',
};

const ICONS: Record<ToastKind, string> = {
  success: '✓',
  error: '✗',
  info: 'ℹ',
};

export function Toast({ kind, message, ttl = 3000, onDone }: Props): React.ReactElement {
  useEffect(() => {
    const t = setTimeout(onDone, ttl);
    return () => clearTimeout(t);
  }, [ttl, onDone]);

  return (
    <Box borderStyle="round" borderColor={COLORS[kind]} paddingX={1}>
      <Text color={COLORS[kind]}>{ICONS[kind]} {message}</Text>
    </Box>
  );
}
