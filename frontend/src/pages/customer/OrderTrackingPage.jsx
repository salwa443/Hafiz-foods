import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { ClipboardList, TriangleAlert } from 'lucide-react';
import CustomerOrderStatus from '../../components/customer/CustomerOrderStatus.jsx';
import { useCustomerOrderStatus } from '../../hooks/useCustomerOrderStatus.js';
import { getCustomerTrackedOrder } from '../../services/customerOrderService.js';
import { findOrderTrackingReference } from '../../services/customerOrderTrackingStorage.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { getTableDisplayLabel } from '../../utils/tableDisplayLabel.js';
import { getOrderDisplayNumber } from '../../utils/orderDisplayNumber.js';

function TrackedOrderDetails({ initialOrder, trackingToken, onReturn }) {
  const trackedInitialOrder = useMemo(
    () => ({ ...initialOrder, trackingToken }),
    [initialOrder, trackingToken]
  );
  const { order, connectionStatus } = useCustomerOrderStatus({
    initialOrder: trackedInitialOrder,
  });
  const tableDisplayLabel = getTableDisplayLabel(order);
  const displayOrderNumber = getOrderDisplayNumber(order);

  return (
    <section className="customer-tracking-card" aria-labelledby="tracking-order-title">
      <header className="customer-tracking-header">
        <div>
          <p className="eyebrow">Order tracking</p>
          <h2 id="tracking-order-title">Your order</h2>
          <p>Table {tableDisplayLabel}</p>
        </div>
        <button type="button" className="secondary-button" onClick={onReturn}>
          Return to menu
        </button>
      </header>

      <CustomerOrderStatus
        order={order}
        connectionStatus={connectionStatus}
        isCancelling={false}
        cancellationError=""
        onCancel={() => {}}
        allowCancellation
      />

      <section className="customer-tracking-items" aria-labelledby="tracking-items-title">
        <div className="order-review-section-heading">
          <ClipboardList size={20} aria-hidden="true" />
          <h3 id="tracking-items-title">Ordered items</h3>
        </div>
        {order.items.map((item, index) => (
          <article className="customer-tracking-item" key={`${item.name}-${index}`}>
            <div>
              <strong>{item.name}</strong>
              <p>{item.quantity} × {formatCurrency(item.unitPrice)}</p>
              {item.specialInstructions && (
                <p><span>Instructions:</span> {item.specialInstructions}</p>
              )}
            </div>
            <strong>{formatCurrency(item.subtotal)}</strong>
          </article>
        ))}
      </section>

      <dl className="order-confirmation-details">
        <div><dt>Order number</dt><dd>{displayOrderNumber}</dd></div>
        <div>
          <dt>Order time</dt>
          <dd><time dateTime={order.orderTime}>{new Date(order.orderTime).toLocaleString('en-PK')}</time></dd>
        </div>
        <div><dt>Total</dt><dd>{formatCurrency(order.totalAmount)}</dd></div>
      </dl>
    </section>
  );
}

function OrderTrackingPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', order: null, reference: null });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOrder() {
      const reference = findOrderTrackingReference(orderId);

      if (!reference) {
        setState({ status: 'missing', order: null, reference: null });
        return;
      }

      setState({ status: 'loading', order: null, reference });

      try {
        const order = await getCustomerTrackedOrder(
          orderId,
          reference.trackingToken,
          { signal: controller.signal }
        );

        if (!controller.signal.aborted) {
          setState({ status: 'success', order, reference });
        }
      } catch (error) {
        if (!controller.signal.aborted && !axios.isCancel(error)) {
          setState({
            status: error?.response?.status === 404 ? 'unavailable' : 'error',
            order: null,
            reference,
          });
        }
      }
    }

    loadOrder();
    return () => controller.abort();
  }, [orderId, retryKey]);

  function returnToMenu() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }

  if (state.status === 'success') {
    return (
      <section className="customer-tracking-page">
        <TrackedOrderDetails
          initialOrder={state.order}
          trackingToken={state.reference.trackingToken}
          onReturn={returnToMenu}
        />
      </section>
    );
  }

  return (
    <section className="customer-tracking-page" aria-live="polite">
      <div className="customer-tracking-feedback">
        {state.status === 'loading' ? (
          <>
            <p className="eyebrow">Order tracking</p>
            <h2>Loading your order</h2>
            <p>Please wait while we retrieve the latest status.</p>
          </>
        ) : (
          <>
            <TriangleAlert size={36} aria-hidden="true" />
            <p className="eyebrow">Order tracking unavailable</p>
            <h2>We could not open this order</h2>
            <p>
              {state.status === 'missing'
                ? 'This browser session does not contain access to that order.'
                : state.status === 'unavailable'
                  ? 'This saved order is unavailable or its access is no longer valid.'
                  : 'We could not load the order right now. Please try again.'}
            </p>
            {state.status === 'error' && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setRetryKey((value) => value + 1)}
              >
                Retry
              </button>
            )}
            <button type="button" className="primary-button" onClick={returnToMenu}>
              Return to menu
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export default OrderTrackingPage;
