# Api-Orquestrador Sascar — Documentação da API

## Autenticação

Todas as queries/mutations (exceto `health`) requerem header:
`Authorization: Bearer <accessToken>`

Tokens são obtidos via `mutation login` ou `mutation refresh`.

## Queries

### Cadastros (cache TTL 24h)
- `clientes(idCliente: Int, quantidade: Int = 1000): [Cliente!]!`
- `veiculos(idVeiculo: Int, quantidade: Int = 1000): [Veiculo!]!`
- `motoristas(idMotorista: Int, quantidade: Int = 1000): [Motorista!]!`

### Posições
- `posicoesRecentes(quantidade: Int = 1000): [Posicao!]!`
- `posicoesPorVeiculo(idVeiculo: Int!, dataInicio: DateTime!, dataFim: DateTime!): [Posicao!]!`

### Auditoria / status
- `requestLog(limit: Int = 100, method: String): [RequestLogEntry!]!`
- `syncStatus: [SyncCursor!]!`

## Mutations

- `login(email: String!, password: String!): AuthPayload!`
- `refresh(refreshToken: String!): AuthPayload!`

## Métodos descontinuados (SasIntegra v2.07)

| Query/Mutation GraphQL | Método SDK                       | Status Sascar                              | Substituir por                                  |
|------------------------|----------------------------------|--------------------------------------------|-------------------------------------------------|
| `caixaPretaEventos`    | `recuperarEventosCaixaPreta`     | Parcial — `solicitar` (4.51) está desativado | `posicoesRecentes`                            |
| `caixaPretaEventos`    | `solicitarEventosCaixaPreta`     | DESATIVADO, sem previsão                   | sem substituto — não usar                       |
| —                      | `obterDeltaTelemetriaIntegracao` | Descontinuado                              | `obterDeltaTelemetriaIntegracaoInercia`         |
| `clientes`             | `obterClientes`                  | Compatibilidade LGPD                       | `clientesV2` (CNPJ alfanumérico)               |

A diretiva `@deprecated` está aplicada nos campos SDL correspondentes
para que ferramentas (Apollo Studio, GraphiQL) exibam o aviso automaticamente.
