import type { ReactElement } from 'react';

export interface RenderInstance {
  readonly lastFrame: () => string | undefined;
  readonly rerender: (tree: ReactElement) => void;
  readonly unmount: () => void;
  readonly cleanup: () => void;
  readonly debug: () => void;
  readonly stdout: {
    lastFrame: () => string | undefined;
    write: (chunk: string) => void;
    readonly frames: string[];
  };
  readonly stderr: {
    lastFrame: () => string | undefined;
    write: (chunk: string) => void;
    readonly frames: string[];
  };
  readonly stdin: { write: (data: string) => void };
}

export function render(tree: ReactElement): RenderInstance;
