import { query } from '../config/db.js';

export async function getMenuItemSummary() {
  const result = await query(`
    SELECT
      COUNT(*)::INTEGER AS total_menu_items,
      COUNT(*) FILTER (WHERE is_active = TRUE)::INTEGER AS active_menu_items,
      COUNT(*) FILTER (WHERE is_active = TRUE AND is_available = TRUE)::INTEGER AS available_menu_items,
      COUNT(*) FILTER (WHERE is_active = TRUE AND is_available = FALSE)::INTEGER AS unavailable_menu_items
    FROM menu_items
  `);

  return result.rows[0];
}

export async function getAllMenuItems({ includeInactive = false } = {}) {
  const result = await query(
    `
      SELECT
        menu_items.id,
        menu_items.category_id,
        categories.name AS category_name,
        categories.is_active AS category_is_active,
        menu_items.name,
        menu_items.description,
        menu_items.price,
        menu_items.image_url,
        menu_items.is_available,
        menu_items.is_active,
        menu_items.created_at,
        menu_items.updated_at
      FROM menu_items
      INNER JOIN categories ON categories.id = menu_items.category_id
      WHERE ($1::BOOLEAN = TRUE OR menu_items.is_active = TRUE)
      ORDER BY categories.display_order ASC, menu_items.name ASC
    `,
    [includeInactive]
  );

  return result.rows;
}

export async function findMenuItemById(id) {
  const result = await query(
    `
      SELECT
        menu_items.id,
        menu_items.category_id,
        categories.name AS category_name,
        categories.is_active AS category_is_active,
        menu_items.name,
        menu_items.description,
        menu_items.price,
        menu_items.image_url,
        menu_items.is_available,
        menu_items.is_active,
        menu_items.created_at,
        menu_items.updated_at
      FROM menu_items
      INNER JOIN categories ON categories.id = menu_items.category_id
      WHERE menu_items.id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function createMenuItem({
  categoryId,
  name,
  description,
  price,
  imageUrl,
  isAvailable,
}) {
  const result = await query(
    `
      INSERT INTO menu_items (
        category_id,
        name,
        description,
        price,
        image_url,
        is_available
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
    [
      categoryId,
      name,
      description || null,
      price,
      imageUrl || null,
      isAvailable ?? true,
    ]
  );

  return findMenuItemById(result.rows[0].id);
}

export async function updateMenuItem(
  id,
  { categoryId, name, description, price, imageUrl, isAvailable }
) {
  const result = await query(
    `
      UPDATE menu_items
      SET category_id = $1,
          name = $2,
          description = $3,
          price = $4,
          image_url = COALESCE($5, image_url),
          is_available = $6
      WHERE id = $7
      RETURNING id
    `,
    [
      categoryId,
      name,
      description || null,
      price,
      imageUrl || null,
      isAvailable ?? true,
      id,
    ]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return findMenuItemById(id);
}

export async function setMenuItemAvailability(id, isAvailable) {
  const result = await query(
    `
      UPDATE menu_items
      SET is_available = $1
      WHERE id = $2
      RETURNING id
    `,
    [isAvailable, id]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return findMenuItemById(id);
}

export async function deactivateMenuItem(id) {
  const result = await query(
    `
      UPDATE menu_items
      SET is_active = FALSE
      WHERE id = $1
      RETURNING id
    `,
    [id]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return findMenuItemById(id);
}
