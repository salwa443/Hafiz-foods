import { closePool, query } from '../config/db.js';
import {
  createTable,
  deactivateTable,
  findTableById,
  getAllTables,
  reactivateTable,
  replaceTableQrToken,
  updateTable,
  updateTableStatus,
} from '../models/tableModel.js';

const results = [];

function record(test, passed, detail = '') {
  results.push({ test, status: passed ? 'PASS' : 'FAIL', detail });
}

async function verifySchema() {
  const columns = await query(
    `
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'restaurant_tables'
      ORDER BY ordinal_position
    `
  );
  const columnNames = columns.rows.map((column) => column.column_name);
  const requiredColumns = [
    'id',
    'table_number',
    'qr_token',
    'qr_code_data',
    'status',
    'is_active',
    'created_at',
    'updated_at',
  ];

  record(
    'restaurant_tables schema has required columns',
    requiredColumns.every((column) => columnNames.includes(column)),
    columnNames.join(', ')
  );

  const constraints = await query(
    `
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'restaurant_tables'::regclass
    `
  );
  const constraintNames = constraints.rows.map((constraint) => constraint.conname);

  record(
    'restaurant_tables has table number uniqueness',
    constraintNames.includes('restaurant_tables_table_number_key')
  );
  record(
    'restaurant_tables has QR token uniqueness',
    constraintNames.includes('restaurant_tables_qr_token_key')
  );
  record(
    'restaurant_tables has status check constraint',
    constraintNames.includes('restaurant_tables_status_check')
  );

  const indexes = await query(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'restaurant_tables'
    `
  );
  const indexNames = indexes.rows.map((index) => index.indexname);

  record(
    'restaurant_tables has QR/status/activity indexes',
    ['idx_restaurant_tables_qr_token', 'idx_restaurant_tables_status', 'idx_restaurant_tables_is_active']
      .every((index) => indexNames.includes(index)),
    indexNames.join(', ')
  );
}

async function runTableModelTests() {
  await verifySchema();

  const existingTables = await getAllTables({ includeInactive: true });
  record('getAllTables returns existing table records', existingTables.length >= 5, `${existingTables.length} tables`);

  const tableNumber = `TM${Date.now().toString().slice(-8)}`;
  const createdTable = await createTable({ tableNumber });
  record(
    'createTable creates table with secure QR token',
    createdTable?.table_number === tableNumber &&
      createdTable.qr_token.length >= 32 &&
      createdTable.qr_code_data === `/menu/${tableNumber}/${createdTable.qr_token}` &&
      createdTable.status === 'available' &&
      createdTable.is_active === true,
    createdTable?.qr_code_data
  );

  const foundTable = await findTableById(createdTable.id);
  record('findTableById returns created table', foundTable?.id === createdTable.id);

  const updatedTableNumber = `${tableNumber}E`;
  const updatedTable = await updateTable(createdTable.id, {
    tableNumber: updatedTableNumber,
    status: 'available',
  });
  record(
    'updateTable updates table number, status and QR path',
    updatedTable?.table_number === updatedTableNumber &&
      updatedTable.status === 'available' &&
      updatedTable.is_active === true &&
      updatedTable.qr_code_data === `/menu/${updatedTableNumber}/${updatedTable.qr_token}`,
    updatedTable?.qr_code_data
  );

  const occupiedWithoutOrder = await updateTableStatus(createdTable.id, 'occupied');
  record(
    'order-free table cannot be marked occupied',
    occupiedWithoutOrder === null
  );

  const availableTable = await updateTableStatus(createdTable.id, 'available');
  record(
    'updateTableStatus updates table status',
    availableTable?.status === 'available' && availableTable.is_active === true
  );

  const previousQrToken = availableTable.qr_token;
  const regeneratedTable = await replaceTableQrToken(createdTable.id);
  record(
    'replaceTableQrToken generates new QR token and path',
    regeneratedTable?.qr_token !== previousQrToken &&
      regeneratedTable.qr_code_data === `/menu/${updatedTableNumber}/${regeneratedTable.qr_token}`,
    regeneratedTable?.qr_code_data
  );

  const duplicateResult = await createTable({ tableNumber: updatedTableNumber })
    .then(() => false)
    .catch((error) => error.code === '23505');
  record('database rejects duplicate table number', duplicateResult);

  const deactivatedTable = await deactivateTable(createdTable.id);
  record(
    'deactivateTable soft deactivates table',
    deactivatedTable?.status === 'inactive' && deactivatedTable.is_active === false
  );

  const reactivatedTable = await reactivateTable(createdTable.id);
  record(
    'reactivateTable restores active available state',
    reactivatedTable?.status === 'available' && reactivatedTable.is_active === true
  );
  record(
    'reactivateTable preserves id and QR mapping',
    reactivatedTable?.id === createdTable.id &&
      reactivatedTable.qr_token === regeneratedTable.qr_token &&
      reactivatedTable.qr_code_data === regeneratedTable.qr_code_data
  );

  await deactivateTable(createdTable.id);

  const activeTables = await getAllTables({ includeInactive: false });
  record(
    'inactive table excluded from active table list',
    !activeTables.some((table) => table.id === createdTable.id)
  );
}

runTableModelTests()
  .catch((error) => {
    record('table model smoke test runner', false, error.message);
  })
  .finally(async () => {
    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');
    await closePool();

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });
