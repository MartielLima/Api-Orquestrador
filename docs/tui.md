# TUI (Terminal User Interface) — Documentação

**v0.2.0** — TUI Ink-based (`npm run tui`): 7 views navegáveis, gestão de usuários, logs, cadastros, posições, sync.

## Visão geral

A TUI é um cockpit de terminal para operadores que preferem linha de comando a Postman/curl/psql. Ela assume que o operador já tem acesso ao container — **não há tela de login**. A autenticação é resolvida automaticamente em `src/tui/api/bootstrap.ts`.

```bash
# dentro do container ou com a API rodando em http://localhost:4000/graphql
npm run tui
```

## Setup

### Pré-requisitos

- API rodando (Docker Compose ou `npm run dev`).
- Credenciais Sascar válidas na API (`SASCAR_USUARIO`/`SASCAR_SENHA`) **ou** um `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` configurado na API.

### Resolução automática de token (ordem)

`src/tui/api/bootstrap.ts` resolve o token de acesso nesta ordem:

1. **`TUI_API_TOKEN` no env** — uso direto, sem chamadas à API. Para CI/CD ou sessões longas.
2. **Sessão persistida em `env-paths('api-orquestrador').config/session.json`** — carregada e validada. Se o access token estiver perto de expirar, faz `refresh` automático.
3. **Login silencioso** via `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` (mesmas vars usadas pelo seed da API). O token resultante é gravado no env do processo e persistido em `session.json` para execuções futuras.

Se tudo falhar, tela de erro amigável indica o que configurar. `TUI_API_URL` opcional (default `http://localhost:4000/graphql`).

### Variáveis de ambiente

| Var | Default | Descrição |
| --- | --- | --- |
| `TUI_API_URL` | `http://localhost:4000/graphql` | URL do endpoint GraphQL |
| `TUI_API_TOKEN` | (vazio) | Token JWT pronto para uso; pula toda a lógica de login |

## Layout

```
┌──────────────────────────────────────────────────────────┐
│ api-orquestrador · admin@local.dev · [OK]   sync ↑       │  Header: status, conexão
├────────────┬─────────────────────────────────────────────┤
│ 1 Usuários │  id  email             role    active       │
│ 2 Clientes │  ──  ────────────────  ──────  ──────       │
│ 3 Veículos │  1   admin@local.dev   admin   ✓            │  View ativa
│ 4 Motorist.│  2   operator@...      op      ✓            │  (navegação por setas)
│ 5 Posições │  ...                                       │
│ 6 Logs     │                                            │  Hint bar: teclas
│ 7 Sync     │                                            │  (rodapé da view)
├────────────┴─────────────────────────────────────────────┤
│ n novo · e editar · a ativar · p senha · t tokens  ↵  │  Footer: atalhos
└──────────────────────────────────────────────────────────┘
```

- **Header**: status da API, usuário logado, indicador de sync.
- **Sidebar**: lista numerada das 7 views. Selecionar com setas ou número.
- **View ativa**: tabela principal com linhas selecionáveis.
- **Hint bar**: atalhos contextuais da view atual (rodapé da view).
- **Footer**: atalhos globais (rodapé da tela).

## As 7 views

### 1. Usuários (`Users`)

Gestão de usuários (admin-gated na API). Lista com auto-refresh 30s.

**Ações:**
- `n` — criar usuário (form: email, password, role).
- `e` — editar role/active do usuário selecionado.
- `a` — toggle active (com `<Confirm>` para evitar toggle acidental).
- `p` — resetar senha (gera 16 chars ou aceita manual).
- `t` — ver/revogar refresh tokens do usuário.
- `r` — refresh manual.

**Guard `isSelf`:** previne `CANNOT_DEMOTE_SELF` (tentar rebaixar próprio role) e `CANNOT_DEACTIVATE_SELF` (desativar próprio user).

### 2. Clientes (`Clientes`)

Lista de clientes da Sascar (cadastro). Polling 60s.

**Colunas:** `id`, `CNPJ/CPF`, `nome`, `fetched`.

**Ações:**
- `f` — filtrar.
- `r` — refresh.

### 3. Veículos (`Veiculos`)

Lista de veículos da Sascar (cadastro). Polling 60s. **Inclui coluna `status`** com badges ASCII desde a feature `VeiculoStatus`.

**Colunas:** `id`, `placa`, **`status`** (`[B]` bloqueado, `[I]` ignição, `[+]` online, `[ ]` inativo, `—` sem posição), `cliente`, `descrição`, `fetched`.

**Ações:**
- `f` — filtrar.
- `r` — refresh.

### 4. Motoristas (`Motoristas`)

Lista de motoristas da Sascar. Polling 60s.

**Colunas:** `id`, `nome`, `tipo doc`, `fetched`.

**Ações:**
- `f` — filtrar.
- `r` — refresh.

### 5. Posições (`Posicoes`)

Visualização de posições recentes. Tem **2 abas** (Tab para alternar):

**5a. Recentes:** últimas N posições do banco local. Polling 30s.
- Colunas: `pacote`, `veículo`, `data`, `vel`, `dir`, `lat/long`, `odômetro`.
- `m` — abrir mapa (placeholder/futuro).

**5b. Por veículo:** posições filtradas por `idVeiculo` + `dataInicio` + `dataFim` (ISO 8601).
- Cap em 200 linhas.
- Dispara sync sob demanda antes de consultar (`fetchAndUpsertPosicoes`).

### 6. Logs (`Logs`)

Log de auditoria das chamadas Sascar (vindo de `request_log` no DB).

**Colunas:** `id`, `method`, `source`, `status`, `cacheHit`, `latencyMs`, `error`.

**Filtros (cicláveis):**
- `method` — filtra por método Sascar (ex: `obterVeiculos`).
- `status` — `all` / `ok` / `error`.
- `follow ON/OFF` — toggle polling automático.

**Ações:**
- `f` — ciclar filtros.
- `s` — toggle follow.
- `r` — refresh.
- `x` — limpar filtros.

### 7. Sync (`Sync`)

Status do cursor de sync (vindo de `sync_cursor`). Tabela compacta, polling 10s.

**Colunas:** `method`, `idVeiculo`, `lastIdPacote`, `lastSyncedAt`.

**Ações:**
- `r` — refresh.

## Atalhos globais

| Tecla | Ação |
| --- | --- |
| `Ctrl+C` | Sair da TUI |
| `1`–`7` | Ir direto para a view N |
| `↑` / `↓` | Navegar linhas na view ativa |
| `Enter` | Selecionar / abrir detalhe |
| `Esc` | Voltar / fechar modal |
| `Tab` | Próxima aba (em views com abas) |
| `?` | Mostrar help overlay (atalhos da view) |

## Detalhes de implementação

### Stack
- **Ink 5** — renderiza React no terminal.
- **graphql-request** — cliente GraphQL minimal.
- **ink-table** — tabelas formatadas.
- **chalk** — cores no console.
- **ink-text-input**, **ink-select-input** — inputs.

### Estrutura de pastas

```
src/tui/
├── index.tsx               # entry point
├── app.tsx                 # roteador de views + Layout
├── api/
│   ├── auth.ts             # auth helpers
│   ├── bootstrap.ts        # resolve token + URL
│   ├── client.ts           # graphql-request wrapper
│   └── queries.ts          # Q_VEICULOS, Q_POSICOES, etc.
├── components/             # Header, Sidebar, Footer, Modal, Toast, ...
├── hooks/                  # useApi, useInterval, useKeypress, useToast
├── lib/                    # format, theme, validators, passwordGen
└── views/                  # 7 views (Users, Clientes, Veiculos, Motoristas, Posicoes, Logs, Sync)
```

### Specs e planos

- **Spec de design:** `docs/superpowers/specs/2026-06-15-tui-orquestrador-design.md`
- **Plano de implementação:** `docs/superpowers/plans/2026-06-15-tui-orquestrador.md`

## Limitações conhecidas

- **Sem detalhe de linha (modal):** as colunas são fixas; modal de detalhe com JSON formatado ainda não implementado. Ver `docs/api.md` para referência de tipos.
- **Sem auth visível:** a TUI assume que o operador tem acesso ao container. Não há tela de login ou logout (o token persiste em `session.json`).
- **Mapa (placeholder):** o atalho `m` em Posições → Recentes é placeholder; não renderiza mapa.
- **Tabela única por view:** uma view = uma tabela. Sem agregações ou gráficos.
