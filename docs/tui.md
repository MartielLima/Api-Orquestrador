# TUI (Terminal User Interface) — Documentação

**v0.2.0** — TUI Ink-based (`npm run tui`): 7 views navegáveis, gestão de usuários, logs, cadastros, posições, sync.

## Visão geral

A TUI é um cockpit de terminal para operadores que preferem linha de comando a Postman/curl/psql. Ela assume que o operador já tem acesso ao container — **não há tela de login**. A autenticação é resolvida automaticamente em `src/tui/api/bootstrap.ts`.

```bash
# dentro do container ou com a API rodando em http://localhost:4000/graphql
npm run tui
```

## Setup

### Como rodar

Há duas formas, equivalentes em funcionalidade. Use a do host no dia-a-dia (mais rápido); use a do container quando estiver conectado direto nele.

**A. Pelo host (com a API rodando em `http://localhost:4000/graphql`)**

```bash
npm run tui
```

O script faz `npm run build:tui && node dist-tui/index.js`. A primeira vez demora alguns segundos (build); nas seguintes é instantâneo. Funciona mesmo com a API rodando via `docker compose up -d app`.

**B. Dentro do container** (assume que a imagem `api-orquestrador:0.1.0` já tem o build da TUI — ver [Build e deploy](#build-e-deploy))

```bash
docker exec -it api-orquestrador-app node dist-tui/index.js
```

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
| `SEED_ADMIN_EMAIL` | (vazio) | Email do admin (mesma var da API) — usado no login silencioso (passo 3 da resolução automática) |
| `SEED_ADMIN_PASSWORD` | (vazio) | Senha do admin (mesma var da API) — usado no login silencioso |

A TUI **carrega `.env` automaticamente** do diretório atual (cwd) na inicialização, via `import 'dotenv/config'` em `src/tui/api/bootstrap.ts`. Variáveis já presentes no `process.env` têm precedência (dotenv não sobrescreve). Isso permite que o mesmo `.env` usado pelo `docker-compose` seja aproveitado pela TUI no host, sem `export` manual. `.env` é gitignored — nada vaza.

**Exemplo de uso a partir do host** (assumindo API rodando via `docker compose up -d app` e `.env` com `SEED_ADMIN_*` definidos):

```bash
# Zero-config: lê TUI_API_URL/SEED_ADMIN_*/TUI_API_TOKEN do .env automaticamente
npm run tui

# Sobrescreve pontualmente sem editar o .env
TUI_API_URL=http://api.exemplo.com/graphql npm run tui

# Token fixo (CI/CD) — vai pelo passo 1 da resolução automática
TUI_API_TOKEN=eyJhbGc... npm run tui
```

A primeira execução persiste o token em `env-paths('api-orquestrador').config/session.json`; execuções seguintes reutilizam até `refresh` automático perto da expiração.

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
- **`Box`/`Text` do próprio Ink** — `Table` próprio em `src/tui/components/Table.tsx` (substitui `ink-table`, incompatível com a cadeia ESM da TUI; ver [Build e deploy](#build-e-deploy)).
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
├── components/             # Header, Sidebar, Footer, Modal, Toast, Table (próprio), ...
├── hooks/                  # useApi, useInterval, useKeypress, useToast
├── lib/                    # format, theme, validators, passwordGen
└── views/                  # 7 views (Users, Clientes, Veiculos, Motoristas, Posicoes, Logs, Sync)
```

### Specs e planos

- **Spec de design:** `docs/superpowers/specs/2026-06-15-tui-orquestrador-design.md`
- **Plano de implementação:** `docs/superpowers/plans/2026-06-15-tui-orquestrador.md`

## Build e deploy

A TUI é compilada como um pacote **ESM standalone** em `dist-tui/`, separado do resto do projeto (que continua CJS). Esse isolamento é necessário por duas razões:

1. **`yoga-layout`** (transitiva de `ink`) é ESM e usa **top-level await** (`const Yoga = wrapAssembly(await loadYoga())` em `node_modules/yoga-layout/dist/src/index.js:13`). Em projeto CJS, o register do `tsx` intercepta o `.js` e tenta transformar via esbuild em modo CJS — operação que esbuild recusa (`Top-level await is currently not supported with the "cjs" output format`).
2. **`ink-table@3.1.0`** é CJS e faz `require("ink")` na sua inicialização. Em Node 22+ isso dispara `ERR_REQUIRE_ASYNC_MODULE` porque `ink` é ESM com top-level await. É a última versão publicada (não tem variante ESM), então foi substituído por `Table` próprio.

### Pipeline

| Etapa | Comando | O que faz |
| --- | --- | --- |
| Build | `npm run build:tui` | Roda `tsc` com `tsconfig.tui.json` (`module: ESNext`, `outDir: dist-tui`, `rootDir: src/tui`), depois pós-processa cada `.js` para adicionar `.js` em imports relativos (ESM exige extensão), e cria `dist-tui/package.json` com `{"type":"module"}` (marcador ESM). |
| Run (host) | `npm run tui` | `build:tui` + `node dist-tui/index.js`. |
| Run (container) | `docker exec -it api-orquestrador-app node dist-tui/index.js` | A imagem runtime já tem `dist-tui/` copiado do stage builder. |

### Arquivos relevantes

| Arquivo | Função |
| --- | --- |
| `tsconfig.tui.json` | ESM tsconfig para a TUI. |
| `scripts/build-tui.cjs` | Pipeline de build (tsc + patch de imports + marcador ESM). |
| `dist-tui/` (gitignored) | Output do build. |
| `src/tui/components/Table.tsx` | Tabela própria (substitui `ink-table`). |
| `Dockerfile` | Builda `dist-tui/` antes do `npm prune --omit=dev` e copia para o stage runtime. |

### Rebuild da imagem

```bash
docker compose build app          # rebuild após mexer em src/tui/
docker compose up -d              # recria o container para usar a nova imagem
```

## Limitações conhecidas

- **Sem detalhe de linha (modal):** as colunas são fixas; modal de detalhe com JSON formatado ainda não implementado. Ver `docs/api.md` para referência de tipos.
- **Sem auth visível:** a TUI assume que o operador tem acesso ao container. Não há tela de login ou logout (o token persiste em `session.json`).
- **Mapa (placeholder):** o atalho `m` em Posições → Recentes é placeholder; não renderiza mapa.
- **Tabela única por view:** uma view = uma tabela. Sem agregações ou gráficos.
- **Tabela visual mais simples:** o `Table` próprio (substituindo `ink-table`) renderiza colunas em texto plano com separador de `─`. Sem bordas ASCII art, sem alinhamento configurável por coluna. Suficiente para leitura em terminal padrão; se precisar de visual mais polido, considere PR com versão usando `ink-table` ESM (ou outra lib) quando aparecer.
