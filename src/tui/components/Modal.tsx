import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../lib/theme';

interface Props {
  title: string;
  children: React.ReactNode;
  width?: number;
}

export function Modal({ title, children, width = 60 }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width="100%" height="100%">
      <Box flexDirection="column" borderStyle="round" borderColor={theme.modal.border} paddingX={theme.modal.padding} width={width}>
        <Box marginBottom={1}><Text bold>{title}</Text></Box>
        {children}
      </Box>
    </Box>
  );
}
