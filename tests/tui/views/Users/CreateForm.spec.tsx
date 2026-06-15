import React from 'react';
import { render } from 'ink-testing-library';
import { CreateForm } from '../../../../src/tui/views/Users/CreateForm';

describe('CreateForm', () => {
  it('renders email, role, password, and confirm fields', () => {
    const { lastFrame, unmount } = render(
      <CreateForm onSubmit={async () => {}} onCancel={() => {}} />,
    );
    const f = lastFrame();
    expect(f).toContain('Email');
    expect(f).toContain('Role');
    expect(f).toContain('Senha');
    expect(f).toContain('Confirmar');
    expect(f).toContain('admin');
    expect(f).toContain('user');
    unmount();
  });

  it('renders submit and cancel hints', () => {
    const { lastFrame, unmount } = render(
      <CreateForm onSubmit={async () => {}} onCancel={() => {}} />,
    );
    const f = lastFrame();
    expect(f).toContain('criar');
    expect(f).toContain('cancelar');
    unmount();
  });
});
