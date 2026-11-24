import { closePool, pool } from '../config/db.js';

const categories = [
  ['BBQ', 'Chargrilled Pakistani barbecue served hot from the grill.', 5, [
    ['Chicken Tikka', 'Spiced chicken tikka, charcoal grilled and served with chutney.', 780, '/assets/menu/bbq-chicken-tikka.jpg'],
    ['Beef Seekh Kebab', 'Juicy minced beef kebabs seasoned with herbs and traditional spices.', 850, '/assets/menu/beef-seekh-kebab.png'],
  ]],
  ['Fries & Sides', 'Crispy sides and shareable snacks for every meal.', 6, [
    ['Classic French Fries', 'Golden crispy fries lightly seasoned with salt.', 300, '/assets/menu/fries-and-sides.jpg'],
    ['Loaded Cheese Fries', 'Crispy fries topped with cheese sauce, jalapeños and house dressing.', 550, '/assets/menu/loaded-cheese-fries.png'],
  ]],
  ['Sandwiches', 'Freshly assembled sandwiches with generous fillings.', 7, [
    ['Club Sandwich', 'Triple-layer chicken, egg and vegetable sandwich served with sauce.', 720, '/assets/menu/club-sandwich.jpg'],
    ['Grilled Chicken Sandwich', 'Grilled chicken, cheese, lettuce and garlic mayo on toasted bread.', 680, '/assets/menu/grilled-chicken-sandwich.png'],
  ]],
  ['Shawarma & Rolls', 'Warm wraps and rolls filled with seasoned chicken and fresh sauces.', 8, [
    ['Chicken Shawarma', 'Seasoned chicken, vegetables and garlic sauce wrapped in pita.', 480, '/assets/menu/shawarma-roll.jpg'],
    ['Chicken Paratha Roll', 'Spiced chicken, onions and chutney rolled in a flaky paratha.', 450, '/assets/menu/chicken-paratha-roll.png'],
  ]],
  ['Pakistani Food', 'Comforting Pakistani favourites prepared with traditional spices.', 9, [
    ['Chicken Biryani', 'Aromatic basmati rice layered with spiced chicken and herbs.', 520, '/assets/menu/chicken-biryani.jpg'],
    ['Chicken Karahi', 'Traditional tomato-based chicken karahi finished with ginger and chillies.', 1450, '/assets/menu/chicken-karahi.png'],
  ]],
  ['Pasta', 'Satisfying pasta dishes cooked in rich, flavourful sauces.', 10, [
    ['Chicken Alfredo Pasta', 'Creamy Alfredo pasta with grilled chicken and parmesan.', 950, '/assets/menu/creamy-pasta.jpg'],
    ['Spicy Arrabbiata Pasta', 'Penne tossed in a spicy tomato, garlic and herb sauce.', 820, '/assets/menu/spicy-arrabbiata-pasta.png'],
  ]],
  ['Deals & Combos', 'Value meals combining popular Hafiz Foods favourites.', 11, [
    ['Burger Meal Combo', 'Classic beef burger with regular fries and a soft drink.', 1190, '/assets/menu/burger-combo.jpg'],
    ['Family Pizza Deal', 'One large chicken fajita pizza, garlic bread and a large soft drink.', 2490, '/assets/menu/family-pizza-deal.png'],
  ]],
  ['Extra Toppings & Add-ons', 'Optional extras to personalise an eligible menu item.', 12, [
    ['Extra Cheese Slice', 'Add one extra cheese slice to an eligible burger or sandwich.', 120, '/assets/menu/extra-cheese-slice.png'],
    ['Extra Garlic Mayo', 'A separate serving of creamy garlic mayonnaise.', 80, '/assets/menu/extra-garlic-mayo.png'],
    ['Jalapeño Add-on', 'A separate serving of sliced jalapeños.', 100, '/assets/menu/jalapeno-addon.png'],
  ]],
];

async function seedExpandedMenu() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let itemCount = 0;
    for (const [name, description, displayOrder, items] of categories) {
      const categoryResult = await client.query(
        `INSERT INTO categories (name, description, display_order, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (name) DO UPDATE SET
           description = EXCLUDED.description,
           display_order = EXCLUDED.display_order,
           is_active = TRUE
         RETURNING id`,
        [name, description, displayOrder]
      );
      const categoryId = categoryResult.rows[0].id;
      for (const [itemName, itemDescription, price, imageUrl] of items) {
        await client.query(
          `INSERT INTO menu_items
             (category_id, name, description, price, image_url, is_available, is_active)
           VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
           ON CONFLICT (category_id, name) DO UPDATE SET
             description = EXCLUDED.description,
             price = EXCLUDED.price,
             image_url = EXCLUDED.image_url,
             is_available = TRUE,
             is_active = TRUE`,
          [categoryId, itemName, itemDescription, price, imageUrl]
        );
        itemCount += 1;
      }
    }

    await client.query(
      `UPDATE menu_items
       SET image_url = $1
       WHERE name = $2
         AND is_active = TRUE`,
      ['/assets/menu/grilled-burger.png', 'Grilled Burgur']
    );
    await client.query('COMMIT');
    console.log(`Hafiz Foods menu categories prepared: ${categories.length}`);
    console.log(`Hafiz Foods menu items prepared: ${itemCount}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seedExpandedMenu()
  .catch((error) => {
    console.error('Expanded Hafiz Foods menu setup failed. No partial changes were committed.');
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
