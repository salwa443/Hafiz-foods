import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { findOrderSocketAuthorizationByCode } from '../models/orderModel.js';
import { findActiveTableByNumberAndQrToken } from '../models/tableModel.js';
import { verifyToken } from '../services/authService.js';
import { verifyTrackingToken } from '../utils/trackingToken.js';
import {
  isValidPublicQrToken,
  isValidPublicTableNumber,
} from '../validators/publicTableValidators.js';

export const KITCHEN_SOCKET_ROOM = 'kitchen';
export const WAITER_SOCKET_ROOM = 'waiter';
export const CUSTOMER_SOCKET_NAMESPACE = '/customer';

export const SOCKET_EVENTS = Object.freeze({
  KITCHEN_ORDER_NEW: 'kitchen:order:new',
  KITCHEN_ORDER_STATUS_UPDATED: 'kitchen:order:status-updated',
  CUSTOMER_ORDER_STATUS_UPDATED: 'customer:order:status-updated',
  WAITER_ORDER_READY: 'waiter:order:ready',
  WAITER_ORDER_UPDATED: 'waiter:order:updated',
});

export function buildCustomerOrderRoom(orderId) {
  return `customer-order:${orderId}`;
}

let socketServer = null;

function createConnectionError(code) {
  const error = new Error('Socket authentication failed.');
  error.data = { code };
  return error;
}

function getHandshakeToken(socket) {
  const token = socket.handshake.auth?.token;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

function getCustomerHandshake(socket) {
  const { tableNumber, orderId, token, trackingToken } =
    socket.handshake.auth || {};

  if (
    typeof orderId !== 'string' ||
    !orderId.trim() ||
    orderId.trim().length > 80
  ) {
    return null;
  }

  return {
    tableNumber,
    orderId: orderId.trim(),
    token,
    trackingToken,
  };
}

export function initializeSocketServer(httpServer) {
  if (socketServer) {
    return socketServer;
  }

  socketServer = new Server(httpServer, {
    cors: {
      origin: env.frontendUrl,
      credentials: true,
    },
  });

  socketServer.use(async (socket, next) => {
    const token = getHandshakeToken(socket);

    if (!token) {
      next(createConnectionError('AUTH_REQUIRED'));
      return;
    }

    try {
      const user = await verifyToken(token);

      if (!['kitchen', 'waiter'].includes(user.role)) {
        next(createConnectionError('FORBIDDEN'));
        return;
      }

      socket.data.user = {
        id: user.id,
        name: user.name,
        role: user.role,
      };
      next();
    } catch {
      next(createConnectionError('AUTH_INVALID'));
    }
  });

  socketServer.on('connection', (socket) => {
    socket.join(socket.data.user.role === 'kitchen' ? KITCHEN_SOCKET_ROOM : WAITER_SOCKET_ROOM);

    socket.on('disconnect', () => {
      // Socket.IO removes disconnected sockets from rooms automatically.
    });
  });

  const customerNamespace = socketServer.of(CUSTOMER_SOCKET_NAMESPACE);

  customerNamespace.use(async (socket, next) => {
    const credentials = getCustomerHandshake(socket);

    if (!credentials) {
      next(createConnectionError('AUTH_REQUIRED'));
      return;
    }

    try {
      const order = await findOrderSocketAuthorizationByCode(
        credentials.orderId
      );

      if (!order) {
        next(createConnectionError('AUTH_INVALID'));
        return;
      }

      if (order.tracking_token_hash) {
        if (
          !verifyTrackingToken(
            credentials.trackingToken,
            order.tracking_token_hash
          )
        ) {
          next(createConnectionError('AUTH_INVALID'));
          return;
        }

        socket.data.customerOrder = {
          orderId: order.order_code,
          tableNumber: order.table_number,
        };
        next();
        return;
      }

      if (
        !isValidPublicTableNumber(credentials.tableNumber) ||
        !isValidPublicQrToken(credentials.token)
      ) {
        next(createConnectionError('AUTH_INVALID'));
        return;
      }

      const table = await findActiveTableByNumberAndQrToken(
        credentials.tableNumber.trim(),
        credentials.token.trim()
      );

      if (!table || order.table_id !== table.id) {
        next(createConnectionError('AUTH_INVALID'));
        return;
      }

      socket.data.customerOrder = {
        orderId: order.order_code,
        tableNumber: table.table_number,
      };
      next();
    } catch {
      next(createConnectionError('AUTH_INVALID'));
    }
  });

  customerNamespace.on('connection', (socket) => {
    socket.join(buildCustomerOrderRoom(socket.data.customerOrder.orderId));

    socket.on('disconnect', () => {
      // Socket.IO safely removes disconnected customer sockets from their order room.
    });
  });

  return socketServer;
}

export function getSocketServer() {
  return socketServer;
}

export async function closeSocketServer() {
  if (!socketServer) {
    return;
  }

  const serverToClose = socketServer;
  socketServer = null;
  await new Promise((resolve) => serverToClose.close(resolve));
}
