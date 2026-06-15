import React from 'react';
import { Box, Text } from 'ink';

interface Props { hints: { key: string; label: string }[]; }

export function Footer({ hints }: Props): React.ReactElement {
  return (
    <Box borderStyle="single" paddingX={1}>
      {hints.map((h, i) => (
        <Box key={h.key + i} marginRight={2}>
          <Text color="yellow">[{h.key}]</Text>
          <Text>{h.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
