BEGIN;

INSERT INTO roles (name, description)
VALUES
  ('admin', 'System administrator who manages tables, QR codes, menu, orders and reports.'),
  ('kitchen', 'Kitchen staff member who receives and processes food orders.'),
  ('waiter', 'Waiter who receives and handles customer table requests.')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description;

INSERT INTO restaurant_tables (table_number, qr_token, qr_code_data, status)
VALUES
  ('T01', 'table-t01-secure-token', '/menu/table-t01-secure-token', 'available'),
  ('T02', 'table-t02-secure-token', '/menu/table-t02-secure-token', 'available'),
  ('T03', 'table-t03-secure-token', '/menu/table-t03-secure-token', 'available'),
  ('T04', 'table-t04-secure-token', '/menu/table-t04-secure-token', 'available'),
  ('T05', 'table-t05-secure-token', '/menu/table-t05-secure-token', 'available')
ON CONFLICT (table_number) DO UPDATE
SET qr_token = EXCLUDED.qr_token,
    qr_code_data = EXCLUDED.qr_code_data,
    status = EXCLUDED.status;

INSERT INTO categories (name, description, display_order)
VALUES
  ('Burgers', 'Freshly prepared burgers with classic and spicy options.', 1),
  ('Pizza', 'Hand-tossed pizzas with popular toppings.', 2),
  ('Drinks', 'Cold beverages and refreshing drinks.', 3),
  ('Desserts', 'Sweet dishes to finish the meal.', 4)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = TRUE;

INSERT INTO menu_items (category_id, name, description, price, image_url, is_available)
VALUES
  ((SELECT id FROM categories WHERE name = 'Burgers'), 'Classic Beef Burger', 'Beef patty with lettuce, tomato, onion and house sauce.', 850.00, '/assets/menu/classic-beef-burger.jpg', TRUE),
  ((SELECT id FROM categories WHERE name = 'Burgers'), 'Crispy Chicken Burger', 'Crispy chicken fillet with mayo, lettuce and pickles.', 780.00, '/assets/menu/crispy-chicken-burger.jpg', TRUE),
  ((SELECT id FROM categories WHERE name = 'Burgers'), 'Spicy Zinger Burger', 'Spicy fried chicken with cheese and chili garlic sauce.', 820.00, '/assets/menu/spicy-zinger-burger.jpg', TRUE),
  ((SELECT id FROM categories WHERE name = 'Pizza'), 'Margherita Pizza', 'Mozzarella cheese, tomato sauce and basil.', 1150.00, '/assets/menu/margherita-pizza.jpg', TRUE),
  ((SELECT id FROM categories WHERE name = 'Pizza'), 'Chicken Fajita Pizza', 'Chicken fajita topping with peppers, onions and mozzarella.', 1450.00, '/assets/menu/chicken-fajita-pizza.jpg', TRUE),
  ((SELECT id FROM categories WHERE name = 'Pizza'), 'Pepperoni Pizza', 'Pepperoni slices, mozzarella and signature pizza sauce.', 1550.00, '/assets/menu/pepperoni-pizza.jpg', TRUE),
  ((SELECT id FROM categories WHERE name = 'Drinks'), 'Mint Margarita', 'Chilled lemon and mint drink served over ice.', 320.00, '/assets/menu/mint-margarita.jpg', TRUE),
  ((SELECT id FROM categories WHERE name = 'Drinks'), 'Soft Drink', 'Regular chilled carbonated soft drink.', 180.00, '/assets/menu/soft-drink.jpg', TRUE),
  ((SELECT id FROM categories WHERE name = 'Desserts'), 'Chocolate Brownie', 'Warm chocolate brownie with rich cocoa flavor.', 420.00, '/assets/menu/chocolate-brownie.jpg', TRUE),
  ((SELECT id FROM categories WHERE name = 'Desserts'), 'Vanilla Ice Cream', 'Two scoops of vanilla ice cream.', 350.00, '/assets/menu/vanilla-ice-cream.jpg', TRUE)
ON CONFLICT (category_id, name) DO UPDATE
SET description = EXCLUDED.description,
    price = EXCLUDED.price,
    image_url = EXCLUDED.image_url,
    is_available = EXCLUDED.is_available,
    is_active = TRUE;

COMMIT;
