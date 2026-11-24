import { query } from '../config/db.js';

export async function getCategorySummary() {
  const result = await query(`
    SELECT
      COUNT(*)::INTEGER AS total_categories,
      COUNT(*) FILTER (WHERE is_active = TRUE)::INTEGER AS active_categories
    FROM categories
  `);

  return result.rows[0];
}

export async function getAllCategories({ includeInactive = true } = {}) {
  const result = await query(
    `
      SELECT id, name, description, display_order, is_active, created_at, updated_at
      FROM categories
      WHERE ($1::BOOLEAN = TRUE OR is_active = TRUE)
      ORDER BY display_order ASC, name ASC
    `,
    [includeInactive]
  );

  return result.rows;
}

export async function findCategoryById(id) {
  const result = await query(
    `
      SELECT id, name, description, display_order, is_active, created_at, updated_at
      FROM categories
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function createCategory({ name, description, displayOrder }) {
  const result = await query(
    `
      INSERT INTO categories (name, description, display_order)
      VALUES ($1, $2, $3)
      RETURNING id, name, description, display_order, is_active, created_at, updated_at
    `,
    [name, description || null, displayOrder ?? 0]
  );

  return result.rows[0];
}

export async function updateCategory(id, { name, description, displayOrder }) {
  const result = await query(
    `
      UPDATE categories
      SET name = $1,
          description = $2,
          display_order = $3
      WHERE id = $4
      RETURNING id, name, description, display_order, is_active, created_at, updated_at
    `,
    [name, description || null, displayOrder ?? 0, id]
  );

  return result.rows[0] || null;
}

export async function deactivateCategory(id) {
  const result = await query(
    `
      UPDATE categories
      SET is_active = FALSE
      WHERE id = $1
      RETURNING id, name, description, display_order, is_active, created_at, updated_at
    `,
    [id]
  );

  return result.rows[0] || null;
}
