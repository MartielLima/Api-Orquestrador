# Guia de Setup Docker — Api-Orquestrador

> Passo a passo para subir o stack (Postgres + API GraphQL) em Docker,
> sem credenciais SasIntegra reais, e entender **quem é quem** nas
> variáveis de ambiente.

---

## 1. Pré-requisitos

| Item | Versão / Observação |
| --- | --- |
| Docker | 29.x ou superior |
| Docker Compose | v2 (vem com Docker Desktop) ou plugin `docker compose-plugin` |
| Portas livres | `4000` (API) e `5432` (Postgres) — ou troque no `docker-compose.yml` |
| RAM livre | ~1 GB (Postgres + Node 22 + bcrypt nativo) |
| Rede | HTTPS de saída para `sasintegra.sascar.com.br` (só quando você for chamar de verdade) |

Verifique:

```bash
docker --version
docker compose version
```

---

## 2. Os "3 usuários" do sistema — qual é qual?

Antes de tocar no `.env`, entenda **as três identidades diferentes** que coexistem:

| Identidade | Onde mora | Serve para | Definida por |
| --- | --- | --- | --- |
| **Admin local** (o "usuário local" da sua dúvida) | Tabela `users` do Postgres | Login na API GraphQL (`mutation login`) e TUI | `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` |
| **Usuário Sascar** (credencial externa) | Não é persistido — só lido do `.env` | Autenticar cada chamada SOAP ao SasIntegra | `SASCAR_USUARIO` / `SASCAR_SENHA` |
| **JWT secrets** (assinatura de tokens) | Não é persistido — só lido do `.env` | Assinar/verificar access e refresh tokens emitidos pela API | `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` |

### 2.1. Admin local (o "usuário local")

É o **único usuário que existe no banco** depois do seed automático. É com ele que você faz login no GraphQL/TUI.

- Email precisa ter TLD válido (validador `zod.email()`), por isso `admin@local.dev` (não `admin@local`).
- Senha precisa ter **≥ 8 caracteres** (validador `zod.string().min(8)`).
- Após o seed, ele tem `role = 'admin'` e `active = true` — pode gerenciar outros usuários via `mutation createUser`, etc.
- O `docker-entrypoint.sh` roda `node dist/scripts/seed-admin.js` em todo `up` (idempotente: se já existe, só loga "Skipping").

> **Você pode subir o stack inteiro, fazer login e usar a API mesmo sem ter as credenciais Sascar.** As chamadas a SasIntegra vão falhar com erro de autenticação SOAP, mas o `health` e o `login` funcionam.

### 2.2. Usuário Sascar (credencial externa)

É a credencial de acesso ao **web service SOAP SasIntegra v2.07** da Sascar/Michelin. É diferente do admin local.

- É repassada para `new SascarClient({ usuario, senha }, ...)` dentro de `SascarOrchestrator.ts:11`.
- Sem ela, a API sobe, mas `query veiculos`, `query clientes`, etc. vão devolver erro de auth SOAP.

> **Sem as chaves originais:** deixe `SASCAR_USUARIO` e `SASCAR_SENHA` com qualquer valor não-vazio (o `SascarClient` exige ambos populados — `client.js:34`). O stack sobe, `health` e `login` funcionam, e quando você colocar as chaves reais, basta reiniciar o container da app.

### 2.3. JWT secrets

- Precisam ter **≥ 32 caracteres** cada (validador `zod.string().min(32)`).
- Use valores aleatórios e **diferentes** para access e refresh.
- Gerar localmente:

  ```bash
  openssl rand -hex 32   # rodar 2x (um para cada secret)
  ```

---

## 3. Configurar o `.env`

O `.env` lido pelo `docker compose` precisa ter **no mínimo**:

```dotenv
# (obrigatório) Credenciais SasIntegra — preencha quando tiver
SASCAR_USUARIO=coloque_aqui_quando_tiver
SASCAR_SENHA=coloque_aqui_quando_tiver
SASCAR_WSDL_URL=https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService

# (obrigatório) JWT — 32+ chars cada, DIFERENTES entre si
JWT_ACCESS_SECRET=        # openssl rand -hex 32
JWT_REFRESH_SECRET=       # openssl rand -hex 32

# (obrigatório) Admin local — usado pelo login GraphQL e pela TUI
SEED_ADMIN_EMAIL=admin@local.dev
SEED_ADMIN_PASSWORD=      # ≥ 8 chars
```

> ⚠️ O `.env` está no `.gitignore` — ele **não vai** para o repositório. Copie do `.env.example` e ajuste:

```bash
cp .env.example .env
$EDITOR .env
```

### Tabela completa das variáveis

| Variável | Default | Obrigatório? | Notas |
| --- | --- | --- | --- |
| `SASCAR_USUARIO` | — | **sim** | Login SasIntegra. Sem ele o `SascarClient` lança no boot. |
| `SASCAR_SENHA` | — | **sim** | Senha SasIntegra. |
| `SASCAR_WSDL_URL` | URL oficial | não | Use outro endpoint apenas em homologação Sascar. |
| `SASCAR_TIMEOUT_MS` | `30000` | não | Timeout HTTP por chamada SOAP. |
| `SASCAR_MAX_RETRIES` | `3` | não | Retries em 5xx/erro de rede. |
| `API_PORT` | `4000` | não | Porta do Apollo (também exposta em `docker-compose.yml`). |
| `API_CORS_ORIGINS` | `http://localhost:3000` | não | CSV. Em prod, troque para o domínio do front. |
| `JWT_ACCESS_SECRET` | — | **sim (≥32)** | Assina access token (TTL 15m). |
| `JWT_REFRESH_SECRET` | — | **sim (≥32)** | Assina refresh token (TTL 7d). |
| `JWT_ACCESS_TTL` | `15m` | não | Formato `ms`/`s`/`m`/`h`/`d`. |
| `JWT_REFRESH_TTL` | `7d` | não | Idem. |
| `SEED_ADMIN_EMAIL` | — | **sim** | Email válido (TLD). |
| `SEED_ADMIN_PASSWORD` | — | **sim (≥8)** | Senha do admin. |
| `CACHE_CADASTRO_TTL_MS` | `86400000` (24h) | não | TTL do cache de clientes/veículos/motoristas. |
| `CACHE_POSICAO_TTL_MS` | `300000` (5min) | não | TTL do cache de posições. |
| `SYNC_POSITIONS_ENABLED` | `false` | não | Liga o cron de 10 min. |
| `SYNC_POSITIONS_CRON` | `*/10 * * * *` | não | Expressão cron. |
| `SYNC_POSITIONS_QUANTITY` | `1000` | não | Max pacotes por range. |
| `DATABASE_URL` | (do compose) | não | O compose já injeta `postgresql://...@postgres:5432/...`. |
| `LOG_LEVEL` | `info` | não | `fatal`/`error`/`warn`/`info`/`debug`/`trace`. |

---

## 4. Subir o stack

### 4.1. Build + start (recomendado na primeira vez)

```bash
docker compose up -d --build
```

O que acontece, em ordem:

1. **postgres** sobe (`postgres:16-alpine`), `healthcheck` aguarda `pg_isready`.
2. **app** é buildada multi-stage (`Dockerfile`):
   - clona `sascar-sdk` do GitHub, builda o `dist/`, instala em `node_modules/sascar-sdk/`
   - roda `npm rebuild bcrypt` (binding nativo)
   - compila o TS → `dist/`
3. **app** sobe e o `docker-entrypoint.sh`:
   1. Aguarda o Postgres responder (até 30 × 2s).
   2. Roda `node dist/scripts/migrate.js` (idempotente — 4 SQLs em `src/db/migrations/`).
   3. Roda `node dist/scripts/seed-admin.js` (insere o admin local se não existir).
   4. `exec node dist/index.js` → Apollo na porta 4000.

### 4.2. Acompanhar o boot

```bash
docker compose logs -f app
```

Procure, em ordem, por:

```
[entrypoint] waiting for postgres at postgresql://...
[entrypoint] postgres ready
[entrypoint] running migrations
APPLIED 0001_init.sql
APPLIED 0002_cadastros_cache.sql
APPLIED 0003_posicoes.sql
APPLIED 0004_caixa_preta.sql
[entrypoint] seeding admin
Seeded admin: admin@local.dev        # ou "already exists. Skipping."
[entrypoint] starting: node dist/index.js
{"level":30,"msg":"Apollo server started","url":"http://localhost:4000/"}
```

Saia do follow com `Ctrl+C` (o container continua rodando).

### 4.3. Status dos containers

```bash
docker compose ps
# ambos "Up" + "(healthy)"
```

---

## 5. Validar

### 5.1. Healthcheck (sem autenticação)

```bash
curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ health }"}'
```

Resposta esperada:

```json
{"data":{"health":"ok"}}
```

### 5.2. Login do admin local

```bash
curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { login(email:\"admin@local.dev\", password:\"SUA_SENHA\") { accessToken refreshToken user { email role } } }"}'
```

Resposta (exemplo):

```json
{
  "data": {
    "login": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi...",
      "user": { "email": "admin@local.dev", "role": "admin" }
    }
  }
}
```

> Troque `SUA_SENHA` pelo valor que você colocou em `SEED_ADMIN_PASSWORD`. Se você esqueceu, rode `npm run db:reset` (apaga tudo e re-seeda) — ou troque a senha direto no banco:
>
> ```sql
> \c api_orquestrador
> UPDATE users SET password_hash = crypt('nova_senha_aqui', gen_salt('bf')) WHERE email = 'admin@local.dev';
> ```

### 5.3. Primeira chamada autenticada

```bash
TOKEN="COLE_O_ACCESS_TOKEN_AQUI"
curl -sS -X POST http://localhost:4000/ \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ veiculos(quantidade: 10) { idVeiculo placa idCliente } }"}'
```

> **Sem credenciais Sascar**, essa query devolve erro SOAP do tipo `SascarApiError`. É esperado — a parte GraphQL/auth/cache está funcionando.

### 5.4. TUI (alternativa ao curl)

Se preferir cockpit de terminal em vez de Postman/curl:

```bash
docker compose exec app npm run tui
```

A TUI assume que você já tem admin local configurado. Na primeira execução, faz login silencioso com `SEED_ADMIN_*` e persiste a sessão em `env-paths('api-orquestrador').config/session.json` (host ou container, conforme onde você rodou).

---

## 6. Sobre o `sascar-sdk` (a parte que estava errada)

> Você mencionou que baixou do git de forma correta. Confirmando o estado atual:

- **package.json** declara `"sascar-sdk": "github:MartielLima/sascar-sdk"`.
- **Dockerfile** clona o repo no build stage, faz `npm ci --ignore-scripts` + `npm run build` e copia `package.json` + `dist/` para `node_modules/sascar-sdk/`. Isso garante que a versão no container é **exatamente o `dist/` do source** do branch `main`, não um tarball NPM stale.
- **package-lock.json** aponta para um commit específico do seu repo (atualizado por você, vide o `git diff`).
- **SascarOrchestrator.ts** instancia o client com a assinatura correta do SDK:

  ```ts
  // src/orchestrator/SascarOrchestrator.ts:11
  return new SascarClient(
    { usuario: opts.usuario, senha: opts.senha },        // T.SascarCredentials
    {
      wsdlUrl:    opts.wsdlUrl,                            // SascarClientOptions
      timeoutMs:  opts.timeoutMs ?? 30_000,
      maxRetries: opts.maxRetries ?? 3,
    },
  );
  ```

  Isso bate com `client.d.ts:28` (`constructor(credentials?, options?)`).

- **Postinstall local** (`src/scripts/postinstall.js`): se você rodar `npm install` direto na host (sem Docker), o `postinstall` rebuilda o `dist/` do SDK automaticamente caso esteja vazio. No Docker isso é responsabilidade do `Dockerfile` (passo 16–26).

Se depois de tudo isso você ainda ver erro de "sascar-sdk não tem `dist/`" no host, force o rebuild:

```bash
rm -rf node_modules/sascar-sdk
npm install
# ou, se persistir:
cd node_modules/sascar-sdk && npm install && npm run build && cd -
```

---

## 7. Comandos úteis

```bash
# Stack
docker compose up -d --build          # build + start
docker compose down                    # stop (mantém volume pg_data)
docker compose down -v                 # stop + apaga volume (DB zerado)
docker compose restart app             # reinicia só a API
docker compose logs -f app             # follow logs
docker compose exec app sh             # shell no container

# Banco
docker compose exec postgres psql -U api_orquestrador -d api_orquestrador
\dt                                   # listar tabelas
SELECT email, role, active FROM users;

# Imagem
docker images api-orquestrador:0.1.0
docker rmi api-orquestrador:0.1.0     # remover imagem (próximo build rebuilda)
```

---

## 8. Troubleshooting

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| `JWT_ACCESS_SECRET deve ter no mínimo 32 caracteres` no boot | Secrets curtos | `openssl rand -hex 32` 2×, cole no `.env` |
| `SASCAR_USUARIO obrigatório` no boot | Falta variável | Adicione ao `.env` (qualquer valor não-vazio) |
| `EAI_AGAIN postgres` no entrypoint | DNS do compose | Garanta que o `app` tem `depends_on: postgres: condition: service_healthy` (já tem) |
| `relation "users" does not exist` | Migrations não rodaram | `docker compose exec app node dist/scripts/migrate.js` |
| `Seeded admin: ...` aparece toda vez | `users` vazia | Rode `npm run db:reset` ou insira manualmente via SQL |
| `Invalid credentials` no login | Senha errada ou admin não foi seedado | Verifique `SEED_ADMIN_PASSWORD`; se trocou e esqueceu, atualize o hash via SQL (seção 5.2) |
| Healthcheck `(unhealthy)` no `docker compose ps` | API não respondeu `{health:ok}` em 30s | `docker compose logs app` para ver stack trace |
| `Cannot find module 'sascar-sdk'` | `node_modules/sascar-sdk/dist/` vazio | Rebuildar a imagem: `docker compose build --no-cache app` |
| Erro SOAP `Fault: ...` nas queries | Credenciais Sascar inválidas | Esperado sem as chaves reais — coloque-as no `.env` e reinicie |

---

## 9. Reset completo (último recurso)

Se quiser **começar do zero**:

```bash
docker compose down -v                # apaga container + volume (DB zerado)
docker image rm api-orquestrador:0.1.0
# ajustar .env
docker compose up -d --build         # build fresco + seed limpo
```

Pronto. Stack sobe em ~1 min após o primeiro build (cache de layers do Docker).
