import React from 'react';
import { render } from 'ink-testing-library';
import { render as rtlRender } from 'ink-testing-library';
import { useToast, type ToastApi } from '../../../src/tui/hooks/useToast';

function Probe({ apiRef }: { apiRef: { current: ToastApi | null } }): React.ReactElement {
  apiRef.current = useToast();
  return <></>;
}

describe('useToast (initial state)', () => {
  it('starts with an empty queue', () => {
    const ref: { current: ToastApi | null } = { current: null };
    const { unmount } = render(<Probe apiRef={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.toasts).toEqual([]);
    unmount();
  });
});

describe('useToast module exports', () => {
  it('exposes the expected api shape', () => {
    const ref: { current: ToastApi | null } = { current: null };
    const { unmount } = rtlRender(<Probe apiRef={ref} />);
    const api = ref.current!;
    expect(typeof api.push).toBe('function');
    expect(typeof api.dismiss).toBe('function');
    expect(typeof api.success).toBe('function');
    expect(typeof api.error).toBe('function');
    expect(typeof api.info).toBe('function');
    unmount();
  });
});
