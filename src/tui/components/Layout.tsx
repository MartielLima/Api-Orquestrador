import React from 'react';
import { Box } from 'ink';
import { Header } from './Header';
import { Sidebar, type NavItem } from './Sidebar';
import { Footer } from './Footer';
import type { AuthUser } from '../api/auth';

interface Props {
  user: AuthUser | null;
  navItems: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  hints: { key: string; label: string }[];
  children: React.ReactNode;
}

export function Layout({ user, navItems, activeKey, onSelect, hints, children }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header user={user} />
      <Box flexGrow={1}>
        <Sidebar items={navItems} activeKey={activeKey} onSelect={onSelect} />
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          {children}
        </Box>
      </Box>
      <Footer hints={hints} />
    </Box>
  );
}
