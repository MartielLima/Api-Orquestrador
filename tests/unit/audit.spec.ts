import type { Logger } from 'pino';
import { recordAudit } from '../../src/auth/audit';

function makeLogger(): Logger {
  const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(),
    level: 'info',
  } as unknown as Logger;
  return logger;
}

describe('recordAudit', () => {
  it('insere uma linha na tabela audit_log com todos os campos', async () => {
    const execute = jest.fn().mockResolvedValue({ rows: [] });
    const db = { execute } as unknown as Parameters<typeof recordAudit>[0]['db'];
    const logger = makeLogger();

    await recordAudit(
      { db, logger, actorUserId: 'user-1', ip: '127.0.0.1', userAgent: 'jest' },
      'user.create',
      'users',
      'new-user-id',
      { id: 'new-user-id', email: 'a@b.c', role: 'user', active: true },
    );

    expect(execute).toHaveBeenCalledTimes(1);
    const call = execute.mock.calls[0][0];
    expect(call.sql).toMatch(/INSERT INTO audit_log/);
    expect(call.args[0]).toBe('user-1');
    expect(call.args[1]).toBe('user.create');
    expect(call.args[2]).toBe('users');
    expect(call.args[3]).toBe('new-user-id');
    expect(call.args[4]).toBe(
      JSON.stringify({ id: 'new-user-id', email: 'a@b.c', role: 'user', active: true }),
    );
    expect(call.args[5]).toBe('127.0.0.1');
    expect(call.args[6]).toBe('jest');
  });

  it('não quebra quando db.execute lança erro (fire-and-forget)', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('db down'));
    const db = { execute } as unknown as Parameters<typeof recordAudit>[0]['db'];
    const logger = makeLogger();

    await expect(
      recordAudit(
        { db, logger, actorUserId: null, ip: null, userAgent: null },
        'user.update',
        'users',
        'u-1',
        { role: { from: 'user', to: 'admin' } },
      ),
    ).resolves.toBeUndefined();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.update', targetId: 'u-1' }),
      'audit_log insert failed',
    );
  });

  it('aceita actorUserId null (ações de script/cron)', async () => {
    const execute = jest.fn().mockResolvedValue({ rows: [] });
    const db = { execute } as unknown as Parameters<typeof recordAudit>[0]['db'];
    const logger = makeLogger();

    await recordAudit(
      { db, logger, actorUserId: null, ip: null, userAgent: null },
      'user.create',
      'users',
      'sys-1',
      { id: 'sys-1', email: 'cron@x', role: 'admin', active: true },
    );

    expect(execute.mock.calls[0][0].args[0]).toBeNull();
  });
});
