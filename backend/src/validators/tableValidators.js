import { body, param, query } from 'express-validator';

const statusValues = ['available', 'occupied', 'inactive'];

export const tableIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('Table id must be a positive integer.'),
];

export const listTablesValidator = [
  query('includeInactive')
    .optional()
    .isBoolean()
    .withMessage('includeInactive must be true or false.'),
];

export const tablePayloadValidator = [
  body('tableNumber')
    .trim()
    .notEmpty()
    .withMessage('Table number is required.')
    .isLength({ max: 20 })
    .withMessage('Table number must be 20 characters or fewer.')
    .matches(/^[A-Za-z0-9_-]+$/)
    .withMessage('Table number may only contain letters, numbers, underscores and hyphens.'),
  body('status')
    .optional({ values: 'falsy' })
    .isIn(statusValues)
    .withMessage('Status must be available, occupied or inactive.'),
];

export const tableStatusValidator = [
  body('status')
    .notEmpty()
    .withMessage('Status is required.')
    .isIn(statusValues)
    .withMessage('Status must be available, occupied or inactive.'),
];

export const qrValidationValidator = [
  query('tableNumber')
    .trim()
    .notEmpty()
    .withMessage('Table number is required.')
    .isLength({ max: 20 })
    .withMessage('Table number must be 20 characters or fewer.'),
  query('token')
    .trim()
    .notEmpty()
    .withMessage('QR token is required.')
    .isLength({ max: 120 })
    .withMessage('QR token must be 120 characters or fewer.'),
];
