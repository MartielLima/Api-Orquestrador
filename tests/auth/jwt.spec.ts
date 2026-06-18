/* eslint-disable @typescript-eslint/no-explicit-any */
import { signRefreshToken, verifyRefreshToken } from '../../src/auth/jwt';

describe('signRefreshToken jti uniqueness', () => {
  const opts = { secret: 'a'.repeat(32), expiresIn: '7d' as any };

  it('produces different tokens for two consecutive calls with same payload', () => {
    const t1 = signRefreshToken({ sub: 'user-1' }, opts);
    const t2 = signRefreshToken({ sub: 'user-1' }, opts);
    expect(t1).not.toBe(t2);
  });

  it('both tokens verify with the same payload', () => {
    const t1 = signRefreshToken({ sub: 'user-2' }, opts);
    const t2 = signRefreshToken({ sub: 'user-2' }, opts);
    const p1 = verifyRefreshToken(t1, { secret: opts.secret });
    const p2 = verifyRefreshToken(t2, { secret: opts.secret });
    expect(p1.sub).toBe('user-2');
    expect(p2.sub).toBe('user-2');
  });
});
