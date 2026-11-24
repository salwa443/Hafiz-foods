import { body, param, query } from 'express-validator';

export const categoryIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('Category id must be a positive integer.'),
];

export const listCategoriesValidator = [
  query('includeInactive')
    .optional()
    .isBoolean()
    .withMessage('includeInactive must be true or false.'),
];

export const categoryPayloadValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Category name is required.')
    .isLength({ max: 120 })
    .withMessage('Category name must be 120 characters or fewer.'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be 1000 characters or fewer.'),
  body('displayOrder')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('Display order must be zero or greater.')
    .toInt(),
];
