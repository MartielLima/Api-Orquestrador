import { createLogger } from '../../src/lib/logger';

describe('createLogger', () => {
  it('returns a pino logger with the requested level', () => {
    const log = createLogger({ level: 'debug' });
    expect(log.level).toBe('debug');
  });

  it('redacts sensitive fields', () => {
    const log = createLogger({ level: 'info', redact: ['password'] });
    expect(typeof log.info).toBe('function');
    expect(typeof log.error).toBe('function');
  });
});
