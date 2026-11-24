import { io } from 'socket.io-client';

export const WAITER_SOCKET_EVENTS = Object.freeze({
  READY: 'waiter:order:ready',
  UPDATED: 'waiter:order:updated',
});

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export function createWaiterSocket(token) {
  return io(new URL(apiBaseUrl).origin, {
    auth: { token },
    autoConnect: false,
    reconnection: true,
  });
}
