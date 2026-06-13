import { GraphQLError } from 'graphql';
import {
  SascarApiError,
  SascarAuthError,
  SascarConnectionError,
  SascarRateLimitError,
  SascarTimeoutError,
} from 'sascar-sdk';

export function mapSascarError(err: unknown): GraphQLError {
  if (err instanceof SascarAuthError) {
    return new GraphQLError('Credenciais Sascar inválidas', {
      extensions: { code: 'SASCAR_AUTH' },
    });
  }
  if (err instanceof SascarRateLimitError) {
    const e = err as SascarRateLimitError & { retryAfter?: number };
    return new GraphQLError('Sascar limitou o número de chamadas', {
      extensions: { code: 'SASCAR_RATE_LIMIT', retryAfter: e.retryAfter ?? 30 },
    });
  }
  if (err instanceof SascarTimeoutError) {
    const e = err as SascarTimeoutError & { timeoutMs?: number };
    return new GraphQLError('Sascar não respondeu a tempo', {
      extensions: { code: 'SASCAR_TIMEOUT', timeoutMs: e.timeoutMs },
    });
  }
  if (err instanceof SascarConnectionError) {
    return new GraphQLError('Falha de rede com Sascar', {
      extensions: { code: 'SASCAR_NETWORK', message: (err as Error).message },
    });
  }
  if (err instanceof SascarApiError) {
    const e = err as SascarApiError & { fault?: { faultstring?: string; faultcode?: string } };
    return new GraphQLError(`Sascar SOAP Fault: ${e.fault?.faultstring ?? 'desconhecido'}`, {
      extensions: { code: 'SASCAR_FAULT', faultcode: e.fault?.faultcode },
    });
  }
  return new GraphQLError('Erro interno', {
    extensions: { code: 'INTERNAL', message: (err as Error)?.message ?? String(err) },
  });
}
