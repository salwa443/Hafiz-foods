import bcrypt from 'bcrypt';
import { closePool, query } from '../config/db.js';
import { createStaffUser, findUserByEmail } from '../models/userModel.js';

const [roleName, name, email, password] = process.argv.slice(2);
const allowedRoles = ['admin', 'kitchen', 'waiter'];

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

async function createStaff() {
  if (!roleName || !name || !email || !password) {
    throw new Error(
      'Usage: node src/database/createStaffUser.js admin "Admin User" admin@example.com "StrongPassword123"'
    );
  }

  if (!allowedRoles.includes(roleName)) {
    throw new Error('Role must be one of: admin, kitchen, waiter.');
  }

  if (password.length < 8) {
    throw new Error('Staff password must be at least 8 characters long.');
  }

  await ensureRoles();

  const existingUser = await findUserByEmail(email.toLowerCase());

  if (existingUser) {
    throw new Error('A user with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const staffUser = await createStaffUser({
    name,
    email: email.toLowerCase(),
    passwordHash,
    roleName,
  });

  console.log('Staff account created successfully.');
  console.table([
    {
      id: staffUser.id,
      name: staffUser.name,
      email: staffUser.email,
      role: roleName,
    },
  ]);
}

createStaff()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
