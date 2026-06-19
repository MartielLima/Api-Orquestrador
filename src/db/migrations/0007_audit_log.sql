CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id),
  action        TEXT NOT NULL,
  target_table  TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  diff          JSONB NOT NULL,
  ip            INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_actor_created ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX idx_audit_log_target ON audit_log(target_table, target_id, created_at DESC);
CREATE INDEX idx_audit_log_action_created ON audit_log(action, created_at DESC);