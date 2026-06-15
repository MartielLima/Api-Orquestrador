import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useInterval } from '../hooks/useInterval';
import type { AuthUser } from '../api/auth';
import { buildApiClient } from '../api/client';
import { Q_HEALTH } from '../api/queries';

interface Props {
  user: AuthUser;
  apiUrl: string;
  tokenExp: number;
}

type Health = 'unknown' | 'ok' | 'err';

function formatExp(exp: number): string {
  const ms = exp - Date.now();
  if (ms <= 0) return 'expirado';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${(s % 60).toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h${(m % 60).toString().padStart(2, '0')}m`;
}

export function StatusBar({ user, apiUrl, tokenExp }: Props): React.ReactElement {
  const [health, setHealth] = useState<Health>('unknown');
  const [now, setNow] = useState(() => new Date());

  useInterval(() => setNow(new Date()), 1000);
  useInterval(() => {
    const api = buildApiClient(apiUrl);
    api.request<{ health: string }>(Q_HEALTH)
      .then(() => setHealth('ok'))
      .catch(() => setHealth('err'));
  }, 5000);

  useEffect(() => {
    const api = buildApiClient(apiUrl);
    api.request<{ health: string }>(Q_HEALTH)
      .then(() => setHealth('ok'))
      .catch(() => setHealth('err'));
  }, [apiUrl]);

  const healthColor = health === 'ok' ? 'green' : health === 'err' ? 'red' : 'yellow';
  const healthLabel = health === 'ok' ? 'API ok' : health === 'err' ? 'API erro' : 'API ?';

  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text>
        <Text color="cyan">{user.email}</Text>
        <Text dimColor> · {user.role} · </Text>
        <Text color={healthColor}>{healthLabel}</Text>
      </Text>
      <Text>
        <Text dimColor>token </Text>
        <Text color="cyan">{formatExp(tokenExp)}</Text>
        <Text dimColor> · </Text>
        <Text dimColor>{now.toISOString().slice(11, 19)}</Text>
      </Text>
    </Box>
  );
}
