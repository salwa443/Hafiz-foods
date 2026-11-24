import {
  CustomerOrderTrackingError,
  getCustomerTrackedOrder,
} from '../services/customerOrderTrackingService.js';

export async function getPublicOrderTracking(req, res, next) {
  try {
    const order = await getCustomerTrackedOrder({
      orderId: req.params.orderId,
      trackingToken: req.get('X-Order-Tracking-Token'),
    });

    return res.status(200).json({
      success: true,
      data: { order },
    });
  } catch (error) {
    if (error instanceof CustomerOrderTrackingError) {
      return next(error);
    }

    const safeError = new Error('Unable to load order tracking information.');
    safeError.statusCode = 500;
    return next(safeError);
  }
}
