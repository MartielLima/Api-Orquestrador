import React from 'react';
import { Text, Box } from 'ink';
import { Spinner } from '../components/Spinner';

interface Props {
  title: string;
  loading?: boolean;
  empty?: boolean;
  children?: React.ReactNode;
}

export function ViewScaffold({ title, loading, empty, children }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">{title}</Text>
      </Box>
      {loading ? (
        <Spinner label="carregando..." />
      ) : empty ? (
        <Text dimColor>(em construção — placeholder do esqueleto navegável)</Text>
      ) : (
        children ?? null
      )}
    </Box>
  );
}
