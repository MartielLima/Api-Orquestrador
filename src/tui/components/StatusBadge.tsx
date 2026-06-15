import React from 'react';
import { Text } from 'ink';
import { theme } from '../lib/theme';

export type StatusKind = 'ok' | 'error' | 'cacheHit' | 'pending' | 'inactive';

interface Props { kind: StatusKind; label: string; }

export function StatusBadge({ kind, label }: Props): React.ReactElement {
  const color =
    kind === 'ok' ? theme.status.ok :
    kind === 'error' ? theme.status.error :
    kind === 'cacheHit' ? theme.status.cacheHit :
    kind === 'pending' ? theme.status.pending :
    theme.dim;
  return <Text color={color}>[{label}]</Text>;
}
