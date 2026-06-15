import type { ReactElement } from 'react';

export interface InkTableProps {
  data: object[];
  columns?: string[];
  header?: (data: object) => ReactElement;
  cell?: (data: unknown, column: string) => ReactElement;
  padding?: number;
  skeleton?: boolean;
}

declare const InkTable: (props: InkTableProps) => ReactElement;
export default InkTable;
export { InkTable };
