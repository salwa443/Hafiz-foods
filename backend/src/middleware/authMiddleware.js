import { verifyToken } from '../services/authService.js';

function getBearerToken(req) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }

  return header.split(' ')[1];
}

export async function authMiddleware(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      const error = new Error('Authentication token is required.');
      error.statusCode = 401;
      throw error;
    }

    req.user = await verifyToken(token);
    next();
  } catch (error) {
    next(error);
  }
}
