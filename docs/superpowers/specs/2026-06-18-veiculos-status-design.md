# VeiculoStatus — design

**Data:** 2026-06-18
**Escopo:** feature — adiciona estado vivo (`bloqueio`, `ignição`, `localização`, `GPS`, `jamming`, `combustível`, `sensores`, `alarme`) ao `Veiculo` a partir do último pacote de posição registrado em `posicoes`.
**Relacionado:** depende de `posicoes` estar populado pelo job `syncPositions` (cron `*/10 * * * *`). Sem dependência de chamadas Sascar no path da query `Query.veiculos`.

## Contexto

A query `Query.veiculos` retorna o cadastro cacheado via `obterVeiculos` SDK com `placa`, `descricao`, `idEquipamento`, `fetchedAt`/`expiresAt`. A TTL efetiva em `src/domain/veiculos.ts` é `60_000` ms (60s) — `docs/api.md` e `README.md` declaram 24h (que é o default de `CACHE_CADASTRO_TTL_MS`), mas o valor hardcoded no `cachedQuery` está divergente. Inconsistência pré-existente, fora do escopo desta spec.

Operadores do TUI e clientes da API usam essa lista para localização rápida de veículo, mas precisam cruzar com `posicoesRecentes` ou `posicoesPorVeiculo` para saber se o veículo está bloqueado, com ignição ligada, em jamming, ou offline — 2 round-trips e nenhum join no cliente.

Além disso, a TUI Ink (`src/tui/views/Veiculos.tsx`) é uma tabela que exibe só dados estáticos. Para saber o estado de 50+ veículos o operador precisa abrir a view `Posições` → tab "por veículo" e digitar o `idVeiculo` de cada um. Não escala.

A Sascar expõe esses dados em cada pacote de posição (`posicoes.raw` + colunas), e já estamos persistindo tudo isso no banco local a cada execução do cron. O `raw` JSONB tem ~25 campos úteis (bloqueio, ignição, gps, jamming, nível de combustível, litrômetros, tensões, temperaturas, status âncora, ponto de entrada/saída, mensagens). Só não estávamos expondo.

## Decisão de escopo (com o usuário)

**Derivar `Veiculo.status` a partir do último `posicoes` por veículo, com 1 query SQL batched, e expor como sub-type GraphQL + coluna na TUI.**

Justificativas (vs. alternativas exploradas):
- **Não criar tabela `veiculo_status` materializada.** YAGNI: cron já popula `posicoes` a cada 10min, dado já está no banco. Adicionar tabela + trigger de upsert dobra superfície de manutenção sem benefício observável para 50–500 veículos. Trade-off aceitável: 1 query extra por chamada de `veiculos` (com `id_veiculo = ANY($1)` e `DISTINCT ON`, é O(N log N) num índice).
- **Não fazer chamada Sascar extra no path do resolver.** A query `veiculos` fica cacheada por 60s em `veiculos_cache`; passar a chamar `obterPacotePosicaoPorRangeJSON` por veículo adicionaria latência e pressão de rate-limit. O cron já cuida da freshness.
- **Não usar GraphQL subscriptions.** A TUI faz polling 60s; subscriptions adicionariam complexidade (WebSocket gateway, lifecycle de canais) sem ganho concreto para o caso de uso atual (operador olhando a lista).
- **Expor todos os sub-types com `null` onde o `raw` estiver ausente.** Combustível é o único sub-type nullable — depende de hardware do rastreador. Sensores, alarme, localização são sempre populados (colunas obrigatórias; campos individuais do `raw` que faltam ficam `null` dentro do type).

## Mudanças

### 1. `src/domain/veiculosStatus.ts` (novo)

Camada de domínio pura, sem dependência do `cachedQuery` nem de GraphQL.

- **Types** exportados:
  - `Localizacao { latitude, longitude, velocidade, direcao }`
  - `Combustivel { nivel, litrometro }` (ambos `string | null` — Sascar envia como string em alguns modelos)
  - `Sensores { tensao, rpm, temperatura1, temperatura2, temperatura3 }` (todos `number | null`)
  - `AlarmeUltimaMensagem { nome, conteudo, texto }` (todos `string | null`)
  - `Alarme { statusAncora, pontoEntrada, pontoSaida, ultimaMensagem }`
  - `VeiculoStatus { bloqueado, ignicaoLigada, online, localizacao, gps, jamming, combustivel, sensores, alarme, atualizadoEm, idadeSegundos }`
- **`mapPosicaoRowToVeiculoStatus(row, now = new Date())`**: função pura. Recebe uma row de `posicoes` (com colunas relacionais + `raw` JSONB parsed), devolve `VeiculoStatus`. Usa helpers internos `toBool` (`1 | '1' | true → true`), `toIntOrNull`, `toStrOrNull` para normalizar o que vem do `pg`/JSONB.
- **`getStatusByVeiculos(ctx, ids, now = new Date())`**: recebe lista de `id_veiculo`, executa **1 query** com `SELECT DISTINCT ON (id_veiculo) ... FROM posicoes WHERE id_veiculo = ANY($1) ORDER BY id_veiculo, data_posicao DESC`, devolve `Map<number, VeiculoStatus>`. Veículos sem posição não entram no Map (caller trata como `null`).
- **Heurística `online`:** `data_posicao > now - 10min` (`ONLINE_WINDOW_MS = 10 * 60 * 1000`). Bate com a periodicidade do `syncPositions` (cron a cada 10min). Se o cron estiver desligado, o `online` rapidamente vira `false` — é uma heurística, não verdade absoluta.
- **`combustivel = null` quando ambos `nivelCombustivel` e `litrometro` estão ausentes** (rastreador sem sensor). Se pelo menos um existir, o sub-object é retornado com o campo ausente como `null` (consumidor decide se quer mostrar).
- **`alarme.ultimaMensagem = null` quando os 3 campos de mensagem (`nomeMensagem`, `conteudoMensagem`, `textoMensagem`) são vazios/nulos.** Caso contrário, retorna o sub-object.

### 2. `src/domain/veiculos.ts` (modificado)

- **`interface Veiculo`** ganhou `status: VeiculoStatus | null`.
- **`getVeiculos()`** agora faz 2 chamadas em série:
  1. `cachedQuery('veiculos_cache', ...)` (inalterado, retorna com `status: null`).
  2. Se `veiculos.length > 0`: `getStatusByVeiculos(ctx, ids)` e mapeia o Map sobre a lista, preenchendo `status`.
- **Não muda a TTL do cache de `veiculos_cache` (60s) nem o `method` (`obterVeiculos`).** A freshness do `status` é independente — vem do cron `syncPositions`.

### 3. `src/graphql/schema.ts` (modificado)

- **`Veiculo.status: VeiculoStatus`** adicionado (nullable, type novo).
- **5 sub-types novos** em ordem de declaração: `VeiculoStatusLocalizacao`, `VeiculoStatusCombustivel`, `VeiculoStatusSensores`, `VeiculoStatusAlarmeUltimaMensagem`, `VeiculoStatusAlarme`, `VeiculoStatus`.
- **Decisões de nullability** no schema:
  - `Veiculo.status: VeiculoStatus` (nullable — veículo sem posição)
  - `VeiculoStatus.combustivel: VeiculoStatusCombustivel` (nullable — rastreador sem sensor)
  - `VeiculoStatus.alarme.ultimaMensagem: VeiculoStatusAlarmeUltimaMensagem` (nullable — sem mensagem)
  - Todos os outros campos em `VeiculoStatus*` são `!` (sempre populados na prática; nullability é uma decisão de type, não de dado).

### 4. `src/tui/views/veiculosStatusCell.ts` (novo)

- **`renderStatusCell(row)`**: recebe a row do GraphQL, retorna string curta com badges ASCII representando `bloqueado` (`B`), `ignicaoLigada` (`I`), `online` (`+`).
- **Combinações** (na ordem da string): `[B]` bloqueado · `[I]` ignição · `[+]` online · `[BI+]` todos · `[ ]` nenhum ativo (status vivo com tudo false) · `—` sem status (veículo nunca teve posição).
- Mantém a cell com 4 chars no máximo (`[B]+` é o pior caso), encaixa na coluna da TUI sem ajuste de layout.

### 5. `src/tui/views/Veiculos.tsx` (modificado)

- Nova coluna `status` entre `placa` e `cliente`, renderizada via `renderStatusCell`.

### 6. `src/tui/api/queries.ts` (modificado)

- `Q_VEICULOS` pede `status { bloqueado, ignicaoLigada, online }` (apenas as 3 flags que a cell usa — TUI não precisa do resto).

### 7. `docs/api.md` (modificado)

- Seção de `Veiculo` agora lista `status: VeiculoStatus` na lista de campos.
- Subseção nova `VeiculoStatus` com a tabela de campos + nota sobre o mecanismo (1 query batched, sem N+1, sem chamada Sascar extra).
- Nota de implementação explicando `DISTINCT ON` + `ANY($1)`.

### 8. `README.md` (modificado)

- Linha de `veiculos` na tabela da seção "API GraphQL" ganhou menção a "status vivo (último pacote posicoes)".
- Linha de types: `Veiculo` lista `status: VeiculoStatus (null se sem posição)`; nova linha para `VeiculoStatus`.

### 9. `CHANGELOG.md` (modificado)

- Entrada em `[Unreleased]` → `### Added`: feature completa (resumo do sub-type, heurística 10min, mecanismo 1-query, badges TUI).
- Entrada em `[Unreleased]` → `### Notes`: contagem de testes atualizada (51/172, +37 do VeiculoStatus).

## Testes

| Suite | Tipo | Casos | Cobre |
| --- | --- | --- | --- |
| `tests/unit/veiculosStatus.spec.ts` | unit | 20 | `mapPosicaoRowToVeiculoStatus` puro: cada campo de `raw` mapeado, online boundary (10min exato, dentro/fora), null/ausente para sub-types opcionais, `atualizadoEm`/`idadeSegundos` derivados de `data_posicao` |
| `tests/integration/veiculosStatus.spec.ts` (`getStatusByVeiculos`) | integration | 6 | lista vazia, 1 veículo, N veículos em 1 query (`DISTINCT ON`), veículo sem posição omitido do Map, pacote mais recente escolhido quando há múltiplos, mapeamento de JSONB `raw` |
| `tests/integration/veiculosStatus.spec.ts` (`Query.veiculos { status }`) | integration | 2 | veículo com posição traz `status` populado; veículo sem posição em `posicoes` retorna `status: null` sem quebrar a query |
| `tests/unit/veiculosStatusCell.spec.ts` | unit | 9 | `renderStatusCell`: null/undefined → `—`, cada flag sozinha, combinações, todas false → `[ ]` |

**Total: 37 novos casos. Suite geral: 51/172 (era 45/129).**

## Fora de escopo

- Persistir `veiculo_status` em tabela própria (decidido não fazer — YAGNI).
- Subscription GraphQL para push de mudança de status (TUI já faz polling 60s).
- Adicionar `status` a outras queries (`posicoesRecentes`, `posicoesPorVeiculo`) — não faz sentido, o `status` é derivado da própria `posicoes`.
- Histórico de transições (entrou em jamming às 14:32, saiu às 14:35) — fora de escopo, requer modelagem de eventos.
- Alertas / webhooks quando `bloqueado` muda — feature separada, quando aparecer demanda.
- Refactor do `cachedQuery` (Known Issue #6) — capturado em `docs/api.md`, sem relação.

## Riscos

- **Latência da query batched.** O `DISTINCT ON` usa índice `(id_veiculo, data_posicao DESC)` se existir; sem índice, faz sort de todas as rows de `posicoes`. Em contas com 1M+ de posições, isso fica perceptível. Mitigação: o índice já existe implicitamente via `UNIQUE (id_veiculo, id_pacote)` na criação da tabela? **Não.** Precisamos criar um índice composto `(id_veiculo, data_posicao DESC)`. **(Atenção para o follow-up abaixo.)**
- **`online = false` quando o cron está desligado.** Heurística 10min. Operador pode interpretar como "veículo offline" quando na verdade é "sync desligado". Documentado na API reference; trade-off aceito (alternativa seria Sascar em cada request, que não escala).
- **Schema versionado.** Mudança é aditiva (campo novo, sub-types novos, todos nullable ou com default seguro). Sem breaking change para clientes que não pedem `status`.
- **Sub-types granulares podem ser overkill para o caso de uso atual.** Operador raramente quer `temperatura1` na lista. Trade-off: TUI só lê 3 flags (`bloqueado`, `ignicaoLigada`, `online`); o resto fica disponível via API para clientes futuros sem custo de payload (Apollo só serializa o que foi pedido).

## Verificação

- `npm run typecheck` → exit 0.
- `npm test -- --testPathIgnorePatterns="tui"` → 3 novas suites (1 unit + 1 integration + 1 unit) passando; 37 novos casos totalizando 28 novos passando no subset de backend.
- `npm test` (suite completa, incluindo TUI Ink) → esperado: 51 suites / 172 tests (alvo reportado em `CHANGELOG` → `[Unreleased]` → `### Notes`).
- `npm run lint` → exit 0.
- Smoke test contra o container rodando:
  ```bash
  TOKEN=$(curl -sS -X POST http://localhost:4000/ \
    -H 'Content-Type: application/json' \
    -d '{"query":"mutation { login(email:\"admin@local.dev\", password:\"admin1234\") { accessToken } }"}' \
    | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

  curl -sS -X POST http://localhost:4000/ \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"query":"{ veiculos(quantidade: 10) { idVeiculo placa status { bloqueado ignicaoLigada online idadeSegundos } } }"}' | head -c 1000
  ```
  Esperado: JSON com `veiculos` array; cada item com `placa` e `status` (object ou `null`).

## Follow-up (não-bloqueante, capturado para próxima sessão)

- **Índice composto `(id_veiculo, data_posicao DESC)`** em `posicoes` para a query `DISTINCT ON` escalar. Criar migration `0006_posicoes_id_veiculo_data_posicao_idx.sql`. Não incluído nesta spec para manter o escopo focado na feature.
- **Telemetria histórica estruturada** (`posicao_eventos` ou `posicao_telemetria`): blackbox (caixa preta), consumo de combustível, rede CAN, RPM, força G, e qualquer outro campo de telemetria que o Sascar devolva no `posicoes.raw`. O `VeiculoStatus` atual expõe **apenas o último** valor de cada campo — não histórico. Investigar primeiro quais campos realmente chegam no `raw` via `SELECT DISTINCT jsonb_object_keys(raw) FROM posicoes` num banco com dados reais. O método `solicitarEventosCaixaPreta` está `@deprecated` e desativado pela Sascar; pode ser que a "caixa preta" relevante venha embutida no `raw` de cada posição. Decidir formato (colunas tipadas vs. JSONB indexado) só após o levantamento.
- **Time log sempre disponível** (audit trail de eventos de telemetria): garantir que cada pacote persistido tenha `created_at`/`received_at` (já temos via `synced_via` + `data_pacote` + `data_posicao`, mas pode valer formalizar com `INSERT ... RETURNING *` e um log estruturado por job de captura).
