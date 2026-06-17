# Pin do sascar-sdk em v1.1.1 — Design

**Data:** 2026-06-17
**Status:** Aguardando revisão
**Escopo:** Patch mínimo — pin de versão, sem novas funcionalidades

## Resumo executivo

O `sascar-sdk` publicado em 2026-06-17 teve mudanças importantes (v1.0.0 → v1.1.1):

- **v1.1.0**: novo módulo `SascarXmlRpcClient` (34 comandos do manual XML-RPC v3.5 — bloqueio, desbloqueio, atuadores, mensagens, layouts embarcados, AVD).
- **v1.1.1**: bugfixes críticos no XML-RPC (URL do endpoint, roteamento, `placa: string` em vez de `idVeiculo: number`, ticket auto-gerado, `ticketServidor: string`).

Hoje o `package.json` deste projeto pina `"sascar-sdk": "github:MartielLima/sascar-sdk"`, o que
faz o `npm install` resolver sempre para o `HEAD` da branch `main` — builds não são
reproduzíveis e o que roda em CI pode divergir do que roda local. Este design fixa o SDK
na tag `v1.1.1`, captura o estado auditado do upstream, e deixa pronto o terreno para
integrações futuras (XML-RPC, mais métodos SOAP) sem acoplar a este pin.

## Objetivos e não-objetivos

### Objetivos

1. **Reprodutibilidade do build** — qualquer `npm install` (CI, Docker, dev local) resolve
   para o mesmo commit do SDK.
2. **Capturar as mudanças já publicadas** — módulo XML-RPC + bugfixes que foram auditados
   em produção contra `xmlrpc.sascar.com.br`.
3. **Sem novas funcionalidades** — não adicionar `SascarXmlRpcClient` ao orquestrador, não
   expor novas queries/mutations, não mexer na TUI.

### Não-objetivos

1. Integração do `SascarXmlRpcClient` (comandos de escrita) — spec futura.
2. Expor mais dos 74 métodos SOAP disponíveis no SDK — fora deste escopo.
3. Tela de comandos na TUI — fora deste escopo.
4. Adotar `SascarXmlRpcError` / mapear erros XML-RPC — não usado ainda.

## Análise de impacto

### Compatibilidade com o consumidor atual

A v1.1.0 e a v1.1.1 são puramente **aditivas para a superfície SOAP**: nenhum método
existente foi renomeado, removido, ou teve assinatura alterada. As mudanças afetam só o
novo módulo XML-RPC (que ainda não importamos).

Pontos de contato atuais com o SDK neste projeto:

| Arquivo | Símbolos usados | Impacto do pin |
| --- | --- | --- |
| `src/orchestrator/SascarOrchestrator.ts:1` | `SascarClient`, `AsyncQueue` | Nenhum — inalterados |
| `src/orchestrator/errors.ts:2-8` | `SascarApiError`, `SascarAuthError`, `SascarConnectionError`, `SascarRateLimitError`, `SascarTimeoutError` | Nenhum — 5 classes exportadas inalteradas |
| `Dockerfile` (clone + build) | nenhum import | Mudar URL de clone para `https://github.com/MartielLima/sascar-sdk.git#v1.1.1` |
| `src/scripts/postinstall.js` | nenhum import | Sem mudança de comportamento — já trata `dist/` ausente |

### Risco residual

- O `postinstall` do projeto (`src/scripts/postinstall.js`) detecta `dist/` ausente e roda
  `npm run build` no `sascar-sdk`. Como a v1.1.1 já traz `dist/` no tarball GitHub, o
  postinstall vira no-op nessa versão. Sem risco.
- O Dockerfile multi-stage (clona + builda) precisa atualizar a URL de clone para fixar
  o tag, senão a imagem Docker continua resolvendo `main`.

## Abordagem

### 1. Pin no `package.json`

```diff
-    "sascar-sdk": "github:MartielLima/sascar-sdk",
+    "sascar-sdk": "github:MartielLima/sascar-sdk#v1.1.1",
```

Sintaxe `#v1.1.1` é a forma canônica npm 7+ para fixar a referência de uma dep GitHub
por tag. O pacote `package-lock.json` é regenerado pelo `npm install` e fica ancorado
no commit exato da tag (imutável).

### 2. Pin no `Dockerfile`

```diff
-    git clone --depth 1 https://github.com/MartielLima/sascar-sdk.git /tmp/sascar-sdk && \
+    git clone --depth 1 --branch v1.1.1 https://github.com/MartielLima/sascar-sdk.git /tmp/sascar-sdk && \
     cd /tmp/sascar-sdk && npm ci && npm run build && \
```

`--branch v1.1.1` faz o `git clone` resolver direto para o commit da tag. Mantém a
imagem Docker reprodutível mesmo que o `main` evolua.

### 3. Limpar e reinstalar

```bash
rm -rf node_modules/sascar-sdk
rm -f  package-lock.json   # força resolução fresca
npm install
```

Justificativa para apagar o lock: a entrada atual no `package-lock.json` referencia
`main` (resolvido por integridade do git). Apagar e regenerar garante que o lock
contenha o SHA exato da tag `v1.1.1`.

### 4. Verificar versão instalada

```bash
cat node_modules/sascar-sdk/package.json | grep '"version"'
# esperado: "version": "1.1.1"
```

### 5. Validações obrigatórias

- `npm run typecheck` — sem mudanças breaking no SOAP, deve passar limpo.
- `npm run lint` — sem mudanças de estilo, deve passar.
- `npm run build` — `tsc` deve compilar `dist/` sem erros.
- `npm test -- tests/unit` — suítes que não tocam DB:
  - `tests/unit/config.spec.ts`
  - `tests/unit/jwt.spec.ts`
  - `tests/unit/logger.spec.ts`
  - `tests/unit/password.spec.ts`
  - `tests/unit/SascarOrchestrator.spec.ts`
  - `tests/unit/orchestrator-errors.spec.ts`
  - `tests/auth/errors.spec.ts`
  - `tests/auth/validators.spec.ts`
- `node_modules/sascar-sdk/dist/index.d.ts` deve exportar `SascarXmlRpcClient` (smoke
  check de que pegamos a v1.1.x, não a v1.0.0).

Suítes que **não rodam sem docker compose up postgres** (estado pré-existente, não
relacionado a este pin): `tests/integration/*`, `tests/auth/userResolvers.spec.ts`,
`tests/auth/authPlugin.spec.ts`, `tests/auth/guards.spec.ts`. Não verificar
localmente; cobertura será validada em CI / docker.

### 6. Documentação

- `CHANGELOG.md`: nova entrada sob "Unreleased" ou como patch `0.2.1`:
  - "Pinned sascar-sdk to v1.1.1 (module XML-RPC + bugfixes)"
- `README.md`:
  - "Notas operacionais" → substituir "instalado do GitHub" por "pinned em
    [v1.1.1](https://github.com/MartielLima/sascar-sdk/releases/tag/v1.1.1)"
  - "Arquitetura (Docker)" → mencionar que a imagem builder clona `--branch v1.1.1`
- `docs/api.md`: nenhuma mudança (nenhum método GraphQL exposto muda).

## Plano de execução

Tarefa unitária, mas listada em ordem por clareza:

1. Editar `package.json` (linha 52) — adicionar `#v1.1.1`.
2. Editar `Dockerfile` — adicionar `--branch v1.1.1` no `git clone`.
3. `rm -rf node_modules/sascar-sdk package-lock.json`.
4. `npm install` — gera novo lock com SHA da tag.
5. `cat node_modules/sascar-sdk/package.json | grep version` — confirmar `1.1.1`.
6. `npm run typecheck` — deve sair 0.
7. `npm run lint` — deve sair 0.
8. `npm run build` — deve sair 0.
9. `npx jest tests/unit tests/auth/errors.spec.ts tests/auth/validators.spec.ts` — deve sair 0.
10. Editar `CHANGELOG.md` — entrada nova.
11. Editar `README.md` — atualizar "Notas operacionais" e "Docker".
12. `git add package.json package-lock.json Dockerfile CHANGELOG.md README.md`.
13. `git commit -m "build: pin sascar-sdk to v1.1.1"` (sem `Co-Authored-By`).

## Critérios de aceitação

- [ ] `node_modules/sascar-sdk/package.json` reporta `"version": "1.1.1"`.
- [ ] `grep '"sascar-sdk"' package.json` mostra `github:MartielLima/sascar-sdk#v1.1.1`.
- [ ] `grep 'sascar-sdk.git' Dockerfile` mostra `--branch v1.1.1`.
- [ ] `npm run typecheck` exit 0.
- [ ] `npm run lint` exit 0.
- [ ] `npm run build` exit 0.
- [ ] Jest (suítes listadas) exit 0.
- [ ] `node_modules/sascar-sdk/dist/index.d.ts` contém `export.*SascarXmlRpcClient`.
- [ ] `CHANGELOG.md` e `README.md` atualizados.
- [ ] `git status` limpo após commit.

## Riscos e mitigações

| Risco | Probabilidade | Mitigação |
| --- | --- | --- |
| Tag `v1.1.1` é apagada/deletada no GitHub | muito baixa | GitHub protege tags de release; documentar o SHA como fallback em comentário do commit |
| Novo XML-RPC tem side-effect no nosso `mapSascarError` | nenhuma | Não importamos `SascarXmlRpcError`; erros XML-RPC ainda não passam por aqui |
| Lock file vira gigante | baixa | Esperado (lock com SHA do commit); manter `package-lock.json` versionado como hoje |
| `postinstall` falha em CI | baixa | Já é idempotente; v1.1.1 tem `dist/` no tarball, então nem dispara build |

## Arquivos alterados

- `package.json` (1 linha)
- `package-lock.json` (regenerado)
- `Dockerfile` (1 linha)
- `CHANGELOG.md` (entrada nova)
- `README.md` (parágrafo "Notas operacionais" + linha do Docker)

Nenhuma mudança em `src/`, `tests/`, `dist/`, `docs/api.md`.

## Fora de escopo (próximas specs, se desejado)

1. **Integração XML-RPC completa** — adicionar `SascarXmlRpcClient` ao
   `SascarOrchestrator` (segunda instância paralela, fila separada), env vars
   `SASCAR_XMLRPC_ENVIAR_COMANDO_URL` + `SASCAR_XMLRPC_OPERACAO_URL`, mutations
   GraphQL `bloquearVeiculo` / `desbloquearVeiculo` / `enviarMensagem` /
   `alternarAtuador` com `aguardarComando` polling, mapeamento de
   `SascarXmlRpcError`, TUI tab "Comandos", testes, docs.
2. **Expor mais métodos SOAP** — adicionar queries GraphQL para os 68 métodos
   SOAP hoje não expostos (rotas, pontos de referência, eventos telemetria,
   etc.), seguindo o padrão de `src/domain/*` + `cachedQuery`.
