import React from 'react';
import { render } from 'ink-testing-library';
import { Confirm } from '../../../src/tui/components/Confirm';

describe('Confirm', () => {
  // TODO: ESM jest support — interactive stdin tests (pressing y/n) are skipped.
  // The shim's fake dispatcher no-ops useInput, so keyboard simulation cannot
  // trigger onConfirm/onCancel. The shim does not process stdin events.
  it('renders message and Yes/No buttons', () => {
    const { lastFrame, unmount } = render(
      <Confirm message="Sure?" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(lastFrame()).toContain('Sure?');
    expect(lastFrame()).toContain('Sim');
    expect(lastFrame()).toContain('Não');
    unmount();
  });
});
