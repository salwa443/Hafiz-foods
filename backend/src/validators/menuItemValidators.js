import { body, param, query } from 'express-validator';

export const menuItemIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('Menu item id must be a positive integer.'),
];

export const listMenuItemsValidator = [
  query('includeInactive')
    .optional()
    .isBoolean()
    .withMessage('includeInactive must be true or false.'),
];

export const menuItemPayloadValidator = [
  body('categoryId')
    .notEmpty()
    .withMessage('Category is required.')
    .isInt({ min: 1 })
    .withMessage('Category id must be a positive integer.')
    .toInt(),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Menu item name is required.')
    .isLength({ max: 160 })
    .withMessage('Menu item name must be 160 characters or fewer.'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 1500 })
    .withMessage('Description must be 1500 characters or fewer.'),
  body('imageUrl')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Image URL must be 2000 characters or fewer.'),
  body('image_url')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Image URL must be 2000 characters or fewer.'),
  body('price')
    .notEmpty()
    .withMessage('Price is required.')
    .isFloat({ min: 0 })
    .withMessage('Price must be zero or greater.')
    .toFloat(),
  body('isAvailable')
    .optional()
    .isBoolean()
    .withMessage('Availability must be true or false.')
    .toBoolean(),
];

export const availabilityPayloadValidator = [
  body('isAvailable')
    .isBoolean()
    .withMessage('Availability must be true or false.')
    .toBoolean(),
];
