import { ApolloServer } from '@apollo/server';
import type { FormattedExecutionResult } from 'graphql';
import { typeDefs } from '../../src/graphql/schema';
import { resolvers } from '../../src/graphql/resolvers';
import { buildContext } from '../../src/context';

export async function buildTestServer() {
  const ctx = await buildContext();
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  const executeOperation = (request: { query: string; variables?: Record<string, unknown> }) =>
    server
      .executeOperation(request as Parameters<typeof server.executeOperation>[0], {
        contextValue: ctx,
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
