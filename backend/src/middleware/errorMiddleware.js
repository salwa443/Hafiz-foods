import { deleteUploadedMenuImage } from './uploadMiddleware.js';

export async function errorMiddleware(error, req, res, _next) {
  if (req.uploadedMenuImage?.relativePath) {
    try {
      await deleteUploadedMenuImage(req.uploadedMenuImage.relativePath);
    } catch {
      // Keep the original request error as the response source.
    }
  }

  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal server error',
    details: error.details,
  });
}
