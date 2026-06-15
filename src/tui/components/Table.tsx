import React from 'react';
import { Box } from 'ink';
import InkTable from 'ink-table';

type Scalar = string | number | boolean | null | undefined;
type ScalarDict = { [key: string]: Scalar };

interface Props<T extends ScalarDict> { data: T[]; }

export function Table<T extends ScalarDict>({ data }: Props<T>): React.ReactElement {
  return (
    <Box flexDirection="column">
      <InkTable data={data} />
    </Box>
  );
}
