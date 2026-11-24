import { body, header, param, query } from 'express-validator';
import { publicTableAccessValidator } from './publicTableValidators.js';
import { isValidTrackingToken } from '../utils/trackingToken.js';

const paymentMethods = ['cash', 'pay_at_counter', 'pay_at_table'];

export const publicOrderPlacementValidator = [
  ...publicTableAccessValidator,
  body('paymentMethod')
    .isString()
    .withMessage('Payment method is required.')
    .isIn(paymentMethods)
    .withMessage('Payment method must be cash, pay_at_counter or pay_at_table.'),
  body('items')
    .isArray({ min: 1, max: 50 })
    .withMessage('Order must contain between 1 and 50 cart lines.'),
  body('items.*.menuItemId')
    .isInt({ min: 1 })
    .withMessage('Each menu item id must be a positive integer.')
    .toInt(),
  body('items.*.quantity')
    .isInt({ min: 1, max: 99 })
    .withMessage('Each quantity must be between 1 and 99.')
    .toInt(),
  body('items.*.specialInstructions')
    .optional({ nullable: true })
    .isString()
    .withMessage('Special instructions must be text.')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Special instructions must be 500 characters or fewer.'),
];

export const publicOrderCancellationValidator = [
  publicTableAccessValidator[0],
  param('orderId')
    .trim()
    .notEmpty()
    .withMessage('Order ID is required.')
    .isLength({ max: 80 })
    .withMessage('Order ID must be 80 characters or fewer.'),
  query('token')
    .optional()
    .isString()
    .withMessage('QR token format is invalid.')
    .trim()
    .notEmpty()
    .withMessage('QR token format is invalid.')
    .isLength({ max: 120 })
    .withMessage('QR token format is invalid.')
    .matches(/^[A-Za-z0-9_-]+$/)
    .withMessage('QR token format is invalid.'),
  header('x-order-tracking-token')
    .optional()
    .custom((value) => {
      if (!isValidTrackingToken(value)) {
        throw new Error('Tracking token format is invalid.');
      }
      return true;
    }),
  body().custom((payload) => {
    if (payload === undefined || payload === null) {
      return true;
    }

    if (typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Cancellation request body must be empty.');
    }

    if (Object.keys(payload).length > 0) {
      throw new Error('Cancellation request body must not contain fields.');
    }

    return true;
  }),
];
