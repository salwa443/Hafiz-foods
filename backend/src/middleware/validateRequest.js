import { validationResult } from 'express-validator';

export function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    next();
    return;
  }

  const error = new Error('Validation failed.');
  error.statusCode = 400;
  error.details = errors.array().map((item) => ({
    field: item.path,
    message: item.msg,
  }));

  next(error);
}
