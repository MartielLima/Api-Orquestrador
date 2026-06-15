import React from 'react';
import { render } from 'ink-testing-library';
import { EditForm } from '../../../../src/tui/views/Users/EditForm';
import type { UserRow } from '../../../../src/tui/views/Users/types';

const user: UserRow = { id: 'u1', email: 'a@b.dev', role: 'user', active: true, createdAt: '2026-06-15T00:00:00.000Z' };

describe('EditForm', () => {
  it('renders the user email and current role', () => {
    const { lastFrame, unmount } = render(
      <EditForm user={user} isSelf={false} onSubmit={async () => {}} onCancel={() => {}} />,
    );
    const f = lastFrame();
    expect(f).toContain('a@b.dev');
    expect(f).toContain('Role');
    expect(f).toContain('user');
    unmount();
  });

  it('shows self-demote warning when editing self', () => {
    const { lastFrame, unmount } = render(
      <EditForm user={user} isSelf={true} onSubmit={async () => {}} onCancel={() => {}} />,
    );
    const f = lastFrame();
    expect(f).toMatch(/você|self|si mesmo/i);
    unmount();
  });
});
