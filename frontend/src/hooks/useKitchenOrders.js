import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getActiveKitchenOrders,
  updateKitchenOrderStatus,
} from '../services/kitchenOrderService.js';
import { createKitchenSocket } from '../services/kitchenSocketService.js';
import { createKitchenOrderSession } from '../utils/kitchenOrderState.js';

const initialState = {
  orders: [],
  isLoading: true,
  error: '',
  connectionStatus: 'connecting',
  pendingOrderIds: [],
  actionErrors: {},
};

export function useKitchenOrders(token) {
  const [state, setState] = useState(initialState);
  const sessionRef = useRef(null);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const socket = createKitchenSocket(token);
    const session = createKitchenOrderSession({
      socket,
      loadOrders: getActiveKitchenOrders,
      updateOrderStatus: updateKitchenOrderStatus,
      onStateChange: setState,
    });
    sessionRef.current = session;
    session.start();

    return () => {
      session.stop();
      sessionRef.current = null;
    };
  }, [token]);

  const retry = useCallback(() => sessionRef.current?.retry(), []);
  const changeStatus = useCallback(
    (orderId, targetStatus) => sessionRef.current?.changeStatus(orderId, targetStatus),
    []
  );

  return { ...state, retry, changeStatus };
}
