import bcrypt from 'bcrypt';
import { closePool, query } from '../config/db.js';
import { createStaffUser, findUserByEmail } from '../models/userModel.js';

const [name, email, password] = process.argv.slice(2);

async function ensureRoles() {
  await query(
    `
      INSERT INTO roles (name, description)
      VALUES
        ('admin', 'System administrator who manages tables, QR codes, menu, orders and reports.'),
        ('kitchen', 'Kitchen staff member who receives and processes food orders.'),
        ('waiter', 'Waiter who receives and handles customer table requests.')
      ON CONFLICT (name) DO NOTHING
    `
  );
}

async function createInitialAdmin() {
  if (!name || !email || !password) {
    throw new Error(
      'Usage: node src/database/createInitialAdmin.js "Admin Name" admin@example.com "StrongPassword123"'
    );
  }

  if (password.length < 8) {
    throw new Error('Admin password must be at least 8 characters long.');
  }

  await ensureRoles();

  const existingUser = await findUserByEmail(email.toLowerCase());

  if (existingUser) {
    throw new Error('A user with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await createStaffUser({
    name,
    email: email.toLowerCase(),
    passwordHash,
    roleName: 'admin',
  });

  console.log('Initial admin account created successfully.');
  console.table([{ id: admin.id, name: admin.name, email: admin.email }]);
}

createInitialAdmin()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
