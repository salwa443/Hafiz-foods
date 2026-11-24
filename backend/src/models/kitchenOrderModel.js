import { query } from '../config/db.js';

const ACTIVE_KITCHEN_STATUSES = ['new', 'accepted', 'preparing', 'ready'];

export async function getActiveKitchenOrderRows(dbQuery = query) {
  const result = await dbQuery(
    `
      SELECT
        orders.order_code,
        orders.table_id,
        restaurant_tables.table_number,
        orders.order_time,
        orders.status,
        order_items.item_name_snapshot,
        order_items.quantity,
        order_items.special_instructions
      FROM orders
      INNER JOIN restaurant_tables
        ON restaurant_tables.id = orders.table_id
      INNER JOIN order_items
        ON order_items.order_id = orders.id
      WHERE orders.status = ANY($1::VARCHAR[])
      ORDER BY orders.order_time ASC, orders.id ASC, order_items.id ASC
    `,
    [ACTIVE_KITCHEN_STATUSES]
  );

  return result.rows;
}
