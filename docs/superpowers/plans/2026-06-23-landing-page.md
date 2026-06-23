# Landing Page Custom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o Apollo Sandbox do `GET /` por uma landing page HTML estática com texto breve sobre a API e link para a documentação no GitHub, sem alterar o `POST /` (GraphQL).

**Architecture:** Criar um plugin Apollo (`src/server/landingPagePlugin.ts`) cuja `serverListener.renderLandingPage()` retorna o HTML custom. Adicionar esse plugin ao array `plugins` do `new ApolloServer(...)` em `src/server.ts`. O Apollo standalone server faz dispatch por método HTTP: `GET` serve o HTML estático via plugin, `POST` (e outros) vão para o handler do GraphQL. Sem mudança de schema, resolvers, auth, ou dependências. Sem assets externos (HTML + CSS inline, zero `<script>`, zero CDN).

**Tech Stack:** TypeScript, Node 18+ (built-in `fetch`), jest + ts-jest, @apollo/server v4 (plugins).

**Spec:** `docs/superpowers/specs/2026-06-23-landing-page-design.md`

---

## File Structure

| Arquivo | Responsabilidade | Criar/Modificar |
|---|---|---|
| `tests/helpers/jest-setup.js` | Adicionar `API_PORT` único por worker (evita conflito de porta entre 4 jest workers paralelos) | Modificar |
| `tests/integration/landing-page.spec.ts` | Suite nova com 2 testes: GET / HTML + POST / GraphQL regression | Criar |
| `src/server/landingPagePlugin.ts` | Plugin Apollo `renderLandingPage()` que serve HTML custom no `GET /` | Criar |
| `src/server.ts` | Importa e adiciona `landingPagePlugin(...)` no array `plugins` do `new ApolloServer(...)` | Modificar |
| `CHANGELOG.md` | Entrada em `[Unreleased] > ### Added` | Modificar |

---

## Task 1: Port único por jest worker

**Files:**
- Modify: `tests/helpers/jest-setup.js` (adicionar 1 linha)

**Contexto:** `jest.config.ts:41` define `maxWorkers: 4`. Cada worker roda em paralelo. O `startServer()` de `src/server.ts` usa `cfg.api.port` (default 4000). Se 2 workers rodarem `landing-page.spec.ts` ao mesmo tempo, colidem na porta e o segundo teste falha com `EADDRINUSE`. Solução: cada worker ganha uma porta única (`4000 + workerId`). O mesmo padrão já é usado para `DATABASE_URL` no mesmo arquivo (linhas 1–6).

- [ ] **Step 1.1: Adicionar `API_PORT` em `tests/helpers/jest-setup.js`**

Abrir `tests/helpers/jest-setup.js`. Estado atual (linhas 1–6):

```js
/* eslint-disable @typescript-eslint/no-require-imports */
const workerId = process.env.JEST_WORKER_ID || '1';
const baseUrl =
  process.env.DATABASE_URL_BASE || 'postgresql://api_orquestrador:dev_password@localhost:5432';
const dbName = `api_orquestrador_test_w${workerId}`;
process.env.DATABASE_URL = `${baseUrl}/${dbName}`;
```

Adicionar uma linha nova no final do arquivo:

```js
process.env.API_PORT = String(4000 + parseInt(workerId, 10));
```

Arquivo final:

```js
/* eslint-disable @typescript-eslint/no-require-imports */
const workerId = process.env.JEST_WORKER_ID || '1';
const baseUrl =
  process.env.DATABASE_URL_BASE || 'postgresql://api_orquestrador:dev_password@localhost:5432';
const dbName = `api_orquestrador_test_w${workerId}`;
process.env.DATABASE_URL = `${baseUrl}/${dbName}`;
process.env.API_PORT = String(4000 + parseInt(workerId, 10));
```

- [ ] **Step 1.2: Validar que o setup não quebra testes existentes**

```bash
npm test -- --testPathPattern=server.spec
```

Esperado: 2 testes passam em `tests/integration/server.spec.ts` (mesmo `describe` de antes — usa `executeOperation`, não toca porta, então não é afetado pela mudança). Se falhar, investigar e desfazer.

- [ ] **Step 1.3: Commit**

```bash
git add tests/helpers/jest-setup.js
git commit -m "test(jest): unique API_PORT per worker to avoid EADDRINUSE"
```

---

## Task 2: TDD — teste falhando para a landing page

**Files:**
- Create: `tests/integration/landing-page.spec.ts`

- [ ] **Step 2.1: Criar o arquivo de teste**

Criar `tests/integration/landing-page.spec.ts`:

```ts
import { startServer, type StartedServer } from '../../src/server';

describe('landing page', () => {
  let srv: StartedServer;

  beforeAll(async () => {
    srv = await startServer();
  });

  afterAll(async () => {
    await srv.stop();
  });

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
    const json = (await res.json()) as { data?: { health?: string } };
    expect(json.data?.health).toBe('ok');
  });
});
```

**Nota sobre o cast TS:** `res.json()` retorna `unknown` (lib.dom.d.ts), e o `tsconfig.json` deste projeto define `"strict": true`. Sem o cast `(await res.json()) as { data?: { health?: string } }` a suite nem compila. O cast é mínimo, não muda o runtime, e o teste continua verificando o mesmo invariante (`json.data.health === 'ok'`).

**Pré-condições que precisam estar OK antes de rodar:**
- Postgres rodando (`docker compose up -d postgres` ou conforme `README.md:54-83`).
- `.env` populado (especialmente `SASCAR_USUARIO`, `SASCAR_SENHA`, `JWT_ACCESS_SECRET` ≥32 chars, `JWT_REFRESH_SECRET` ≥32 chars, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` ≥8 chars, `DATABASE_URL`). Ver `README.md:188-211`.
- `global-setup.js` (jest) já cria/migra/seeda o DB por worker.

- [ ] **Step 2.2: Rodar o teste e verificar que falha**

```bash
npm test -- --testPathPattern=landing-page
```

Esperado: AMBOS os testes falham.
- `GET / returns 200 text/html...` falha porque o Apollo standalone não tem landing page handler — `GET /` é forwarded pro executor GraphQL que retorna HTTP 400 (no operation found). Verificado em `node_modules/@apollo/server/dist/esm/standalone/index.js:9-34` (só monta `cors`, `express.json`, `expressMiddleware`).
- `POST / still serves GraphQL (regression)` passa (ainda não tocamos no server.ts).

Se AMBOS falharem por outro motivo (DB não acessível, port em uso, env vars faltando), corrigir o setup antes de prosseguir. O `POST /` test DEVE passar antes de seguir para a Task 3 — é a baseline de regressão.

- [ ] **Step 2.3: Commit (test falhando)**

```bash
git add tests/integration/landing-page.spec.ts
git commit -m "test(server): failing test for landing page on GET /"
```

---

## Task 3: Plugin `landingPagePlugin` + wire-up em `src/server.ts`

**Files:**
- Create: `src/server/landingPagePlugin.ts`
- Modify: `src/server.ts` (import + adicionar plugin no array `plugins`)

> **⚠️ Correção dupla do design original:** o `landingPage` NÃO é opção de `startStandaloneServer` NEM do construtor `new ApolloServer(...)` em Apollo Server v4.13.0. A única API oficial é um plugin com `serverListener.renderLandingPage()`. Verificado em:
> - `node_modules/@apollo/server/dist/esm/externalTypes/constructor.d.ts:28-52` — `ApolloServerOptionsBase` **não** tem `landingPage` (o `landingPage: LandingPage | null` em `ApolloServer.d.ts:18` está no estado interno `RunningServerState`, não nas options).
> - `node_modules/@apollo/server/dist/esm/externalTypes/plugins.d.ts:37-45` — `GraphQLServerListener.renderLandingPage?(): Promise<LandingPage>` é o único caminho.

- [ ] **Step 3.1: Criar `src/server/landingPagePlugin.ts`**

Criar o arquivo `src/server/landingPagePlugin.ts` com o seguinte conteúdo:

```ts
import type { ApolloServerPlugin } from '@apollo/server';

export function landingPagePlugin(html: string): ApolloServerPlugin {
  return {
    async serverWillStart() {
      return {
        async renderLandingPage() {
          return { html };
        },
      };
    },
  };
}
```

- [ ] **Step 3.2: Editar `src/server.ts` — adicionar import**

No topo de `src/server.ts` (após os imports existentes, próximo ao import de `authPlugin` na linha 9), adicionar:

```ts
import { landingPagePlugin } from './server/landingPagePlugin';
```

- [ ] **Step 3.3: Editar `src/server.ts` — adicionar plugin no array `plugins`**

Localizar a chamada atual em `src/server.ts:39-50`:

```ts
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
```

Substituir por (extrai HTML para uma constante `const` no escopo da função `startServer` e adiciona `landingPagePlugin` no array `plugins`):

```ts
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
```

**Notas:**
- O HTML é extraído para `LANDING_PAGE_HTML` (constante no escopo da função) para manter a construção do `ApolloServer` legível e isolar a string grande.
- A chamada `startStandaloneServer` (linhas 51–63) fica **inalterada**.
- Entidades HTML (`&eacute;`, `&ccedil;`, `&otilde;`, `&lt;`, `&gt;`) são usadas porque o template é uma string TS comum, não raw — assim não precisamos escapar backticks nem `${}`.
- HTML 100% inline: zero `<script>`, zero `<link>`, zero CDN. Funciona offline.
- Acento `#4ec9b0` + fundo `#0f1419` casam com a paleta `chalk`/`ink` que a TUI já usa.
- Responsivo: `max-width` no container + `padding` no body.

- [ ] **Step 3.4: Rodar o teste da Task 2 e verificar que agora passa**

```bash
npm test -- --testPathPattern=landing-page
```

Esperado: 2 testes passam.
- `GET / returns 200 text/html...` agora recebe o HTML da landing page (contém "Api-Orquestrador" e o link do GitHub).
- `POST / still serves GraphQL (regression)` continua passando — confirma que o Apollo standalone ainda despacha `POST` para o handler GraphQL.

- [ ] **Step 3.5: Rodar typecheck e lint**

```bash
npm run typecheck
npm run lint
```

Esperado: 0 erros nos dois.

- [ ] **Step 3.6: Commit**

```bash
git add src/server/landingPagePlugin.ts src/server.ts
git commit -m "feat(server): custom landing page on GET / via Apollo plugin"
```

---

## Task 4: Rodar suite completa + atualizar CHANGELOG

**Files:**
- Modify: `CHANGELOG.md` (adicionar 1 bullet em `## [Unreleased] > ### Added`)

- [ ] **Step 4.1: Rodar a suite completa**

```bash
npm test
```

Esperado: 116 testes existentes + 2 novos = **118 testes passam** (1 skipped pré-existente segue skipped). Se algum teste existente quebrar (especialmente os que dependem de porta ou do response body), investigar antes de prosseguir.

- [ ] **Step 4.2: Smoke test local**

Subir o server localmente e testar com curl:

```bash
npm run dev &
sleep 3

curl -i http://localhost:4000/ | head -20
```

Esperado:
- `HTTP/1.1 200 OK`
- `Content-Type: text/html; charset=utf-8` (ou similar)
- Body contém `<h1>Api-Orquestrador</h1>` e `https://github.com/MartielLima/Api-Orquestrador`

```bash
curl -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ health }"}'
```

Esperado: `{"data":{"health":"ok"}}`.

Depois:

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 4.3: Adicionar entrada no CHANGELOG**

Abrir `CHANGELOG.md`. Localizar `## [Unreleased] > ### Added` (linhas 5–26). Adicionar uma linha nova no final da lista:

```markdown
- **feat(server)**: Custom landing page no `GET /` substituindo o Apollo Sandbox. Implementado via plugin Apollo (`src/server/landingPagePlugin.ts`) cujo `serverListener.renderLandingPage()` retorna HTML inline estático (zero CDN, zero JS) com descrição da API e link direto para `https://github.com/MartielLima/Api-Orquestrador`. `POST /` (GraphQL) inalterado. Coberto por `tests/integration/landing-page.spec.ts` (2 testes: GET HTML + POST GraphQL regression).
```

- [ ] **Step 4.4: Commit final**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): landing page custom on GET /"
```

---

## Self-Review (executado pelo planner)

**Spec coverage:**
- [x] Substituir Apollo Sandbox por HTML estático → Task 3 (via plugin)
- [x] Texto breve sobre a aplicação → Task 3 (copy do README)
- [x] Link para `https://github.com/MartielLima/Api-Orquestrador` → Task 3
- [x] `POST /` inalterado → Task 2 baseline + Task 3 step 3.4 + Task 4 step 4.2
- [x] Sem assets externos → Task 3 (HTML + CSS inline, zero `<script>`/`<link>`)
- [x] Teste integração → Task 2
- [x] Ajuste `jest-setup.js` (porta por worker) → Task 1
- [x] CHANGELOG atualizado → Task 4 step 4.3

**Placeholder scan:** nenhum "TBD" / "TODO" / "implement later" no plano.

**Type consistency:** `startServer`, `StartedServer`, `srv.url`, `srv.stop`, `landingPagePlugin` (novo), `ApolloServerPlugin` (import), `authPlugin` (existente) — todas as APIs batem com o que está no `src/server.ts` e no que o Apollo Server v4 expõe.

**Risco residual:** a renderização visual (CSS) não é testada — confia na inspeção visual manual do Step 4.2. Aceitável para este escopo (sem framework de testes visuais no projeto).
