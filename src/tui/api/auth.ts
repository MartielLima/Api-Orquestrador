import fs from 'fs';
import path from 'path';
import envPaths from 'env-paths';
import type { ApiClient } from './client';
import { M_LOGIN, M_REFRESH } from './queries';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
}

export interface PersistedSession {
  apiUrl: string;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  accessTokenExp: number;
}

function sessionPath(): string {
  const dir = envPaths('api-orquestrador', { suffix: '' }).config;
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'session.json');
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = fs.readFileSync(sessionPath(), 'utf-8');
    const s = JSON.parse(raw) as PersistedSession;
    if (s.accessTokenExp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: PersistedSession): void {
  const p = sessionPath();
  fs.writeFileSync(p, JSON.stringify(s, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* windows no-op */
  }
}

export function clearSession(): void {
  try {
    fs.unlinkSync(sessionPath());
  } catch {
    /* ignore */
  }
}

function decodeJwtExp(token: string): number {
  try {
    const part = token.split('.')[1];
    const json = Buffer.from(part, 'base64url').toString('utf-8');
    return (JSON.parse(json) as { exp: number }).exp * 1000;
  } catch {
    return Date.now();
  }
}

export async function login(
  api: ApiClient,
  apiUrl: string,
  email: string,
  password: string,
): Promise<PersistedSession> {
  type R = { login: { accessToken: string; refreshToken: string; user: AuthUser } };
  const data = await api.request<R>(M_LOGIN, { email, password });
  const session: PersistedSession = {
    apiUrl,
    accessToken: data.login.accessToken,
    refreshToken: data.login.refreshToken,
    user: data.login.user,
    accessTokenExp: decodeJwtExp(data.login.accessToken),
  };
  saveSession(session);
  return session;
}

export async function refresh(
  api: ApiClient,
  current: PersistedSession,
): Promise<PersistedSession> {
  type R = { refresh: { accessToken: string; refreshToken: string; user: AuthUser } };
  const data = await api.request<R>(M_REFRESH, { refreshToken: current.refreshToken });
  const session: PersistedSession = {
    apiUrl: current.apiUrl,
    accessToken: data.refresh.accessToken,
    refreshToken: data.refresh.refreshToken,
    user: data.refresh.user,
    accessTokenExp: decodeJwtExp(data.refresh.accessToken),
  };
  saveSession(session);
  return session;
}
