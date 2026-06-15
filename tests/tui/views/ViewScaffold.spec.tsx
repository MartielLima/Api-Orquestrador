import React from 'react';
import { render } from 'ink-testing-library';
import { ViewScaffold } from '../../../src/tui/views/ViewScaffold';

describe('ViewScaffold', () => {
  it('renders title and empty placeholder', () => {
    const { lastFrame, unmount } = render(<ViewScaffold title="Foo" empty />);
    const f = lastFrame();
    expect(f).toContain('Foo');
    expect(f).toMatch(/em constru/);
    unmount();
  });

  it('renders spinner when loading', () => {
    const { lastFrame, unmount } = render(<ViewScaffold title="Bar" loading />);
    expect(lastFrame()).toContain('carregando');
    unmount();
  });
});
