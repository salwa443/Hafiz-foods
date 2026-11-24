import { useCallback, useEffect, useRef, useState } from 'react';
import { getReadyWaiterOrders, updateWaiterDelivery } from '../services/waiterOrderService.js';
import { createWaiterSocket, WAITER_SOCKET_EVENTS } from '../services/waiterSocketService.js';
import { mergeWaiterOrder } from '../utils/waiterOrderState.js';

export function useWaiterOrders(token) {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [pendingOrderId, setPendingOrderId] = useState(null);
  const loadInFlightRef = useRef(null);

  const load = useCallback(() => {
    if (loadInFlightRef.current) return loadInFlightRef.current;

    setIsLoading(true); setError('');
    const request = getReadyWaiterOrders()
      .then((readyOrders) => {
        setOrders(readyOrders);
        setError('');
      })
      .catch(() => setError('Ready orders could not be loaded. Please try again.'))
      .finally(() => {
        setIsLoading(false);
        loadInFlightRef.current = null;
      });

    loadInFlightRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    // The REST queue must load even when the realtime connection is slow or unavailable.
    const initialLoadTimer = window.setTimeout(load, 0);
    const socket = createWaiterSocket(token);
    const merge = (order) => setOrders((current) => mergeWaiterOrder(current, order));
    socket.on('connect', () => { setConnectionStatus('connected'); load(); });
    socket.on('disconnect', () => setConnectionStatus('disconnected'));
    socket.on('connect_error', () => setConnectionStatus('error'));
    socket.on(WAITER_SOCKET_EVENTS.READY, merge);
    socket.on(WAITER_SOCKET_EVENTS.UPDATED, merge);
    socket.connect();
    return () => {
      window.clearTimeout(initialLoadTimer);
      socket.off();
      socket.disconnect();
    };
  }, [token, load]);

  const act = useCallback(async (orderId, action) => {
    if (pendingOrderId) return;
    setPendingOrderId(orderId); setError(''); setSuccess('');
    try {
      const updated = await updateWaiterDelivery(orderId, action);
      setOrders((current) => mergeWaiterOrder(current, updated));
      setSuccess(action === 'claim' ? 'Order claimed.' : action === 'pickup' ? 'Order marked picked up.' : 'Order delivered to the table.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The delivery action could not be completed.');
      await load();
    } finally { setPendingOrderId(null); }
  }, [pendingOrderId, load]);

  return { orders, isLoading, error, success, connectionStatus, pendingOrderId, retry: load, act };
}
