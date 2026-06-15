import { UserError, UserErrorCode } from '../../src/auth/errors';

describe('UserError', () => {
  it('carries a code and message', () => {
    const e = new UserError(UserErrorCode.EMAIL_TAKEN, 'email already exists');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(UserErrorCode.EMAIL_TAKEN);
    expect(e.message).toBe('email already exists');
    expect(e.name).toBe('UserError');
  });

  it('toGraphQLFormat exposes extensions.code', () => {
    const e = new UserError(UserErrorCode.WEAK_PASSWORD, 'too short');
    expect(e.toGraphQLFormat()).toEqual({
      message: 'too short',
      extensions: { code: 'WEAK_PASSWORD' },
    });
  });

  it('all codes are unique strings', () => {
    const codes = Object.values(UserErrorCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
