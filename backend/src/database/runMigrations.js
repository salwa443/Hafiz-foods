import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { closePool, pool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function hasMigrationRun(filename) {
  const result = await pool.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1',
    [filename]
  );

  return result.rowCount > 0;
}

async function runMigration(filename) {
  const filePath = path.join(migrationsDir, filename);
  const sql = await fs.readFile(filePath, 'utf8');

  await pool.query(sql);
  await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
  console.log(`Applied migration: ${filename}`);
}

async function runMigrations() {
  await ensureMigrationsTable();

  const files = await fs.readdir(migrationsDir);
  const migrationFiles = files
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const filename of migrationFiles) {
    const alreadyRun = await hasMigrationRun(filename);

    if (alreadyRun) {
      console.log(`Skipped migration: ${filename}`);
      continue;
    }

    await runMigration(filename);
  }

  console.log('Database migrations completed.');
}

runMigrations()
  .catch((error) => {
    console.error('Database migration failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
