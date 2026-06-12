import type { Logger } from 'pino';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface AppContext {
  user: AuthUser | null;
  logger: Logger;
}

export async function buildContext(): Promise<AppContext> {
  return {
    user: null,
    logger: console as unknown as Logger,
  };
}
