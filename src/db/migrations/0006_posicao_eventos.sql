-- 0006_posicao_eventos.sql
-- Telemetria histórica 1:N com posicoes.
-- Captura snapshot (8 sinais) + transição (ignicao/bloqueio/jamming) por posição.
-- Volume estimado: ~117k rows/dia para 100 veículos (cron 10min).

CREATE TABLE posicao_eventos (
  id BIGSERIAL PRIMARY KEY,
  id_veiculo INT NOT NULL,
  id_pacote BIGINT NOT NULL,
  data_posicao TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL CHECK (event_type IN ('snapshot', 'transition')),
  signal TEXT NOT NULL,
  value_numeric NUMERIC,
  value_text TEXT,
  value_bool BOOLEAN,
  metadata JSONB,
  UNIQUE (id_veiculo, id_pacote, event_type, signal)
);

CREATE INDEX idx_posicao_eventos_veiculo_data
  ON posicao_eventos (id_veiculo, data_posicao DESC);

CREATE INDEX idx_posicao_eventos_signal_data
  ON posicao_eventos (signal, data_posicao DESC);