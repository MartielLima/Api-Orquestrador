/**
 * Extrai apenas a mensagem amigável de um erro, evitando vazar query GraphQL,
 * variáveis, headers ou payload de response na UI.
 *
 * O `ClientError` do `graphql-request` serializa toda a operação dentro de
 * `error.message` (ex: `GraphQL error: ...\n{"response":...,"request":{"query":"..."}}`),
 * o que expõe a estrutura interna das mutations/queries.
 */
export function formatGraphQLError(err: unknown): string {
  if (!err) return 'erro desconhecido';

  if (typeof err === 'object' && err !== null) {
    const e = err as {
      name?: string;
      message?: string;
      response?: { errors?: Array<{ message?: string }> };
    };

    if (e.response?.errors && e.response.errors.length > 0) {
      const first = e.response.errors[0]?.message;
      if (first) return first;
    }

    if (e.name === 'AbortError') return 'requisição cancelada';
  }

  if (err instanceof Error) {
    const m = err.message.split('\n')[0]?.trim();
    if (m && m.length <= 200) return m;
    if (m) return `${m.slice(0, 197)}...`;
    return err.name || 'erro';
  }

  const s = String(err);
  return s.length > 200 ? `${s.slice(0, 197)}...` : s;
}