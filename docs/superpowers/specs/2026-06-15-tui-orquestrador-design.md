# TUI Orquestrador — Design

**Data:** 2026-06-15
**Status:** Aguardando revisão
**Stack escolhida:** TypeScript + Ink (React) + graphql-request + chalk + env-paths
**Compatibilidade:** Node 18+ (mesmo runtime da API)

## Resumo executivo

Adicionar uma **TUI (Terminal User Interface)** ao projeto `api-orquestrador`,
operada 100% pelo terminal, que funcione como um "cockpit" da API: gerenciamento
de usuários (prioridade), navegação dos dados Sascar, visualização de logs de
auditoria, status de sincronização, e gestão de refresh tokens.

A TUI vive **dentro do mesmo repositório** (em `src/tui/`), roda via `npm run tui`,
e se comunica **exclusivamente** com a API GraphQL existente — não toca o
Postgres diretamente. Para viabilizar a feature prioritária (gestão de usuários),
o backend ganha **mutations e queries novas de user management**, gates por
`role: 'admin'`.

A meta é: o operador roda `npm run tui`, faz login com email/senha, e opera
tudo que a API expõe (e o que a API passa a expor com esta spec) sem sair do
terminal — sem Postman, sem curl, sem psql.

## Objetivos e não-objetivos

### Objetivos

1. **Gestão de usuários completa** via TUI: listar, criar, editar role,
   ativar/desativar, resetar senha, ver/revogar refresh tokens. Esta é a
   feature prioritária — onde o operador gasta 80% do tempo.
2. **Navegação de dados Sascar** em formato tabela interativa: clientes,
   veículos, motoristas, posições (recentes + por veículo).
3. **Visualização de logs** (`request_log`) com filtros e streaming,
   **funcionalidade obrigatória** por solicitação explícita.
4. **Status de sincronização** (`sync_cursor`) em painel compacto.
5. **Tela de login** com persistência segura de JWT entre execuções.
6. **Aparência polida** — header em gradiente, sidebar fixa, toasts,
   modais, spinners, atalhos vim-like. Operação por teclado, sem mouse.
7. **Adicionar mutations/queries no backend** para que a TUI não precise
   tocar o banco. Tudo gateado por `role: 'admin'`.

### Não-objetivos (fora do escopo desta spec)

- Painel web ou front-end browser-based.
- Multi-tenant (várias credenciais Sascar).
- Subscriptions GraphQL em tempo real (a TUI faz polling; vira spec futura).
- Edição de credenciais Sascar ou rotação de secrets pela TUI.
- Edição da própria role do admin logado (anti-lockout).
- Internacionalização (i18n) — copy em pt-BR.
- Auto-update da TUI.
- Edição de email de usuário (quebra auditoria; troca = criar novo).

## Contexto e pré-requisitos

- O projeto `api-orquestrador` é uma API GraphQL (Apollo Server 4) que
  orquestra o `sascar-sdk` (SOAP SasIntegra v2.07). Detalhes em
  `docs/superpowers/specs/2026-06-12-api-orquestrador-sascar-design.md`.
- A tabela `users` (Postgres) tem: `id`, `email` (citext), `password_hash`,
  `role`, `active`, `createdAt`, `updatedAt`. Já tem seed-admin script.
- A tabela `refresh_tokens` tem: `id`, `user_id`, `token_hash`, `expiresAt`,
  `revokedAt`, `createdAt`. JWT auth já emite/revoga tokens.
- A API expõe **apenas** `login` e `refresh` como mutations — **não há
  CRUD de usuários via GraphQL hoje**. Esta spec adiciona.
- 37 testes Jest passando no momento. Meta após a spec: 87+ (62 backend + 25+
  TUI).
- O terminal do operador é presumido: ≥ 80 colunas × 24 linhas, suporte a
  cores truecolor (fallback automático se não). Linux/macOS primários,
  Windows via WSL como caso secundário.

## Decisões de stack

| Decisão | Escolha | Por quê |
|---|---|---|
| Framework TUI | **Ink (React)** | Composição, hooks, ecossistema maduro (ink-text-input, ink-select-input, ink-table, ink-spinner). Usado por Vercel CLI, Cloudflare Wrangler, npm CLI. |
| Cliente GraphQL | **graphql-request** | Leve (3 KB), fetch-based, sem cache global. Suficiente para polling. |
| Persistência de credenciais | **env-paths** (chmod 600) | Caminho cross-platform seguro. `~/.config/api-orquestrador/auth.json` no Linux. |
| Execução | **`tsx` + JSX/TSX** | Sem build step adicional. Mesmo toolchain já em uso no `npm run dev`. |
| Cores | **chalk** + **ink-gradient** | Compositor e gradientes prontos. |
| Validação | **zod** (mesmo da API) | Consistência. |

Localização dos arquivos:

```
src/
  tui/
    index.tsx              # entry point
    app.tsx                # root + roteamento
    api/
      client.ts            # graphql-request wrapper
      auth.ts              # login/refresh/persist
      queries.ts           # strings GraphQL
    components/
      Layout.tsx           # frame header/sidebar/footer
      Header.tsx
      Sidebar.tsx
      Footer.tsx
      Toast.tsx
      Modal.tsx
      Spinner.tsx
      Table.tsx            # wrapper sobre ink-table
      Form.tsx             # campo + label + erro
      Confirm.tsx
      StatusBadge.tsx
      ErrorBoundary.tsx
    views/
      Login.tsx
      Users/
        index.tsx
        List.tsx
        CreateForm.tsx
        EditForm.tsx
        ResetPassword.tsx
        Tokens.tsx
      Clientes.tsx
      Veiculos.tsx
      Motoristas.tsx
      Posicoes/
        index.tsx
        Recentes.tsx
        PorVeiculo.tsx
      Logs.tsx
      SyncStatus.tsx
    hooks/
      useAuth.ts
      useApi.ts
      useToast.ts
      useInterval.ts
      useKeypress.ts
    lib/
      keyboard.ts          # atalhos
      format.ts            # datas, números
      validators.ts        # zod schemas da UI
      theme.ts             # cores, espaçamentos
tests/
  tui/
    components/
    views/
    integration/
```

## Backend — adições

### Schema GraphQL

Novos types:

```graphql
type User {
  id: ID!
  email: String!
  role: String!
  active: Boolean!            # NOVO: expõe coluna existente
  createdAt: DateTime!
}

type RefreshToken {
  id: ID!
  userId: ID!
  createdAt: DateTime!
  expiresAt: DateTime!
  revokedAt: DateTime
}

input CreateUserInput {
  email: String!
  password: String!
  role: String!               # 'admin' | 'user'
}

input UpdateUserInput {
  role: String
  active: Boolean
}
```

Novos fields:

```graphql
type Query {
  me: User!                                       # autenticado (qualquer role)
  users: [User!]!                                 # admin
  refreshTokens(userId: ID!): [RefreshToken!]!    # admin
}

type Mutation {
  createUser(input: CreateUserInput!): User!                      # admin
  updateUser(id: ID!, input: UpdateUserInput!): User!             # admin
  resetUserPassword(id: ID!, newPassword: String!): User!         # admin
  revokeRefreshToken(id: ID!): Boolean!                           # admin
}
```

### Implementação

- Novo arquivo: `src/auth/userResolvers.ts` (queries + mutations de user mgmt).
- Novo arquivo: `src/auth/guards.ts` com `requireAuth(ctx)` e `requireAdmin(ctx)`.
- Reuso: `hashPassword` / `verifyPassword` de `src/auth/password.ts`.
- Reuso: `signAccessToken` / `signRefreshToken` apenas para tokens futuros
  (não expostos no user mgmt direto).
- Validação: `src/auth/validators.ts` com zod schemas para `CreateUserInput`,
  `UpdateUserInput`, força de senha (8-128 chars, classes mistas).
- Erros tipados: `UserError` com códigos (`EMAIL_TAKEN`, `USER_NOT_FOUND`,
  `WEAK_PASSWORD`, `FORBIDDEN`, `CANNOT_DEMOTE_SELF`, `CANNOT_DEACTIVATE_SELF`).
- `CANNOT_DEMOTE_SELF` / `CANNOT_DEACTIVATE_SELF`: proteção anti-lockout.
  Se o admin tentar rebaixar/desativar a si mesmo, retorna erro.

### Migrations

**Nenhuma.** As tabelas `users` e `refresh_tokens` já têm todas as colunas
necessárias. O único acréscimo é o campo `active` no type SDL `User` (a coluna
já existe na tabela desde a migration inicial).

### Testes novos (backend)

`tests/auth/userResolvers.test.ts` com no mínimo:

1. `me` retorna o user do JWT
2. `users` lista todos (admin)
3. `users` rejeita não-admin
4. `createUser` sucesso
5. `createUser` rejeita email duplicado (EMAIL_TAKEN)
6. `createUser` rejeita senha fraca
7. `createUser` rejeita não-admin
8. `updateUser` muda role
9. `updateUser` desativa
10. `updateUser` rejeita auto-demote (CANNOT_DEMOTE_SELF)
11. `resetUserPassword` sucesso (hash muda)
12. `revokeRefreshToken` marca revokedAt
13. `refreshTokens` lista por user
14. `refreshTokens` rejeita não-admin
15. `revokeRefreshToken` rejeita não-admin

Meta: **15 testes novos** no backend (47 → 62).

## TUI — design funcional

### Fluxo de autenticação

1. Ao iniciar, `useAuth` checa `auth.json` em `envPaths('api-orquestrador').config`.
2. Se existe e não expirado: pula para o app.
3. Se não existe ou expirado: renderiza `<Login>`.
4. `<Login>` pede email/senha, chama `mutation login`, persiste
   `accessToken`, `refreshToken`, `user` no `auth.json` com `fs.writeFileSync`
   + `chmod 0o600` (Linux/macOS; no Windows o `chmod` é no-op, ACL NTFS
   depende do usuário).
5. Refresh automático: se uma query retorna `UNAUTHENTICATED`, chama
   `mutation refresh` silenciosamente e repete. Se o refresh também falha,
   volta para `<Login>` e apaga `auth.json`.
6. Logout: revoga o refresh token via `mutation revokeRefreshToken`, apaga
   o arquivo, volta para `<Login>`.

### Layout

```
┌────────────────────────────────────────────────────────────┐
│  API ORQUESTRADOR   v0.2.0   user: admin@local.dev  [S]  │  ← header gradient
├──────────┬───────────────────────────────────────────────┤
│ ▸ Usuár. │                                                │
│   Client.│                                                │
│   Veíc.  │              (conteúdo da view)                │
│   Mot.   │                                                │
│   Posic. │                                                │
│   Logs   │                                                │
│   Sync   │                                                │
│   Sair   │                                                │
├──────────┴───────────────────────────────────────────────┤
│  [n]novo  [e]editar  [a]ativar  [r]refresh  [?]ajuda      │  ← footer contextual
└────────────────────────────────────────────────────────────┘
```

- Responsivo: se `stdout.columns < 100`, sidebar colapsa para um menu
  horizontal (setas + Enter).
- Cores: header em gradiente `cyan → magenta`; sidebar ativa `bgGray` +
  `bold`; bordas `round`.
- ASCII art opcional no header (toggle `H`): "API ORQUESTRADOR" via
  `ink-big-text`, esconde para ganhar espaço vertical.

### Atalhos globais

| Tecla | Ação |
|---|---|
| `Ctrl+C` | Quit (com confirmação se houver mudanças) |
| `q` | Quit / volta uma view |
| `1`–`7` | Pula para view da sidebar |
| `Tab` / `Shift+Tab` | Próxima / anterior view |
| `?` | Help overlay (mapa de teclas por view) |
| `Esc` | Fecha modal / volta |
| `H` | Toggle ASCII art no header |

### View 1 — Usuários (prioridade)

**Lista (default):**
- Tabela: `email | role | active | createdAt`
- Auto-refresh: 30s em background, indicador "última sync HH:MM:SS" no header
- Ordenação: tecla `s` cicla (email ↑, email ↓, role, createdAt)
- Linha selecionada: bgGray

Ações (rodapé contextual):
| Tecla | Ação |
|---|---|
| `n` | Novo usuário → `<CreateForm>` |
| `e` | Editar role do selecionado → `<EditForm>` |
| `a` | Toggle active (com `<Confirm>`) |
| `p` | Reset senha do selecionado → `<ResetPassword>` |
| `t` | Ver tokens ativos do selecionado → `<Tokens>` |
| `r` | Refresh manual |
| `↑`/`↓` | Navega linhas |

**`<CreateForm>` (modal):**
- Campos: `email`, `role` (select: admin/user), `password` + `password_confirm`
- Validação inline (zod no client):
  - email: regex básico apenas; duplicidade é detectada via `EMAIL_TAKEN`
    retornado pelo servidor (ver "Decisão pendente" abaixo)
  - role: enum
  - password: 8-128 chars, ≥1 minúscula, ≥1 maiúscula, ≥1 dígito
- Indicador de força: barra `[████████░░] forte`
- Submit: chama `mutation createUser`; em sucesso, toast verde + fecha modal +
  recarrega lista; em erro, exibe `error.message` no topo do form
- Cancel: `Esc`

**`<EditForm>` (modal):**
- Apenas `role` (select). Email não editável.
- Não permite mudar o próprio role para `user` (anti-demote).
- Submit: `mutation updateUser({ role })`.

**Toggle active (`a` na lista):**
- `<Confirm>`: "Desativar foo@bar.com? Ele não conseguirá mais logar."
- Submit: `mutation updateUser({ active: false })`.
- Não permite desativar a si mesmo.

**`<ResetPassword>` (modal):**
- Duas opções (radio):
  1. "Gerar senha aleatória (16 chars, classes mistas)" — default
  2. "Definir manualmente"
- Aviso grande no topo: "Esta senha será exibida APENAS UMA VEZ. Anote agora."
- Submit: `mutation resetUserPassword(id, newPassword)`.
- Pós-sucesso: nova tela de "anote a senha" com botão "Copiei" (Enter copia
  a senha ao clipboard via `clipboardy`) e "Já anotei" (fecha). A tecla
  `Ctrl+C` continua globalmente significando "sair" e é suprimida só enquanto
  esta tela está aberta.

**`<Tokens>` (sub-view, nova linha da lista):**
- Tabela: `createdAt | expiresAt | revokedAt`
- Ação: `x` revoga (com `<Confirm>`)
- Voltar: `q` ou `Esc`

**Decisão pendente — duplicidade de email:**

A spec original propõe checagem de duplicidade no form via debounce. Duas
opções:
- (A) cliente faz `users` e filtra local — rápido mas vaza emails existentes
  para usuários não-admin. **Rejeitado.**
- (B) mutation dedicada `userExists(email): Boolean!` admin-only.
- **(C — escolhida)** Deixar o servidor retornar `EMAIL_TAKEN` no
  `createUser`; cliente trata como erro de validação inline. Mais simples,
  sem nova mutation.

### Views 2-4 — Clientes, Veículos, Motoristas

Layout idêntico (view genérica `<CadastroList>` parametrizada):

| Coluna Clientes | Coluna Veículos | Coluna Motoristas |
|---|---|---|
| `idCliente` | `idVeiculo` | `idMotorista` |
| `cnpj/cpf` | `placa` | `nome` |
| `nome` | `idCliente` | `tipoDocumento` |
| `fetchedAt` | `descricao` | `expiresAt` |
| `expiresAt` | `idEquipamento` | — |
| — | `expiresAt` | — |

- TTL badge: verde (>50% restante), amarelo (10-50%), vermelho (<10% ou expirado)
- Filtro por id: tecla `f` abre input; `Esc` limpa
- Paginação: `quantidade: Int = 1000` (default), `m` para mudar (input)
- Refresh: `r`
- `Enter` na linha abre detalhe (modal com JSON completo, formatado)

### View 5 — Posições

Sub-views com tabs internos:
- `[Tab]` alterna entre `Recentes` e `Por veículo`

**`<Recentes>`:**
- Tabela: `idPacote | idVeiculo | dataPosicao | velocidade | ignicao | lat | lng`
- Input `quantidade` no topo (default 1000)
- Toggle mapa ASCII: tecla `m` (grid 20x60 com pontos `·` e posição atual `╋`)

**`<PorVeiculo>` (form no topo + tabela):**
- Campos: `idVeiculo` (Int), `dataInicio` (DateTime), `dataFim` (DateTime)
- Submit: chama `posicoesPorVeiculo`; tabela aparece embaixo

### View 6 — Logs (obrigatório)

- Tabela: `createdAt | method | source | status | cacheHit | latencyMs | error?`
- Filtros no topo (linha de filtros com `f` para editar):
  - método: select com lista distinta (busca de tipos em runtime é cara;
    oferecer lista fixa dos métodos conhecidos)
  - status: `ok | error | all`
  - período: `1h | 24h | 7d | custom (com dataInicio/dataFim)`
- Streaming: toggle `s` para follow/unfollow; quando on, refetch a cada 2s
- `Enter` na linha: modal de detalhe com `args` (JSON formatado) +
  `error` (se houver)
- `r`: refresh manual
- `x`: limpar filtros

### View 7 — Sync status

- Tabela compacta: `method | idVeiculo | lastIdPacote | lastSyncedAt`
- Refresh `r` a cada 10s
- Útil pra ver se o cron job está vivo

### View "Sair"

- Confirmação: "Sair e revogar token? [S/n]"
- Submit: `mutation revokeRefreshToken` + apaga `auth.json` + volta pra login

## TUI — design visual

### Paleta

| Uso | Cor (chalk/ink) | Hex |
|---|---|---|
| Header gradiente | cyan → magenta | `#06b6d4` → `#d946ef` |
| Sidebar ativa | bold + bgGray | — |
| Status `ok` | green | `#22c55e` |
| Status `error` | red | `#ef4444` |
| Status `cache_hit` | cyan | `#06b6d4` |
| Status `pending` | yellow | `#eab308` |
| Texto dim | gray | `#6b7280` |
| Borda de modal | white | `#ffffff` |

### Componentes compartilhados

- `<Toast position="bottom-right" ttl={3000}>` — success/error/info
- `<Modal centered>` — overlay com box `round`
- `<Spinner type="dots" />` — durante fetch
- `<ErrorBoundary>` — render amigável, log silencioso, botão "voltar"
- `<HelpOverlay>` — `?` mostra atalhos da view atual

### Status bar global (rodapé)

`"23 usuários · última sync 14:32:05 · API ok · token expira em 14:18"`

- Atualiza a cada 5s
- "API ok" / "API erro" reflete health check (`{ health }`)
- "token expira em" countdown do JWT

## Testes da TUI

### Framework

- `ink-testing-library` para snapshot + assertions via `TestRenderer`.
- Sem testes E2E de TUI real (frágil); E2E coberto por testes de backend
  + um teste de integração que renderiza `<App>` com mock do cliente GraphQL.

### Pirâmide

| Camada | Foco | Meta |
|---|---|---|
| Unit (componentes puros) | `<StatusBadge>`, `<Form>`, `<Toast>`, `<Modal>`, `<Confirm>` | ≥80% cobertura |
| Integração (views) | `<UserList>` carrega dados, `<Login>` submete, `<Logs>` filtra | ≥60% |
| Snapshot | header, sidebar, help overlay, modal estático | snapshots estáveis |
| E2E smoke | login → users → create → logout (com Apollo mockado) | 1 teste |

### Testes novos (TUI): ~29 testes

- `components/StatusBadge.test.tsx` (4)
- `components/Toast.test.tsx` (3)
- `components/Modal.test.tsx` (2)
- `components/Confirm.test.tsx` (2)
- `components/Form.test.tsx` (3)
- `components/Layout.test.tsx` (2)
- `views/Login.test.tsx` (3)
- `views/Users/List.test.tsx` (4)
- `views/Users/CreateForm.test.tsx` (3)
- `views/Logs.test.tsx` (2)
- `integration/app.smoke.test.tsx` (1)

## Plano de entrega (resumo)

Esta spec será detalhada em um plano de implementação separado (vai para
`docs/superpowers/plans/`). Ordem prevista:

1. **Backend primeiro** — adicionar schema, resolvers, validators, testes.
   Garante contrato antes de construir UI.
2. **Esqueleto TUI** — entry point, layout, auth, navegação entre views
   vazias.
3. **View Usuários** completa (prioridade) — cobrir todos os fluxos.
4. **View Logs** (segunda prioridade do usuário).
5. **Views Sascar** (Clientes, Veículos, Motoristas, Posições, Sync).
6. **Polimento visual** (gradientes, snapshots, help overlay).
7. **README + CHANGELOG** com `npm run tui`.

Critério de "pronto": `npm run lint && npm run typecheck && npm test && npm run format:check` verdes, TUI rodando contra `docker compose up` com `npm run tui` end-to-end.

## Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Ink quebrar em Windows / WSL | Documentar que suporte primário é Linux/macOS. WSL2 OK. Windows nativo fica como follow-up. |
| Render em terminais antigos (sem truecolor) | Detectar `COLORTERM` / `TERM`; fallback para 256 cores; degradar gradiente para cor sólida. |
| Token salvo em disco comprometido | `chmod 600` no Linux/macOS; documentar warning no README. Refresh tokens têm TTL curto (7d) e podem ser revogados. |
| TUI matar API com muitas queries paralelas | Polling em background com interval mínimo (logs 2s, users 30s). Throttle global em `useApi` se necessário. |
| Backend ainda em v0.1.0 não tem migrations formais | Esta spec não exige nova migration; tudo é via SDL. Doc explicitamente. |
| Esquecer de gatear `users`/`createUser` por admin | Teste explícito "user comum é rejeitado em cada mutation" no backend. |

## Critérios de aceite

1. `npm run tui` abre login, persiste token, navega entre 7 views.
2. Criar, listar, editar role, desativar, resetar senha, ver/revogar tokens
   — tudo funcional via TUI contra a API real.
3. `users` / `createUser` / `updateUser` / `resetUserPassword` /
   `revokeRefreshToken` / `refreshTokens` retornam `FORBIDDEN` para role
   `user`.
4. Logs de auditoria aparecem em tempo real na view Logs.
5. Não-admin não consegue listar users; o `me` continua disponível.
6. TUI não toca o banco diretamente — 100% via GraphQL.
7. `npm run lint && npm run typecheck && npm test && npm run format:check`
   verdes. 87+ testes passando.
8. README atualizado com seção "TUI" e GIF (ou ASCII art) de demo.

## Notas de iteração

Esta spec é a v1 da TUI. Iterações futuras (fora do escopo):

- Auto-update da TUI (`update-notifier`).
- Tema claro/escuro (`t` toggle).
- Export de tabelas (CSV/JSON) — `e` na lista.
- Modo "watch" para uma posição específica de veículo.
- Integração com 1Password / keychain pra evitar `auth.json` em disco.
- i18n (en/pt-BR).
