import express from 'express';

import {
  getCategories,
  getMenuItems,
} from '../controllers/publicMenuController.js';
import { validatePublicMenuItemFilters } from '../validators/publicMenuValidators.js';

const router = express.Router();

router.get('/categories', getCategories);
router.get('/items', validatePublicMenuItemFilters, getMenuItems);

export default router;
