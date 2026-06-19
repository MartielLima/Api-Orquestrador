import { useCallback, useMemo, useState } from 'react';
import type { ToastKind } from '../components/Toast';

export interface ToastEntry {
  id: number;
  kind: ToastKind;
  message: string;
  ttl?: number;
}

export interface ToastApi {
  toasts: ToastEntry[];
  push: (kind: ToastKind, message: string, ttl?: number) => void;
  dismiss: (id: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

let nextId = 1;

export function useToast(): ToastApi {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, ttl = 3000) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, kind, message, ttl }]);
      if (ttl > 0) {
        setTimeout(() => dismiss(id), ttl);
      }
    },
    [dismiss],
  );

  const success = useCallback((m: string) => push('success', m), [push]);
  const error = useCallback((m: string) => push('error', m), [push]);
  const info = useCallback((m: string) => push('info', m), [push]);

  return useMemo(
    () => ({ toasts, push, dismiss, success, error, info }),
    [toasts, push, dismiss, success, error, info],
  );
}
