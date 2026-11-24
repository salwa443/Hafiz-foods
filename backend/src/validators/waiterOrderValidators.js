import { param } from 'express-validator';

export const waiterOrderIdValidator = [
  param('orderId').trim().notEmpty().isLength({ max: 80 }).withMessage('A valid Order ID is required.'),
];
