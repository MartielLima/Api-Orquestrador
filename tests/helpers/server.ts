import { ApolloServer } from '@apollo/server';
import type { FormattedExecutionResult } from 'graphql';
import { typeDefs } from '../../src/graphql/schema';
import { resolvers } from '../../src/graphql/resolvers';
import { buildContext } from '../../src/context';
import { SascarOrchestrator, buildSascarClient } from '../../src/orchestrator/SascarOrchestrator';
import { loadConfig } from '../../src/config';
import { UserError } from '../../src/auth/errors';
import { Pool } from 'pg';

function unwrapError(err: unknown): unknown {
  let current: unknown = err;
  while (current && typeof current === 'object' && 'originalError' in (current as object)) {
    current = (current as { originalError: unknown }).originalError;
  }
  return current;
}

async function loadAdminUser(): Promise<{ id: string; email: string; role: string } | null> {
  if (!process.env.DATABASE_URL) return null;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const cfg = loadConfig();
    const { rows } = await pool.query(
      'SELECT id, email, role FROM users WHERE email = $1 AND active = true',
      [cfg.seed.adminEmail],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  } finally {
    await pool.end();
  }
}

export interface TestServerOptions {
  user?: { id: string; email: string; role: string } | null;
}

export async function buildTestServer(opts: TestServerOptions = {}) {
  const ctx = await buildContext();
  const orchestrator = new SascarOrchestrator(
    buildSascarClient({ usuario: 'test', senha: 'test', wsdlUrl: 'http://localhost:9999' }),
  );
  if (opts.user !== undefined) {
    ctx.user = opts.user;
  } else {
    const admin = await loadAdminUser();
    if (admin) ctx.user = admin;
  }
  const ctxWithOrch = { ...ctx, orchestrator };
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    formatError: (formattedError, error) => {
      const original = unwrapError(error);
      if (original instanceof UserError) {
        return original.toGraphQLFormat();
      }
      return formattedError;
    },
  });
  await server.start();
  const executeOperation = (request: { query: string; variables?: Record<string, unknown> }) =>
    server
      .executeOperation(request as Parameters<typeof server.executeOperation>[0], {
        contextValue: ctxWithOrch,
      })
      .then((res) => {
        const body = res.body as { kind: 'single'; singleResult: FormattedExecutionResult };
        return body.singleResult;
      });
  return { server, executeOperation };
}

export function makeContext(overrides: Partial<Awaited<ReturnType<typeof buildContext>>> = {}) {
  return { user: null, logger: console, ...overrides };
}
