import React from 'react';
import { Box, Text } from 'ink';

export interface NavItem { key: string; label: string; }

interface Props {
  items: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

export function Sidebar({ items, activeKey, onSelect }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1} width={18}>
      {items.map((it) => {
        const active = it.key === activeKey;
        return (
          <Text key={it.key} inverse={active} bold={active}>
            {active ? '▸ ' : '  '}{it.label}
          </Text>
        );
      })}
    </Box>
  );
}
