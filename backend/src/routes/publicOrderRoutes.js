import { Router } from 'express';
import {
  cancelPublicOrder,
  placePublicOrder,
} from '../controllers/publicOrderController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  publicOrderCancellationValidator,
  publicOrderPlacementValidator,
} from '../validators/publicOrderValidators.js';

const router = Router();

router.post(
  '/:tableNumber/orders',
  publicOrderPlacementValidator,
  validateRequest,
  placePublicOrder
);
router.patch(
  '/:tableNumber/orders/:orderId/cancel',
  publicOrderCancellationValidator,
  validateRequest,
  cancelPublicOrder
);

export default router;
