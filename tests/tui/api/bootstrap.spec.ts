import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-bootstrap-test-'));

jest.mock('env-paths', () => () => ({ config: tmpDir }));

import { clearSession, loadSession, saveSession } from '../../../src/tui/api/auth';
import { bootstrapSession } from '../../../src/tui/api/bootstrap';
import { Q_ME } from '../../../src/tui/api/queries';

function okUser() {
  return {
    id: 'u1',
    email: 'admin@local.dev',
    role: 'admin',
    active: true,
    createdAt: '2026-06-15T00:00:00Z',
  };
}

function makeJwt(expSec: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: 'u1', email: 'admin@local.dev', role: 'admin', exp: expSec }),
  ).toString('base64url');
  return `${header}.${payload}.signature`;
}

function okResponse(data: unknown): Response {
  const body = JSON.stringify({ data });
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => JSON.parse(body),
    text: async () => body,
  } as Response;
}

function unauthResponse(): Response {
  const body = JSON.stringify({
    errors: [{ message: 'Authentication required', extensions: { code: 'UNAUTHENTICATED' } }],
  });
  return {
    ok: false,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => JSON.parse(body),
    text: async () => body,
  } as Response;
}

describe('bootstrapSession', () => {
  const origToken = process.env.TUI_API_TOKEN;
  const origEmail = process.env.SEED_ADMIN_EMAIL;
  const origPwd = process.env.SEED_ADMIN_PASSWORD;
  const origUrl = process.env.TUI_API_URL;

  beforeEach(() => {
    clearSession();
    delete process.env.TUI_API_TOKEN;
    delete process.env.SEED_ADMIN_EMAIL;
    delete process.env.SEED_ADMIN_PASSWORD;
    process.env.TUI_API_URL = 'http://localhost:4000/graphql';
  });

  afterAll(() => {
    if (origToken) process.env.TUI_API_TOKEN = origToken;
    else delete process.env.TUI_API_TOKEN;
    if (origEmail) process.env.SEED_ADMIN_EMAIL = origEmail;
    else delete process.env.SEED_ADMIN_EMAIL;
    if (origPwd) process.env.SEED_ADMIN_PASSWORD = origPwd;
    else delete process.env.SEED_ADMIN_PASSWORD;
    if (origUrl) process.env.TUI_API_URL = origUrl;
    else delete process.env.TUI_API_URL;
  });

  it('returns err when no token, no session, and no seed creds', async () => {
    const r = await bootstrapSession();
    expect(r.kind).toBe('err');
    if (r.kind === 'err') {
      expect(r.message).toMatch(/SEED_ADMIN_EMAIL/);
    }
  });

  it('uses TUI_API_TOKEN env when present and decodable', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    process.env.TUI_API_TOKEN = makeJwt(future);

    const fakeFetch = jest.fn().mockImplementation(async () => {
      const body = JSON.stringify({ data: { me: okUser() } });
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => JSON.parse(body),
        text: async () => body,
      };
    });
    const origFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch;
    try {
      const r = await bootstrapSession();
      expect(r.kind).toBe('ok');
      if (r.kind === 'ok') {
        expect(r.user.email).toBe('admin@local.dev');
        expect(r.session.accessToken).toBe(process.env.TUI_API_TOKEN);
      }
    } finally {
      (globalThis as unknown as { fetch: unknown }).fetch = origFetch;
    }
  });

  it('returns err hinting at env when fetch fails for env token', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    process.env.TUI_API_TOKEN = makeJwt(future);
    const fakeFetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const origFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch;
    try {
      const r = await bootstrapSession();
      expect(r.kind).toBe('err');
    } finally {
      (globalThis as unknown as { fetch: unknown }).fetch = origFetch;
    }
  });

  it('attempts silent login via SEED_ADMIN_EMAIL/PASSWORD when no token', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@local.dev';
    process.env.SEED_ADMIN_PASSWORD = 'Aa1!aaaa';

    const loginToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    const fakeFetch = jest.fn().mockImplementation(async () => {
      const body = JSON.stringify({
        data: {
          login: {
            accessToken: loginToken,
            refreshToken: 'r'.repeat(40),
            user: okUser(),
          },
        },
      });
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => JSON.parse(body),
        text: async () => body,
      };
    });
    const origFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch;
    try {
      const r = await bootstrapSession();
      expect(r.kind).toBe('ok');
      if (r.kind === 'ok') {
        expect(r.user.email).toBe('admin@local.dev');
        expect(r.session.refreshToken).toBe('r'.repeat(40));
        expect(process.env.TUI_API_TOKEN).toBe(loginToken);
        expect(loadSession()?.accessToken).toBe(loginToken);
      }
    } finally {
      (globalThis as unknown as { fetch: unknown }).fetch = origFetch;
    }
  });

  it('returns err if seed login itself fails', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@local.dev';
    process.env.SEED_ADMIN_PASSWORD = 'wrong';
    const fakeFetch = jest.fn().mockRejectedValue(new Error('401 Unauthorized'));
    const origFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch;
    try {
      const r = await bootstrapSession();
      expect(r.kind).toBe('err');
    } finally {
      (globalThis as unknown as { fetch: unknown }).fetch = origFetch;
    }
  });

  it('auto-refreshes when an authenticated query returns UNAUTHENTICATED', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const oldAccess = makeJwt(future);
    const newAccess = makeJwt(future + 3600);
    const newRefresh = 'r'.repeat(50);
    const persistedRefresh = 'r'.repeat(40);

    saveSession({
      apiUrl: 'http://localhost:4000/graphql',
      accessToken: oldAccess,
      refreshToken: persistedRefresh,
      user: okUser(),
      accessTokenExp: future * 1000,
    });

    let meCalls = 0;
    const callLog: string[] = [];
    const fakeFetch = jest.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = String(init?.body ?? '');
      if (body.includes('refresh(')) {
        callLog.push('refresh');
        return okResponse({ refresh: { accessToken: newAccess, refreshToken: newRefresh, user: okUser() } });
      }
      if (body.includes('me ')) {
        meCalls += 1;
        callLog.push(`me#${meCalls}`);
        if (meCalls === 1) return unauthResponse();
        return okResponse({ me: okUser() });
      }
      return okResponse({ health: 'ok' });
    });
    const origFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = fakeFetch;
    try {
      const r = await bootstrapSession();
      expect(r.kind).toBe('ok');
      if (r.kind !== 'ok') return;
      await r.api.request<{ me: typeof okUser extends () => infer R ? R : never }>(Q_ME);
      const stored = loadSession();
      expect(stored?.accessToken).toBe(newAccess);
      expect(stored?.refreshToken).toBe(newRefresh);
      expect(callLog).toEqual(['me#1', 'refresh', 'me#2']);
    } finally {
      (globalThis as unknown as { fetch: unknown }).fetch = origFetch;
    }
  });
});
