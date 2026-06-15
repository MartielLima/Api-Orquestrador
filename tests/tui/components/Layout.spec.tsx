import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { Layout } from '../../../src/tui/components/Layout';

const user = { id: 'u1', email: 'a@b.dev', role: 'admin', active: true, createdAt: '' };
const nav = [
  { key: 'users', label: 'Usuários' },
  { key: 'logs', label: 'Logs' },
];

describe('Layout', () => {
  it('renders header, sidebar, footer, and children', () => {
    const { lastFrame, unmount } = render(
      <Layout
        user={user}
        navItems={nav}
        activeKey="users"
        onSelect={() => {}}
        hints={[{ key: 'n', label: 'novo' }]}
      >
        <Text>conteúdo</Text>
      </Layout>,
    );
    expect(lastFrame()).toContain('API ORQUESTRADOR');
    expect(lastFrame()).toContain('Usuários');
    expect(lastFrame()).toContain('Logs');
    expect(lastFrame()).toContain('conteúdo');
    unmount();
  });

  it('marks the active sidebar item', () => {
    const { lastFrame, unmount } = render(
      <Layout user={user} navItems={nav} activeKey="logs" onSelect={() => {}} hints={[]}>
        <Text>x</Text>
      </Layout>,
    );
    expect(lastFrame()).toMatch(/▸\s*Logs/);
    unmount();
  });
});
