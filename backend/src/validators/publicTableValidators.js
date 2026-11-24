import { param, query } from 'express-validator';

const tableNumberPattern = /^[A-Za-z0-9_-]+$/;
const qrTokenPattern = /^[A-Za-z0-9_-]+$/;

export function isValidPublicTableNumber(value) {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= 20 &&
    tableNumberPattern.test(value.trim());
}

export function isValidPublicQrToken(value) {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= 120 &&
    qrTokenPattern.test(value.trim());
}

export const publicTableAccessValidator = [
  param('tableNumber')
    .trim()
    .notEmpty()
    .withMessage('Table number is required.')
    .isLength({ max: 20 })
    .withMessage('Table number must be 20 characters or fewer.')
    .matches(tableNumberPattern)
    .withMessage('Table number may only contain letters, numbers, underscores and hyphens.'),
  query('token')
    .trim()
    .notEmpty()
    .withMessage('QR token is required.')
    .isLength({ max: 120 })
    .withMessage('QR token must be 120 characters or fewer.')
    .matches(qrTokenPattern)
    .withMessage('QR token format is invalid.'),
];
