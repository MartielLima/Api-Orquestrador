import { useInput } from 'ink';
import { useApp } from 'ink';

export interface KeyBinding {
  key: string;
  description: string;
  handler: () => void;
}

export interface KeypressOptions {
  bindings: KeyBinding[];
  isActive?: boolean;
}

export function useKeypress(opts: KeypressOptions): void {
  const { exit } = useApp();
  const isActive = opts.isActive ?? true;
  useInput((input, key) => {
    if (!isActive) return;
    if (input === 'q' && !key.ctrl) {
      exit();
      return;
    }
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }
    for (const b of opts.bindings) {
      if (input === b.key) {
        b.handler();
        return;
      }
    }
  });
}
