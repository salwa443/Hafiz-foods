export function requireRoles(...allowedRoles) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) {
      const error = new Error('Authentication is required before checking roles.');
      error.statusCode = 401;
      next(error);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      const error = new Error('You do not have permission to access this resource.');
      error.statusCode = 403;
      next(error);
      return;
    }

    next();
  };
}

export const requireAdmin = requireRoles('admin');
export const requireKitchenStaff = requireRoles('kitchen');
export const requireWaiter = requireRoles('waiter');
export const requireWaiterOrAdmin = requireRoles('waiter', 'admin');
