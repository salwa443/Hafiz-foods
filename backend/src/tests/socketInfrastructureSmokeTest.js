import http from 'http';
import jwt from 'jsonwebtoken';
import { io as createSocketClient } from 'socket.io-client';
import app from '../app.js';
import { closePool, query } from '../config/db.js';
import { env } from '../config/env.js';
import { generateToken } from '../services/authService.js';
import {
  KITCHEN_SOCKET_ROOM,
  WAITER_SOCKET_ROOM,
  closeSocketServer,
  initializeSocketServer,
} from '../realtime/socketServer.js';

const results = [];
const suffix = Date.now();
const emails = {
  kitchen: `fr06.socket.kitchen.${suffix}@example.com`,
  admin: `fr06.socket.admin.${suffix}@example.com`,
  waiter: `fr06.socket.waiter.${suffix}@example.com`,
};

function record(test, passed, detail = '') {
  results.push({ test, status: passed ? 'PASS' : 'FAIL', detail });
}

async function createUser(role, email) {
  const result = await query(
    `INSERT INTO users (role_id, name, email, password_hash, is_active)
     VALUES ((SELECT id FROM roles WHERE name = $1), $2, $3, $4, TRUE)
     RETURNING id, name, email, is_active`,
    [role, `FR06 ${role}`, email, 'socket-test-not-a-login-password']
  );

  return { ...result.rows[0], role };
}

async function cleanup() {
  await query('DELETE FROM users WHERE email = ANY($1::TEXT[])', [Object.values(emails)]);
}

function connectSocket(url, token) {
  return createSocketClient(url, {
    auth: token === undefined ? {} : { token },
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
}

function waitForConnection(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket connection timed out.')), 4000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.connect();
  });
}

function waitForRejection(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket rejection timed out.')), 4000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      reject(new Error('Unauthorized socket connected unexpectedly.'));
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      resolve(error);
    });
    socket.connect();
  });
}

const run = async () => {
  const httpServer = http.createServer(app);
  const io = initializeSocketServer(httpServer);
  const clients = [];

  try {
    await cleanup();
    const kitchen = await createUser('kitchen', emails.kitchen);
    const admin = await createUser('admin', emails.admin);
    const waiter = await createUser('waiter', emails.waiter);
    const kitchenToken = generateToken(kitchen);
    const adminToken = generateToken(admin);
    const waiterToken = generateToken(waiter);
    const expiredToken = jwt.sign(
      { sub: kitchen.id, role: 'kitchen' },
      env.jwtSecret,
      { expiresIn: -1 }
    );

    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;

    const kitchenClient = connectSocket(url, kitchenToken);
    clients.push(kitchenClient);
    await waitForConnection(kitchenClient);
    record('valid kitchen JWT connects', kitchenClient.connected);

    const roomMembers = await io.in(KITCHEN_SOCKET_ROOM).fetchSockets();
    record(
      'authorized kitchen socket joins the kitchen room',
      roomMembers.length === 1 && roomMembers[0].data.user?.role === 'kitchen'
    );

    const waiterClient = connectSocket(url, waiterToken);
    clients.push(waiterClient);
    await waitForConnection(waiterClient);
    const waiterRoomMembers = await io.in(WAITER_SOCKET_ROOM).fetchSockets();
    record(
      'valid waiter JWT joins only the waiter room',
      waiterRoomMembers.length === 1 &&
        waiterRoomMembers[0].data.user?.role === 'waiter' &&
        !waiterRoomMembers[0].rooms.has(KITCHEN_SOCKET_ROOM)
    );

    for (const [label, token, expectedCode] of [
      ['missing token is rejected', undefined, 'AUTH_REQUIRED'],
      ['invalid token is rejected', 'not-a-valid-jwt', 'AUTH_INVALID'],
      ['expired token is rejected', expiredToken, 'AUTH_INVALID'],
      ['admin role is rejected consistently with requireKitchenStaff', adminToken, 'FORBIDDEN'],
    ]) {
      const client = connectSocket(url, token);
      clients.push(client);
      const error = await waitForRejection(client);
      record(label, error.message === 'Socket authentication failed.' && error.data?.code === expectedCode);
    }

    kitchenClient.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const roomAfterDisconnect = await io.in(KITCHEN_SOCKET_ROOM).fetchSockets();
    record('socket disconnection removes kitchen room membership', roomAfterDisconnect.length === 0);

    const healthResponse = await fetch(`${url}/api/health`);
    record('existing REST health API still works', healthResponse.status === 200);

    const meResponse = await fetch(`${url}/api/auth/me`, {
      headers: { Authorization: `Bearer ${kitchenToken}` },
    });
    const meBody = await meResponse.json();
    record(
      'existing REST JWT authentication still works',
      meResponse.status === 200 && meBody.data?.user?.role === 'kitchen'
    );

    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');
    if (failed.length) process.exitCode = 1;
  } finally {
    clients.forEach((client) => client.disconnect());
    await closeSocketServer();
    if (httpServer.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await cleanup();
    await closePool();
  }
};

run().catch((error) => {
  console.error('FR-06 Socket.IO infrastructure tests failed:', error);
  process.exitCode = 1;
});
