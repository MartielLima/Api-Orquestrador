import { loadConfig } from '../../src/config';

describe('loadConfig', () => {
  const requiredEnv = {
    SASCAR_USUARIO: 'u',
    SASCAR_SENHA: 's',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    SEED_ADMIN_EMAIL: 'admin@x.com',
    SEED_ADMIN_PASSWORD: 'pw123456',
    DATABASE_URL: 'postgresql://x:y@z:5432/w',
  };

  it('returns a config object with all required fields', () => {
    const cfg = loadConfig({ ...requiredEnv, API_PORT: '4000' });
    expect(cfg.sascar.usuario).toBe('u');
    expect(cfg.sascar.senha).toBe('s');
    expect(cfg.api.port).toBe(4000);
    expect(cfg.jwt.accessSecret).toBe('a'.repeat(32));
  });

  it('uses defaults for optional fields', () => {
    const cfg = loadConfig(requiredEnv);
    expect(cfg.cache.cadastroTtlMs).toBe(86_400_000);
    expect(cfg.cache.posicaoTtlMs).toBe(300_000);
    expect(cfg.job.enabled).toBe(false);
    expect(cfg.job.cron).toBe('*/10 * * * *');
    expect(cfg.api.corsOrigins).toEqual(['http://localhost:3000']);
  });

  it('throws on missing SASCAR_USUARIO', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { SASCAR_USUARIO, ...rest } = requiredEnv;
    expect(() => loadConfig(rest)).toThrow(/SASCAR_USUARIO/);
  });

  it('throws on JWT_ACCESS_SECRET shorter than 32 chars', () => {
    expect(() => loadConfig({ ...requiredEnv, JWT_ACCESS_SECRET: 'short' })).toThrow(/32/);
  });

  it('parses SYNC_POSITIONS_ENABLED=true correctly', () => {
    const cfg = loadConfig({ ...requiredEnv, SYNC_POSITIONS_ENABLED: 'true' });
    expect(cfg.job.enabled).toBe(true);
  });
});
