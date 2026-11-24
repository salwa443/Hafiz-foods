BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;

UPDATE orders
SET ready_at = updated_at
WHERE ready_at IS NULL
  AND status IN ('ready', 'completed');

CREATE INDEX IF NOT EXISTS idx_orders_ready_at
  ON orders(ready_at)
  WHERE ready_at IS NOT NULL;

COMMIT;
