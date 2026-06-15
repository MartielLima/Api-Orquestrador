import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from './Modal';

interface Props {
  title: string;
  data: Record<string, unknown>;
  width?: number;
  onClose: () => void;
}

function formatValue(v: unknown): string {
  if (v == null) return 'null';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function DetailModal({ title, data, width = 80, onClose }: Props): React.ReactElement {
  const entries = Object.entries(data);
  const maxKeyLen = entries.reduce((m, [k]) => Math.max(m, k.length), 0);

  useInput((input, key) => {
    if (key.escape || input === 'q' || key.return) onClose();
  });

  return (
    <Modal title={title} width={width}>
      <Box flexDirection="column">
        {entries.length === 0 ? (
          <Text dimColor>(sem dados)</Text>
        ) : (
          entries.map(([k, v]) => (
            <Box key={k}>
              <Text color="cyan">{(k + ':').padEnd(maxKeyLen + 1)}</Text>
              <Text>{' '}{formatValue(v)}</Text>
            </Box>
          ))
        )}
        <Box marginTop={1}>
          <Text dimColor>[Enter/Esc/q] fechar</Text>
        </Box>
      </Box>
    </Modal>
  );
}
