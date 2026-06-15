import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function Confirm({ message, onConfirm, onCancel }: Props): React.ReactElement {
  const [focused, setFocused] = useState<'yes' | 'no'>('no');
  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow || key.tab) {
      setFocused((f) => (f === 'yes' ? 'no' : 'yes'));
    } else if (input === 'y' || input === 'Y') {
      onConfirm();
    } else if (input === 'n' || input === 'N' || key.escape) {
      onCancel();
    } else if (key.return) {
      focused === 'yes' ? onConfirm() : onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      <Text>{message}</Text>
      <Box marginTop={1}>
        <Text inverse={focused === 'yes'} color="green"> Sim (Y) </Text>
        <Text>  </Text>
        <Text inverse={focused === 'no'} color="red"> Não (N) </Text>
      </Box>
    </Box>
  );
}
