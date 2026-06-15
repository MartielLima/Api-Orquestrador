import React from 'react';
import { render } from 'ink-testing-library';
import { Toast } from '../../../src/tui/components/Toast';

describe('Toast', () => {
  it('renders success icon and message', () => {
    const { lastFrame, unmount } = render(<Toast kind="success" message="Saved" onDone={() => {}} />);
    expect(lastFrame()).toContain('✓');
    expect(lastFrame()).toContain('Saved');
    unmount();
  });

  it('renders error icon', () => {
    const { lastFrame, unmount } = render(<Toast kind="error" message="Oops" onDone={() => {}} />);
    expect(lastFrame()).toContain('✗');
    unmount();
  });

  // TODO: ESM jest support — useEffect timer-based testing requires real React renderer.
  // The fake dispatcher used by the shim no-ops useEffect, so onDone never fires.
  it.skip('calls onDone after ttl', (done) => {
    render(<Toast kind="info" message="hi" ttl={50} onDone={() => { done(); }} />);
  });
});
