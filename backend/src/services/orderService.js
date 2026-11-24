import crypto from 'crypto';
import { pool } from '../config/db.js';
import {
  findOrderTableForShare,
  findOrderableMenuItemsForShare,
  insertOrder,
  insertOrderItem,
} from '../models/orderModel.js';
import { publishNewKitchenOrder } from './kitchenOrderRealtimeService.js';
import {
  generateTrackingToken,
  hashTrackingToken,
} from '../utils/trackingToken.js';
import { formatTableDisplayLabel } from '../utils/tableDisplayLabel.js';
import { markTableOccupied } from './tableAvailabilityService.js';

const MAX_MONEY_MINOR = 9_999_999_999n;

function publicError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function parseDecimalToMinorUnits(value) {
  const normalizedValue = String(value);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalizedValue);

  if (!match) {
    throw new Error('Invalid database money value.');
  }

  const fraction = (match[2] || '').padEnd(2, '0');
  return BigInt(match[1]) * 100n + BigInt(fraction || '0');
}

export function formatMinorUnits(minorUnits) {
  const whole = minorUnits / 100n;
  const fraction = String(minorUnits % 100n).padStart(2, '0');
  return `${whole}.${fraction}`;
}

function normalizeOrderLines(items) {
  const normalizedLines = new Map();

  items.forEach((item) => {
    const specialInstructions = String(item.specialInstructions || '').trim();
    const key = JSON.stringify([item.menuItemId, specialInstructions]);
    const existingLine = normalizedLines.get(key);

    if (existingLine) {
      const nextQuantity = existingLine.quantity + item.quantity;

      if (nextQuantity > 99) {
        throw publicError('Combined quantity for an item cannot exceed 99.', 400);
      }

      existingLine.quantity = nextQuantity;
      return;
    }

    normalizedLines.set(key, {
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      specialInstructions,
    });
  });

  return [...normalizedLines.values()];
}

function generateOrderCode() {
  return `ORD-${crypto.randomUUID()}`;
}

export async function placeOrder({ tableNumber, qrToken, paymentMethod, items }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const table = await findOrderTableForShare(client, tableNumber, qrToken);

    if (!table) {
      throw publicError('Invalid or expired QR code.', 404);
    }

    const normalizedLines = normalizeOrderLines(items);
    const menuItemIds = [...new Set(normalizedLines.map((item) => item.menuItemId))];
    const menuItems = await findOrderableMenuItemsForShare(client, menuItemIds);

    if (menuItems.length !== menuItemIds.length) {
      throw publicError('One or more menu items are unavailable.', 400);
    }

    const menuItemMap = new Map(menuItems.map((item) => [item.id, item]));
    let totalMinor = 0n;

    const trustedLines = normalizedLines.map((line) => {
      const menuItem = menuItemMap.get(line.menuItemId);

      if (!menuItem) {
        throw publicError('One or more menu items are unavailable.', 400);
      }

      const unitPriceMinor = parseDecimalToMinorUnits(menuItem.price);
      const subtotalMinor = unitPriceMinor * BigInt(line.quantity);
      totalMinor += subtotalMinor;

      return {
        ...line,
        itemName: menuItem.name,
        unitPrice: formatMinorUnits(unitPriceMinor),
        subtotal: formatMinorUnits(subtotalMinor),
      };
    });

    if (totalMinor > MAX_MONEY_MINOR) {
      throw publicError('Order total exceeds the supported limit.', 400);
    }

    const trackingToken = generateTrackingToken();
    const trackingTokenHash = hashTrackingToken(trackingToken);
    const order = await insertOrder(client, {
      orderCode: generateOrderCode(),
      tableId: table.id,
      paymentMethod,
      totalAmount: formatMinorUnits(totalMinor),
      trackingTokenHash,
    });
    const insertedItems = [];

    for (const line of trustedLines) {
      const insertedItem = await insertOrderItem(client, {
        orderId: order.id,
        menuItemId: line.menuItemId,
        itemName: line.itemName,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        specialInstructions: line.specialInstructions,
        subtotal: line.subtotal,
      });

      insertedItems.push({
        name: insertedItem.item_name_snapshot,
        unitPrice: insertedItem.unit_price_snapshot,
        quantity: insertedItem.quantity,
        specialInstructions: insertedItem.special_instructions,
        subtotal: insertedItem.subtotal,
      });
    }

    await markTableOccupied(client, table.id);

    const placedOrder = {
      orderId: order.order_code,
      tableNumber: table.table_number,
      tableDisplayLabel: formatTableDisplayLabel(table.table_number, table.id),
      status: order.status,
      paymentMethod: order.payment_method,
      totalAmount: order.total_amount,
      orderTime: order.order_time,
      items: insertedItems,
    };

    await client.query('COMMIT');
    publishNewKitchenOrder(placedOrder);

    return { ...placedOrder, trackingToken };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505' && error.constraint === 'orders_order_code_key') {
      throw publicError('Unable to generate a unique Order ID. Please submit again.', 409);
    }

    if (
      error.code === '23505' &&
      error.constraint === 'idx_orders_tracking_token_hash'
    ) {
      throw publicError(
        'Unable to generate secure order tracking credentials. Please submit again.',
        409
      );
    }

    throw error;
  } finally {
    client.release();
  }
}
