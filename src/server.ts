import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';
import { buildContext } from './context';
import { loadConfig } from './config';
import { createLogger } from './lib/logger';
import { SascarOrchestrator, buildSascarClient } from './orchestrator/SascarOrchestrator';
import { authPlugin } from './auth/authPlugin';
import { UserError } from './auth/errors';
import { landingPagePlugin } from './server/landingPagePlugin';

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

  const LANDING_PAGE_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Api-Orquestrador</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #0f1419;
  color: #c9d1d9;
  padding: 1.5rem;
}
main { max-width: 540px; text-align: center; }
h1 { color: #4ec9b0; margin: 0 0 1rem; font-size: 2rem; }
p { line-height: 1.6; margin: 0 0 1rem; }
code { background: #1a2026; padding: 0.15em 0.4em; border-radius: 4px; color: #4ec9b0; }
a.cta {
  display: inline-block;
  margin-top: 1.25rem;
  padding: 0.7rem 1.4rem;
  background: #4ec9b0;
  color: #0f1419;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  transition: background 0.15s;
}
a.cta:hover { background: #6edcc6; }
</style>
</head>
<body>
<main>
<h1>Api-Orquestrador</h1>
<p>API GraphQL (TypeScript) que orquestra chamadas ao <code>sascar-sdk</code> (SasIntegra v2.07).</p>
<p>Esta &eacute; uma API. Envie requisi&ccedil;&otilde;es <code>POST</code> para <code>/</code> com <code>Authorization: Bearer &lt;accessToken&gt;</code>.</p>
<a class="cta" href="https://github.com/MartielLima/Api-Orquestrador" target="_blank" rel="noopener noreferrer">Documenta&ccedil;&atilde;o no GitHub</a>
</main>
</body>
</html>`;

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [
      authPlugin({ accessSecret: cfg.jwt.accessSecret }),
      landingPagePlugin(LANDING_PAGE_HTML),
    ],
    formatError: (formattedError, error) => {
      const original = unwrapError(error);
      if (original instanceof UserError) {
        return original.toGraphQLFormat();
      }
      return formattedError;
    },
  });
  const { url } = await startStandaloneServer(server, {
    context: async ({ req }) => {
      const xff = req.headers['x-forwarded-for']?.toString().split(',')[0].trim();
      const ip = xff || req.socket.remoteAddress || null;
      const userAgent = req.headers['user-agent']?.toString() ?? null;
      return {
        ...(await buildContext()),
        orchestrator,
        request: { ip, userAgent },
      };
    },
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
