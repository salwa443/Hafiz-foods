import app from '../app.js';
import { closePool, query } from '../config/db.js';

const request = (baseUrl, path, options = {}) => fetch(`${baseUrl}${path}`, options);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const cleanup = async (names) => {
  await query(
    'DELETE FROM menu_items WHERE name = ANY($1::text[])',
    [names.items]
  );
  await query(
    'DELETE FROM categories WHERE name = ANY($1::text[])',
    [names.categories]
  );
};

const run = async () => {
  const timestamp = Date.now();
  const names = {
    categories: [
      `FR03_SMOKE_ACTIVE_${timestamp}`,
      `FR03_SMOKE_INACTIVE_${timestamp}`,
      `FR03_SMOKE_EMPTY_${timestamp}`,
    ],
    items: [
      `FR03_SMOKE_VISIBLE_${timestamp}`,
      `FR03_SMOKE_INACTIVE_ITEM_${timestamp}`,
      `FR03_SMOKE_UNAVAILABLE_${timestamp}`,
      `FR03_SMOKE_HIDDEN_CATEGORY_${timestamp}`,
    ],
  };

  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await cleanup(names);

    const activeCategory = await query(
      'INSERT INTO categories (name, display_order, is_active) VALUES ($1, $2, true) RETURNING id',
      [names.categories[0], 901]
    );
    const inactiveCategory = await query(
      'INSERT INTO categories (name, display_order, is_active) VALUES ($1, $2, false) RETURNING id',
      [names.categories[1], 902]
    );
    await query(
      'INSERT INTO categories (name, display_order, is_active) VALUES ($1, $2, true)',
      [names.categories[2], 903]
    );

    const activeCategoryId = activeCategory.rows[0].id;
    const inactiveCategoryId = inactiveCategory.rows[0].id;

    await query(
      `
        INSERT INTO menu_items
          (category_id, name, description, price, image_url, is_available, is_active)
        VALUES
          ($1, $2, $3, $4, $5, true, true),
          ($1, $6, $7, $8, $9, true, false),
          ($1, $10, $11, $12, $13, false, true),
          ($14, $15, $16, $17, $18, true, true)
      `,
      [
        activeCategoryId,
        names.items[0],
        'Visible public menu item',
        10.5,
        '/uploads/menu/fr03-visible.webp',
        names.items[1],
        'Inactive public menu item',
        11.5,
        '/uploads/menu/fr03-inactive.webp',
        names.items[2],
        'Unavailable but visible public menu item',
        12.5,
        '/uploads/menu/fr03-unavailable.webp',
        inactiveCategoryId,
        names.items[3],
        'Hidden because category is inactive',
        13.5,
        '/uploads/menu/fr03-hidden.webp',
      ]
    );

    const categoriesResponse = await request(baseUrl, '/api/public/menu/categories');
    assert(categoriesResponse.status === 200, 'Public categories endpoint should return 200 without JWT.');
    const categoriesBody = await categoriesResponse.json();
    assert(categoriesBody.success === true, 'Public categories response should be successful.');
    assert(
      categoriesBody.data.categories.some((category) => category.name === names.categories[0]),
      'Active category should be returned.'
    );
    assert(
      !categoriesBody.data.categories.some((category) => category.name === names.categories[1]),
      'Inactive category should be excluded.'
    );

    const itemsResponse = await request(baseUrl, '/api/public/menu/items');
    assert(itemsResponse.status === 200, 'Public menu items endpoint should return 200 without JWT.');
    const itemsBody = await itemsResponse.json();
    assert(itemsBody.success === true, 'Public menu items response should be successful.');
    assert(
      itemsBody.data.menuItems.some((item) => item.name === names.items[0]),
      'Active menu item should be returned.'
    );
    assert(
      !itemsBody.data.menuItems.some((item) => item.name === names.items[1]),
      'Inactive menu item should be excluded.'
    );
    assert(
      !itemsBody.data.menuItems.some((item) => item.name === names.items[3]),
      'Item belonging to inactive category should be excluded.'
    );
    assert(
      itemsBody.data.menuItems.some((item) => item.name === names.items[2] && item.is_available === false),
      'Unavailable menu item should remain visible.'
    );

    const searchResponse = await request(
      baseUrl,
      `/api/public/menu/items?search=${encodeURIComponent('VISIBLE')}`
    );
    assert(searchResponse.status === 200, 'Search filter should return 200.');
    const searchBody = await searchResponse.json();
    assert(
      searchBody.data.menuItems.some((item) => item.name === names.items[0]),
      'Search by item name should find matching items.'
    );

    const categoryResponse = await request(
      baseUrl,
      `/api/public/menu/items?categoryId=${activeCategoryId}`
    );
    assert(categoryResponse.status === 200, 'Category filter should return 200.');
    const categoryBody = await categoryResponse.json();
    assert(
      categoryBody.data.menuItems.every((item) => item.category_id === activeCategoryId),
      'Category filter should only return items from the selected category.'
    );

    const combinedResponse = await request(
      baseUrl,
      `/api/public/menu/items?categoryId=${activeCategoryId}&search=${encodeURIComponent(names.items[2])}`
    );
    assert(combinedResponse.status === 200, 'Combined filters should return 200.');
    const combinedBody = await combinedResponse.json();
    assert(
      combinedBody.data.menuItems.length === 1 && combinedBody.data.menuItems[0].name === names.items[2],
      'Combined search and category filters should narrow results correctly.'
    );

    const invalidCategoryResponse = await request(baseUrl, '/api/public/menu/items?categoryId=abc');
    assert(invalidCategoryResponse.status === 400, 'Invalid categoryId should be rejected.');

    const longSearchResponse = await request(
      baseUrl,
      `/api/public/menu/items?search=${'a'.repeat(101)}`
    );
    assert(longSearchResponse.status === 400, 'Excessively long search should be rejected.');

    const emptyResponse = await request(
      baseUrl,
      `/api/public/menu/items?search=${encodeURIComponent(`NO_MATCH_${timestamp}`)}`
    );
    assert(emptyResponse.status === 200, 'Empty menu search results should return 200.');
    const emptyBody = await emptyResponse.json();
    assert(
      Array.isArray(emptyBody.data.menuItems) && emptyBody.data.menuItems.length === 0,
      'Empty results should return an empty array.'
    );

    const adminResponse = await request(baseUrl, '/api/admin/menu-items');
    assert([401, 403].includes(adminResponse.status), 'Existing admin menu APIs should remain protected.');

    console.log('FR-03 public menu smoke tests passed: 14/14');
  } finally {
    await cleanup(names);
    await new Promise((resolve) => server.close(resolve));

    await closePool();
  }
};

run().catch((error) => {
  console.error('FR-03 public menu smoke tests failed.');
  console.error(error);
  process.exit(1);
});
