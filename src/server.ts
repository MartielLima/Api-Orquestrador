import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';
import { buildContext } from './context';
import { loadConfig } from './config';
import { createLogger } from './lib/logger';

export interface StartedServer {
  url: string;
  stop: () => Promise<void>;
}

export async function startServer(): Promise<StartedServer> {
  const cfg = loadConfig();
  const logger = createLogger({ level: cfg.log.level });

  const server = new ApolloServer({ typeDefs, resolvers });
  const { url } = await startStandaloneServer(server, {
    context: buildContext,
    listen: { port: cfg.api.port },
  });
  logger.info({ url }, 'Apollo server started');

  return {
    url,
    stop: async () => {
      await server.stop();
    },
  };
}
