import React from 'react';
import { render } from 'ink-testing-library';
import { Field } from '../../../src/tui/components/Form';

describe('Field', () => {
  it('renders label and value', () => {
    const { lastFrame, unmount } = render(
      <Field label="Email" value="a@b.dev" onChange={() => {}} />,
    );
    expect(lastFrame()).toContain('Email');
    expect(lastFrame()).toContain('a@b.dev');
    unmount();
  });

  it('renders error inline', () => {
    const { lastFrame, unmount } = render(
      <Field label="Email" value="" onChange={() => {}} error="required" />,
    );
    expect(lastFrame()).toContain('required');
    unmount();
  });

  it('masks password input', () => {
    const { lastFrame, unmount } = render(
      <Field label="Senha" value="secret" onChange={() => {}} password />,
    );
    expect(lastFrame()).toContain('Senha');
    expect(lastFrame()).not.toContain('secret');
    unmount();
  });
});
