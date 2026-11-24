import crypto from 'crypto';
import { query } from '../config/db.js';

const tableStatuses = new Set(['available', 'occupied', 'inactive']);

export function generateQrToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function buildTableMenuPath(tableNumber, qrToken) {
  return `/menu/${encodeURIComponent(tableNumber)}/${encodeURIComponent(qrToken)}`;
}

function normalizeStatus(status, fallback = 'available') {
  if (status === undefined || status === null || status === '') {
    return fallback;
  }

  if (!tableStatuses.has(status)) {
    const error = new Error('Invalid table status.');
    error.statusCode = 400;
    throw error;
  }

  return status;
}

async function buildUniqueQrToken() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateQrToken();
    const existing = await query(
      'SELECT 1 FROM restaurant_tables WHERE qr_token = $1 LIMIT 1',
      [token]
    );

    if (existing.rowCount === 0) {
      return token;
    }
  }

  throw new Error('Could not generate a unique QR token.');
}

export async function getAllTables({ includeInactive = true } = {}) {
  const result = await query(
    `
      SELECT id, table_number, qr_token, qr_code_data, status, is_active, created_at, updated_at
      FROM restaurant_tables
      WHERE ($1::BOOLEAN = TRUE OR is_active = TRUE)
      ORDER BY table_number ASC
    `,
    [includeInactive]
  );

  return result.rows;
}

export async function findTableById(id) {
  const result = await query(
    `
      SELECT id, table_number, qr_token, qr_code_data, status, is_active, created_at, updated_at
      FROM restaurant_tables
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function findActiveTableByNumberAndQrToken(tableNumber, qrToken) {
  const result = await query(
    `
      SELECT id, table_number, qr_token, qr_code_data, status, is_active, created_at, updated_at
      FROM restaurant_tables
      WHERE table_number = $1
        AND qr_token = $2
        AND is_active = TRUE
        AND status <> 'inactive'
      LIMIT 1
    `,
    [tableNumber, qrToken]
  );

  return result.rows[0] || null;
}

export async function createTable({ tableNumber, status = 'available' }) {
  const qrToken = await buildUniqueQrToken();
  const safeStatus = normalizeStatus(status);
  const qrCodeData = buildTableMenuPath(tableNumber, qrToken);

  const result = await query(
    `
      INSERT INTO restaurant_tables (table_number, qr_token, qr_code_data, status, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
    [
      tableNumber,
      qrToken,
      qrCodeData,
      safeStatus,
      safeStatus !== 'inactive',
    ]
  );

  return findTableById(result.rows[0].id);
}

export async function updateTable(id, { tableNumber, status }) {
  const existingTable = await findTableById(id);

  if (!existingTable) {
    return null;
  }

  const safeStatus = normalizeStatus(status, existingTable.status);
  const nextTableNumber = tableNumber ?? existingTable.table_number;
  const qrCodeData = buildTableMenuPath(nextTableNumber, existingTable.qr_token);

  const result = await query(
    `
      UPDATE restaurant_tables
      SET table_number = $1,
          status = $2,
          is_active = $3,
          qr_code_data = $4
      WHERE id = $5
        AND (
          (
            $2 = 'occupied'
            AND EXISTS (
              SELECT 1 FROM orders
              WHERE table_id = $5
                AND status = ANY($6::TEXT[])
            )
          )
          OR (
            $2 IN ('available', 'inactive')
            AND NOT EXISTS (
              SELECT 1 FROM orders
              WHERE table_id = $5
                AND status = ANY($6::TEXT[])
            )
          )
        )
      RETURNING id
    `,
    [
      nextTableNumber,
      safeStatus,
      safeStatus !== 'inactive',
      qrCodeData,
      id,
      ['new', 'accepted', 'preparing', 'ready'],
    ]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return findTableById(id);
}

export async function deactivateTable(id) {
  const result = await query(
    `
      UPDATE restaurant_tables
      SET is_active = FALSE,
          status = 'inactive'
      WHERE id = $1
        AND NOT EXISTS (
          SELECT 1 FROM orders
          WHERE table_id = $1
            AND status = ANY($2::TEXT[])
        )
      RETURNING id
    `,
    [id, ['new', 'accepted', 'preparing', 'ready']]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return findTableById(id);
}

export async function updateTableStatus(id, status) {
  const safeStatus = normalizeStatus(status);
  const result = await query(
    `
      UPDATE restaurant_tables
      SET status = $1,
          is_active = $2
      WHERE id = $3
        AND (
          (
            $1 = 'occupied'
            AND EXISTS (
              SELECT 1 FROM orders
              WHERE table_id = $3
                AND status = ANY($4::TEXT[])
            )
          )
          OR (
            $1 IN ('available', 'inactive')
            AND NOT EXISTS (
              SELECT 1 FROM orders
              WHERE table_id = $3
                AND status = ANY($4::TEXT[])
            )
          )
        )
      RETURNING id
    `,
    [
      safeStatus,
      safeStatus !== 'inactive',
      id,
      ['new', 'accepted', 'preparing', 'ready'],
    ]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return findTableById(id);
}

export async function tableHasActiveOrders(id) {
  const result = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM orders
       WHERE table_id = $1
         AND status = ANY($2::TEXT[])
     ) AS has_active_orders`,
    [id, ['new', 'accepted', 'preparing', 'ready']]
  );

  return result.rows[0].has_active_orders;
}

export async function reactivateTable(id) {
  const result = await query(
    `UPDATE restaurant_tables
     SET is_active = TRUE,
         status = CASE
           WHEN EXISTS (
             SELECT 1
             FROM orders
             WHERE table_id = $1
               AND status = ANY($2::TEXT[])
           ) THEN 'occupied'
           ELSE 'available'
         END
     WHERE id = $1
       AND is_active = FALSE
     RETURNING id`,
    [id, ['new', 'accepted', 'preparing', 'ready']]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return findTableById(id);
}

export async function replaceTableQrToken(id) {
  const existingTable = await findTableById(id);

  if (!existingTable) {
    return null;
  }

  const qrToken = await buildUniqueQrToken();
  const qrCodeData = buildTableMenuPath(existingTable.table_number, qrToken);
  const result = await query(
    `
      UPDATE restaurant_tables
      SET qr_token = $1,
          qr_code_data = $2
      WHERE id = $3
      RETURNING id
    `,
    [qrToken, qrCodeData, id]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return findTableById(id);
}
