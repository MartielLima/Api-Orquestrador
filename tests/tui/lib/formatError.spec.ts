import { formatGraphQLError } from '../../../src/tui/lib/formatError';

describe('formatGraphQLError', () => {
  it('extrai apenas a mensagem de GraphQL errors[0].message', () => {
    const err = {
      name: 'ClientError',
      message:
        'GraphQL error: Authentication required\n{"response":{"data":null,"errors":[{"message":"Authentication required","extensions":{"code":"UNAUTHENTICATED"}}],"status":200,"headers":{},"body":"{\\"errors\\":[{\\"message\\":\\"Authentication required\\"}]"},"request":{"query":"query Users { users { id } }","variables":{}}}',
      response: { errors: [{ message: 'Authentication required' }] },
    };
    expect(formatGraphQLError(err)).toBe('Authentication required');
  });

  it('nao vaza a query GraphQL mesmo quando response.errors esta ausente', () => {
    const err = {
      name: 'ClientError',
      message:
        'GraphQL error (1)\n{"response":{"data":null,"errors":[{"message":"Boom"}],"request":{"query":"query Secret { __schema { types { name } } }"}}',
    };
    const out = formatGraphQLError(err);
    expect(out).not.toContain('query Secret');
    expect(out).not.toContain('__schema');
    expect(out).not.toContain('{');
  });

  it('corta mensagens muito longas vindas de Error.message', () => {
    const long = 'a'.repeat(500);
    const out = formatGraphQLError(new Error(long));
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it('formata erros simples', () => {
    expect(formatGraphQLError(new Error('boom'))).toBe('boom');
    expect(formatGraphQLError(new Error('boom\nstack trace here'))).toBe('boom');
  });

  it('retorna fallback para valores nao-Erro', () => {
    expect(formatGraphQLError(null)).toBe('erro desconhecido');
    expect(formatGraphQLError(undefined)).toBe('erro desconhecido');
    expect(formatGraphQLError('plain string')).toBe('plain string');
    expect(formatGraphQLError(42)).toBe('42');
  });

  it('identifica AbortError', () => {
    expect(formatGraphQLError({ name: 'AbortError' })).toBe('requisição cancelada');
  });
});