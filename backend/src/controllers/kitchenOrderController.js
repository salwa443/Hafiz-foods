import { getActiveKitchenOrders } from '../services/kitchenOrderService.js';
import {
  OrderStatusServiceError,
  updateOrderStatus,
} from '../services/orderStatusService.js';
import { ORDER_STATUS_ACTORS } from '../utils/orderStatusTransitions.js';

export function createGetActiveKitchenOrdersHandler(loadOrders = getActiveKitchenOrders) {
  return async function getActiveKitchenOrdersHandler(_req, res, next) {
    try {
      const orders = await loadOrders();

      return res.status(200).json({
        success: true,
        data: { orders },
      });
    } catch {
      const error = new Error('Unable to load active kitchen orders.');
      error.statusCode = 500;
      return next(error);
    }
  };
}

export const getActiveKitchenOrdersHandler = createGetActiveKitchenOrdersHandler();

export function createUpdateKitchenOrderStatusHandler(updateStatus = updateOrderStatus) {
  return async function updateKitchenOrderStatusHandler(req, res, next) {
    try {
      const order = await updateStatus({
        orderId: req.params.orderId,
        targetStatus: req.body.status,
        actor: ORDER_STATUS_ACTORS.KITCHEN,
      });

      return res.status(200).json({
        success: true,
        message: 'Order status updated successfully.',
        data: { order },
      });
    } catch (error) {
      if (error instanceof OrderStatusServiceError) {
        return next(error);
      }

      const safeError = new Error('Unable to update order status.');
      safeError.statusCode = 500;
      return next(safeError);
    }
  };
}

export const updateKitchenOrderStatusHandler =
  createUpdateKitchenOrderStatusHandler();
