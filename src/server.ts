import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';
import { buildContext, type AppContext } from './context';
import { loadConfig } from './config';
import { createLogger } from './lib/logger';
import { SascarOrchestrator, buildSascarClient } from './orchestrator/SascarOrchestrator';
import { authPlugin } from './auth/authPlugin';
import { UserError } from './auth/errors';

export interface StartedServer {
  url: string;
  stop: () => Promise<void>;
  orchestrator: SascarOrchestrator;
  cfg: ReturnType<typeof loadConfig>;
}

function unwrapError(err: unknown): unknown {
  let current: unknown = err;
  while (current && typeof current === 'object' && 'originalError' in (current as object)) {
    current = (current as { originalError: unknown }).originalError;
  }
  return current;
}

export async function startServer(): Promise<StartedServer> {
  const cfg = loadConfig();
  const logger = createLogger({ level: cfg.log.level });
  const sascar = buildSascarClient({
    usuario: cfg.sascar.usuario,
    senha: cfg.sascar.senha,
    wsdlUrl: cfg.sascar.wsdlUrl,
    timeoutMs: cfg.sascar.timeoutMs,
    maxRetries: cfg.sascar.maxRetries,
  });
  const orchestrator = new SascarOrchestrator(sascar);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [authPlugin({ accessSecret: cfg.jwt.accessSecret })],
    formatError: (formattedError, error) => {
      const original = unwrapError(error);
      if (original instanceof UserError) {
        return original.toGraphQLFormat();
      }
      return formattedError;
    },
  });
  const { url } = await startStandaloneServer(server, {
    context: async (): Promise<AppContext> => ({
      ...(await buildContext()),
      orchestrator,
    }),
    listen: { port: cfg.api.port },
  });
  logger.info({ url }, 'Apollo server started');

  return {
    url,
    orchestrator,
    cfg,
    stop: async () => {
      await server.stop();
    },
  };
}
