import type { Logger } from 'pino';
import { buildDb, type Db } from './db/client';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface AppContext {
  user: AuthUser | null;
  logger: Logger;
  db: Db;
}

export async function buildContext(): Promise<Omit<AppContext, 'orchestrator'>> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return {
    user: null,
    logger: console as unknown as Logger,
    db: buildDb(url),
  };
}
