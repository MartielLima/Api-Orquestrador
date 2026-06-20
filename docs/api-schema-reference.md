# Schema reference — Api-Orquestrador

Referência rápida de todos os queries e mutations disponíveis em `https://orcapi.martiellima.com/`.

Introspection está **desabilitada em prod** (Apollo Server 4+), então não dá pra usar `__schema` no Postman. Este doc serve como source-of-truth.

**Convenções:**
- 🔓 = público (não precisa token)
- 🔐 = requer `Authorization: Bearer <token>` (qualquer usuário autenticado)
- 👑 = requer admin

---

## Queries

### 🔓 `health`

```graphql
{ health }
```

Retorna `"ok"`. Útil pra smoke test.

### 🔐 `me`

```graphql
{ me { id email role active createdAt } }
```

Retorna o usuário autenticado.

### 👑 `users`

```graphql
{ users { id email role active createdAt } }
```

Lista todos os usuários.

### 🔐 `clientes`

```graphql
{ clientes(idCliente: 1, quantidade: 100) { idCliente cnpj cpf nome } }
```

Filtros opcionais: `idCliente`, `quantidade` (default 1000).

### 🔐 `veiculos`

```graphql
{ veiculos(idVeiculo: 123, quantidade: 100) { idVeiculo placa idCliente descricao idEquipamento status { online ignicaoLigada localizacao { latitude longitude } } } }
```

### 🔐 `motoristas`

```graphql
{ motoristas(idMotorista: 1, quantidade: 100) { idMotorista nome tipoDocumento } }
```

### 🔐 `posicoesRecentes`

```graphql
{ posicoesRecentes(quantidade: 100) { idVeiculo latitude longitude velocidade ignicao dataPosicao } }
```

### 🔐 `posicoesPorVeiculo`

```graphql
query($id: Int!, $di: DateTime!, $df: DateTime!) {
  posicoesPorVeiculo(idVeiculo: $id, dataInicio: $di, dataFim: $df) {
    idVeiculo latitude longitude velocidade dataPosicao
  }
}
```

Variables: `{"id": 123, "di": "2026-06-01T00:00:00Z", "df": "2026-06-20T00:00:00Z"}`.

### 👑 `syncStatus`

```graphql
{ syncStatus { method idVeiculo lastIdPacote lastSyncedAt } }
```

### 👑 `requestLog`

```graphql
{ requestLog(limit: 100, method: "Mutation.createUser") { id method source status cacheHit latencyMs createdAt error } }
```

Filtros opcionais: `limit` (default 100), `method`.

### 👑 `auditLog` ⭐ NOVO

```graphql
{
  auditLog(
    limit: 50,
    action: "user.password_reset",
    targetTable: "users",
    targetId: "uuid-opcional"
  ) {
    id action targetTable targetId actorUserId
    ip userAgent diff createdAt
  }
}
```

Filtros opcionais: `limit` (default 100), `actorUserId`, `action`, `targetTable`, `targetId`. Todos combinam com AND.

`action` aceita: `user.create`, `user.update`, `user.delete`, `user.password_reset`, `refresh_token.revoke`.

### 👑 `refreshTokens`

```graphql
{ refreshTokens(userId: "uuid") { id userId createdAt expiresAt revokedAt } }
```

### 🔐 `caixaPretaEventos` (deprecated)

```graphql
{ caixaPretaEventos(placa: "ABC1234") { id placa dataEvento latitude longitude } }
```

⚠️ Deprecated — use `posicoesRecentes`.

---

## Mutations

### 🔓 `login`

```graphql
mutation { login(email: "admin@local.dev", password: "admin1234") { accessToken refreshToken user { id email role } } }
```

Retorna JWT (15min) + refresh token. **Use o `accessToken` no header `Authorization: Bearer <token>`.**

### 🔓 `refresh`

```graphql
mutation { refresh(refreshToken: "...") { accessToken refreshToken user { id email role } } }
```

Roda o access token sem precisar logar de novo.

### 👑 `createUser`

```graphql
mutation C($i: CreateUserInput!) {
  createUser(input: $i) { id email role active }
}
```

Variables: `{"i": {"email": "user@x.com", "password": "Aa1!aaaa", "role": "user"}}`.

⚠️ Password precisa ter 8+ chars, maiúscula, minúscula, dígito.

### 👑 `updateUser`

```graphql
mutation U($id: ID!, $i: UpdateUserInput!) {
  updateUser(id: $id, input: $i) { id email role active }
}
```

Variables: `{"id": "uuid", "i": {"role": "admin", "active": false}}`. Ambos os campos opcionais.

⚠️ Não pode desativar/demotar a si mesmo.

### 👑 `deleteUser`

```graphql
mutation { deleteUser(id: "uuid") }
```

Retorna `true` se deletou. ⚠️ Não pode deletar a si mesmo.

### 👑 `resetUserPassword`

```graphql
mutation R($id: ID!, $p: String!) { resetUserPassword(id: $id, newPassword: $p) { id } }
```

Variables: `{"id": "uuid", "p": "NovaSenhaAa1!"}`.

### 👑 `revokeRefreshToken`

```graphql
mutation { revokeRefreshToken(id: "uuid-do-refresh-token") }
```

---

## Headers obrigatórios

Apollo Server 4+ tem **CSRF protection**. Toda request POST precisa de:

```
Content-Type: application/json
apollo-require-preflight: true
```

E pra requests autenticadas:

```
Authorization: Bearer <accessToken>
```

## Códigos de erro comuns

| extensions.code | Significa |
|---|---|
| `UNAUTHENTICATED` | Sem token ou token inválido/expirado |
| `FORBIDDEN` | Token válido mas user não tem permissão (ex: não-admin tentando `auditLog`) |
| `BAD_USER_INPUT` | Input inválido (password fraco, etc.) |
| `BAD_REQUEST` | Body malformado, falta `query`, CSRF block |
| `GRAPHQL_VALIDATION_FAILED` | Query com sintaxe inválida ou campo inexistente |
| `WEAK_PASSWORD` | Senha não atende critérios (8+ chars, mixed case, dígito) |
| `EMAIL_TAKEN` | Email já existe |
| `USER_NOT_FOUND` | UUID não existe |
| `CANNOT_DEMOTE_SELF` / `CANNOT_DEACTIVATE_SELF` | Tentou se autodemover/desativar |
