import { Router } from 'express';
import { claimOrder, deliverOrder, listReadyOrders, pickupOrder } from '../controllers/waiterOrderController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireWaiter, requireWaiterOrAdmin } from '../middleware/roleMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { waiterOrderIdValidator } from '../validators/waiterOrderValidators.js';

const router = Router();
router.use(authMiddleware);
router.get('/ready', requireWaiterOrAdmin, listReadyOrders);
router.patch('/:orderId/claim', requireWaiter, waiterOrderIdValidator, validateRequest, claimOrder);
router.patch('/:orderId/pickup', requireWaiterOrAdmin, waiterOrderIdValidator, validateRequest, pickupOrder);
router.patch('/:orderId/deliver', requireWaiterOrAdmin, waiterOrderIdValidator, validateRequest, deliverOrder);
export default router;
