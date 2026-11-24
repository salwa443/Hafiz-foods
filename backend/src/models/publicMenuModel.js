import { query } from '../config/db.js';

export async function getPublicCategories() {
  const result = await query(`
    SELECT
      id,
      name,
      description,
      display_order
    FROM categories
    WHERE is_active = TRUE
    ORDER BY display_order ASC, name ASC
  `);

  return result.rows;
}

export async function getPublicMenuItems({ search, categoryId } = {}) {
  const conditions = ['menu_items.is_active = TRUE', 'categories.is_active = TRUE'];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`menu_items.name ILIKE $${params.length}`);
  }

  if (categoryId) {
    params.push(categoryId);
    conditions.push(`menu_items.category_id = $${params.length}`);
  }

  const result = await query(
    `
      SELECT
        menu_items.id,
        menu_items.category_id,
        categories.name AS category_name,
        menu_items.name,
        menu_items.description,
        menu_items.price,
        menu_items.image_url,
        menu_items.is_available
      FROM menu_items
      INNER JOIN categories ON categories.id = menu_items.category_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY categories.display_order ASC, categories.name ASC, menu_items.name ASC
    `,
    params
  );

  return result.rows;
}
