import { useCallback, useEffect, useRef, useState } from 'react';
import { getReadyWaiterOrders, updateWaiterDelivery } from '../services/waiterOrderService.js';
import { createWaiterSocket, WAITER_SOCKET_EVENTS } from '../services/waiterSocketService.js';
import { createWaiterQueueSync, mergeWaiterOrder } from '../utils/waiterOrderState.js';

export function useWaiterOrders(token) {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [pendingOrderId, setPendingOrderId] = useState(null);
  const queueRef = useRef(null);
  const retry = useCallback(() => queueRef.current?.refresh(), []);

  useEffect(() => {
    if (!token) return undefined;

    // The REST queue must load even when the realtime connection is slow or unavailable.
    const queue = createWaiterQueueSync({
      loadOrders: getReadyWaiterOrders,
      onSnapshot: setOrders,
      onUpdate: (order) => setOrders((current) => mergeWaiterOrder(current, order)),
      onLoading: setIsLoading,
      onError: setError,
    });
    queueRef.current = queue;
    const initialLoadTimer = window.setTimeout(queue.refresh, 0);
    const socket = createWaiterSocket(token);
    socket.on('connect', () => {
      setConnectionStatus('connected');
      void queue.refresh({ afterConnection: true });
    });
    socket.on('disconnect', () => setConnectionStatus('disconnected'));
    socket.on('connect_error', () => setConnectionStatus('error'));
    socket.on(WAITER_SOCKET_EVENTS.READY, queue.receive);
    socket.on(WAITER_SOCKET_EVENTS.UPDATED, queue.receive);
    socket.connect();
    return () => {
      window.clearTimeout(initialLoadTimer);
      queue.stop();
      queueRef.current = null;
      socket.off();
      socket.disconnect();
    };
  }, [token]);

  const act = useCallback(async (orderId, action) => {
    if (pendingOrderId) return;
    const queue = queueRef.current;
    setPendingOrderId(orderId); setError(''); setSuccess('');
    try {
      const updated = await updateWaiterDelivery(orderId, action);
      if (queueRef.current !== queue) return;
      queue?.receive(updated);
      setSuccess(action === 'claim' ? 'Order claimed.' : action === 'pickup' ? 'Order marked picked up.' : 'Order delivered to the table.');
    } catch (requestError) {
      await queue?.refresh();
      if (queueRef.current === queue) {
        setError(requestError.response?.data?.message || 'The delivery action could not be completed.');
      }
    } finally { setPendingOrderId(null); }
  }, [pendingOrderId]);

  return { orders, isLoading, error, success, connectionStatus, pendingOrderId, retry, act };
}
