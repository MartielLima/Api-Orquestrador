-- 0005_veiculos_id_equipamento_bigint.sql
-- Alter id_equipamento from INTEGER (int4, max 2^31-1 = 2.147.483.647) to BIGINT (int8).
-- Sascar returns idEquipamento values that can exceed 2.1B (e.g., 9.3B in this account),
-- causing INSERT ... ON CONFLICT DO NOTHING to throw "value N is out of range for type integer"
-- and breaking the GraphQL `veiculos` query end-to-end (via cachedQuery).
--
-- Idempotent: USING clause casts existing int4 values to bigint (all fit).
-- Other integer id columns in this table (id_veiculo, id_cliente) currently fit in int4
-- for this account but may need the same treatment in others; not changed here (YAGNI).

ALTER TABLE veiculos_cache
  ALTER COLUMN id_equipamento TYPE BIGINT USING id_equipamento::BIGINT;
