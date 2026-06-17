import { verifyPassword } from './password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './jwt';
import { createHash } from 'crypto';
import type { Db } from '../db/client';
import type { Logger } from 'pino';
import { UserError, UserErrorCode } from './errors';

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  refreshTtl: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function ttlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) throw new Error(`Invalid TTL: ${ttl}`);
  const n = Number(m[1]);
  return n * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd']!;
}

export function buildAuthResolvers(cfg: AuthConfig) {
  return {
    Mutation: {
      login: async (
        _: unknown,
        args: { email: string; password: string },
        ctx: { db: Db; logger: Logger },
      ) => {
        const { rows } = await ctx.db.execute({
          sql: 'SELECT id, email, password_hash, role, active FROM users WHERE email = $1',
          args: [args.email],
        });
        const u = rows[0];
        if (!u || !u.active) {
          throw new UserError(UserErrorCode.UNAUTHENTICATED, 'Invalid credentials');
        }
        const ok = await verifyPassword(args.password, u.password_hash);
        if (!ok) {
          throw new UserError(UserErrorCode.UNAUTHENTICATED, 'Invalid credentials');
        }

        const accessToken = signAccessToken(
          { sub: u.id, email: u.email, role: u.role },
          { secret: cfg.accessSecret, expiresIn: cfg.accessTtl as never },
        );
        const refreshToken = signRefreshToken(
          { sub: u.id },
          { secret: cfg.refreshSecret, expiresIn: cfg.refreshTtl as never },
        );
        await ctx.db.execute({
          sql: `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
          args: [u.id, hashToken(refreshToken), new Date(Date.now() + ttlToMs(cfg.refreshTtl))],
        });
        return {
          accessToken,
          refreshToken,
          user: { id: u.id, email: u.email, role: u.role, active: u.active, createdAt: new Date() },
        };
      },

      refresh: async (
        _: unknown,
        args: { refreshToken: string },
        ctx: { db: Db; logger: Logger },
      ) => {
        const payload = verifyRefreshToken(args.refreshToken, { secret: cfg.refreshSecret });
        const { rows } = await ctx.db.execute({
          sql: `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1`,
          args: [hashToken(args.refreshToken)],
        });
        const t = rows[0];
        if (!t || t.revoked_at || new Date(t.expires_at) < new Date()) {
          throw new UserError(UserErrorCode.UNAUTHENTICATED, 'Invalid refresh token');
        }
        const { rows: urows } = await ctx.db.execute({
          sql: 'SELECT id, email, role, active FROM users WHERE id = $1 AND active = true',
          args: [payload.sub],
        });
        const u = urows[0];
        if (!u) {
          throw new UserError(UserErrorCode.UNAUTHENTICATED, 'User not found');
        }

        await ctx.db.execute({
          sql: 'UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1',
          args: [t.id],
        });
        const newRefresh = signRefreshToken(
          { sub: u.id },
          { secret: cfg.refreshSecret, expiresIn: cfg.refreshTtl as never },
        );
        await ctx.db.execute({
          sql: 'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
          args: [u.id, hashToken(newRefresh), new Date(Date.now() + ttlToMs(cfg.refreshTtl))],
        });
        const accessToken = signAccessToken(
          { sub: u.id, email: u.email, role: u.role },
          { secret: cfg.accessSecret, expiresIn: cfg.accessTtl as never },
        );
        return {
          accessToken,
          refreshToken: newRefresh,
          user: { id: u.id, email: u.email, role: u.role, active: u.active, createdAt: new Date() },
        };
      },
    },
  };
}
