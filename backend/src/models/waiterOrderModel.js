export async function getReadyOrderRows(dbQuery) {
  const result = await dbQuery(`
    SELECT o.id, o.order_code, o.status, COALESCE(o.ready_at, o.updated_at) AS ready_at,
           o.assigned_waiter_id, o.claimed_at, o.picked_up_at, o.delivered_at,
           t.id AS table_id, t.table_number,
           u.name AS assigned_waiter_name,
           oi.item_name_snapshot, oi.quantity, oi.special_instructions
    FROM orders o
    JOIN restaurant_tables t ON t.id = o.table_id
    LEFT JOIN users u ON u.id = o.assigned_waiter_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status IN ('ready', 'completed')
      AND o.delivered_at IS NULL
    ORDER BY COALESCE(o.ready_at, o.updated_at) ASC, oi.id ASC
  `);
  return result.rows;
}

export async function getWaiterOrderRowsById(client, orderId) {
  const result = await client.query(`
    SELECT o.id, o.order_code, o.status, COALESCE(o.ready_at, o.updated_at) AS ready_at,
           o.assigned_waiter_id, o.claimed_at, o.picked_up_at, o.delivered_at,
           t.id AS table_id, t.table_number,
           u.name AS assigned_waiter_name,
           oi.item_name_snapshot, oi.quantity, oi.special_instructions
    FROM orders o
    JOIN restaurant_tables t ON t.id = o.table_id
    LEFT JOIN users u ON u.id = o.assigned_waiter_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.order_code = $1
    ORDER BY oi.id ASC
  `, [orderId]);
  return result.rows;
}
