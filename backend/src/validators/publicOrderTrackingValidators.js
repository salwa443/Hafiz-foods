import { header, param, validationResult } from 'express-validator';
import { CustomerOrderTrackingError } from '../services/customerOrderTrackingService.js';
import { isValidTrackingToken } from '../utils/trackingToken.js';

export const publicOrderTrackingValidator = [
  param('orderId')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 80 }),
  header('x-order-tracking-token').custom((value) => {
    if (!isValidTrackingToken(value)) {
      throw new Error('Invalid tracking credentials.');
    }

    return true;
  }),
];

export function validatePublicOrderTrackingRequest(req, _res, next) {
  if (!validationResult(req).isEmpty()) {
    next(new CustomerOrderTrackingError());
    return;
  }

  next();
}
