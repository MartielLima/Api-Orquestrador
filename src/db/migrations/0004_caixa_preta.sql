CREATE TABLE caixa_preta_eventos (
  id            BIGSERIAL PRIMARY KEY,
  id_veiculo    INTEGER,
  placa         TEXT,
  data_evento   TIMESTAMPTZ,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  velocidade    DOUBLE PRECISION,
  rpm           INTEGER,
  ignicao       INTEGER,
  freio         INTEGER,
  raw           JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL DEFAULT 'recuperarEventosCaixaPreta'
);
COMMENT ON TABLE caixa_preta_eventos IS
  'DEPRECATED: solicitarEventosCaixaPreta foi desativada pela Sascar no manual v2.07. '
  'Esta tabela só será populada novamente se a Sascar reativar o método. '
  'Mantida para histórico e detecção de reativação.';
