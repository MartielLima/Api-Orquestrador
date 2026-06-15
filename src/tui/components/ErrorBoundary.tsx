import React from 'react';
import { Text, Box } from 'ink';

interface State { error: Error | null; }

interface Props { children: React.ReactNode; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text color="red">Erro: {this.state.error.message}</Text>
          <Text color="gray">Pressione Ctrl+C para sair.</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}
