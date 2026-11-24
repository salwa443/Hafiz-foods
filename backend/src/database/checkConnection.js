import { closePool, pool } from '../config/db.js';

async function checkConnection() {
  const result = await pool.query(`
    SELECT
      CURRENT_DATABASE() AS database,
      CURRENT_USER AS database_user,
      NOW() AS checked_at
  `);

  console.log('PostgreSQL connection successful.');
  console.table(result.rows);
}

checkConnection()
  .catch((error) => {
    console.error('PostgreSQL connection failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
