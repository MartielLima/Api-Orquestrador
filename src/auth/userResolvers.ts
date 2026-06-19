import { requireAuth, requireAdmin } from './guards';
import { UserError, UserErrorCode } from './errors';
import { hashPassword } from './password';
import { createUserSchema, updateUserSchema, resetPasswordSchema } from './validators';
import { recordAudit } from './audit';
import type { AppContext } from '../context';

function mapUniqueViolation(e: unknown): UserError {
  const msg = (e as { message?: string })?.message ?? '';
  if (/duplicate key/i.test(msg) || /unique constraint/i.test(msg)) {
    return new UserError(UserErrorCode.EMAIL_TAKEN, 'email already in use');
  }
  return new UserError(UserErrorCode.INVALID_INPUT, msg);
}

function rowToUser(r: Record<string, unknown>): {
  id: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: Date;
} {
  return {
    id: r.id as string,
    email: r.email as string,
    role: r.role as string,
    active: r.active as boolean,
    createdAt: r.created_at as Date,
  };
}

export const userResolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: AppContext) => {
      const u = requireAuth(ctx);
      const { rows } = await ctx.db.execute({
        sql: 'SELECT id, email, role, active, created_at FROM users WHERE id = $1',
        args: [u.id],
      });
      const r = rows[0];
      if (!r) throw new UserError(UserErrorCode.USER_NOT_FOUND, 'user not found');
      return rowToUser(r);
    },

    users: async (_: unknown, __: unknown, ctx: AppContext) => {
      requireAdmin(ctx);
      const { rows } = await ctx.db.execute({
        sql: 'SELECT id, email, role, active, created_at FROM users ORDER BY created_at DESC',
        args: [],
      });
      return (rows as Record<string, unknown>[]).map(rowToUser);
    },

    refreshTokens: async (_: unknown, args: { userId: string }, ctx: AppContext) => {
      requireAdmin(ctx);
      const { rows } = await ctx.db.execute({
        sql: `SELECT id, user_id, created_at, expires_at, revoked_at
              FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
        args: [args.userId],
      });
      return (rows as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        userId: r.user_id as string,
        createdAt: r.created_at as Date,
        expiresAt: r.expires_at as Date,
        revokedAt: r.revoked_at as Date | null,
      }));
    },
  },

  Mutation: {
    createUser: async (
      _: unknown,
      args: { input: { email: string; password: string; role: string } },
      ctx: AppContext,
    ) => {
      requireAdmin(ctx);
      const parsed = createUserSchema.safeParse(args.input);
      if (!parsed.success) {
        throw new UserError(
          UserErrorCode.WEAK_PASSWORD,
          parsed.error.issues[0]?.message ?? 'invalid input',
        );
      }
      try {
        const hash = await hashPassword(parsed.data.password);
        const { rows } = await ctx.db.execute({
          sql: `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
                RETURNING id, email, role, active, created_at`,
          args: [parsed.data.email, hash, parsed.data.role],
        });
        const created = rowToUser(rows[0] as Record<string, unknown>);
        await recordAudit(
          {
            db: ctx.db,
            logger: ctx.logger,
            actorUserId: ctx.user?.id ?? null,
            ip: ctx.request?.ip ?? null,
            userAgent: ctx.request?.userAgent ?? null,
          },
          'user.create',
          'users',
          created.id,
          { id: created.id, email: created.email, role: created.role, active: created.active },
        );
        return created;
      } catch (e) {
        throw mapUniqueViolation(e);
      }
    },

    updateUser: async (
      _: unknown,
      args: { id: string; input: { role?: string; active?: boolean } },
      ctx: AppContext,
    ) => {
      const me = requireAdmin(ctx);
      const parsed = updateUserSchema.safeParse(args.input);
      if (!parsed.success) {
        throw new UserError(
          UserErrorCode.INVALID_INPUT,
          parsed.error.issues[0]?.message ?? 'invalid input',
        );
      }
      if (args.id === me.id) {
        if (parsed.data.role && parsed.data.role !== 'admin') {
          throw new UserError(UserErrorCode.CANNOT_DEMOTE_SELF, 'cannot demote yourself');
        }
        if (parsed.data.active === false) {
          throw new UserError(UserErrorCode.CANNOT_DEACTIVATE_SELF, 'cannot deactivate yourself');
        }
      }
      const { rows: existing } = await ctx.db.execute({
        sql: 'SELECT id, role, active FROM users WHERE id = $1',
        args: [args.id],
      });
      const before = existing[0] as { id: string; role: string; active: boolean } | undefined;
      if (!before) throw new UserError(UserErrorCode.USER_NOT_FOUND, 'user not found');

      const sets: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      const diff: Record<string, { from: unknown; to: unknown }> = {};
      if (parsed.data.role !== undefined) {
        if (parsed.data.role !== before.role) {
          sets.push(`role = $${i++}`);
          params.push(parsed.data.role);
          diff.role = { from: before.role, to: parsed.data.role };
        }
      }
      if (parsed.data.active !== undefined) {
        if (parsed.data.active !== before.active) {
          sets.push(`active = $${i++}`);
          params.push(parsed.data.active);
          diff.active = { from: before.active, to: parsed.data.active };
        }
      }

      if (sets.length === 0) {
        const { rows } = await ctx.db.execute({
          sql: 'SELECT id, email, role, active, created_at FROM users WHERE id = $1',
          args: [args.id],
        });
        return rowToUser(rows[0] as Record<string, unknown>);
      }

      sets.push('updated_at = now()');
      params.push(args.id);
      const { rows } = await ctx.db.execute({
        sql: `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
              RETURNING id, email, role, active, created_at`,
        args: params,
      });
      await recordAudit(
        {
          db: ctx.db,
          logger: ctx.logger,
          actorUserId: ctx.user?.id ?? null,
          ip: ctx.request?.ip ?? null,
          userAgent: ctx.request?.userAgent ?? null,
        },
        'user.update',
        'users',
        args.id,
        diff,
      );
      return rowToUser(rows[0] as Record<string, unknown>);
    },

    resetUserPassword: async (
      _: unknown,
      args: { id: string; newPassword: string },
      ctx: AppContext,
    ) => {
      requireAdmin(ctx);
      const parsed = resetPasswordSchema.safeParse({ newPassword: args.newPassword });
      if (!parsed.success) {
        throw new UserError(
          UserErrorCode.WEAK_PASSWORD,
          parsed.error.issues[0]?.message ?? 'invalid input',
        );
      }
      const hash = await hashPassword(parsed.data.newPassword);
      const { rows } = await ctx.db.execute({
        sql: `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2
              RETURNING id, email, role, active, created_at`,
        args: [hash, args.id],
      });
      if (!rows[0]) throw new UserError(UserErrorCode.USER_NOT_FOUND, 'user not found');
      await recordAudit(
        {
          db: ctx.db,
          logger: ctx.logger,
          actorUserId: ctx.user?.id ?? null,
          ip: ctx.request?.ip ?? null,
          userAgent: ctx.request?.userAgent ?? null,
        },
        'user.password_reset',
        'users',
        args.id,
        { password_changed: true },
      );
      return rowToUser(rows[0] as Record<string, unknown>);
    },

    revokeRefreshToken: async (_: unknown, args: { id: string }, ctx: AppContext) => {
      requireAdmin(ctx);
      const { rows } = await ctx.db.execute({
        sql: `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL
              RETURNING id`,
        args: [args.id],
      });
      return (rows as unknown[]).length > 0;
    },

    deleteUser: async (_: unknown, args: { id: string }, ctx: AppContext) => {
      const me = requireAdmin(ctx);
      if (args.id === me.id) {
        throw new UserError(UserErrorCode.CANNOT_DEACTIVATE_SELF, 'cannot delete yourself');
      }
      const { rows: existing } = await ctx.db.execute({
        sql: 'SELECT id FROM users WHERE id = $1',
        args: [args.id],
      });
      if (!existing[0]) throw new UserError(UserErrorCode.USER_NOT_FOUND, 'user not found');
      await ctx.db.execute({
        sql: 'DELETE FROM refresh_tokens WHERE user_id = $1',
        args: [args.id],
      });
      const { rows } = await ctx.db.execute({
        sql: 'DELETE FROM users WHERE id = $1 RETURNING id',
        args: [args.id],
      });
      return (rows as unknown[]).length > 0;
    },
  },
};
