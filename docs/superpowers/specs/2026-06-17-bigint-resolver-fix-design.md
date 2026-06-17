# BigInt resolver passthrough fix — design

**Data:** 2026-06-17
**Escopo:** bugfix — fecha o item #7 (remanescente do PR #1, `build/sascar-sdk-pin-v1.1.1`).
**Relacionado:** commit `ada026f` (parcial — trocou schema, esqueceu dos resolvers).

## Contexto

O schema GraphQL declara `Posicao.idPacote: BigInt!` e `SyncCursor.lastIdPacote: BigInt`. O scalar `BigInt` (em `src/graphql/resolvers.ts:102-111`) serializa `string | number | bigint` para string no JSON de saída.

Mas os resolvers e o domain layer que produzem esses campos **ainda coercem para `Number`** antes de devolver. Como o `pg` driver retorna `int8` (BIGINT) como `string` por padrão, o fluxo atual é:

```
pg (string) → Number()  ← precisão perdida se valor > 2^53
   → BigInt scalar (formata como string)
   → JSON (string, mas já truncado)
```

Valores típicos da conta (~9.3B) cabem em `Number` (< 2^53 ≈ 9.007e15), então o bug é **latente** — não afeta dados atuais, mas quebra o invariante declarado no schema e vai falhar em qualquer conta com volume maior.

**Por que o fix anterior (`ada026f`) foi incompleto:** trocou o SDL mas não tocou nos 4 pontos de coerção. Não há teste cobrindo valores > 2^53, então o CI passou.

## Decisão de escopo (com o usuário)

**Propagar `string` apenas na saída GraphQL (resolvers + interface).** Manter a entrada do SDK como `Number()`.

Justificativa: o parâmetro `idInicio` que vai pro SDK já usa `Number.MAX_SAFE_INTEGER` como teto (em `src/domain/posicoes.ts:67`), então valores > 2^53 nunca chegam **para dentro** do nosso banco. O risco é só na **saída** (relermos o que gravamos). End-to-end exigiria cast `as any` no SDK e mentiria o type system — YAGNI.

## Mudanças

### 1. `src/domain/posicoes.ts`

- `interface Posicao.idPacote: number` → `idPacote: string` (linha 7).
- `mapPosicoes()` (linha 108): `Number(r.id_pacote)` → `String(r.id_pacote)`.
- `fetchAndUpsertPosicoes()`:
  - Linha 64 (cursor → `idInicio`): manter `Number()` aqui — o input do SDK é number, valor cabe em 2^53, é só para o request SOAP.
  - Linha 95 (max dos ids retornados): trocar `Math.max(...posicoes.map(Number))` por `posicoes.map((p) => BigInt(p.idPacote)).reduce((a, b) => (a > b ? a : b), 0n)`. Converter pra `String()` antes de gravar no `sync_cursor` (que é BIGINT). `0n` quando vazio (não grava nesse caso — o `if (posicoes.length)` já cobre).

### 2. `src/graphql/resolvers.ts`

- Linha 40 (`posicoesPorVeiculo`): `Number(r.id_pacote)` → `String(r.id_pacote)`.
- Linha 61 (`syncStatus`): `r.last_id_pacote ? Number(r.last_id_pacote) : null` → `r.last_id_pacote ? String(r.last_id_pacote) : null`.

### 3. Teste novo — `tests/integration/posicoes-bigint.spec.ts`

Cenário:
- Inserir `id_pacote = 9322440283` (> 2^31, ainda < 2^53) em `posicoes`.
- Query GraphQL `{ posicoesPorVeiculo(idVeiculo, dataInicio, dataFim) { idPacote } }` deve retornar `"9322440283"` como string, não número.
- Query `{ syncStatus { lastIdPacote } }` deve retornar string quando o cursor existe.

Cenário adicional (long, mas garante que o invariante é preservado):
- Inserir `id_pacote = "10000000000000000"` (10^16, > 2^53) **diretamente via SQL** (o SDK não gera, mas se chegar via import/manual, o sistema não pode quebrar).
- Query deve retornar a string **idêntica** ao que está no banco.

### 4. CHANGELOG

Adicionar entrada em `[Unreleased]` → `### Fixed`:
> `fix(bigint)`: Resolvers de `posicoesPorVeiculo`, `syncStatus` e `mapPosicoes` agora propagam `id_pacote`/`last_id_pacote` como `string` direto do `pg` (em vez de `Number()`), preservando precisão > 2^53. O schema já declarava `BigInt!` desde `ada026f`; este commit fecha o invariante no lado do resolver.

## Fora de escopo

- Refatorar `cachedQuery` em `posicoes.ts` (issue #6) — outro dia.
- Paralelizar `getPosicoesRecentes` (issue #5) — outro dia.
- Tocar no SDK para aceitar `string` em `idInicio` — fora do nosso repo.
- `id_veiculo` em `posicoes` e `sync_cursor` continua `INTEGER` — cabe em 2^31 pra todas as contas Sascar conhecidas.

## Riscos

- **Baixo.** Mudança é pass-through: o `pg` já retorna string, só removemos a coerção. O `BigInt` scalar continua serializando string. O BigInt scalar do Apollo já trata `string` como caso normal.
- **Compat:** nenhum consumidor hoje depende de `idPacote` ser Number no JSON (a documentação e o scalar já dizem string). Se houver cliente JS que faz `Number(json.idPacote)`, vai quebrar — mas `Number("9322440283")` funciona até 2^53, então na prática não quebra.
- **Tests:** o teste novo usa o mesmo pattern de `posicoes-query.spec.ts` (`buildTestServer` + `executeOperation`).

## Verificação

- `npm run typecheck` deve passar (string é compatível com `BigInt!` no schema, e o GraphQL aceita).
- `npm test` deve passar: 79 testes existentes + 1 novo suite (2-3 testes) = 81-82.
- Smoke: `docker compose up -d --build && curl -X POST http://localhost:4000/ -H 'Content-Type: application/json' -d '{"query":"{ syncStatus { lastIdPacote } }"}'` deve retornar `lastIdPacote` como string em JSON.
