import { query } from '../config/db.js';

export async function findOrderSocketAuthorizationByCode(
  orderCode,
  dbQuery = query
) {
  const result = await dbQuery(
    `
      SELECT
        o.order_code,
        o.table_id,
        o.tracking_token_hash,
        t.table_number
      FROM orders o
      INNER JOIN restaurant_tables t ON t.id = o.table_id
      WHERE o.order_code = $1
      LIMIT 1
    `,
    [orderCode]
  );

  return result.rows[0] || null;
}

export async function getOrderTrackingRowsByCode(orderCode, dbQuery = query) {
  const result = await dbQuery(
    `
      SELECT
        o.order_code,
        o.table_id,
        o.status,
        o.payment_method,
        o.total_amount::TEXT AS total_amount,
        o.order_time,
        o.updated_at,
        o.tracking_token_hash,
        t.table_number,
        oi.item_name_snapshot,
        oi.unit_price_snapshot::TEXT AS unit_price_snapshot,
        oi.quantity,
        oi.special_instructions,
        oi.subtotal::TEXT AS subtotal
      FROM orders o
      INNER JOIN restaurant_tables t ON t.id = o.table_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.order_code = $1
      ORDER BY oi.id ASC
    `,
    [orderCode]
  );

  return result.rows;
}

export async function findOrderByCodeAndTableId(orderCode, tableId, dbQuery = query) {
  const result = await dbQuery(
    `
      SELECT order_code, table_id, status
      FROM orders
      WHERE order_code = $1
        AND table_id = $2
      LIMIT 1
    `,
    [orderCode, tableId]
  );

  return result.rows[0] || null;
}

export async function findOrderTableForShare(client, tableNumber, qrToken) {
  const result = await client.query(
    `
      SELECT id, table_number, status
      FROM restaurant_tables
      WHERE table_number = $1
        AND qr_token = $2
        AND is_active = TRUE
        AND status <> 'inactive'
      LIMIT 1
      FOR UPDATE
    `,
    [tableNumber, qrToken]
  );

  return result.rows[0] || null;
}

export async function findOrderableMenuItemsForShare(client, menuItemIds) {
  const result = await client.query(
    `
      SELECT
        menu_items.id,
        menu_items.name,
        menu_items.price::TEXT AS price
      FROM menu_items
      INNER JOIN categories ON categories.id = menu_items.category_id
      WHERE menu_items.id = ANY($1::INTEGER[])
        AND menu_items.is_active = TRUE
        AND menu_items.is_available = TRUE
        AND categories.is_active = TRUE
      ORDER BY menu_items.id
      FOR SHARE OF menu_items, categories
    `,
    [menuItemIds]
  );

  return result.rows;
}

export async function insertOrder(
  client,
  { orderCode, tableId, paymentMethod, totalAmount, trackingTokenHash }
) {
  const result = await client.query(
    `
      INSERT INTO orders (
        order_code,
        table_id,
        status,
        payment_method,
        total_amount,
        tracking_token_hash
      )
      VALUES ($1, $2, 'new', $3, $4, $5)
      RETURNING
        id,
        order_code,
        status,
        payment_method,
        total_amount::TEXT AS total_amount,
        order_time
    `,
    [orderCode, tableId, paymentMethod, totalAmount, trackingTokenHash]
  );

  return result.rows[0];
}

export async function insertOrderItem(
  client,
  {
    orderId,
    menuItemId,
    itemName,
    unitPrice,
    quantity,
    specialInstructions,
    subtotal,
  }
) {
  const result = await client.query(
    `
      INSERT INTO order_items (
        order_id,
        menu_item_id,
        item_name_snapshot,
        unit_price_snapshot,
        quantity,
        special_instructions,
        subtotal
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        item_name_snapshot,
        unit_price_snapshot::TEXT AS unit_price_snapshot,
        quantity,
        special_instructions,
        subtotal::TEXT AS subtotal
    `,
    [
      orderId,
      menuItemId,
      itemName,
      unitPrice,
      quantity,
      specialInstructions || null,
      subtotal,
    ]
  );

  return result.rows[0];
}
