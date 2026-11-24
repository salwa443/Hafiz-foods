import { closePool, query } from '../config/db.js';

const TEST_PREFIXES = ['API', 'QR', 'BT', 'TM', 'F101', 'F102'];
const REAL_TABLES = ['T01', 'T02', 'T03', 'T04', 'T05'];

function hasTestPrefix(tableNumber) {
  return TEST_PREFIXES.some((prefix) => tableNumber.startsWith(prefix));
}

async function main() {
  const candidates = await query(
    `
      SELECT id, table_number, status, is_active
      FROM restaurant_tables
      WHERE (
        table_number LIKE 'API%'
        OR table_number LIKE 'QR%'
        OR table_number LIKE 'BT%'
        OR table_number LIKE 'TM%'
        OR table_number LIKE 'F101%'
        OR table_number LIKE 'F102%'
      )
      ORDER BY id
    `
  );

  const unsafeMatches = candidates.rows.filter(
    (table) =>
      REAL_TABLES.includes(table.table_number) ||
      !hasTestPrefix(table.table_number)
  );

  if (unsafeMatches.length > 0) {
    throw new Error(
      `Cleanup stopped because unexpected table records matched: ${unsafeMatches
        .map((table) => table.table_number)
        .join(', ')}`
    );
  }

  const activeCandidates = candidates.rows.filter((table) => table.is_active);

  let cleanedRows = [];
  if (activeCandidates.length > 0) {
    const cleanupResult = await query(
      `
        UPDATE restaurant_tables
        SET is_active = FALSE,
            status = 'inactive',
            updated_at = NOW()
        WHERE id = ANY($1::int[])
          AND table_number <> ALL($2::text[])
        RETURNING id, table_number, status, is_active
      `,
      [
        activeCandidates.map((table) => table.id),
        REAL_TABLES,
      ]
    );

    cleanedRows = cleanupResult.rows;
  }

  const remainingActive = await query(
    `
      SELECT id, table_number, status, is_active
      FROM restaurant_tables
      WHERE is_active = TRUE
        AND (
          table_number LIKE 'API%'
          OR table_number LIKE 'QR%'
          OR table_number LIKE 'BT%'
          OR table_number LIKE 'TM%'
          OR table_number LIKE 'F101%'
          OR table_number LIKE 'F102%'
        )
      ORDER BY id
    `
  );

  const realTables = await query(
    `
      SELECT id, table_number, status, is_active
      FROM restaurant_tables
      WHERE table_number = ANY($1::text[])
      ORDER BY table_number
    `,
    [REAL_TABLES]
  );

  console.log(
    JSON.stringify(
      {
        testPrefixes: TEST_PREFIXES,
        realTablesExcluded: REAL_TABLES,
        matchedTestRecords: candidates.rows,
        deactivatedRecords: cleanedRows,
        remainingActiveTestRecords: remainingActive.rows,
        realTablesAfterCleanup: realTables.rows,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
