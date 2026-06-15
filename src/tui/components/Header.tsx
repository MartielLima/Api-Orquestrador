import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import type { AuthUser } from '../api/auth';

interface Props { user: AuthUser | null; }

export function Header({ user }: Props): React.ReactElement {
  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Gradient name="rainbow">
        <Text>API ORQUESTRADOR  v0.2.0</Text>
      </Gradient>
      <Text>
        user: <Text color="cyan">{user?.email ?? '—'}</Text>  role: <Text color="cyan">{user?.role ?? '—'}</Text>
      </Text>
    </Box>
  );
}
