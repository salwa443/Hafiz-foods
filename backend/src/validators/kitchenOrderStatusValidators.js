import { body, param } from 'express-validator';

const KITCHEN_TARGET_STATUSES = Object.freeze([
  'accepted',
  'preparing',
  'ready',
  'completed',
]);

export const kitchenOrderIdValidator = [
  param('orderId')
    .trim()
    .notEmpty()
    .withMessage('Order ID is required.')
    .isLength({ max: 80 })
    .withMessage('Order ID must be 80 characters or fewer.'),
];

export const kitchenOrderStatusUpdateValidator = [
  body().custom((payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Request body must be an object containing only status.');
    }

    const unexpectedFields = Object.keys(payload).filter((field) => field !== 'status');

    if (unexpectedFields.length > 0) {
      throw new Error('Request body may only contain the status field.');
    }

    return true;
  }),
  body('status')
    .exists({ values: 'null' })
    .withMessage('Status is required.')
    .bail()
    .isString()
    .withMessage('Status must be a string.')
    .bail()
    .notEmpty()
    .withMessage('Status is required.')
    .bail()
    .isIn(KITCHEN_TARGET_STATUSES)
    .withMessage('Status must be accepted, preparing, ready or completed.'),
];
