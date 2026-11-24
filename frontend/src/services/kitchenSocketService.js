import { io } from 'socket.io-client';
import { KITCHEN_SOCKET_EVENTS } from './kitchenSocketEvents.js';

export { KITCHEN_SOCKET_EVENTS };

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const socketServerUrl = new URL(apiBaseUrl).origin;

export function createKitchenSocket(token) {
  return io(socketServerUrl, {
    auth: { token },
    autoConnect: false,
    reconnection: true,
  });
}
