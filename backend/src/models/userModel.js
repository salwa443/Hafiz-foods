import { query } from '../config/db.js';

export async function findUserByEmail(email) {
  const result = await query(
    `
      SELECT
        users.id,
        users.name,
        users.email,
        users.password_hash,
        users.is_active,
        roles.name AS role
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      WHERE users.email = $1
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await query(
    `
      SELECT
        users.id,
        users.name,
        users.email,
        users.is_active,
        roles.name AS role
      FROM users
      INNER JOIN roles ON roles.id = users.role_id
      WHERE users.id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function createStaffUser({ name, email, passwordHash, roleName }) {
  const result = await query(
    `
      INSERT INTO users (role_id, name, email, password_hash)
      VALUES (
        (SELECT id FROM roles WHERE name = $1),
        $2,
        $3,
        $4
      )
      RETURNING id, name, email
    `,
    [roleName, name, email, passwordHash]
  );

  return result.rows[0];
}
