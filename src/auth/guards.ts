import { UserError, UserErrorCode } from './errors';
import type { AppContext, AuthUser } from '../context';

export function requireAuth(ctx: AppContext): AuthUser {
  if (!ctx.user) {
    throw new UserError(UserErrorCode.UNAUTHENTICATED, 'Authentication required');
  }
  return ctx.user;
}

export function requireAdmin(ctx: AppContext): AuthUser {
  const user = requireAuth(ctx);
  if (user.role !== 'admin') {
    throw new UserError(UserErrorCode.FORBIDDEN, 'Admin role required');
  }
  return user;
}
