import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from '../config/db.js';

const genuineTableNumbers = Object.freeze(['T01', 'T02', 'T03', 'T04', 'T05']);
const activeOrderStatuses = Object.freeze(['new', 'accepted', 'preparing', 'ready']);
const automatedTablePattern = /^(?:(?:TM|API|QR|BT)\d+E?|F10[12]\d+E?)$/;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backupDirectory = path.join(scriptDirectory, 'backups');

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function timestampForFilename() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

async function inspectCandidates(client) {
  const result = await client.query(
    `SELECT id, table_number, status, is_active, qr_token, qr_code_data
     FROM restaurant_tables
     ORDER BY id`
  );
  const genuineTables = result.rows.filter((table) =>
    genuineTableNumbers.includes(table.table_number)
  );

  if (genuineTables.length !== genuineTableNumbers.length) {
    throw new Error('Expected genuine restaurant tables T01-T05 were not all found.');
  }

  return {
    genuineTables,
    testTables: result.rows.filter((table) => automatedTablePattern.test(table.table_number)),
  };
}

async function applyArchive() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const candidates = await inspectCandidates(client);
    const testTableIds = candidates.testTables.map((table) => table.id);
    const snapshot = {
      createdAt: new Date().toISOString(),
      purpose: 'Pre-change state for automated table archival and T01-T05 status reconciliation',
      genuineTables: candidates.genuineTables.map((table) => ({
        id: table.id,
        tableNumber: table.table_number,
        status: table.status,
        isActive: table.is_active,
        qrTokenSha256: hashValue(table.qr_token),
        qrCodeDataSha256: hashValue(table.qr_code_data),
      })),
      testTables: candidates.testTables.map((table) => ({
        id: table.id,
        tableNumber: table.table_number,
        status: table.status,
        isActive: table.is_active,
      })),
    };

    await fs.mkdir(backupDirectory, { recursive: true });
    const backupPath = path.join(
      backupDirectory,
      `table-test-data-before-archive-${timestampForFilename()}.json`
    );
    await fs.writeFile(backupPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

    const archivedResult = testTableIds.length
      ? await client.query(
          `UPDATE restaurant_tables
           SET is_active = FALSE,
               status = 'inactive'
           WHERE id = ANY($1::INTEGER[])
           RETURNING id, table_number`,
          [testTableIds]
        )
      : { rows: [] };

    const genuineResult = await client.query(
      `UPDATE restaurant_tables AS table_record
       SET is_active = TRUE,
           status = CASE
             WHEN EXISTS (
               SELECT 1
               FROM orders
               WHERE orders.table_id = table_record.id
                 AND orders.status = ANY($2::TEXT[])
             ) THEN 'occupied'
             ELSE 'available'
           END
       WHERE table_record.table_number = ANY($1::TEXT[])
       RETURNING id, table_number, status`,
      [genuineTableNumbers, activeOrderStatuses]
    );

    await client.query('COMMIT');

    console.log('Automated table test data archived successfully.');
    console.log(`Backup: ${backupPath}`);
    console.log(`Test tables matched and archived: ${archivedResult.rows.length}`);
    console.table(genuineResult.rows);
    console.log('QR tokens, QR URLs, table IDs and relationships were not updated.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function previewArchive() {
  const client = await pool.connect();

  try {
    const candidates = await inspectCandidates(client);
    console.log('Dry run only. No database records were changed.');
    console.log(`Automated test tables matched: ${candidates.testTables.length}`);
    console.table(
      candidates.genuineTables.map(({ id, table_number, status, is_active }) => ({
        id,
        tableNumber: table_number,
        status,
        isActive: is_active,
      }))
    );
    console.log('Run with --apply to create a backup, archive test tables and reconcile T01-T05.');
  } finally {
    client.release();
  }
}

const shouldApply = process.argv.includes('--apply');

(shouldApply ? applyArchive() : previewArchive())
  .catch((error) => {
    console.error('Table test-data archival failed. No partial changes were committed.');
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
