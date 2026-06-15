import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { Modal } from '../../../src/tui/components/Modal';

describe('Modal', () => {
  it('renders title and children', () => {
    const { lastFrame, unmount } = render(
      <Modal title="Hello"><Text>body</Text></Modal>,
    );
    expect(lastFrame()).toContain('Hello');
    expect(lastFrame()).toContain('body');
    unmount();
  });
});
