import React from 'react';
import { render } from 'ink-testing-library';
import { Tokens } from '../../../../src/tui/views/Users/Tokens';
import type { UserRow, RefreshTokenRow } from '../../../../src/tui/views/Users/types';

const user: UserRow = { id: 'u1', email: 'a@b.dev', role: 'user', active: true, createdAt: '2026-06-15T00:00:00.000Z' };
const tokens: RefreshTokenRow[] = [
  { id: 't1', userId: 'u1', createdAt: '2026-06-10T10:00:00.000Z', expiresAt: '2026-06-17T10:00:00.000Z', revokedAt: null },
  { id: 't2', userId: 'u1', createdAt: '2026-06-12T10:00:00.000Z', expiresAt: '2026-06-19T10:00:00.000Z', revokedAt: '2026-06-13T10:00:00.000Z' },
];

describe('Tokens', () => {
  it('renders the user email in the title', () => {
    const { lastFrame, unmount } = render(
      <Tokens user={user} tokens={tokens} loading={false} onRevoke={async () => {}} onBack={() => {}} />,
    );
    const f = lastFrame();
    expect(f).toContain('a@b.dev');
    unmount();
  });

  it('shows empty state when there are no tokens', () => {
    const { lastFrame, unmount } = render(
      <Tokens user={user} tokens={[]} loading={false} onRevoke={async () => {}} onBack={() => {}} />,
    );
    const f = lastFrame();
    expect(f).toMatch(/nenhum|empty|0 token/i);
    unmount();
  });
});
