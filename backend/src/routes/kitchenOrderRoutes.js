import { Router } from 'express';
import {
  getActiveKitchenOrdersHandler,
  updateKitchenOrderStatusHandler,
} from '../controllers/kitchenOrderController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireKitchenStaff } from '../middleware/roleMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  kitchenOrderIdValidator,
  kitchenOrderStatusUpdateValidator,
} from '../validators/kitchenOrderStatusValidators.js';

const router = Router();

router.use(authMiddleware, requireKitchenStaff);
router.get('/active', getActiveKitchenOrdersHandler);
router.patch(
  '/:orderId/status',
  kitchenOrderIdValidator,
  kitchenOrderStatusUpdateValidator,
  validateRequest,
  updateKitchenOrderStatusHandler
);

export default router;
