import { useSyncExternalStore } from 'react';

let count = 0;
const listeners = new Set<(focused: boolean) => void>();

function emit(): void {
  const focused = count > 0;
  listeners.forEach((l) => l(focused));
}

export function reportInputFocus(focused: boolean): void {
  const next = Math.max(0, count + (focused ? 1 : -1));
  if (next === count) return;
  count = next;
  emit();
}

export function subscribeInputFocus(listener: (focused: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInputFocused(): boolean {
  return count > 0;
}

export function useTextInputFocused(): boolean {
  return useSyncExternalStore(subscribeInputFocus, getInputFocused, getInputFocused);
}