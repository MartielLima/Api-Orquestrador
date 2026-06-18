# posicao_eventos (Telemetria Histórica 1:N) — design

**Data:** 2026-06-18
**Escopo:** feature — adiciona tabela `posicao_eventos` (1:N com `posicoes`) que persiste snapshot dos sinais CAN principais (ignição, bloqueio, RPM, tensão, velocidade, jamming, combustível) por posição + 1 row por transição detectada vs posição anterior. Garante "log de tempo sempre disponível" (auditoria) e habilita queries históricas ("quando o veículo X foi bloqueado pela última vez?").

**Relacionado:** follow-up explícito de `docs/superpowers/specs/2026-06-18-veiculos-status-design.md` §"Follow-up — Telemetria histórica estruturada". O `VeiculoStatus` atual expõe apenas o **último** valor; este spec adiciona o histórico.

## Contexto

A Sascar envia, por posição, 62 campos no SOAP `obterPacotePosicoesJSON`. Probe real (vehicle `idVeiculo=1832881`, posição de 2026-06-17) confirmou os campos disponíveis:

```
velocidade, ignicao, odometro, horimetro, tensao, saida1-8, entrada1-8,
satelite, gps, bloqueio, jamming, rpm, temperatura1-3, saida5-8, entrada5-8,
pontoEntrada, pontoSaida, codigoMacro, nomeMensagem, conteudoMensagem,
textoMensagem, statusAncora, idPacote, integradoraId, idMotorista,
nomeMotorista, nivelCombustivel, litrometro, estadoLimpadorParabrisa,
umidadeSerial, temperaturaSerial, odometroExato
```

A coluna `posicoes.raw` (JSONB) já guarda tudo isso desde o scaffold inicial. O que falta é **persistência estruturada + histórica** dos sinais que o usuário pediu:
- "Blackbox" (caixa preta) — **DESATIVADO** pela Sascar; sinais que viriam via `CaixaPretaList` (`freio, limpador, buzzer, embreagem`) NÃO estão disponíveis
- "Consumo de Combustivel" — disponível via `nivelCombustivel` + `litrometro`
- "Rede CAN" — Sascar não expõe CAN bus raw; só os **sinais já decodificados** pelo equipamento
- "RPM" — disponível
- "Força G" — **NÃO DISPONÍVEL** no SOAP da Sascar (provavelmente só em telemetria custom proprietária do equipamento)

O `VeiculoStatus` (`docs/superpowers/specs/2026-06-18-veiculos-status-design.md` §1) já expõe o **último** valor desses sinais via `posicoes.raw` (campos derivados). Falta o **histórico** + **log de tempo garantido** (auditoria).

## Decisão de escopo (com o usuário)

**Criar tabela `posicao_eventos` (1:N com `posicoes`) que persiste, por posição:**
1. **Snapshot** dos 8 sinais importantes (ignicao, bloqueio, rpm, tensao, velocidade, jamming, combustivel_nivel, combustivel_litrometro) — sempre, 8 rows por posição.
2. **Transição** (ignicao, bloqueio, jamming) — 1 row adicional quando o valor mudou vs posição anterior do mesmo veículo. `from_value` e `to_value` no `metadata` JSONB.

Sinais **excluídos** (permanecem só em `posicoes.raw` JSONB, sem evento explícito):
- `saida1-8`, `entrada1-8` — sempre `0` no probe (hardware não instalado)
- `temperatura1-3` — sempre `-125` (sensor desconectado, valor sentinela)
- `eventoSequenciamento`, `eventos` — sempre vazios
- Mensagens (`nomeMensagem`, `conteudoMensagem`, `textoMensagem`) — cobertas pelo `VeiculoStatus.alarme.ultimaMensagem`

**Volume estimado** (assumindo 100 veículos × 144 posições/dia = 14.400 pos/dia):
- Snapshots: 14.400 × 8 = **115.200 rows/dia**
- Transições: ~14.400 × 0.1 (10% mudam) = **1.440 rows/dia**
- **Total: ~117k rows/dia, ~42M/ano** — aceitável para PostgreSQL com index `(id_veiculo, data_posicao DESC)`

## Mudanças

### 1. `src/db/migrations/0006_posicao_eventos.sql` (novo)

```sql
-- posicao_eventos: telemetria histórica 1:N com posicoes
-- Captura snapshot (8 sinais/pos) + transição (ignicao/bloqueio/jamming) por posição.
-- Volume estimado: ~117k rows/dia para 100 veículos (cron 10min).

CREATE TABLE posicao_eventos (
  id BIGSERIAL PRIMARY KEY,
  id_veiculo INT NOT NULL,
  id_pacote BIGINT NOT NULL,
  data_posicao TIMESTAMPTZ NOT NULL,             -- "log de tempo" do Sascar
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- "log de tempo" do nosso lado
  event_type TEXT NOT NULL CHECK (event_type IN ('snapshot', 'transition')),
  signal TEXT NOT NULL,                          -- 'ignicao' | 'bloqueio' | 'rpm' | etc.
  value_numeric NUMERIC,
  value_text TEXT,
  value_bool BOOLEAN,
  metadata JSONB,                                -- contexto: from_value/to_value (transition), lat/long/placa
  UNIQUE (id_veiculo, id_pacote, event_type, signal)  -- dedup de re-runs do cron
);

CREATE INDEX idx_posicao_eventos_veiculo_data
  ON posicao_eventos (id_veiculo, data_posicao DESC);

CREATE INDEX idx_posicao_eventos_signal_data
  ON posicao_eventos (signal, data_posicao DESC);
```

### 2. `src/db/schema.ts` (modificado)

Adicionar tabela `posicao_eventos` na definição Drizzle (se usado) ou em runtime schema. Como o projeto usa SQL raw via `pg.Pool`, **não há mudança obrigatória** — só adicionar um comentário no header do arquivo apontando para a migration 0006.

### 3. `src/domain/posicoes.ts` (modificado)

Adicionar função pura `extractEventsFromPosicao(posicao, previousPosicao?)` que retorna o array de `PosicaoEventoInsert` a serem inseridos:

```typescript
export interface PosicaoEventoInsert {
  idVeiculo: number;
  idPacote: string;  // BIGINT do Sascar; armazenado como string
  dataPosicao: Date;
  eventType: 'snapshot' | 'transition';
  signal: string;
  valueNumeric?: number;
  valueText?: string;
  valueBool?: boolean;
  metadata?: Record<string, unknown>;
}

const SNAPSHOT_SIGNALS = [
  { name: 'ignicao', column: 'ignicao', type: 'bool' },
  { name: 'bloqueio', column: 'bloqueio', type: 'bool' },
  { name: 'rpm', column: 'rpm', type: 'numeric' },
  { name: 'tensao', column: 'tensao', type: 'numeric' },
  { name: 'velocidade', column: 'velocidade', type: 'numeric' },
  { name: 'jamming', column: 'jamming', type: 'bool' },
  { name: 'combustivel_nivel', column: 'nivel_combustivel', type: 'text' },
  { name: 'combustivel_litrometro', column: 'litrometro', type: 'text' },
] as const;

const TRANSITION_SIGNALS = ['ignicao', 'bloqueio', 'jamming'] as const;

export function extractEventsFromPosicao(
  pos: { idVeiculo: number; idPacote: string; dataPosicao: Date; ignicao: number | null; bloqueio: number | null; rpm: number | null; tensao: number | null; velocidade: number | null; jamming: number | null; nivelCombustivel: string | null; litrometro: string | null },
  previous?: { ignicao: number | null; bloqueio: number | null; jamming: number | null },
): PosicaoEventoInsert[] {
  const events: PosicaoEventoInsert[] = [];
  const base = { idVeiculo: pos.idVeiculo, idPacote: pos.idPacote, dataPosicao: pos.dataPosicao };

  for (const sig of SNAPSHOT_SIGNALS) {
    const rawValue = (pos as any)[sig.column];
    if (rawValue === null || rawValue === undefined) continue;
    const event: PosicaoEventoInsert = { ...base, eventType: 'snapshot', signal: sig.name };
    if (sig.type === 'numeric') event.valueNumeric = Number(rawValue);
    else if (sig.type === 'text') event.valueText = String(rawValue);
    else if (sig.type === 'bool') event.valueBool = toBool(rawValue);
    events.push(event);
  }

  if (previous) {
    for (const sig of TRANSITION_SIGNALS) {
      const cur = pos[sig as keyof typeof pos] as number | null;
      const prev = previous[sig] as number | null;
      if (cur === prev || cur === null || cur === undefined) continue;
      events.push({
        ...base,
        eventType: 'transition',
        signal: sig,
        valueBool: toBool(cur),
        metadata: { from_value: prev, to_value: cur },
      });
    }
  }
  return events;
}
```

Modificar `fetchAndUpsertPosicoes` para:
1. Buscar a posição anterior do mesmo veículo (`SELECT * FROM posicoes WHERE id_veiculo = $1 ORDER BY data_posicao DESC LIMIT 1`).
2. Após `INSERT INTO posicoes`, calcular `events = extractEventsFromPosicao(pos, previous)`.
3. Fazer `INSERT INTO posicao_eventos` em batch (mesma transação).

### 4. Tests

**`tests/integration/posicao-eventos.spec.ts`** (novo):
- Snapshot: 1 posição insere 8 rows (1 por sinal).
- Transition: 2 posições com ignicao mudando de 0 → 1 geram 1 row adicional de transition.
- Sem previous: apenas snapshots, sem transition.
- Volume: 100 posições × 8 sinais = 800 rows.
- Unique constraint: 2 runs com mesma (id_veiculo, id_pacote) geram 1 row (sem dup).

**`tests/unit/extractEventsFromPosicao.spec.ts`** (novo):
- Cada signal com valor null/undefined é pulado.
- Boolean toBool: 1/0/'1'/'0'/true/false.
- Text toStr: número virá como string (Sascar envia `nivelCombustivel: "100"`).
- Transition com previous igual: não gera row.
- Transition com previous null: não gera row (sem baseline).
- Transition de ignicao 0 → 1: row com `metadata.from_value=0, to_value=1`.
- Transition de ignicao 1 → 0: row com `metadata.from_value=1, to_value=0`.

### 5. `CHANGELOG.md` (modificado)

Em `[Unreleased]` → `### Added`:
> **feat(domain)**: New `posicao_eventos` table (migration 0006) — telemetria histórica 1:N com `posicoes`. Persiste snapshot (8 sinais: ignicao, bloqueio, rpm, tensao, velocidade, jamming, combustivel_nivel, combustivel_litrometro) + 1 row por transição (ignicao/bloqueio/jamming) vs posição anterior. Indexado por `(id_veiculo, data_posicao DESC)`. Volume estimado: ~117k rows/dia para 100 veículos. **Nota:** blackbox (caixa preta) e força G não estão disponíveis no Sascar SOAP — fora de escopo deste spec.

### 6. `README.md` (modificado)

Em "API GraphQL" → tabela de types, adicionar `PosicaoEvento` (se exposto via GraphQL) ou nota "consulta direta via SQL, não exposto via GraphQL nesta v1".

## Tests

Cobertura:
- 6+ unit tests para `extractEventsFromPosicao` (cada signal + edge cases).
- 4+ integration tests para `posicao_eventos` (insert, transition, dedup, volume).

Total esperado: +10 tests. Suite geral: ~62/182.

## Fora de escopo

- **Força G** — não exposta pela Sascar. Follow-up: investigar telemetria custom via XML-RPC ou negociar com Sascar.
- **Blackbox (caixa preta)** — método `solicitarEventosCaixaPreta` desativado. Sinais `freio, limpador, buzzer, embreagem` (que viriam via `CaixaPretaList`) ficam fora. Follow-up: ver se `posicoes.evento` ou `posicoes.eventoSequenciamento` trarão isso no futuro.
- **GraphQL query `posicaoEventos(...)`** — não exposto nesta v1. Pode ser adicionado depois (queryable direto via SQL por enquanto).
- **Particionamento da tabela** — volume ~42M rows/ano cabe em uma tabela só com index. Particionar por mês se passar de ~100M rows.
- **Compressão / retenção** — sem TTL. Pode ser adicionado depois (e.g., manter 90 dias online, arquivar o resto).

## Riscos

- **Volume alto:** ~117k rows/dia × 365 = ~42M/ano. PostgreSQL aguenta bem com index apropriado. Mitigação: monitorar tamanho, particionar se necessário.
- **Inserts em batch** durante o cron `syncPositions` (que itera por N veículos a cada 10min). Para 100 veículos, 800 events/insert. Total: ~80k inserts/10min = ~13k inserts/min. PostgreSQL aguenta 10k+ inserts/s, então OK.
- **Unique constraint** em `(id_veiculo, id_pacote, event_type, signal)` previne duplicação em re-runs. Se o cron rodar 2x (e.g., retry), a 2ª execução é no-op para os mesmos pacotes.
- **Performance de queries históricas:** index `(id_veiculo, data_posicao DESC)` cobre 90% dos casos ("quando o veículo X foi bloqueado pela última vez?"). Para queries mais exóticas, índice secundário `(signal, data_posicao DESC)` cobre.
- **Backfill de dados existentes:** os `posicoes` já no banco não geram retroativamente `posicao_eventos`. Migration é forward-only. Para backfill: script separado opcional (não incluso).

## Verificação

- `npm run typecheck` → exit 0.
- `npm run lint` → exit 0.
- Migration `npm run db:migrate` aplica sem erro.
- `npm test` (sem env var) → 62 suites / 182 tests passando (+10 novos). Sem regressão.
- `npm run benchmark:sascar` (gate on) → blackbox falha como esperado; history passa. Smoke `posicao-eventos` (após implementar) verifica pipeline end-to-end.

## Follow-up

- Expor `posicao_eventos` via GraphQL (queryable com filtros: idVeiculo, signal, range de data_posicao).
- Adicionar telemetria custom (Força G) se Sascar oferecer via canal dedicado.
- Considerar particionamento por mês se volume > 100M rows.
- Compressão / retenção: manter 90 dias online, arquivar 1-2 anos.
