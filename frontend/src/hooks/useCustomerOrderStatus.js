import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelCustomerOrder } from '../services/customerOrderService.js';
import { createCustomerOrderSocket } from '../services/customerOrderSocketService.js';
import { createCustomerOrderStatusSession } from '../utils/customerOrderStatusState.js';

export function useCustomerOrderStatus({ initialOrder, qrToken }) {
  const [state, setState] = useState({
    order: initialOrder,
    connectionStatus: 'connecting',
    isCancelling: false,
    cancellationError: '',
  });
  const sessionRef = useRef(null);

  useEffect(() => {
    const socket = createCustomerOrderSocket({
      tableNumber: initialOrder.tableNumber,
      orderId: initialOrder.orderId,
      trackingToken: initialOrder.trackingToken,
      token: initialOrder.trackingToken ? undefined : qrToken,
    });
    const session = createCustomerOrderStatusSession({
      socket,
      initialOrder,
      cancelOrder: () =>
        cancelCustomerOrder(
          initialOrder.tableNumber,
          initialOrder.orderId,
          initialOrder.trackingToken
            ? { trackingToken: initialOrder.trackingToken }
            : { qrToken }
        ),
      onStateChange: setState,
    });
    sessionRef.current = session;
    session.start();

    return () => {
      session.stop();
      sessionRef.current = null;
    };
  }, [initialOrder, qrToken]);

  const cancelOrder = useCallback(() => sessionRef.current?.cancel(), []);

  return { ...state, cancelOrder };
}
