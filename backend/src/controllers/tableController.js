import {
  createTable,
  deactivateTable,
  findActiveTableByNumberAndQrToken,
  findTableById,
  getAllTables,
  replaceTableQrToken,
  reactivateTable,
  tableHasActiveOrders,
  updateTable,
  updateTableStatus,
} from '../models/tableModel.js';
import {
  buildTableQrInfo,
  generateTableQrDataUrl,
  generateTableQrPngBuffer,
} from '../services/qrCodeService.js';
import { formatTableDisplayLabel } from '../utils/tableDisplayLabel.js';

function withDisplayLabel(table) {
  return {
    ...table,
    table_display_label: formatTableDisplayLabel(table.table_number, table.id),
  };
}

function toBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true' || value === true;
}

function handleDuplicateTableError(error) {
  if (error.code === '23505') {
    error.message = 'A table with this number already exists.';
    error.statusCode = 409;
  }
}

function ensureTableCanBecomeStatus(table, status) {
  if (!table.is_active && status !== 'inactive') {
    const error = new Error('Inactive tables cannot be marked active through this endpoint.');
    error.statusCode = 400;
    throw error;
  }
}

function ensureTableCanUseQr(table) {
  if (!table) {
    const error = new Error('Table not found.');
    error.statusCode = 404;
    throw error;
  }

  if (!table.is_active || table.status === 'inactive') {
    const error = new Error('Cannot generate QR codes for inactive tables.');
    error.statusCode = 400;
    throw error;
  }
}

async function ensureTableHasNoActiveOrders(tableId) {
  if (await tableHasActiveOrders(tableId)) {
    const error = new Error('Table status cannot be changed while it has an active order.');
    error.statusCode = 409;
    throw error;
  }
}

async function ensureStatusMatchesOrderActivity(tableId, status) {
  const hasActiveOrders = await tableHasActiveOrders(tableId);

  if (status === 'occupied' && !hasActiveOrders) {
    const error = new Error('A table can only be occupied while it has an active order.');
    error.statusCode = 409;
    throw error;
  }

  if ((status === 'available' || status === 'inactive') && hasActiveOrders) {
    const error = new Error('Table status cannot be changed while it has an active order.');
    error.statusCode = 409;
    throw error;
  }
}

export async function listTables(req, res, next) {
  try {
    const tables = await getAllTables({
      includeInactive: toBoolean(req.query.includeInactive),
    });

    res.json({ success: true, data: { tables: tables.map(withDisplayLabel) } });
  } catch (error) {
    next(error);
  }
}

export async function getTable(req, res, next) {
  try {
    const table = await findTableById(req.params.id);

    if (!table) {
      const error = new Error('Table not found.');
      error.statusCode = 404;
      throw error;
    }

    res.json({ success: true, data: { table: withDisplayLabel(table) } });
  } catch (error) {
    next(error);
  }
}

export async function createTableHandler(req, res, next) {
  try {
    if (req.body.status === 'occupied') {
      const error = new Error('New tables cannot be occupied before an order is placed.');
      error.statusCode = 400;
      throw error;
    }

    const table = await createTable(req.body);

    res.status(201).json({
      success: true,
      message: 'Table created successfully.',
      data: { table },
    });
  } catch (error) {
    handleDuplicateTableError(error);
    next(error);
  }
}

export async function updateTableHandler(req, res, next) {
  try {
    const existingTable = await findTableById(req.params.id);

    if (!existingTable) {
      const error = new Error('Table not found.');
      error.statusCode = 404;
      throw error;
    }

    ensureTableCanBecomeStatus(existingTable, req.body.status || existingTable.status);

    await ensureStatusMatchesOrderActivity(
      req.params.id,
      req.body.status || existingTable.status
    );

    const table = await updateTable(req.params.id, req.body);

    res.json({
      success: true,
      message: 'Table updated successfully.',
      data: { table },
    });
  } catch (error) {
    handleDuplicateTableError(error);
    next(error);
  }
}

export async function deactivateTableHandler(req, res, next) {
  try {
    await ensureTableHasNoActiveOrders(req.params.id);
    const table = await deactivateTable(req.params.id);

    if (!table) {
      const error = new Error('Table not found.');
      error.statusCode = 404;
      throw error;
    }

    res.json({
      success: true,
      message: 'Table deactivated successfully.',
      data: { table },
    });
  } catch (error) {
    next(error);
  }
}

export async function reactivateTableHandler(req, res, next) {
  try {
    const existingTable = await findTableById(req.params.id);

    if (!existingTable) {
      const error = new Error('Table not found.');
      error.statusCode = 404;
      throw error;
    }

    if (existingTable.is_active) {
      const error = new Error('Table is already active.');
      error.statusCode = 409;
      throw error;
    }

    const table = await reactivateTable(req.params.id);

    res.json({
      success: true,
      message: 'Table reactivated successfully.',
      data: { table: withDisplayLabel(table) },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateTableStatusHandler(req, res, next) {
  try {
    const existingTable = await findTableById(req.params.id);

    if (!existingTable) {
      const error = new Error('Table not found.');
      error.statusCode = 404;
      throw error;
    }

    ensureTableCanBecomeStatus(existingTable, req.body.status);

    await ensureStatusMatchesOrderActivity(req.params.id, req.body.status);

    const table = await updateTableStatus(req.params.id, req.body.status);

    res.json({
      success: true,
      message: 'Table status updated successfully.',
      data: { table },
    });
  } catch (error) {
    next(error);
  }
}

export async function getTableQrInfo(req, res, next) {
  try {
    const table = await findTableById(req.params.id);
    ensureTableCanUseQr(table);

    res.json({
      success: true,
      data: {
        qr: buildTableQrInfo(table),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function generateTableQrHandler(req, res, next) {
  try {
    const table = await findTableById(req.params.id);
    ensureTableCanUseQr(table);

    const qrImageDataUrl = await generateTableQrDataUrl(table);

    res.json({
      success: true,
      message: 'QR code generated successfully.',
      data: {
        qr: {
          ...buildTableQrInfo(table),
          qrImageDataUrl,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function regenerateTableQrHandler(req, res, next) {
  try {
    const existingTable = await findTableById(req.params.id);
    ensureTableCanUseQr(existingTable);

    const table = await replaceTableQrToken(req.params.id);
    const qrImageDataUrl = await generateTableQrDataUrl(table);

    res.json({
      success: true,
      message: 'QR code regenerated successfully.',
      data: {
        qr: {
          ...buildTableQrInfo(table),
          qrImageDataUrl,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadTableQrHandler(req, res, next) {
  try {
    const table = await findTableById(req.params.id);
    ensureTableCanUseQr(table);

    const qrBuffer = await generateTableQrPngBuffer(table);
    const filename = `table-${table.table_number}-qr.png`;

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', qrBuffer.length);
    res.send(qrBuffer);
  } catch (error) {
    next(error);
  }
}

export async function validateTableQrHandler(req, res, next) {
  try {
    const table = await findActiveTableByNumberAndQrToken(
      req.query.tableNumber,
      req.query.token
    );

    res.json({
      success: true,
      data: {
        valid: Boolean(table),
        table: table
          ? {
              id: table.id,
              tableNumber: table.table_number,
              status: table.status,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
}
