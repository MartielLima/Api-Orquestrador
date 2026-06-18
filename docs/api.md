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

## Cadastros Sascar (cache local)

Todas as queries de cadastro são cache-first (`cachedQuery` em `src/domain/`). TTL efetivo **60 segundos** (hardcoded em `src/domain/{clientes,veiculos,motoristas}.ts:ttlMs: 60_000`). Em cache miss, faz a chamada SOAP ao Sascar, persiste no Postgres, e devolve. A próxima chamada dentro do TTL vem do cache.

> **Nota:** a env var `CACHE_CADASTRO_TTL_MS` (default `86_400_000` = 24h) está documentada no README mas **não é usada** pelo código atual — o `ttlMs` está hardcoded. Para mudar o TTL, edite o código ou faça o `cachedQuery` aceitar env var (follow-up).

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
- `status: VeiculoStatus` — estado vivo derivado do último pacote em `posicoes` (ver `VeiculoStatus` abaixo). `null` se o veículo nunca teve posição registrada.

**`VeiculoStatus`** (extraído de `posicoes.raw` + colunas; sem chamada Sascar extra):
- `bloqueado: Boolean!` — `raw.bloqueio === 1`.
- `ignicaoLigada: Boolean!` — coluna `posicoes.ignicao === 1`.
- `online: Boolean!` — `data_posicao > now() - 10 minutes` (heurística). Se o cron `syncPositions` estiver desligado, fica `false` rapidamente.
- `localizacao: VeiculoStatusLocalizacao!` — `{ latitude, longitude, velocidade, direcao? }` da última posição.
- `gps: Boolean!` — `raw.gps === 1` (fix GPS válido).
- `jamming: Boolean!` — `raw.jamming === 1` (sinal de jamming detectado).
- `combustivel: VeiculoStatusCombustivel` — `{ nivel, litrometro }` de `raw.nivelCombustivel` / `raw.litrometro`. `null` se ausentes.
- `sensores: VeiculoStatusSensores!` — `{ tensao?, rpm?, temperatura1?, temperatura2?, temperatura3? }` de `raw.*` (campos nulos quando ausentes).
- `alarme: VeiculoStatusAlarme!` — `{ statusAncora?, pontoEntrada, pontoSaida, ultimaMensagem: { nome, conteudo, texto }? }` derivados de `raw.statusAncora` / `raw.pontoEntrada` / `raw.pontoSaida` / `raw.nomeMensagem`+`conteudoMensagem`+`textoMensagem`. `ultimaMensagem` é `null` quando os 3 campos são vazios.
- `atualizadoEm: DateTime!` — `data_posicao` do último pacote.
- `idadeSegundos: Int!` — `floor((now - data_posicao) / 1000)`.

**Implementação:** o resolver roda 1 query SQL extra (`SELECT DISTINCT ON (id_veiculo) ... FROM posicoes WHERE id_veiculo = ANY($1) ORDER BY id_veiculo, data_posicao DESC`) por chamada de `veiculos` — **N+1 evitado**, escala para centenas de veículos com 1 round-trip. Veículos sem posição retornam `status: null` (não quebram a query).

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
- `idPacote: BigInt!` — PK do pacote na Sascar (serializado como string no JSON para preservar precisão > 2³¹; ex: `"9322440283"`).
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

---

## Exemplos de respostas reais

Valores capturados em produção (conta SasIntegra real, 2026-06-18). Use como referência para o shape dos retornos.

### `Query.clientes`

```graphql
query {
  clientes(quantidade: 2) {
    idCliente cnpj cpf nome fetchedAt expiresAt
  }
}
```

```json
{
  "data": {
    "clientes": [
      {
        "idCliente": 202977,
        "cnpj": "5975935000107",
        "cpf": "0",
        "nome": "RM MOTA CIA LTDA",
        "fetchedAt": "2026-06-18T19:03:43.438Z",
        "expiresAt": "2026-06-18T19:04:43.438Z"
      }
    ]
  }
}
```

> **Nota:** `cpf: "0"` é literal da Sascar (não `null`) — representa "sem CPF". Use `cnpj ?? cpf` no cliente.

### `Query.veiculos` (com `status` desde v0.2.0)

```graphql
query {
  veiculos(quantidade: 2) {
    idVeiculo placa idCliente idEquipamento fetchedAt expiresAt
    status {
      bloqueado ignicaoLigada online
      localizacao { latitude longitude velocidade direcao }
      gps jamming
      combustivel { nivel litrometro }
      sensores { tensao rpm temperatura1 temperatura2 temperatura3 }
      alarme {
        statusAncora pontoEntrada pontoSaida
        ultimaMensagem { nome conteudo texto }
      }
      atualizadoEm idadeSegundos
    }
  }
}
```

**Exemplo 1 — veículo parado, sem alarmes, combustível cheio** (caso real de `posicao` com ign=0, vel=0):

```json
{
  "data": {
    "veiculos": [
      {
        "idVeiculo": 1832881,
        "placa": "NTO7934",
        "idCliente": 202977,
        "idEquipamento": "9322440283",
        "fetchedAt": "2026-06-18T19:03:43.438Z",
        "expiresAt": "2026-06-18T19:04:43.438Z",
        "status": {
          "bloqueado": false,
          "ignicaoLigada": false,
          "online": false,
          "localizacao": {
            "latitude": -17.5897424,
            "longitude": -39.7412032,
            "velocidade": 0,
            "direcao": 235
          },
          "gps": true,
          "jamming": false,
          "combustivel": { "nivel": "100", "litrometro": "5343.539" },
          "sensores": { "tensao": 24, "rpm": 0, "temperatura1": -125, "temperatura2": -125, "temperatura3": -125 },
          "alarme": { "statusAncora": null, "pontoEntrada": false, "pontoSaida": false, "ultimaMensagem": null },
          "atualizadoEm": "2026-06-17T01:15:33.000Z",
          "idadeSegundos": 150586
        }
      }
    ]
  }
}
```

**Exemplo 2 — veículo em movimento, bloqueado, com alarme** (ign=1, vel=65, com mensagem):

```json
{
  "data": {
    "veiculos": [
      {
        "idVeiculo": 2223613,
        "status": {
          "bloqueado": true,
          "ignicaoLigada": true,
          "online": true,
          "localizacao": { "latitude": -25.87, "longitude": -50.81, "velocidade": 65, "direcao": 90 },
          "gps": true,
          "jamming": false,
          "combustivel": { "nivel": "42", "litrometro": "3210.123" },
          "sensores": { "tensao": 27.5, "rpm": 2200, "temperatura1": 85, "temperatura2": 90, "temperatura3": 78 },
          "alarme": {
            "statusAncora": 2,
            "pontoEntrada": true,
            "pontoSaida": false,
            "ultimaMensagem": { "nome": "BLOQUEIO", "conteudo": "Veículo bloqueado remotamente", "texto": "" }
          },
          "atualizadoEm": "2026-06-18T19:04:49.424Z",
          "idadeSegundos": 30
        }
      }
    ]
  }
}
```

> **Edge cases observados:**
> - `temperatura1/2/3: -125` é sentinela da Sascar para "sensor desconectado" (não é `null`).
> - `statusAncora: null` quando `raw.statusAncora` é null; valores 0/1/2/3 quando populado.
> - `ultimaMensagem: null` quando `raw.nomeMensagem`, `conteudoMensagem`, `textoMensagem` são todos vazios.
> - `combustivel: null` quando `raw.nivelCombustivel` e `raw.litrometro` são ambos null.
> - `online: false` quando `data_posicao` tem mais de 10 min (heurística 10min × 6/h = 144 posições/dia por veículo).
> - Veículos sem posição em `posicoes` retornam `status: null` (não quebram a query).

### `Query.motoristas`

```graphql
query {
  motoristas(quantidade: 2) {
    idMotorista nome tipoDocumento fetchedAt expiresAt
  }
}
```

```json
{
  "data": {
    "motoristas": [
      { "idMotorista": 2661329, "nome": "JORGE LUIZ ANICETO NASCIMENTO", "tipoDocumento": "F", "fetchedAt": "2026-06-18T19:03:53.011Z", "expiresAt": "2026-06-18T19:04:53.010Z" },
      { "idMotorista": 2661467, "nome": "EDVALDO ROCHA FERREIRA", "tipoDocumento": "F", "fetchedAt": "2026-06-18T19:03:53.121Z", "expiresAt": "2026-06-18T19:04:53.010Z" }
    ]
  }
}
```

### `Query.posicoesRecentes`

```graphql
query {
  posicoesRecentes(quantidade: 3) {
    idPacote idVeiculo dataPosicao velocidade ignicao
  }
}
```

```json
{
  "data": {
    "posicoesRecentes": [
      { "idPacote": "15021249998", "idVeiculo": 1950543, "dataPosicao": "2026-06-17T01:15:33.000Z", "velocidade": 0, "ignicao": 0 },
      { "idPacote": "15021249311", "idVeiculo": 1832881, "dataPosicao": "2026-06-17T01:15:15.000Z", "velocidade": 0, "ignicao": 0 },
      { "idPacote": "15021248903", "idVeiculo": 637242,  "dataPosicao": "2026-06-17T01:15:05.000Z", "velocidade": 0, "ignicao": 0 }
    ]
  }
}
```

> **Nota:** `idPacote` é `BigInt!` mas serializa como **string** no JSON (preserva precisão > 2³¹). Não compare como `Number` no cliente JS — mantenha como `String` para não perder precisão.

### `Query.posicoesPorVeiculo`

```graphql
query {
  posicoesPorVeiculo(
    idVeiculo: 1832881,
    dataInicio: "2026-06-17T00:00:00Z",
    dataFim: "2026-06-17T04:30:00Z"
  ) {
    idPacote idVeiculo dataPosicao dataPacote
    latitude longitude velocidade ignicao direcao odometro syncedVia
  }
}
```

```json
{
  "data": {
    "posicoesPorVeiculo": [
      {
        "idPacote": "15021070727",
        "idVeiculo": 1832881,
        "dataPosicao": "2026-06-17T00:00:00.000Z",
        "dataPacote": "2026-06-16T23:59:14.000Z",
        "latitude": -17.5897424,
        "longitude": -39.7412032,
        "velocidade": 0,
        "ignicao": 0,
        "direcao": 235,
        "odometro": 169154,
        "syncedVia": "graphql"
      }
    ]
  }
}
```

> **Comportamento:** a query chama `fetchAndUpsertPosicoes` antes de ler do DB (puxa pacotes novos do cursor de sync). Em contas com >50 veículos, a primeira chamada pode demorar ~30s (1 chamada SOAP + inserts). O cap é ~200 linhas por default (não configurável via GraphQL).

### `Query.syncStatus`

```graphql
query {
  syncStatus {
    method idVeiculo lastIdPacote lastSyncedAt
  }
}
```

```json
{
  "data": {
    "syncStatus": [
      {
        "method": "obterPacotePosicaoPorRangeJSON",
        "idVeiculo": 777,
        "lastIdPacote": "15021249998",
        "lastSyncedAt": "2026-06-18T19:04:23.411Z"
      }
    ]
  }
}
```

> Vazio se o job `syncPositions` está desligado (`SYNC_POSITIONS_ENABLED=false`) e nenhuma `posicoesPorVeiculo` foi chamada.

### `Query.requestLog`

```graphql
query {
  requestLog(limit: 3) {
    id method source status cacheHit latencyMs createdAt
  }
}
```

```json
{
  "data": {
    "requestLog": [
      { "id": "2256", "method": "obterPacotePosicaoPorRangeJSON", "source": "graphql", "status": "ok",         "cacheHit": false, "latencyMs": 30242, "createdAt": "2026-06-18T19:04:23.441Z" },
      { "id": "2255", "method": "obterMotoristas",                  "source": "graphql", "status": "ok",         "cacheHit": false, "latencyMs": 366,   "createdAt": "2026-06-18T19:03:53.146Z" },
      { "id": "2254", "method": "obterVeiculos",                   "source": "graphql", "status": "cache_hit",   "cacheHit": true,  "latencyMs": 21,    "createdAt": "2026-06-18T19:03:43.626Z" }
    ]
  }
}
```

> **Observação:** `status: "cache_hit"` aparece quando `cachedQuery` retornou do Postgres local (TTL 60s); `latencyMs` cai de ~5s para ~20ms. Útil para monitorar efetividade do cache.

### `Query.caixaPretaEventos` (deprecated)

```graphql
query {
  caixaPretaEventos(placa: "AAA1111") {
    id idVeiculo placa dataEvento latitude longitude
  }
}
```

```json
{
  "data": {
    "caixaPretaEventos": []
  }
}
```

> **Sempre retorna `[]`** — `solicitarEventosCaixaPreta` está desativado pela Sascar (sem previsão de retorno). Use `posicoesRecentes` no lugar.
