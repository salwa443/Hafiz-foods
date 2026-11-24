export const ACTIVE_ORDER_STATUSES = Object.freeze([
  'new',
  'accepted',
  'preparing',
  'ready',
]);

export async function markTableOccupied(client, tableId) {
  const result = await client.query(
    `UPDATE restaurant_tables
     SET status = 'occupied'
     WHERE id = $1
       AND is_active = TRUE
     RETURNING id, status`,
    [tableId]
  );

  if (result.rowCount !== 1) {
    throw new Error('Active order table could not be marked occupied.');
  }
}

export async function synchronizeTableAvailability(client, tableId) {
  const tableResult = await client.query(
    `SELECT id, is_active
     FROM restaurant_tables
     WHERE id = $1
     FOR UPDATE`,
    [tableId]
  );
  const table = tableResult.rows[0];

  if (!table || !table.is_active) {
    return null;
  }

  const activeOrderResult = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM orders
       WHERE table_id = $1
         AND status = ANY($2::TEXT[])
     ) AS has_active_orders`,
    [tableId, ACTIVE_ORDER_STATUSES]
  );
  const nextStatus = activeOrderResult.rows[0].has_active_orders
    ? 'occupied'
    : 'available';

  await client.query(
    `UPDATE restaurant_tables
     SET status = $1
     WHERE id = $2`,
    [nextStatus, tableId]
  );

  return nextStatus;
}
