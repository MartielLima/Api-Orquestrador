import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../../src/tui/app';

describe('App smoke', () => {
  it('renders without crashing', () => {
    const { lastFrame, unmount } = render(<App />);
    expect(lastFrame()).toContain('API Orquestrador TUI');
    unmount();
  });
});
