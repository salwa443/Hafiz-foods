import { Router } from 'express';
import {
  createCategoryHandler,
  deactivateCategoryHandler,
  getAdminDashboardSummary,
  getCategory,
  listCategories,
  updateCategoryHandler,
} from '../controllers/categoryController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  categoryIdValidator,
  categoryPayloadValidator,
  listCategoriesValidator,
} from '../validators/categoryValidators.js';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/summary', getAdminDashboardSummary);
router.get('/', listCategoriesValidator, validateRequest, listCategories);
router.post('/', categoryPayloadValidator, validateRequest, createCategoryHandler);
router.get('/:id', categoryIdValidator, validateRequest, getCategory);
router.put(
  '/:id',
  categoryIdValidator,
  categoryPayloadValidator,
  validateRequest,
  updateCategoryHandler
);
router.patch(
  '/:id/deactivate',
  categoryIdValidator,
  validateRequest,
  deactivateCategoryHandler
);

export default router;
