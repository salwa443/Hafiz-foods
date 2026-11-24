import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from '../config/db.js';

const genuineMenuItemIds = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 239]);
const testItemPattern = /^(Smoke Burger|Image Upload Item|Browser Menu Item|FR11 Integration Item) \d{13}(?: Updated)?$/;
const testCategoryPattern = /^(Smoke Category|Category Smoke|Image Upload Category|Browser Menu Category|Browser Category|FR11 Integration Category|FR11 Menu Item Category) \d{13}(?: Updated)?$/;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backupDirectory = path.join(scriptDirectory, 'backups');

function timestampForFilename() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

async function inspectCandidates(client) {
  const [menuResult, categoryResult] = await Promise.all([
    client.query(`
      SELECT id, category_id, name, is_active, is_available
      FROM menu_items
      ORDER BY id
    `),
    client.query(`
      SELECT id, name, is_active
      FROM categories
      ORDER BY id
    `),
  ]);

  const menuItems = menuResult.rows.filter(
    (item) => !genuineMenuItemIds.has(item.id) && testItemPattern.test(item.name)
  );
  const categories = categoryResult.rows.filter((category) => testCategoryPattern.test(category.name));
  const grilledBurger = menuResult.rows.find((item) => item.id === 239);

  if (!grilledBurger || grilledBurger.name !== 'Grilled Burgur') {
    throw new Error('Preserved Grilled Burgur record (id 239) was not found as expected.');
  }

  return { categories, grilledBurger, menuItems };
}

async function applyArchive() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const candidates = await inspectCandidates(client);
    const itemIds = candidates.menuItems.map((item) => item.id);
    const categoryIds = candidates.categories.map((category) => category.id);

    const burgersResult = await client.query(
      'SELECT id FROM categories WHERE name = $1 AND is_active = TRUE LIMIT 1',
      ['Burgers']
    );
    const burgersCategoryId = burgersResult.rows[0]?.id;

    if (!burgersCategoryId) {
      throw new Error('The active Burgers category required for Grilled Burgur was not found.');
    }

    const snapshot = {
      createdAt: new Date().toISOString(),
      purpose: 'Pre-change snapshot for automated menu test-data archival',
      preservedItemIds: [...genuineMenuItemIds],
      previousGrilledBurgerCategoryId: candidates.grilledBurger.category_id,
      menuItems: candidates.menuItems,
      categories: candidates.categories,
    };

    await fs.mkdir(backupDirectory, { recursive: true });
    const backupPath = path.join(
      backupDirectory,
      `menu-test-data-before-archive-${timestampForFilename()}.json`
    );
    await fs.writeFile(backupPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

    await client.query(
      'UPDATE menu_items SET category_id = $1 WHERE id = $2',
      [burgersCategoryId, 239]
    );

    const archivedItems = itemIds.length
      ? await client.query(
          `UPDATE menu_items
           SET is_active = FALSE,
               is_available = FALSE
           WHERE id = ANY($1::INTEGER[])
           RETURNING id, name`,
          [itemIds]
        )
      : { rows: [] };

    const archivedCategories = categoryIds.length
      ? await client.query(
          `UPDATE categories
           SET is_active = FALSE
           WHERE id = ANY($1::INTEGER[])
             AND NOT EXISTS (
               SELECT 1
               FROM menu_items
               WHERE menu_items.category_id = categories.id
                 AND menu_items.is_active = TRUE
             )
           RETURNING id, name`,
          [categoryIds]
        )
      : { rows: [] };

    await client.query('COMMIT');

    console.log('Automated menu test data archived successfully.');
    console.log(`Backup: ${backupPath}`);
    console.log(`Menu items matched and archived: ${archivedItems.rows.length}`);
    console.log(`Test categories safely archived: ${archivedCategories.rows.length}`);
    console.log('Preserved menu items: 1-10 and Grilled Burgur (239).');
    console.log(`Grilled Burgur category moved to Burgers (${burgersCategoryId}).`);
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
    console.log(`Automated menu items matched: ${candidates.menuItems.length}`);
    console.log(`Automated categories matched: ${candidates.categories.length}`);
    console.log('Run with --apply to create a backup and archive these records.');
  } finally {
    client.release();
  }
}

const shouldApply = process.argv.includes('--apply');

(shouldApply ? applyArchive() : previewArchive())
  .catch((error) => {
    console.error('Menu test-data archival failed. No partial changes were committed.');
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
