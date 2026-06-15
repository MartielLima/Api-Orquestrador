import React from 'react';
import InkSpinner from 'ink-spinner';
import { Text } from 'ink';

export function Spinner({ label }: { label?: string }): React.ReactElement {
  return (
    <Text>
      <Text color="cyan"><InkSpinner type="dots" /></Text>
      {label ? <Text> {label}</Text> : null}
    </Text>
  );
}
