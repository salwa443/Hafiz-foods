import { pool } from '../config/db.js';
import {
  ORDER_TRANSITION_ERROR_CODES,
  validateOrderStatusTransition,
} from '../utils/orderStatusTransitions.js';
import { publishOrderStatusUpdated } from './orderStatusRealtimeService.js';
import { verifyTrackingToken } from '../utils/trackingToken.js';
import { formatTableDisplayLabel } from '../utils/tableDisplayLabel.js';
import { synchronizeTableAvailability } from './tableAvailabilityService.js';

export const ORDER_STATUS_SERVICE_ERROR_CODES = Object.freeze({
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ...ORDER_TRANSITION_ERROR_CODES,
});

const CONFLICT_CODES = new Set([
  ORDER_TRANSITION_ERROR_CODES.DUPLICATE_TRANSITION,
  ORDER_TRANSITION_ERROR_CODES.TERMINAL_STATUS,
  ORDER_TRANSITION_ERROR_CODES.INVALID_TRANSITION,
]);

export class OrderStatusServiceError extends Error {
  constructor({ code, message, statusCode }) {
    super(message);
    this.name = 'OrderStatusServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function transitionErrorToServiceError(result) {
  let statusCode = 400;

  if (CONFLICT_CODES.has(result.code)) {
    statusCode = 409;
  } else if (result.code === ORDER_TRANSITION_ERROR_CODES.ACTOR_NOT_AUTHORIZED) {
    statusCode = 403;
  }

  return new OrderStatusServiceError({
    code: result.code,
    message: result.message,
    statusCode,
  });
}

async function rollbackQuietly(client) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original service/database error if rollback itself fails.
  }
}

export async function updateOrderStatus(
  {
    orderId,
    targetStatus,
    actor,
    expectedTableId,
    expectedTableNumber,
    trackingToken,
  },
  dependencies = {}
) {
  const dbPool = dependencies.pool || pool;
  const publishStatus = dependencies.publishStatus || publishOrderStatusUpdated;
  const client = await dbPool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const orderResult = await client.query(
      `
        SELECT
          o.id,
          o.order_code,
          o.table_id,
          o.tracking_token_hash,
          o.status,
          o.order_time,
          o.updated_at,
          t.table_number
        FROM orders o
        INNER JOIN restaurant_tables t ON t.id = o.table_id
        WHERE o.order_code = $1
        LIMIT 1
        FOR UPDATE OF o
      `,
      [orderId]
    );
    const order = orderResult.rows[0];

    const tableNumberMismatch =
      expectedTableNumber !== undefined &&
      order?.table_number !== expectedTableNumber;
    const hasTrackingTokenHash = order?.tracking_token_hash != null;
    const customerCredentialMismatch =
      actor === 'customer' &&
      expectedTableNumber !== undefined &&
      (
        hasTrackingTokenHash
          ? !verifyTrackingToken(trackingToken, order.tracking_token_hash)
          : expectedTableId === undefined || order?.table_id !== expectedTableId
      );

    if (
      !order ||
      tableNumberMismatch ||
      customerCredentialMismatch ||
      (actor !== 'customer' && expectedTableId !== undefined && order.table_id !== expectedTableId)
    ) {
      throw new OrderStatusServiceError({
        code: ORDER_STATUS_SERVICE_ERROR_CODES.ORDER_NOT_FOUND,
        message: 'Order was not found.',
        statusCode: 404,
      });
    }

    const transition = validateOrderStatusTransition({
      currentStatus: order.status,
      nextStatus: targetStatus,
      actor,
    });

    if (!transition.valid) {
      throw transitionErrorToServiceError(transition);
    }

    const updateResult = await client.query(
      `
        UPDATE orders
        SET status = $1::varchar,
            ready_at = CASE
              WHEN $1::varchar = 'ready' THEN CURRENT_TIMESTAMP
              ELSE ready_at
            END
        WHERE id = $2
        RETURNING status, updated_at
      `,
      [targetStatus, order.id]
    );
    const updated = updateResult.rows[0];

    if (!updated) {
      throw new Error('Order status update did not return an updated row.');
    }

    if (targetStatus === 'completed' || targetStatus === 'cancelled') {
      await synchronizeTableAvailability(client, order.table_id);
    } else {
      await client.query(
        `UPDATE restaurant_tables
         SET status = 'occupied'
         WHERE id = $1
           AND is_active = TRUE`,
        [order.table_id]
      );
    }

    const itemResult = await client.query(
      `
        SELECT
          item_name_snapshot,
          quantity,
          special_instructions
        FROM order_items
        WHERE order_id = $1
        ORDER BY id ASC
      `,
      [order.id]
    );

    const updatedOrder = {
      orderId: order.order_code,
      tableNumber: order.table_number,
      tableDisplayLabel: formatTableDisplayLabel(order.table_number, order.table_id),
      orderTime: order.order_time,
      status: updated.status,
      updatedAt: updated.updated_at,
      items: itemResult.rows.map((item) => ({
        name: item.item_name_snapshot,
        quantity: item.quantity,
        specialInstructions: item.special_instructions,
      })),
    };

    await client.query('COMMIT');
    transactionStarted = false;

    try {
      publishStatus(updatedOrder);
    } catch {
      // Realtime delivery cannot turn a committed database update into a failure.
    }

    return updatedOrder;
  } catch (error) {
    if (transactionStarted) {
      await rollbackQuietly(client);
    }
    throw error;
  } finally {
    client.release();
  }
}
