import { Router } from 'express';
import { validatePublicTableAccess } from '../controllers/publicTableController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { publicTableAccessValidator } from '../validators/publicTableValidators.js';

const router = Router();

router.get(
  '/:tableNumber/access',
  publicTableAccessValidator,
  validateRequest,
  validatePublicTableAccess
);

export default router;
