import React from 'react';
import { render } from 'ink-testing-library';
import { StatusBadge } from '../../../src/tui/components/StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['ok', 'OK'],
    ['error', 'ERRO'],
    ['cacheHit', 'CACHE'],
    ['pending', '...'],
    ['inactive', 'OFF'],
  ] as const)('renders %s with label %s', (kind, label) => {
    const { lastFrame, unmount } = render(<StatusBadge kind={kind} label={label} />);
    expect(lastFrame()).toContain(`[${label}]`);
    unmount();
  });
});
