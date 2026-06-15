import fs from 'fs';
import os from 'os';
import path from 'path';
import { saveSession, loadSession, clearSession } from '../../../src/tui/api/auth';

jest.mock('env-paths', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-auth-test-'));
  return () => ({ config: tmp });
});

describe('auth session persistence', () => {
  it('round-trips a session through save/load', () => {
    const s = {
      apiUrl: 'http://localhost:4000/',
      accessToken: 'a'.repeat(40),
      refreshToken: 'b'.repeat(40),
      user: {
        id: 'u1',
        email: 'a@b.dev',
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
      },
      accessTokenExp: Date.now() + 60_000,
    };
    saveSession(s);
    const loaded = loadSession();
    expect(loaded).toEqual(s);
  });

  it('loadSession returns null when session is expired', () => {
    const s = {
      apiUrl: 'http://localhost:4000/',
      accessToken: 'a'.repeat(40),
      refreshToken: 'b'.repeat(40),
      user: {
        id: 'u1',
        email: 'a@b.dev',
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
      },
      accessTokenExp: Date.now() - 1,
    };
    saveSession(s);
    expect(loadSession()).toBeNull();
  });

  it('clearSession removes the file', () => {
    saveSession({
      apiUrl: 'http://x',
      accessToken: 'a',
      refreshToken: 'b',
      user: { id: 'u', email: 'a', role: 'admin', active: true, createdAt: '' },
      accessTokenExp: Date.now() + 60_000,
    });
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
