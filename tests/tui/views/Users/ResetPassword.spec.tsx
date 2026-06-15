import React from 'react';
import { render } from 'ink-testing-library';
import { ResetPassword } from '../../../../src/tui/views/Users/ResetPassword';
import type { UserRow } from '../../../../src/tui/views/Users/types';

const user: UserRow = { id: 'u1', email: 'a@b.dev', role: 'user', active: true, createdAt: '2026-06-15T00:00:00.000Z' };

describe('ResetPassword', () => {
  it('renders the user email and the random/manual options', () => {
    const { lastFrame, unmount } = render(
      <ResetPassword user={user} onSubmit={async () => ''} onCancel={() => {}} onDone={() => {}} />,
    );
    const f = lastFrame();
    expect(f).toContain('a@b.dev');
    expect(f).toContain('aleatória');
    expect(f).toMatch(/manual/i);
    expect(f).toMatch(/uma vez|anote/i);
    unmount();
  });
});
