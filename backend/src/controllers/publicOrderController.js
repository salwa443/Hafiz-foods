import { placeOrder } from '../services/orderService.js';
import { findActiveTableByNumberAndQrToken } from '../models/tableModel.js';
import {
  OrderStatusServiceError,
  updateOrderStatus,
} from '../services/orderStatusService.js';
import { ORDER_STATUS_ACTORS } from '../utils/orderStatusTransitions.js';

export async function placePublicOrder(req, res, next) {
  try {
    const order = await placeOrder({
      tableNumber: req.params.tableNumber,
      qrToken: req.query.token,
      paymentMethod: req.body.paymentMethod,
      items: req.body.items,
    });

    res.status(201).json({
      success: true,
      message: 'Order placed successfully.',
      data: { order },
    });
  } catch (error) {
    if (!error.statusCode) {
      const safeError = new Error('Unable to place order.');
      safeError.statusCode = 500;
      next(safeError);
      return;
    }

    next(error);
  }
}

export async function cancelPublicOrder(req, res, next) {
  try {
    const table = req.query.token
      ? await findActiveTableByNumberAndQrToken(
        req.params.tableNumber,
        req.query.token
      )
      : null;

    const order = await updateOrderStatus({
      orderId: req.params.orderId,
      targetStatus: 'cancelled',
      actor: ORDER_STATUS_ACTORS.CUSTOMER,
      expectedTableId: table?.id,
      expectedTableNumber: req.params.tableNumber,
      trackingToken: req.get('X-Order-Tracking-Token'),
    });

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully.',
      data: { order },
    });
  } catch (error) {
    if (error.statusCode || error instanceof OrderStatusServiceError) {
      return next(error);
    }

    const safeError = new Error('Unable to cancel order.');
    safeError.statusCode = 500;
    return next(safeError);
  }
}
