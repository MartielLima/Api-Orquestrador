import { ApolloServer } from '@apollo/server';
import type { GraphQLResponse } from '@apollo/server';
import type { FormattedExecutionResult } from 'graphql';
import { typeDefs } from '../../src/graphql/schema';
import { resolvers } from '../../src/graphql/resolvers';
import { buildContext } from '../../src/context';

export async function buildTestServer() {
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  const executeOperation = (request: { query: string }) =>
    server.executeOperation(request).then((res: GraphQLResponse) => {
      const body = res.body as { kind: 'single'; singleResult: FormattedExecutionResult };
      return body.singleResult;
    });
  return { server, executeOperation };
}

export function makeContext(overrides: Partial<Awaited<ReturnType<typeof buildContext>>> = {}) {
  return { user: null, logger: console, ...overrides };
}
