# Landing page custom no Apollo standalone

**Data:** 2026-06-23
**Status:** aprovado (design)
**Escopo:** `src/server.ts` + `tests/integration/landing-page.spec.ts`

## Contexto e problema

Em `https://orcapi.martiellima.com/graphql`, o `GET /` abre o **Apollo Sandbox** (explorer interativo). É útil pra dev mas é:

1. **Pesado** — baixa ~2 MB de JS do CDN Apollo, demora a abrir em conexões ruins.
2. **Confuso** — quem chega na URL pública (ex: link em bio, monitor) acha que é uma página de marketing e não uma API.
3. **Sem identidade** — não diz nada sobre o que é a `api-orquestrador`, nem link pra documentação.

O time quer uma landing page simples com:

- Breve texto descrevendo a aplicação.
- Link direto pra `https://github.com/MartielLima/Api-Orquestrador`.

Sem quebrar o endpoint GraphQL (`POST /`).

## Objetivo

Substituir o Apollo Sandbox por uma landing page HTML estática servida no `GET /`, mantendo 100% do comportamento do `POST /` (GraphQL, auth, plugins, error formatting).

## Não-objetivos

- Não reintroduz GraphiQL / Sandbox embutido (decisão do usuário: prefere "mais simples").
- Não externaliza o HTML em arquivo separado (decisão: inline no `server.ts` é o diff menor).
- Não adiciona página de erro custom, healthcheck HTML, favicon, robots.txt, sitemap, ou analytics.
- Não muda o schema, resolvers, auth, ou dependências.
- Não toca `Dockerfile`, `tsconfig`, ou build (HTML inline é JS normal, sem asset extra).

## Design

### Mudança em `src/server.ts`

Adicionar a opção `landingPage` na chamada `startStandaloneServer` (linhas 51–63):

```ts
const { url } = await startStandaloneServer(server, {
  context: async ({ req }) => { /* inalterado */ },
  listen: { port: cfg.api.port },
  landingPage: ` <!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Api-Orquestrador</title>
    <style> /* ~30 linhas: fundo #0f1419, acento #4ec9b0, fonte system */ </style>
  </head>
  <body>
    <main>
      <h1>Api-Orquestrador</h1>
      <p>API GraphQL (TypeScript) que orquestra chamadas ao <code>sascar-sdk</code> (SasIntegra v2.07).</p>
      <p>Esta é uma API. Envie requisições <code>POST</code> para <code>/</code> com <code>Authorization: Bearer &lt;accessToken&gt;</code>.</p>
      <a class="cta" href="https://github.com/MartielLima/Api-Orquestrador" target="_blank" rel="noopener noreferrer">
        Documentação no GitHub
      </a>
    </main>
  </body>
</html>`,
});
```

**Decisões de design:**

| Aspecto | Valor | Por quê |
|---|---|---|
| **Paleta** | Fundo `#0f1419` + acento `#4ec9b0` | Combina com a paleta que a TUI já usa (`chalk`/`ink`) |
| **Texto** | Cópia do `README.md` linha 3 + dica de uso | Já é o que descreve o app; economiza tempo |
| **Idioma** | `pt-BR` no `<html lang>` | Alinhado com o domínio (`martiellima.com`) |
| **Responsivo** | `viewport` + `max-width` no container | Sem framework, CSS inline básico |
| **Link** | `target="_blank" rel="noopener noreferrer"` | Segurança + UX (não tira o user da URL da API) |
| **Sem assets externos** | Zero `<script>`, zero `<link rel="stylesheet">` | Funciona offline; zero CDN |

**Sem mudança no roteamento** — `startStandaloneServer` já faz dispatch por método: `GET` usa o `landingPage`, `POST` (e outros) vão pro Apollo handler. Confirmado na doc do `@apollo/server/standalone`.

### Testes — `tests/integration/landing-page.spec.ts`

Suite nova, padrão dos outros `tests/integration/*.spec.ts` (veja `auth-coverage.spec.ts:6-7` pra setup). Diferente deles, **precisa de um HTTP server de verdade** porque `landingPage` só é servido pelo `startStandaloneServer` (não pelo `executeOperation` da Apollo).

```ts
import { startServer, type StartedServer } from '../../src/server';

describe('landing page', () => {
  let srv: StartedServer;
  beforeAll(async () => { srv = await startServer(); });
  afterAll(async () => { await srv.stop(); });

  it('GET / returns 200 text/html with the app name and GitHub link', async () => {
    const res = await fetch(srv.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('Api-Orquestrador');
    expect(html).toContain('https://github.com/MartielLima/Api-Orquestrador');
  });

  it('POST / still serves GraphQL (regression)', async () => {
    const res = await fetch(srv.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ health }' }),
    });
    const json = await res.json();
    expect(json.data?.health).toBe('ok');
  });
});
```

**Regressão coberta:** o segundo teste garante que trocar o `landingPage` não quebrou o `POST /`.

### Ajuste necessário em `tests/helpers/jest-setup.js`

O `startServer` usa `cfg.api.port` (default 4000) e o `jest.config.ts:41` define `maxWorkers: 4` — 4 workers em paralelo colidiriam na mesma porta. Adiciono 1 linha no `jest-setup.js` (mesmo arquivo que já faz `process.env.DATABASE_URL = ...`):

```js
const workerId = process.env.JEST_WORKER_ID || '1';
// ... existente: DATABASE_URL ...
process.env.API_PORT = String(4000 + parseInt(workerId, 10));
```

Custo: 1 linha. Não muda nada pra quem já roda testes (o `.env` atual não define `API_PORT`, então o default 4000 segue valendo; só o setup de teste passa a usar portas únicas).

## Risco e mitigação

| Risco | Mitigação |
|---|---|
| `landingPage` ser string vazia e o Apollo cair no default | Não acontece — passamos o HTML completo |
| Build quebrar por template string mal-escapada | `tsc` valida em CI; uso de `String.raw` se houver conflito de backticks (`/`) |
| `dist/` desatualizado | Build regenera; nada de asset externo pra copiar |
| Cache de CDN servindo Apollo Sandbox antigo | Out of scope; usuário pode invalidar manualmente |

## Critérios de aceite

1. `curl -i https://orcapi.martiellima.com/graphql` retorna 200 com `Content-Type: text/html` e o HTML novo.
2. O HTML contém "Api-Orquestrador" e o link do GitHub.
3. `curl -X POST https://orcapi.martiellima.com/graphql -d '{"query":"{ health }"}'` continua retornando `{"data":{"health":"ok"}}`.
4. `npm test` passa (116 + 2 = 118 testes).
5. `npm run typecheck` e `npm run lint` passam.

## Fora de escopo (futuro)

- Healthcheck HTML no `/health`.
- Versão exposta no HTML (consumir `package.json`).
- Link direto pra Swagger/Postman collection.
- Hotswap de `landingPage` por env var (dev vs prod com Sandbox).
