import { Router } from 'express';
import {
  getMe,
  login,
  logout,
  register,
} from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  requireAdmin,
  requireKitchenStaff,
  requireWaiter,
} from '../middleware/roleMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  loginValidator,
  registerValidator,
} from '../validators/authValidators.js';

const router = Router();

router.post('/login', loginValidator, validateRequest, login);
router.post(
  '/register',
  authMiddleware,
  requireAdmin,
  registerValidator,
  validateRequest,
  register
);
router.post('/logout', authMiddleware, logout);
router.get('/me', authMiddleware, getMe);

router.get('/admin-only', authMiddleware, requireAdmin, (req, res) => {
  res.json({ success: true, message: 'Admin access granted.' });
});

router.get('/kitchen-only', authMiddleware, requireKitchenStaff, (req, res) => {
  res.json({ success: true, message: 'Kitchen staff access granted.' });
});

router.get('/waiter-only', authMiddleware, requireWaiter, (req, res) => {
  res.json({ success: true, message: 'Waiter access granted.' });
});

export default router;
