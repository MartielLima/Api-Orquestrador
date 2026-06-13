CREATE TABLE posicoes (
  id            BIGSERIAL PRIMARY KEY,
  id_pacote     BIGINT NOT NULL,
  id_veiculo    INTEGER NOT NULL,
  data_posicao  TIMESTAMPTZ NOT NULL,
  data_pacote   TIMESTAMPTZ NOT NULL,
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  velocidade    DOUBLE PRECISION NOT NULL,
  ignicao       INTEGER,
  direcao       INTEGER,
  odometro      DOUBLE PRECISION,
  horimetro     DOUBLE PRECISION,
  raw           JSONB NOT NULL,
  synced_via    TEXT NOT NULL DEFAULT 'graphql',
  UNIQUE (id_veiculo, id_pacote)
);
CREATE INDEX idx_posicoes_veiculo_data ON posicoes(id_veiculo, data_posicao DESC);
CREATE INDEX idx_posicoes_id_pacote ON posicoes(id_pacote);

CREATE TABLE sync_cursor (
  method         TEXT NOT NULL,
  id_veiculo     INTEGER NOT NULL,
  last_id_pacote BIGINT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (method, id_veiculo)
);
