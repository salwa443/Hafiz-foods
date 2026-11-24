import { closePool, query } from '../config/db.js';
import { env } from '../config/env.js';

function isClearlyTestTable(tableNumber) {
  return (
    tableNumber.startsWith('API') ||
    tableNumber.startsWith('BT') ||
    tableNumber.startsWith('QR') ||
    tableNumber.startsWith('F101') ||
    tableNumber.startsWith('F102') ||
    tableNumber.startsWith('TM')
  );
}

async function runVerification() {
  const activeTokenCounts = await query(`
    SELECT
      COUNT(*)::INTEGER AS active_tables,
      COUNT(DISTINCT qr_token)::INTEGER AS unique_active_tokens
    FROM restaurant_tables
    WHERE is_active = TRUE
  `);

  const duplicateActiveTokens = await query(`
    SELECT qr_token, COUNT(*)::INTEGER AS token_count
    FROM restaurant_tables
    WHERE is_active = TRUE
    GROUP BY qr_token
    HAVING COUNT(*) > 1
  `);

  const activeTables = await query(`
    SELECT table_number, qr_code_data, status, is_active
    FROM restaurant_tables
    WHERE is_active = TRUE
    ORDER BY table_number
  `);

  const inactiveTables = await query(`
    SELECT table_number, qr_code_data, status, is_active
    FROM restaurant_tables
    WHERE is_active = FALSE
    ORDER BY updated_at DESC
    LIMIT 12
  `);

  const testRecords = await query(`
    SELECT table_number, status, is_active
    FROM restaurant_tables
    ORDER BY id DESC
    LIMIT 80
  `);

  const identifiableTestRecords = testRecords.rows.filter((row) => (
    isClearlyTestTable(row.table_number)
  ));

  const activeUrlMismatches = activeTables.rows.filter((row) => (
    !row.qr_code_data?.startsWith(`/menu/${row.table_number}/`)
  ));

  console.log(JSON.stringify({
    frontendUrl: env.frontendUrl,
    activeTokenSummary: activeTokenCounts.rows[0],
    duplicateActiveTokens: duplicateActiveTokens.rows,
    activeUrlMismatches,
    inactiveSamples: inactiveTables.rows,
    identifiableTestRecords: identifiableTestRecords.slice(0, 20),
  }, null, 2));
}

runVerification()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
