import { useContext, createContext, type ReactNode } from 'react';
import type { ApiClient } from '../api/client';
import type { AuthUser } from '../api/auth';

export interface ApiContext {
  api: ApiClient;
  user: AuthUser;
  apiUrl: string;
}

const Ctx = createContext<ApiContext | null>(null);

export function ApiProvider({ value, children }: { value: ApiContext; children: ReactNode }): React.ReactElement {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApi(): ApiContext {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useApi deve ser usado dentro de <ApiProvider>');
  }
  return v;
}
