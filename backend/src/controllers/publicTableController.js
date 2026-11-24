import { findActiveTableByNumberAndQrToken } from '../models/tableModel.js';
import { formatTableDisplayLabel } from '../utils/tableDisplayLabel.js';

function createInvalidQrError() {
  const error = new Error('Invalid or expired QR code.');
  error.statusCode = 404;
  return error;
}

export async function validatePublicTableAccess(req, res, next) {
  try {
    const table = await findActiveTableByNumberAndQrToken(
      req.params.tableNumber,
      req.query.token
    );

    if (!table) {
      throw createInvalidQrError();
    }

    res.json({
      success: true,
      data: {
        table: {
          id: table.id,
          tableNumber: table.table_number,
          tableDisplayLabel: formatTableDisplayLabel(table.table_number, table.id),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}
