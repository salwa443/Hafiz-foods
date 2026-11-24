import { Router } from 'express';
import {
  createMenuItemHandler,
  deactivateMenuItemHandler,
  getMenuItem,
  listMenuItems,
  updateMenuItemAvailabilityHandler,
  updateMenuItemHandler,
} from '../controllers/menuItemController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';
import { uploadMenuItemImage } from '../middleware/uploadMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  availabilityPayloadValidator,
  listMenuItemsValidator,
  menuItemIdValidator,
  menuItemPayloadValidator,
} from '../validators/menuItemValidators.js';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', listMenuItemsValidator, validateRequest, listMenuItems);
router.post(
  '/',
  uploadMenuItemImage,
  menuItemPayloadValidator,
  validateRequest,
  createMenuItemHandler
);
router.get('/:id', menuItemIdValidator, validateRequest, getMenuItem);
router.put(
  '/:id',
  menuItemIdValidator,
  uploadMenuItemImage,
  menuItemPayloadValidator,
  validateRequest,
  updateMenuItemHandler
);
router.patch(
  '/:id/availability',
  menuItemIdValidator,
  availabilityPayloadValidator,
  validateRequest,
  updateMenuItemAvailabilityHandler
);
router.patch(
  '/:id/deactivate',
  menuItemIdValidator,
  validateRequest,
  deactivateMenuItemHandler
);

export default router;
