import { getActiveKitchenOrderRows } from '../models/kitchenOrderModel.js';
import { formatTableDisplayLabel } from '../utils/tableDisplayLabel.js';

export async function getActiveKitchenOrders() {
  const rows = await getActiveKitchenOrderRows();
  const orders = new Map();

  rows.forEach((row) => {
    if (!orders.has(row.order_code)) {
      orders.set(row.order_code, {
        orderId: row.order_code,
        tableNumber: row.table_number,
        tableDisplayLabel: formatTableDisplayLabel(row.table_number, row.table_id),
        orderTime: row.order_time,
        status: row.status,
        items: [],
      });
    }

    orders.get(row.order_code).items.push({
      name: row.item_name_snapshot,
      quantity: row.quantity,
      specialInstructions: row.special_instructions,
    });
  });

  return [...orders.values()];
}
