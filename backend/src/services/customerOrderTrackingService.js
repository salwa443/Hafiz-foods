import { getOrderTrackingRowsByCode } from '../models/orderModel.js';
import { verifyTrackingToken } from '../utils/trackingToken.js';
import { formatTableDisplayLabel } from '../utils/tableDisplayLabel.js';

export const CUSTOMER_ORDER_TRACKING_ERROR_CODES = Object.freeze({
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
});

export class CustomerOrderTrackingError extends Error {
  constructor() {
    super('Order tracking information was not found.');
    this.name = 'CustomerOrderTrackingError';
    this.code = CUSTOMER_ORDER_TRACKING_ERROR_CODES.ORDER_NOT_FOUND;
    this.statusCode = 404;
  }
}

function trackingNotFound() {
  return new CustomerOrderTrackingError();
}

export async function getCustomerTrackedOrder(
  { orderId, trackingToken },
  dependencies = {}
) {
  if (typeof orderId !== 'string' || !orderId.trim()) {
    throw trackingNotFound();
  }

  const loadRows = dependencies.loadRows || getOrderTrackingRowsByCode;
  const rows = await loadRows(orderId.trim());
  const order = rows[0];

  if (
    !order ||
    !verifyTrackingToken(trackingToken, order.tracking_token_hash)
  ) {
    throw trackingNotFound();
  }

  return {
    orderId: order.order_code,
    tableNumber: order.table_number,
    tableDisplayLabel: formatTableDisplayLabel(order.table_number, order.table_id),
    status: order.status,
    paymentMethod: order.payment_method,
    totalAmount: order.total_amount,
    orderTime: order.order_time,
    updatedAt: order.updated_at,
    items: rows
      .filter((row) => row.item_name_snapshot !== null)
      .map((row) => ({
        name: row.item_name_snapshot,
        unitPrice: row.unit_price_snapshot,
        quantity: row.quantity,
        specialInstructions: row.special_instructions,
        subtotal: row.subtotal,
      })),
  };
}
