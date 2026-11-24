import { Router } from 'express';
import { getPublicOrderTracking } from '../controllers/publicOrderTrackingController.js';
import { CustomerOrderTrackingError } from '../services/customerOrderTrackingService.js';
import {
  publicOrderTrackingValidator,
  validatePublicOrderTrackingRequest,
} from '../validators/publicOrderTrackingValidators.js';

const router = Router();

router.get(
  '/:orderId/tracking',
  publicOrderTrackingValidator,
  validatePublicOrderTrackingRequest,
  getPublicOrderTracking
);

router.use((error, _req, res, next) => {
  if (!(error instanceof CustomerOrderTrackingError)) {
    next(error);
    return;
  }

  res.status(404).json({
    success: false,
    code: error.code,
    message: error.message,
  });
});

export default router;
