import gql from 'graphql-tag';

export const typeDefs = gql`
  scalar DateTime
  scalar BigInt

  type User {
    id: ID!
    email: String!
    role: String!
    active: Boolean!
    createdAt: DateTime!
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  type RefreshToken {
    id: ID!
    userId: ID!
    createdAt: DateTime!
    expiresAt: DateTime!
    revokedAt: DateTime
  }

  type Cliente {
    idCliente: Int!
    cnpj: String
    cpf: String
    nome: String!
    fetchedAt: DateTime!
    expiresAt: DateTime!
  }

  type Veiculo {
    idVeiculo: Int!
    placa: String!
    idCliente: Int
    descricao: String
    idEquipamento: BigInt
    fetchedAt: DateTime!
    expiresAt: DateTime!
  }

  type Motorista {
    idMotorista: Int!
    nome: String!
    tipoDocumento: String
    fetchedAt: DateTime!
    expiresAt: DateTime!
  }

  type Posicao {
    idPacote: BigInt!
    idVeiculo: Int!
    dataPosicao: DateTime!
    dataPacote: DateTime!
    latitude: Float!
    longitude: Float!
    velocidade: Float!
    ignicao: Int
    direcao: Int
    odometro: Float
    syncedVia: String!
  }

  type SyncCursor {
    method: String!
    idVeiculo: Int!
    lastIdPacote: BigInt
    lastSyncedAt: DateTime!
  }

  type RequestLogEntry {
    id: ID!
    method: String!
    source: String!
    status: String!
    cacheHit: Boolean!
    latencyMs: Int
    createdAt: DateTime!
    error: String
  }

  type CaixaPretaEvento {
    id: ID! @deprecated(reason: "Caixa-preta desativada na Sascar v2.07. Use posicoesRecentes.")
    idVeiculo: Int
    placa: String
    dataEvento: DateTime
    latitude: Float
    longitude: Float
    velocidade: Float
  }

  input CreateUserInput {
    email: String!
    password: String!
    role: String!
  }

  input UpdateUserInput {
    role: String
    active: Boolean
  }

  type Query {
    health: String!
    me: User!
    users: [User!]!
    clientes(idCliente: Int, quantidade: Int = 1000): [Cliente!]!
    veiculos(idVeiculo: Int, quantidade: Int = 1000): [Veiculo!]!
    motoristas(idMotorista: Int, quantidade: Int = 1000): [Motorista!]!
    posicoesRecentes(quantidade: Int = 1000): [Posicao!]!
    posicoesPorVeiculo(idVeiculo: Int!, dataInicio: DateTime!, dataFim: DateTime!): [Posicao!]!
    syncStatus: [SyncCursor!]!
    requestLog(limit: Int = 100, method: String): [RequestLogEntry!]!
    refreshTokens(userId: ID!): [RefreshToken!]!
    caixaPretaEventos(placa: String, idVeiculo: Int): [CaixaPretaEvento!]!
      @deprecated(reason: "Método 4.51 da Sascar desativado. Use posicoesRecentes.")
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    refresh(refreshToken: String!): AuthPayload!
    createUser(input: CreateUserInput!): User!
    updateUser(id: ID!, input: UpdateUserInput!): User!
    resetUserPassword(id: ID!, newPassword: String!): User!
    revokeRefreshToken(id: ID!): Boolean!
  }
`;
