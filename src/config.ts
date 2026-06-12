import { z } from 'zod';

const envSchema = z.object({
  // Sascar
  SASCAR_USUARIO: z.string().min(1, 'SASCAR_USUARIO obrigatório'),
  SASCAR_SENHA: z.string().min(1, 'SASCAR_SENHA obrigatória'),
  SASCAR_WSDL_URL: z
    .string()
    .url()
    .default('https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService'),
  SASCAR_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  SASCAR_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),

  // API
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET deve ter no mínimo 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET deve ter no mínimo 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // Seed
  SEED_ADMIN_EMAIL: z.string().email(),
  SEED_ADMIN_PASSWORD: z.string().min(8),

  // Cache
  CACHE_CADASTRO_TTL_MS: z.coerce.number().int().positive().default(86_400_000),
  CACHE_POSICAO_TTL_MS: z.coerce.number().int().positive().default(300_000),

  // Job
  SYNC_POSITIONS_ENABLED: z.enum(['true', 'false']).default('false'),
  SYNC_POSITIONS_CRON: z.string().default('*/10 * * * *'),
  SYNC_POSITIONS_QUANTITY: z.coerce.number().int().positive().default(1000),

  // DB
  DATABASE_URL: z.string().url(),

  // Logger
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppEnv = z.infer<typeof envSchema>;

export interface AppConfig {
  sascar: {
    usuario: string;
    senha: string;
    wsdlUrl: string;
    timeoutMs: number;
    maxRetries: number;
  };
  api: {
    port: number;
    corsOrigins: string[];
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  seed: {
    adminEmail: string;
    adminPassword: string;
  };
  cache: {
    cadastroTtlMs: number;
    posicaoTtlMs: number;
  };
  job: {
    enabled: boolean;
    cron: string;
    quantity: number;
  };
  db: {
    url: string;
  };
  log: {
    level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    sascar: {
      usuario: parsed.SASCAR_USUARIO,
      senha: parsed.SASCAR_SENHA,
      wsdlUrl: parsed.SASCAR_WSDL_URL,
      timeoutMs: parsed.SASCAR_TIMEOUT_MS,
      maxRetries: parsed.SASCAR_MAX_RETRIES,
    },
    api: {
      port: parsed.API_PORT,
      corsOrigins: parsed.API_CORS_ORIGINS.split(',').map((s) => s.trim()),
    },
    jwt: {
      accessSecret: parsed.JWT_ACCESS_SECRET,
      refreshSecret: parsed.JWT_REFRESH_SECRET,
      accessTtl: parsed.JWT_ACCESS_TTL,
      refreshTtl: parsed.JWT_REFRESH_TTL,
    },
    seed: {
      adminEmail: parsed.SEED_ADMIN_EMAIL,
      adminPassword: parsed.SEED_ADMIN_PASSWORD,
    },
    cache: {
      cadastroTtlMs: parsed.CACHE_CADASTRO_TTL_MS,
      posicaoTtlMs: parsed.CACHE_POSICAO_TTL_MS,
    },
    job: {
      enabled: parsed.SYNC_POSITIONS_ENABLED === 'true',
      cron: parsed.SYNC_POSITIONS_CRON,
      quantity: parsed.SYNC_POSITIONS_QUANTITY,
    },
    db: {
      url: parsed.DATABASE_URL,
    },
    log: {
      level: parsed.LOG_LEVEL,
    },
  };
}
