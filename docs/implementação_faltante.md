# Prompt: Implementar 2 novas queries GraphQL no API-Orquestrador

> **Para colar em outro terminal com `minimax` (ou similar) rodando.**
> O objetivo é adicionar 2 queries GraphQL no projeto `Api-Orquestrador`
> (https://github.com/MartielLima/Api-Orquestrador) que espelham 2 métodos
> do Sascar SOAP SasIntegra v2.07. A Torck Telemetria (projeto irmão)
> consumirá essas queries via job cron para substituir o worker SOAP
> próprio que hoje gera eventos de inércia e fadiga do motorista.

---

## CONTEXTO

**Projeto:** API-Orquestrador (https://github.com/MartielLima/Api-Orquestrador)
- GraphQL server (provavelmente Apollo Server ou GraphQL Yoga)
- Auth: JWT (mutations `Login` + `Refresh` já implementadas — espelhar)
- Padrão de queries existente: `veiculos(quantidade: Int)`, `motoristas(quantidade: Int)`, `posicoesRecentes(quantidade: Int)` — camelCase PT-BR, retornam arrays

**Sascar SOAP de origem (SasIntegra v2.07):**
WSDL: `https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService?wsdl`
PDF: `https://connectedfleet.michelin.com/hubfs/WebService_SasIntegra_v2.07_Portugues.pdf`

Os 2 métodos Sascar a espelhar são:

### 1. `obterDeltaTelemetriaIntegracaoInercia` (inércia)
Retorna eventos de inércia (freadas/acelerações bruscas) para uma data de chegada.

**Request Sascar (parâmetros — consultar WSDL para tipos exatos):**
```xml
<obterDeltaTelemetriaIntegracaoInercia>
  <usuario>...</usuario>
  <senha>...</senha>
  <quantidade>100</quantidade>
</obterDeltaTelemetriaIntegracaoInercia>
```

**Response Sascar (cada item contém):**
```xml
<PacoteIntegracaoDeltaTelemetriaInercia>
  <idVeiculo>12345</idVeiculo>
  <dataHora>2026-06-22T14:30:00</dataHora>
  <quantidadeFreadasBruscas>2</quantidadeFreadasBruscas>
  <quantidadeAceleracoesBruscas>1</quantidadeAceleracoesBruscas>
  <quantidadeCurvasBruscas>3</quantidadeCurvasBruscas>
</PacoteIntegracaoDeltaTelemetriaInercia>
```

### 2. `obterEventosTempoDirecao` (fadiga do motorista)
Retorna eventos de jornada do motorista (jornada excedida, tempo de direção, intervalo).

**Request Sascar:**
```xml
<obterEventosTempoDirecao>
  <usuario>...</usuario>
  <senha>...</senha>
  <quantidade>100</quantidade>
</obterEventosTempoDirecao>
```

**Response Sascar (cada item contém):**
```xml
<EventoTempoDirecao>
  <idVeiculo>12345</idVeiculo>
  <motorista>
    <cpf>12345678900</cpf>
    <nome>João Silva</nome>
  </motorista>
  <dataHora>2026-06-22T18:00:00</dataHora>
  <tipoEvento>JORNADA_EXCEDIDA</tipoEvento>     <!-- ou TEMPO_DIRECAO_EXCEDIDO / INTERVALO_NAO_CUMPRIDO -->
  <minutosExcedidos>45</minutosExcedidos>
</EventoTempoDirecao>
```

> **Se os nomes exatos dos campos Sascar forem diferentes** (verificar via
> WSDL ou PDF), ajuste a query Sascar para usar os nomes corretos.
> **Não inventar campos** — apenas espelhar.

---

## OBJETIVO

Adicionar 2 queries GraphQL no API-Orquestrador que:
1. Fazem a chamada SOAP correspondente ao Sascar (autenticando com usuário/senha — provavelmente já existe um helper `chamarSascar(usuario, senha, metodo, params)`)
2. Mapeiam a resposta para tipos GraphQL
3. Retornam via GraphQL na convenção camelCase PT-BR

---

## SCHEMA GRAPHQL ALVO (proposto — ajustar para match com codebase)

```graphql
type Query {
  # ... existentes ...

  """Eventos de inércia (freadas, acelerações, curvas bruscas)"""
  eventosInercia(
    """Quantidade máxima de eventos a retornar (default 100)"""
    quantidade: Int
    """Cursor opaco para paginação (opcional, YAGNI por enquanto)"""
    cursor: String
  ): [EventoInercia!]!

  """Eventos de fadiga do motorista (jornada excedida, tempo de direção)"""
  eventosFadiga(
    """Quantidade máxima de eventos a retornar (default 100)"""
    quantidade: Int
    """Cursor opaco para paginação (opcional, YAGNI por enquanto)"""
    cursor: String
  ): [EventoFadiga!]!
}

type EventoInercia {
  idVeiculo: Int!
  dataHora: DateTime!
  freadasBruscas: Int!
  aceleracoesBruscas: Int!
  curvasBruscas: Int!
}

type EventoFadiga {
  idVeiculo: Int!
  dataHora: DateTime!
  tipo: TipoEventoFadiga!
  minutosExcedidos: Int!
  motorista: MotoristaEventoFadiga
}

type MotoristaEventoFadiga {
  cpf: String!
  nome: String!
}

enum TipoEventoFadiga {
  JORNADA_EXCEDIDA
  TEMPO_DIRECAO_EXCEDIDO
  INTERVALO_NAO_CUMPRIDO
}
```

---

## IMPLEMENTAÇÃO

### Estrutura esperada (ajustar para match com codebase real)

```
src/
  graphql/
    schema/
      eventos.graphql         # ← schema SDL das 2 queries
    resolvers/
      eventos.ts              # ← resolvers chamando Sascar
    types/
      inercia.ts              # ← type EventoInercia
      fadiga.ts               # ← type EventoFadiga
  services/
    sascar/
      inercia.ts              # ← wrapper SOAP para obterDeltaTelemetriaIntegracaoInercia
      fadiga.ts               # ← wrapper SOAP para obterEventosTempoDirecao
  ...
```

### Requisitos

1. **Schema-first ou code-first:** seguir o padrão já em uso no projeto
2. **Auth:** as queries devem exigir autenticação JWT (mesmo middleware das outras queries — provavelmente `@authenticated` ou via context)
3. **Mapeamento SOAP → GraphQL:** converter resposta XML do Sascar para o tipo GraphQL correspondente. **Não copiar campos desnecessários** (YAGNI).
4. **Validação:** se Sascar retornar erro (fault), propagar como `GraphQLError` com mensagem legível
5. **Quantidade default:** 100 (igual às outras queries)
6. **Paginação cursor:** YAGNI por enquanto — `cursor` param existe no schema mas pode retornar `null`. Adicionar paginação real só se Sascar retornar >1000 eventos com frequência
7. **Logs:** `console.log` ou logger padrão do projeto em cada chamada Sascar (url, método, duração, contagem retornada)
8. **Erros:** se auth Sascar falhar, tentar refresh token (se houver) antes de propagar 401

### Testes (mínimos)

Para cada nova query:
- ✅ **Mock da chamada Sascar** retorna 1 evento válido → query GraphQL retorna 1 item
- ✅ **Mock retorna array vazio** → query retorna `[]`
- ✅ **Mock lança erro de SOAP fault** → query propaga erro GraphQL
- ✅ **Quantidade default** quando param omitido = 100
- ✅ **Quantidade custom** = valor passado
- ✅ **Auth:** query sem JWT retorna erro de autenticação (mesmo padrão das outras queries)

Usar o mesmo framework de teste já em uso no projeto (Jest, Vitest, etc.).

---

## ACEITAÇÃO

A Torck Telimetria vai consumir essas queries com GraphQL assim (exemplo de uso futuro):

```graphql
query EventosInerciaSync($q: Int) {
  eventosInercia(quantidade: $q) {
    idVeiculo
    dataHora
    freadasBruscas
    aceleracoesBruscas
    curvasBruscas
  }
}
```

```graphql
query EventosFadigaSync($q: Int) {
  eventosFadiga(quantidade: $q) {
    idVeiculo
    dataHora
    tipo
    minutosExcedidos
    motorista {
      cpf
      nome
    }
  }
}
```

**Critérios de aceitação:**
- [ ] As 2 queries funcionam no schema GraphQL (verificar com introspection query ou GraphQL Playground)
- [ ] Autenticação JWT obrigatória (mesmo padrão das outras queries)
- [ ] Resposta mapeada exatamente para os tipos propostos
- [ ] Testes passando (mínimo 5 testes por query conforme acima)
- [ ] Sem regressão nas queries existentes
- [ ] Código segue o padrão do projeto (linter, formatter)

---

## COMO RODAR

```bash
# Clone o projeto (se ainda não tiver)
git clone https://github.com/MartielLima/Api-Orquestrador
cd Api-Orquestrador

# Implementar as 2 queries conforme schema acima

# Rodar testes
npm test  # ou pnpm test, bun test — usar o que o projeto usa

# Verificar via Playground/Studio que as queries aparecem
npm run dev  # ou equivalente
# Acessar http://localhost:4000/graphql e testar:
#   query { eventosInercia(quantidade: 10) { idVeiculo } }
#   query { eventosFadiga(quantidade: 10) { idVeiculo tipo } }

# Commit + push
git add .
git commit -m "feat(graphql): expor eventosInercia e eventosFadiga (espelho de obterDeltaTelemetriaIntegracaoInercia e obterEventosTempoDirecao do Sascar SOAP)"
git push
```

---

## NOTAS IMPORTANTES

1. **NÃO inventar campos** — se o Sascar não retornar um campo, não criar no GraphQL. Consultar WSDL/PDF para confirmar.
2. **NÃO expor credenciais Sascar** — usuário/senha do Sascar ficam em env vars (mesmo padrão das outras queries).
3. **NÃO fazer cache** por enquanto — o consumidor (Torck) controla idempotência via timestamps.
4. **YAGNI:** paginação cursor, filtros complexos, batch loading — adicionar depois se precisar.
5. **Espelhar estilo** das outras queries (error handling, logging, naming).

---

## REFERÊNCIA RÁPIDA

| Torck consome | API-Orquestrador expõe | Sascar SOAP original |
|---|---|---|
| `eventosInercia(quantidade)` | `eventosInercia(quantidade)` | `obterDeltaTelemetriaIntegracaoInercia` |
| `eventosFadiga(quantidade)` | `eventosFadiga(quantidade)` | `obterEventosTempoDirecao` |

Quando terminar, me avise e a Torck Telimetria vai implementar:
- `backend/src/sync/jobs/syncInercia.ts` (cron 1h)
- `backend/src/sync/jobs/syncFadiga.ts` (cron 1h)
- Dual-mode de validação (worker + sync rodando em paralelo)
- Cutover gradual e remoção do worker Sascar SOAP