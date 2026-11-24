import { pool, query } from '../config/db.js';
import { getReadyOrderRows, getWaiterOrderRowsById } from '../models/waiterOrderModel.js';
import { formatTableDisplayLabel } from '../utils/tableDisplayLabel.js';
import { publishWaiterOrderUpdated } from './waiterOrderRealtimeService.js';

export class WaiterOrderError extends Error {
  constructor(message, statusCode = 409) { super(message); this.statusCode = statusCode; }
}

function mapRows(rows) {
  const orders = new Map();
  for (const row of rows) {
    if (!orders.has(row.order_code)) {
      orders.set(row.order_code, {
        orderId: row.order_code,
        tableNumber: row.table_number,
        tableDisplayLabel: formatTableDisplayLabel(row.table_number, row.table_id),
        readyAt: row.ready_at,
        assignedWaiter: row.assigned_waiter_id ? { id: row.assigned_waiter_id, name: row.assigned_waiter_name } : null,
        claimedAt: row.claimed_at,
        pickedUpAt: row.picked_up_at,
        deliveredAt: row.delivered_at,
        deliveryStatus: row.delivered_at ? 'delivered' : row.picked_up_at ? 'picked_up' : row.claimed_at ? 'claimed' : 'ready',
        items: [],
      });
    }
    if (row.item_name_snapshot) orders.get(row.order_code).items.push({
      name: row.item_name_snapshot,
      quantity: row.quantity,
      specialInstructions: row.special_instructions,
    });
  }
  return [...orders.values()];
}

export async function getReadyOrders() {
  return mapRows(await getReadyOrderRows(query));
}

export async function updateDelivery({ orderId, action, actor }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, status, assigned_waiter_id, claimed_at, picked_up_at, delivered_at
       FROM orders WHERE order_code = $1 FOR UPDATE`, [orderId]
    );
    const order = result.rows[0];
    if (!order) throw new WaiterOrderError('Ready order was not found.', 404);
    if (!['ready', 'completed'].includes(order.status)) throw new WaiterOrderError('Order is not ready for delivery.');

    if (action === 'claim') {
      if (actor.role !== 'waiter') throw new WaiterOrderError('Only a waiter can claim an order.', 403);
      if (order.assigned_waiter_id) throw new WaiterOrderError('Order has already been claimed.');
      await client.query(`UPDATE orders SET assigned_waiter_id=$1, claimed_at=CURRENT_TIMESTAMP WHERE id=$2`, [actor.id, order.id]);
    } else {
      if (actor.role !== 'admin' && order.assigned_waiter_id !== actor.id) throw new WaiterOrderError('Only the assigned waiter can update this delivery.', 403);
      if (!order.assigned_waiter_id || !order.claimed_at) throw new WaiterOrderError('Order must be claimed first.');
      if (action === 'pickup') {
        if (order.picked_up_at) throw new WaiterOrderError('Order has already been picked up.');
        await client.query(`UPDATE orders SET picked_up_at=CURRENT_TIMESTAMP WHERE id=$1`, [order.id]);
      } else if (action === 'deliver') {
        if (!order.picked_up_at) throw new WaiterOrderError('Order must be picked up before delivery.');
        if (order.delivered_at) throw new WaiterOrderError('Order has already been delivered.');
        await client.query(`UPDATE orders SET delivered_at=CURRENT_TIMESTAMP WHERE id=$1`, [order.id]);
      } else throw new WaiterOrderError('Invalid delivery action.', 400);
    }

    const updated = mapRows(await getWaiterOrderRowsById(client, orderId))[0];
    await client.query('COMMIT');
    try { publishWaiterOrderUpdated(updated); } catch { /* committed operation remains successful */ }
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
