import React, { useEffect } from 'react';
import { Text, Box } from 'ink';
import TextInput from 'ink-text-input';
import { reportInputFocus } from '../hooks/useInputFocus';

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  error?: string;
  password?: boolean;
  placeholder?: string;
  focus?: boolean;
}

export function Field({
  label,
  value,
  onChange,
  onSubmit,
  error,
  password,
  placeholder,
  focus = true,
}: FieldProps): React.ReactElement {
  useEffect(() => {
    if (!focus) return;
    reportInputFocus(true);
    return () => reportInputFocus(false);
  }, [focus]);

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
          focus={focus}
        />
      </Box>
    </Box>
  );
}