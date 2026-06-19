import type { Db } from '../db/client';
import type { Logger } from 'pino';

export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.password_reset'
  | 'refresh_token.revoke';

export type AuditTargetTable = 'users' | 'refresh_tokens';

export type AuditDiff =
  | Record<string, unknown>
  | Record<string, { from: unknown; to: unknown }>
  | { password_changed: true };

export interface AuditContext {
  db: Db;
  logger: Logger;
  actorUserId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(
  ctx: AuditContext,
  action: AuditAction,
  targetTable: AuditTargetTable,
  targetId: string,
  diff: AuditDiff,
): Promise<void> {
  try {
    await ctx.db.execute({
      sql: `INSERT INTO audit_log (actor_user_id, action, target_table, target_id, diff, ip, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      args: [
        ctx.actorUserId,
        action,
        targetTable,
        targetId,
        JSON.stringify(diff),
        ctx.ip ?? null,
        ctx.userAgent ?? null,
      ],
    });
  } catch (err) {
    ctx.logger.error(
      { err, action, targetId },
      'audit_log insert failed',
    );
  }
}
