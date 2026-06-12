import pino, { Logger, LoggerOptions } from 'pino';

export interface CreateLoggerOptions {
  level: string;
  redact?: string[];
}

export function createLogger(opts: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    level: opts.level,
    redact: {
      paths: [
        'sascar.senha',
        'senha',
        'senhaAtual',
        'novaSenha',
        'password',
        '*.senha',
        '*.senhaAtual',
        '*.novaSenha',
        '*.password',
      ],
      censor: '[REDACTED]',
    },
  };
  if (process.env.NODE_ENV !== 'production') {
    return pino({ ...options, transport: { target: 'pino-pretty', options: { colorize: true } } });
  }
  return pino(options);
}
