import { requireAuth, requireAdmin } from '../../src/auth/guards';
import { UserError, UserErrorCode } from '../../src/auth/errors';
import type { AppContext } from '../../src/context';

function makeCtx(role: string | null): AppContext {
  return {
    user: role ? { id: 'u1', email: 'x@x.com', role } : null,
    logger: console as never,
    db: {} as never,
    orchestrator: {} as never,
  };
}

describe('guards', () => {
  it('requireAuth throws UNAUTHENTICATED when user is null', () => {
    expect(() => requireAuth(makeCtx(null))).toThrow(UserError);
    try { requireAuth(makeCtx(null)); } catch (e) {
      expect((e as UserError).code).toBe(UserErrorCode.UNAUTHENTICATED);
    }
  });

  it('requireAuth returns the user when present', () => {
    const u = requireAuth(makeCtx('user'));
    expect(u.role).toBe('user');
  });

  it('requireAdmin throws FORBIDDEN for non-admin', () => {
    try { requireAdmin(makeCtx('user')); } catch (e) {
      expect((e as UserError).code).toBe(UserErrorCode.FORBIDDEN);
    }
  });

  it('requireAdmin returns the user for admin', () => {
    const u = requireAdmin(makeCtx('admin'));
    expect(u.role).toBe('admin');
  });
});
