BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assigned_waiter_id INTEGER REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_timeline_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_timeline_check CHECK (
  (assigned_waiter_id IS NULL AND claimed_at IS NULL AND picked_up_at IS NULL AND delivered_at IS NULL)
  OR
  (assigned_waiter_id IS NOT NULL AND claimed_at IS NOT NULL
    AND (picked_up_at IS NULL OR picked_up_at >= claimed_at)
    AND (delivered_at IS NULL OR (picked_up_at IS NOT NULL AND delivered_at >= picked_up_at)))
);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_waiter_id ON orders(assigned_waiter_id);
CREATE INDEX IF NOT EXISTS idx_orders_ready_delivery_queue
  ON orders(status, delivered_at, updated_at)
  WHERE status IN ('ready', 'completed') AND delivered_at IS NULL;

COMMIT;
