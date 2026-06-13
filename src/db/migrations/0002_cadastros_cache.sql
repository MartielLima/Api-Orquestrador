CREATE TABLE clientes_cache (
  id_cliente  INTEGER PRIMARY KEY,
  cnpj        TEXT,
  cpf         TEXT,
  nome        TEXT NOT NULL,
  raw         JSONB NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE veiculos_cache (
  id_veiculo      INTEGER PRIMARY KEY,
  placa           TEXT NOT NULL,
  id_cliente      INTEGER,
  descricao       TEXT,
  id_equipamento  INTEGER,
  raw             JSONB NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_veiculos_placa ON veiculos_cache(placa);

CREATE TABLE motoristas_cache (
  id_motorista   INTEGER PRIMARY KEY,
  nome           TEXT NOT NULL,
  tipo_documento TEXT,
  raw            JSONB NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL
);
