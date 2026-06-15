import { ApolloServer } from '@apollo/server';
import type { FormattedExecutionResult } from 'graphql';
import { typeDefs } from '../../src/graphql/schema';
import { resolvers } from '../../src/graphql/resolvers';
import { buildContext } from '../../src/context';
import { SascarOrchestrator, buildSascarClient } from '../../src/orchestrator/SascarOrchestrator';
import { authPlugin } from '../../src/auth/authPlugin';
import { loadConfig } from '../../src/config';

export async function buildTestServer() {
  const ctx = await buildContext();
  const orchestrator = new SascarOrchestrator(
    buildSascarClient({ usuario: 'test', senha: 'test', wsdlUrl: 'http://localhost:0' }),
  );
  const ctxWithOrch = { ...ctx, orchestrator };
  const cfg = loadConfig();
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [authPlugin({ accessSecret: cfg.jwt.accessSecret })],
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
