import { getReadyOrders, updateDelivery } from '../services/waiterOrderService.js';

export async function listReadyOrders(_req, res, next) {
  try { res.json({ success: true, data: { orders: await getReadyOrders() } }); } catch (error) { next(error); }
}

function actionHandler(action) {
  return async (req, res, next) => {
    try {
      const order = await updateDelivery({ orderId: req.params.orderId, action, actor: req.user });
      res.json({ success: true, data: { order } });
    } catch (error) { next(error); }
  };
}

export const claimOrder = actionHandler('claim');
export const pickupOrder = actionHandler('pickup');
export const deliverOrder = actionHandler('deliver');
