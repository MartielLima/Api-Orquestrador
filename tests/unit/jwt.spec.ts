import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/auth/jwt';

const SECRET_A = 'a'.repeat(32);
const SECRET_R = 'b'.repeat(32);

describe('jwt', () => {
  it('signs and verifies an access token', () => {
    const token = signAccessToken(
      { sub: 'u1', email: 'a@b.c', role: 'user' },
      { secret: SECRET_A, expiresIn: '1m' },
    );
    const payload = verifyAccessToken(token, { secret: SECRET_A });
    expect(payload.sub).toBe('u1');
    expect(payload.email).toBe('a@b.c');
  });

  it('throws on invalid signature', () => {
    const token = signAccessToken({ sub: 'u1' }, { secret: SECRET_A, expiresIn: '1m' });
    expect(() => verifyAccessToken(token, { secret: 'z'.repeat(32) })).toThrow();
  });

  it('signs and verifies a refresh token', () => {
    const token = signRefreshToken({ sub: 'u1' }, { secret: SECRET_R, expiresIn: '7d' });
    const payload = verifyRefreshToken(token, { secret: SECRET_R });
    expect(payload.sub).toBe('u1');
  });
});
