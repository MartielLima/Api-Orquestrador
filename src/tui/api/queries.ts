import { gql } from 'graphql-request';

export const Q_ME = gql`
  query Me {
    me {
      id
      email
      role
      active
      createdAt
    }
  }
`;

export const Q_USERS = gql`
  query Users {
    users {
      id
      email
      role
      active
      createdAt
    }
  }
`;

export const Q_REFRESH_TOKENS = gql`
  query RefreshTokens($userId: ID!) {
    refreshTokens(userId: $userId) {
      id
      userId
      createdAt
      expiresAt
      revokedAt
    }
  }
`;

export const M_LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken
      refreshToken
      user {
        id
        email
        role
        active
        createdAt
      }
    }
  }
`;

export const M_REFRESH = gql`
  mutation Refresh($refreshToken: String!) {
    refresh(refreshToken: $refreshToken) {
      accessToken
      refreshToken
      user {
        id
        email
        role
        active
        createdAt
      }
    }
  }
`;

export const M_CREATE_USER = gql`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      email
      role
      active
      createdAt
    }
  }
`;

export const M_UPDATE_USER = gql`
  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) {
      id
      email
      role
      active
      createdAt
    }
  }
`;

export const M_RESET_PASSWORD = gql`
  mutation ResetUserPassword($id: ID!, $newPassword: String!) {
    resetUserPassword(id: $id, newPassword: $newPassword) {
      id
    }
  }
`;

export const M_REVOKE_TOKEN = gql`
  mutation RevokeRefreshToken($id: ID!) {
    revokeRefreshToken(id: $id)
  }
`;

export const Q_HEALTH = gql`
  query Health {
    health
  }
`;

export const Q_REQUEST_LOG = gql`
  query RequestLog($limit: Int, $method: String) {
    requestLog(limit: $limit, method: $method) {
      id
      method
      source
      status
      cacheHit
      latencyMs
      createdAt
      error
    }
  }
`;

export const Q_SYNC_STATUS = gql`
  query SyncStatus {
    syncStatus {
      method
      idVeiculo
      lastIdPacote
      lastSyncedAt
    }
  }
`;

export const Q_CLIENTES = gql`
  query Clientes($quantidade: Int) {
    clientes(quantidade: $quantidade) {
      idCliente
      cnpj
      cpf
      nome
      fetchedAt
      expiresAt
    }
  }
`;

export const Q_VEICULOS = gql`
  query Veiculos($quantidade: Int) {
    veiculos(quantidade: $quantidade) {
      idVeiculo
      placa
      idCliente
      descricao
      idEquipamento
      fetchedAt
      expiresAt
    }
  }
`;

export const Q_MOTORISTAS = gql`
  query Motoristas($quantidade: Int) {
    motoristas(quantidade: $quantidade) {
      idMotorista
      nome
      tipoDocumento
      fetchedAt
      expiresAt
    }
  }
`;

export const Q_POSICOES_RECENTES = gql`
  query PosicoesRecentes($quantidade: Int) {
    posicoesRecentes(quantidade: $quantidade) {
      idPacote
      idVeiculo
      dataPosicao
      dataPacote
      latitude
      longitude
      velocidade
      ignicao
      direcao
      odometro
      syncedVia
    }
  }
`;

export const Q_POSICOES_POR_VEICULO = gql`
  query PosicoesPorVeiculo($idVeiculo: Int!, $dataInicio: DateTime!, $dataFim: DateTime!) {
    posicoesPorVeiculo(idVeiculo: $idVeiculo, dataInicio: $dataInicio, dataFim: $dataFim) {
      idPacote
      idVeiculo
      dataPosicao
      latitude
      longitude
      velocidade
    }
  }
`;
