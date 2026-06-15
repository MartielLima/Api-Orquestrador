import React from 'react';
import { Text, Box } from 'ink';
import TextInput from 'ink-text-input';

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  error?: string;
  password?: boolean;
  placeholder?: string;
}

export function Field({ label, value, onChange, onSubmit, error, password, placeholder }: FieldProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={error ? 'red' : undefined}>{label}{error ? `: ${error}` : ''}</Text>
      <Box>
        <Text>{'> '}</Text>
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          mask={password ? '*' : undefined}
          placeholder={placeholder}
        />
      </Box>
    </Box>
  );
}
