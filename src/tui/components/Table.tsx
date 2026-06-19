import React from 'react';
import { Box, Text } from 'ink';

type Scalar = string | number | boolean | null | undefined;
type ScalarDict = { [key: string]: Scalar };

interface Props<T extends ScalarDict> { data: T[]; }

function padRight(s: string, w: number): string {
  return s + ' '.repeat(Math.max(0, w - s.length));
}

function TableImpl<T extends ScalarDict>({ data }: Props<T>): React.ReactElement {
  if (data.length === 0) {
    return (
      <Box>
        <Text dimColor>(sem dados)</Text>
      </Box>
    );
  }

  const columns = Object.keys(data[0]);
  const widths = columns.map((col) =>
    Math.max(col.length, ...data.map((row) => String(row[col] ?? '').length)),
  );
  const gap = '  ';
  const sep = widths.map((w) => '─'.repeat(w)).join(gap);

  return (
    <Box flexDirection="column">
      <Box>
        {columns.map((col, i) => (
          <Text key={col} bold>
            {padRight(col, widths[i])}{i < columns.length - 1 ? gap : ''}
          </Text>
        ))}
      </Box>
      <Text dimColor>{sep}</Text>
      {data.map((row, ri) => (
        <Box key={ri}>
          {columns.map((col, i) => (
            <Text key={col}>
              {padRight(String(row[col] ?? ''), widths[i])}{i < columns.length - 1 ? gap : ''}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}

export const Table = React.memo(TableImpl) as typeof TableImpl;
