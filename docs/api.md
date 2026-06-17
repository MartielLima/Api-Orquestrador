# Api-Orquestrador Sascar — API GraphQL

**Endpoint:** `POST http://localhost:4000/` (ou `http://app:4000/` dentro do docker-compose).
**Header obrigatório** (exceto `health`, `login`, `refresh`): `Authorization: Bearer <accessToken>`.
**Tokens:** obtidos via `mutation login` (access TTL 15min, refresh TTL 7d). Renovar via `mutation refresh` (rotação).

> Visão geral (índice): ver [README.md → API GraphQL](README.md#api-graphql).

---

## Auth

### `login(email: String!, password: String!): AuthPayload!`

Autentica um usuário existente e emite um par de tokens (access + refresh). Não requer header `Authorization`.

**Argumentos:**
- `email: String!` — email do usuário cadastrado (case-insensitive).
- `password: String!` — senha em texto claro (validada contra o hash bcrypt armazenado).

**Retorna (`AuthPayload`):**
- `accessToken: String!` — JWT assinado com `JWT_ACCESS_SECRET`. TTL: `JWT_ACCESS_TTL` (default `15m`). Usar no header `Authorization: Bearer ...`.
- `refreshToken: String!` — JWT assinado com `JWT_REFRESH_SECRET`. TTL: `JWT_REFRESH_TTL` (default `7d`). Usar apenas em `mutation refresh`.
- `user: User!` — objeto do usuário autenticado.

**Erros:**
- `Invalid credentials` (`INTERNAL_SERVER_ERROR` no código atual — ver Known Issues abaixo) — email inexistente, senha errada, ou `user.active = false`.

**Exemplo:**

```graphql
mutation {
  login(email: "admin@local.dev", password: "change-me-admin") {
    accessToken
    refreshToken
    user { id email role }
  }
}
```

```json
{
  "data": {
    "login": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi...",
      "user": { "id": "d74069ec-...", "email": "admin@local.dev", "role": "admin" }
    }
  }
}
```

---

### `refresh(refreshToken: String!): AuthPayload!`

Roda um refresh token: revoga o token usado, emite um novo par (access + refresh). Não requer header `Authorization`. Cada refresh token só pode ser usado uma vez (rotação estrita).

**Argumentos:**
- `refreshToken: String!` — JWT de refresh obtido em `login` ou em um `refresh` anterior.

**Retorna:** mesmo `AuthPayload` de `login` (novo `accessToken`, novo `refreshToken`, `user`).

**Erros:**
- `Invalid refresh token` — token expirado, revogado, ou desconhecido.
- `User not found` — o usuário dono do token foi removido ou desativado.

**Exemplo:**

```graphql
mutation {
  refresh(refreshToken: "eyJhbGciOi...") {
    accessToken
    refreshToken
  }
}
```

---

## Health

### `health: String!`

Liveness probe. Retorna `"ok"`. **Não requer auth.** Usado pelo healthcheck do Docker.

**Exemplo:**

```graphql
{ health }
```

```json
{ "data": { "health": "ok" } }
```

---

## User

### `me: User!`

Retorna o usuário autenticado (a partir do JWT no header).

**Retorna (`User`):**
- `id: ID!` — UUID.
- `email: String!` — email único (case-insensitive).
- `role: String!` — `'admin'` ou `'user'`. Admin tem acesso às mutations de user management.
- `active: Boolean!` — `false` desabilita o login.
- `createdAt: DateTime!` — ISO 8601.

**Erros:** `UNAUTHENTICATED` (sem token / token inválido) — code mapeado como `INTERNAL_SERVER_ERROR` no momento (ver Known Issues).

---

### `users: [User!]!` — 🔒 admin

Lista todos os usuários, ordenados por `createdAt DESC` (mais recentes primeiro).

**Retorna:** array de `User` (mesmos campos de `me`).

**Erros:** `FORBIDDEN` (não-admin) — code `INTERNAL_SERVER_ERROR` no momento.

---

### `refreshTokens(userId: ID!): [RefreshToken!]!` — 🔒 admin

Lista os refresh tokens de um usuário (todos, revogados e não revogados). Ordenados por `createdAt DESC`.

**Argumentos:** `userId: ID!` — UUID do usuário.

**Retorna (`RefreshToken`):**
- `id: ID!` — UUID.
- `userId: ID!` — dono.
- `createdAt: DateTime!` — quando foi emitido.
- `expiresAt: DateTime!` — quando expira (padrão `now() + 7d`).
- `revokedAt: DateTime` — `null` se ainda ativo; setado se revogado (`mutation revokeRefreshToken` ou `refresh` que rotaciona).

---

### `createUser(input: CreateUserInput!): User!` — 🔒 admin

Cria um novo usuário. Idempotente só no erro: email duplicado retorna `EMAIL_TAKEN` sem inserir.

**Argumentos (`CreateUserInput`):**
- `email: String!` — único, case-insensitive, formato válido (zod).
- `password: String!` — mínimo 8 caracteres (zod). Hash bcrypt antes de gravar.
- `role: String!` — `'admin'` ou `'user'` (sem validação no schema; valores fora disso passam).

**Retorna:** `User` (com `active: true` por default).

**Erros:**
- `EMAIL_TAKEN` — email já existe.
- `WEAK_PASSWORD` — senha < 8 chars.
- `FORBIDDEN` — não-admin.

---

### `updateUser(id: ID!, input: UpdateUserInput!): User!` — 🔒 admin

Atualiza `role` e/ou `active` de um usuário.

**Argumentos:**
- `id: ID!` — UUID do usuário.
- `input: UpdateUserInput`:
  - `role: String` — opcional.
  - `active: Boolean` — opcional.

**Retorna:** `User` atualizado.

**Erros:**
- `USER_NOT_FOUND` — `id` inexistente.
- `CANNOT_DEMOTE_SELF` — admin tentando mudar a própria `role` para algo diferente de `'admin'`.
- `CANNOT_DEACTIVATE_SELF` — admin tentando `active: false` em si mesmo.
- `FORBIDDEN` — não-admin.

---

### `resetUserPassword(id: ID!, newPassword: String!): User!` — 🔒 admin

Reseta a senha de um usuário. Hash bcrypt, atualiza `updated_at`.

**Argumentos:**
- `id: ID!` — UUID.
- `newPassword: String!` — mínimo 8 caracteres.

**Retorna:** `User`.

**Erros:** `WEAK_PASSWORD`, `USER_NOT_FOUND`, `FORBIDDEN`.

---

### `revokeRefreshToken(id: ID!): Boolean!` — 🔒 admin

Revoga um refresh token (seta `revoked_at = now()`). Idempotente: revogar um token já revogado retorna `false`.

**Argumentos:** `id: ID!` — UUID do refresh token (não confundir com o JWT em si).

**Retorna:** `Boolean!` — `true` se revogou agora, `false` se já estava revogado ou não existe.

**Erros:** `FORBIDDEN`.

---

## Cadastros Sascar (cache 24h)

Todas as queries de cadastro são cache-first (`cachedQuery` em `src/domain/`). TTL padrão `CACHE_CADASTRO_TTL_MS` (24h). Em cache miss, faz a chamada SOAP ao Sascar, persiste no Postgres, e devolve. A próxima chamada dentro do TTL vem do cache.

### `clientes(quantidade: Int = 1000, idCliente: Int): [Cliente!]!`

Lista de clientes da conta SasIntegra. Mapeia para `obterClientesV2` no SDK (V2 aceita CNPJ alfanumérico, alinhado com LGPD).

**Argumentos:**
- `quantidade: Int` — limite de retorno (default 1000).
- `idCliente: Int` — filtro opcional por ID específico.

**Retorna (`Cliente`):**
- `idCliente: Int!` — PK da Sascar.
- `cnpj: String` — CNPJ alfanumérico (ou `null`).
- `cpf: String` — CPF (ou `null`).
- `nome: String!` — razão social.
- `fetchedAt: DateTime!` — quando foi cacheado (UTC).
- `expiresAt: DateTime!` — quando o cache expira.

**Erros:** Sascar (`SASCAR_AUTH`, `SASCAR_RATE_LIMIT`, `SASCAR_TIMEOUT`, `SASCAR_NETWORK`, `SASCAR_FAULT`) — note que no momento estes vêm como `INTERNAL_SERVER_ERROR` porque `cachedQuery` não chama `mapSascarError` (ver Known Issues).

---

### `veiculos(quantidade: Int = 1000, idVeiculo: Int): [Veiculo!]!`

Lista de veículos. Mapeia para `obterVeiculos` no SDK.

**Argumentos:**
- `quantidade: Int` — limite (default 1000).
- `idVeiculo: Int` — filtro opcional.

**Retorna (`Veiculo`):**
- `idVeiculo: Int!` — PK.
- `placa: String!` — placa (formato Sascar).
- `idCliente: Int` — dono (FK para Cliente).
- `descricao: String` — descrição livre.
- `idEquipamento: BigInt` — ID do equipamento rastreador (string no JSON, pode exceder 2³¹ — ex: 9322440283).
- `fetchedAt`, `expiresAt: DateTime!`.

**Erros:** mesmos de `clientes`.

---

### `motoristas(quantidade: Int = 1000, idMotorista: Int): [Motorista!]!`

Lista de motoristas. Mapeia para `obterMotoristas`.

**Retorna (`Motorista`):**
- `idMotorista: Int!` — PK.
- `nome: String!`
- `tipoDocumento: String` — `'F'` (físico) ou `'J'` (jurídico), ou `null`.
- `fetchedAt`, `expiresAt: DateTime!`.

**Erros:** mesmos de `clientes`.

---

## Posições

### `posicoesRecentes(quantidade: Int = 1000): [Posicao!]!`

Posições recentes do banco local. Filtro SQL: `data_posicao > now() - interval '5 minutes'`. Em cache miss (sem posições recentes), sincroniza TODOS os veículos cacheados em `veiculos_cache` via `fetchAndUpsertPosicoes` (range de `id_pacote`) e retorna as últimas N.

**Argumentos:** `quantidade: Int` — limite (default 1000).

**Retorna (`Posicao`):**
- `idPacote: Int!` — PK do pacote na Sascar. ⚠️ Sascar retorna valores > 2³¹; este campo está atualmente como `Int` no schema e falha em overflow (ver Known Issues).
- `idVeiculo: Int!`
- `dataPosicao: DateTime!` — quando o veículo estava na posição.
- `dataPacote: DateTime!` — quando a Sascar recebeu o pacote.
- `latitude: Float!`, `longitude: Float!`, `velocidade: Float!`
- `ignicao: Int`, `direcao: Int`, `odometro: Float` — opcionais.
- `syncedVia: String!` — `'graphql'` (consulta sob demanda) ou `'cron'` (job de sync).

**Erros:** Sascar (idem cadastros, com o mesmo problema de mapeamento).

---

### `posicoesPorVeiculo(idVeiculo: Int!, dataInicio: DateTime!, dataFim: DateTime!): [Posicao!]!`

Posições de um veículo em um intervalo. Antes de consultar, dispara `fetchAndUpsertPosicoes(ctx, idVeiculo)` para puxar pacotes novos do cursor de sync; depois lê do banco local com `WHERE id_veiculo = $1 AND data_posicao BETWEEN $2 AND $3`.

**Argumentos:**
- `idVeiculo: Int!`
- `dataInicio: DateTime!` — ISO 8601 (ex: `2026-06-17T00:00:00Z`).
- `dataFim: DateTime!` — ISO 8601.

**Retorna:** mesmo `Posicao` de `posicoesRecentes`.

---

## Auditoria / status

### `syncStatus: [SyncCursor!]!`

Estado do cursor de sync de posições, uma linha por par `(method, id_veiculo)`. Usado para monitorar progresso do job `syncPositions` (cron) e da sincronização sob demanda em `posicoesPorVeiculo`.

**Retorna (`SyncCursor`):**
- `method: String!` — método Sascar usado (atualmente `obterPacotePosicaoPorRangeJSON`).
- `idVeiculo: Int!`
- `lastIdPacote: Int` — `null` se nunca sincronizou; senão, maior `id_pacote` já gravado.
- `lastSyncedAt: DateTime!` — última escrita.

**Nota:** vazio se o job `syncPositions` está desligado (`SYNC_POSITIONS_ENABLED=false`) e nenhuma `posicoesPorVeiculo` foi chamada.

---

### `requestLog(limit: Int = 100, method: String): [RequestLogEntry!]!`

Log de auditoria: cada chamada (Sascar, auth, cron) gravada. Usar para debug ("por que essa chamada falhou?") e métricas.

**Argumentos:**
- `limit: Int` — default 100.
- `method: String` — filtro opcional (ex: `"obterVeiculos"`).

**Retorna (`RequestLogEntry`):**
- `id: ID!`
- `method: String!` — método Sascar / `login` / `syncPositions.cron` / etc.
- `source: String!` — `'graphql'`, `'cron'`, ou `'auth'`.
- `status: String!` — `'ok'`, `'error'`, `'cache_hit'`.
- `cacheHit: Boolean!` — se a resposta veio do cache local.
- `latencyMs: Int` — duração em ms.
- `createdAt: DateTime!`
- `error: String` — mensagem de erro se `status = 'error'`.

---

## Deprecated

### `caixaPretaEventos(placa: String, idVeiculo: Int): [CaixaPretaEvento!]!` — ⚠️ `@deprecated`

**Não use.** O método SOAP subjacente (`solicitarEventosCaixaPreta`, seção 4.51 do manual SasIntegra v2.07) está **DESATIVADO** pela Sascar sem previsão de retorno. O resolver retorna apenas histórico em `caixa_preta_eventos` (pode estar vazio).

Use `posicoesRecentes` no lugar.

**Retorna (`CaixaPretaEvento`):**
- `id: ID!` (deprecated)
- `idVeiculo: Int`, `placa: String`, `dataEvento: DateTime`, `latitude: Float`, `longitude: Float`, `velocidade: Float` — todos opcionais.

---

## Scalars customizados

- `DateTime` — string ISO 8601 (ex: `2026-06-17T19:25:06.000Z`).
- `BigInt` — string no JSON (preserva precisão para valores > 2³¹). Exemplo: `idEquipamento: "9322440283"`.

---

## Códigos de erro (target)

| Code | Significado | Onde |
| --- | --- | --- |
| `UNAUTHENTICATED` | Sem token / token inválido | `me`, queries autenticadas |
| `FORBIDDEN` | Autenticado, mas sem `role: admin` | user management |
| `EMAIL_TAKEN` | Email duplicado em `createUser` | `createUser` |
| `WEAK_PASSWORD` | Senha < 8 chars | `createUser`, `resetUserPassword` |
| `USER_NOT_FOUND` | UUID inexistente | `updateUser`, `resetUserPassword` |
| `CANNOT_DEMOTE_SELF` | Admin tentando rebaixar a si mesmo | `updateUser` |
| `CANNOT_DEACTIVATE_SELF` | Admin tentando desativar a si mesmo | `updateUser` |
| `SASCAR_AUTH` | Credenciais SasIntegra inválidas | qualquer chamada Sascar |
| `SASCAR_RATE_LIMIT` | Sascar limitou chamadas (com `retryAfter`) | qualquer chamada Sascar |
| `SASCAR_TIMEOUT` | Sascar não respondeu a tempo (com `timeoutMs`) | qualquer chamada Sascar |
| `SASCAR_NETWORK` | Falha de rede (DNS, conexão) | qualquer chamada Sascar |
| `SASCAR_FAULT` | SOAP Fault retornado (com `faultcode`) | qualquer chamada Sascar |

---

## Known Issues (pré-existentes, fora do escopo do pin)

Bugs #1–#4 foram corrigidos no mesmo PR do pin (ver `CHANGELOG.md` → `[Unreleased]`). Restam 2 issues que não bloqueiam, capturadas para follow-up:

| # | Problema | Local | Impacto | Status |
| --- | --- | --- | --- | --- |
| 5 | `cachedQuery` em `posicoes.ts` (`getPosicoesRecentes`) dispara sync para TODOS os veículos em cache miss, sequencialmente — pode ser lento com muitos veículos | `src/domain/posicoes.ts:42-44` | latência alta em `posicoesRecentes` se há > 50 veículos e banco de posições vazio | **pending** |
| 6 | `cachedQuery` em `posicoesRecentes` faz cache via `obterPacotePosicaoPorRangeJSON` — mas o `cachedQuery` salva em `veiculos_cache` (tabela errada); a tabela `posicoes` é populada só por `fetchAndUpsertPosicoes` (que está OK). O `cachedQuery` para posições é na verdade o sync sob demanda. | `src/domain/posicoes.ts:22-57` | sem impacto funcional agora, mas a função é confusa | **pending** |

### Resolvidos neste PR (era pré-existente, agora fixed)

| # | Era | Fix |
| --- | --- | --- |
| 1 | `login`/`refresh` não retornavam `active` no `user` | Adicionado `active: u.active` em ambos (commit `74e6d35`) |
| 2 | Erros de auth vinham como `INTERNAL_SERVER_ERROR` | `UserError` + `formatError` plugin no Apollo (commits `74e6d35` + `b9ac030`) |
| 3 | `posicoesRecentes.idPacote` overflow em dados reais | `idPacote: BigInt!` no schema (commit `ada026f`) |
| 4 | `cachedQuery` em cadastros não mapeava erros Sascar | `.catch(mapSascarError)` no fetcher (commit `ee5c01a`) |
