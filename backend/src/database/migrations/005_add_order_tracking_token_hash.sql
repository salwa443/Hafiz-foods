BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_token_hash VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_tracking_token_hash_check'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_tracking_token_hash_check
      CHECK (
        tracking_token_hash IS NULL
        OR tracking_token_hash ~ '^[0-9a-f]{64}$'
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token_hash
  ON orders(tracking_token_hash)
  WHERE tracking_token_hash IS NOT NULL;

COMMIT;
