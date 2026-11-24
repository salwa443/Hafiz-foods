BEGIN;

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id SERIAL PRIMARY KEY,
  table_number VARCHAR(20) UNIQUE NOT NULL,
  qr_token VARCHAR(120) UNIQUE NOT NULL,
  qr_code_data TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'available',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS table_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS qr_token VARCHAR(120),
  ADD COLUMN IF NOT EXISTS qr_code_data TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

UPDATE restaurant_tables
SET status = 'inactive'
WHERE is_active = FALSE AND status <> 'inactive';

UPDATE restaurant_tables
SET status = 'available'
WHERE status IS NULL;

UPDATE restaurant_tables
SET is_active = TRUE
WHERE is_active IS NULL;

UPDATE restaurant_tables
SET created_at = CURRENT_TIMESTAMP
WHERE created_at IS NULL;

UPDATE restaurant_tables
SET updated_at = CURRENT_TIMESTAMP
WHERE updated_at IS NULL;

ALTER TABLE restaurant_tables
  ALTER COLUMN table_number SET NOT NULL,
  ALTER COLUMN qr_token SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'available',
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT TRUE,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_tables_table_number_key'
  ) THEN
    ALTER TABLE restaurant_tables
      ADD CONSTRAINT restaurant_tables_table_number_key UNIQUE (table_number);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_tables_qr_token_key'
  ) THEN
    ALTER TABLE restaurant_tables
      ADD CONSTRAINT restaurant_tables_qr_token_key UNIQUE (qr_token);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_tables_status_check'
  ) THEN
    ALTER TABLE restaurant_tables
      ADD CONSTRAINT restaurant_tables_status_check
      CHECK (status IN ('available', 'occupied', 'inactive'));
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS set_restaurant_tables_updated_at ON restaurant_tables;
CREATE TRIGGER set_restaurant_tables_updated_at
BEFORE UPDATE ON restaurant_tables
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_qr_token ON restaurant_tables(qr_token);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_status ON restaurant_tables(status);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_is_active ON restaurant_tables(is_active);

COMMIT;
