import { Router } from 'express';
import {
  createTableHandler,
  deactivateTableHandler,
  downloadTableQrHandler,
  generateTableQrHandler,
  getTable,
  getTableQrInfo,
  listTables,
  regenerateTableQrHandler,
  reactivateTableHandler,
  updateTableHandler,
  updateTableStatusHandler,
  validateTableQrHandler,
} from '../controllers/tableController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  listTablesValidator,
  qrValidationValidator,
  tableIdValidator,
  tablePayloadValidator,
  tableStatusValidator,
} from '../validators/tableValidators.js';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', listTablesValidator, validateRequest, listTables);
router.post('/', tablePayloadValidator, validateRequest, createTableHandler);
router.get('/qr/validate', qrValidationValidator, validateRequest, validateTableQrHandler);
router.get('/:id/qr', tableIdValidator, validateRequest, getTableQrInfo);
router.post('/:id/qr/generate', tableIdValidator, validateRequest, generateTableQrHandler);
router.patch('/:id/qr/regenerate', tableIdValidator, validateRequest, regenerateTableQrHandler);
router.get('/:id/qr/download', tableIdValidator, validateRequest, downloadTableQrHandler);
router.get('/:id', tableIdValidator, validateRequest, getTable);
router.put(
  '/:id',
  tableIdValidator,
  tablePayloadValidator,
  validateRequest,
  updateTableHandler
);
router.patch(
  '/:id/status',
  tableIdValidator,
  tableStatusValidator,
  validateRequest,
  updateTableStatusHandler
);
router.patch(
  '/:id/deactivate',
  tableIdValidator,
  validateRequest,
  deactivateTableHandler
);
router.patch(
  '/:id/reactivate',
  tableIdValidator,
  validateRequest,
  reactivateTableHandler
);

export default router;
