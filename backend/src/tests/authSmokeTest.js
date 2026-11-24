import jwt from 'jsonwebtoken';
import { closePool, query } from '../config/db.js';
import { env } from '../config/env.js';

const apiBaseUrl = `http://localhost:${env.port}/api`;
const adminEmail = 'auth.admin@example.com';
const kitchenEmail = 'auth.kitchen@example.com';
const sharedPassword = 'StrongPassword123';

const results = [];

function record(name, passed, detail = '') {
  results.push({
    test: name,
    status: passed ? 'PASS' : 'FAIL',
    detail,
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { response, body };
}

async function login(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function runAuthTests() {
  const adminLogin = await login(adminEmail, sharedPassword);
  const adminToken = adminLogin.body?.data?.token;
  const adminUser = adminLogin.body?.data?.user;
  record(
    'successful admin login',
    adminLogin.response.status === 200 && Boolean(adminToken) && adminUser?.role === 'admin',
    `HTTP ${adminLogin.response.status}`
  );

  const badLogin = await login(adminEmail, 'WrongPassword123');
  record(
    'incorrect credentials rejected',
    badLogin.response.status === 401,
    `HTTP ${badLogin.response.status}`
  );

  const me = await request('/auth/me', {
    headers: bearer(adminToken),
  });
  record(
    'JWT authentication /me',
    me.response.status === 200 && me.body?.data?.user?.email === adminEmail,
    `HTTP ${me.response.status}`
  );

  const logout = await request('/auth/logout', {
    method: 'POST',
    headers: bearer(adminToken),
  });
  record(
    'stateless logout endpoint',
    logout.response.status === 200,
    `HTTP ${logout.response.status}`
  );

  const staffEmail = `registered.waiter.${Date.now()}@example.com`;
  const staffPassword = 'Registered123';
  const registration = await request('/auth/register', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: 'Registered Waiter',
      email: staffEmail,
      password: staffPassword,
      role: 'waiter',
    }),
  });
  record(
    'admin-only staff registration',
    registration.response.status === 201 && registration.body?.data?.user?.role === 'waiter',
    `HTTP ${registration.response.status}`
  );

  const registeredUserResult = await query(
    'SELECT password_hash FROM users WHERE email = $1 LIMIT 1',
    [staffEmail]
  );
  const storedHash = registeredUserResult.rows[0]?.password_hash;
  record(
    'registered password stored as bcrypt hash',
    Boolean(storedHash) && storedHash !== staffPassword && storedHash.startsWith('$2'),
    storedHash ? 'bcrypt hash found' : 'hash missing'
  );

  const waiterLogin = await login(staffEmail, staffPassword);
  const waiterToken = waiterLogin.body?.data?.token;
  record(
    'registered waiter login',
    waiterLogin.response.status === 200 && Boolean(waiterToken),
    `HTTP ${waiterLogin.response.status}`
  );

  const kitchenLogin = await login(kitchenEmail, sharedPassword);
  const kitchenToken = kitchenLogin.body?.data?.token;
  record(
    'successful kitchen login',
    kitchenLogin.response.status === 200 && kitchenLogin.body?.data?.user?.role === 'kitchen',
    `HTTP ${kitchenLogin.response.status}`
  );

  const adminOnly = await request('/auth/admin-only', {
    headers: bearer(adminToken),
  });
  record(
    'admin route allows admin',
    adminOnly.response.status === 200,
    `HTTP ${adminOnly.response.status}`
  );

  const kitchenOnly = await request('/auth/kitchen-only', {
    headers: bearer(kitchenToken),
  });
  record(
    'kitchen route allows kitchen staff',
    kitchenOnly.response.status === 200,
    `HTTP ${kitchenOnly.response.status}`
  );

  const waiterOnly = await request('/auth/waiter-only', {
    headers: bearer(waiterToken),
  });
  record(
    'waiter route allows waiter',
    waiterOnly.response.status === 200,
    `HTTP ${waiterOnly.response.status}`
  );

  const unauthorizedRole = await request('/auth/admin-only', {
    headers: bearer(kitchenToken),
  });
  record(
    'unauthorized role access rejected',
    unauthorizedRole.response.status === 403,
    `HTTP ${unauthorizedRole.response.status}`
  );

  const expiredToken = jwt.sign(
    { sub: adminUser.id, role: 'admin' },
    env.jwtSecret,
    { expiresIn: '-1s' }
  );
  const expiredTokenRequest = await request('/auth/me', {
    headers: bearer(expiredToken),
  });
  record(
    'expired token rejected',
    expiredTokenRequest.response.status === 401 &&
      expiredTokenRequest.body?.message?.toLowerCase().includes('expired'),
    `HTTP ${expiredTokenRequest.response.status}`
  );
}

runAuthTests()
  .catch((error) => {
    record('auth smoke test runner', false, error.message);
  })
  .finally(async () => {
    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');
    await closePool();

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });
