import { canCancelCustomerOrder } from '../../utils/customerOrderStatusState.js';
import { getTableDisplayLabel } from '../../utils/tableDisplayLabel.js';
import { getOrderDisplayNumber } from '../../utils/orderDisplayNumber.js';

const STATUS_STEPS = ['new', 'accepted', 'preparing', 'ready', 'completed'];
const STATUS_LABELS = {
  new: 'New',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function CustomerOrderStatus({
  order,
  connectionStatus,
  isCancelling,
  cancellationError,
  onCancel,
  allowCancellation = true,
}) {
  const tableDisplayLabel = getTableDisplayLabel(order);
  const displayOrderNumber = getOrderDisplayNumber(order);
  const currentIndex = STATUS_STEPS.indexOf(order.status);
  const connected = connectionStatus === 'connected';

  return (
    <section className="customer-order-status" aria-labelledby="customer-order-status-title">
      <header>
        <div>
          <p className="eyebrow">Live order status</p>
          <h4 id="customer-order-status-title">{STATUS_LABELS[order.status] || order.status}</h4>
        </div>
        <p className={`customer-live-indicator ${connectionStatus}`}>
          <span aria-hidden="true" />
          {connected ? 'Live updates connected' : 'Live updates disconnected'}
        </p>
      </header>

      <dl className="customer-order-status-identifiers">
        <div><dt>Order number</dt><dd>{displayOrderNumber}</dd></div>
        <div><dt>Table</dt><dd>{tableDisplayLabel}</dd></div>
      </dl>

      {order.status === 'cancelled' ? (
        <div className="customer-order-cancelled" role="status">
          This order has been cancelled.
        </div>
      ) : (
        <ol className="customer-status-progress" aria-label="Order progress">
          {STATUS_STEPS.map((status, index) => (
            <li
              className={index < currentIndex ? 'complete' : index === currentIndex ? 'current' : ''}
              key={status}
              aria-current={index === currentIndex ? 'step' : undefined}
            >
              <span aria-hidden="true">{index + 1}</span>
              {STATUS_LABELS[status]}
            </li>
          ))}
        </ol>
      )}

      {!connected && (
        <p className="customer-live-fallback">
          Live updates are temporarily unavailable. The last confirmed status remains visible.
        </p>
      )}

      {cancellationError && <p className="customer-cancel-error" role="alert">{cancellationError}</p>}

      {allowCancellation && canCancelCustomerOrder(order.status) && (
        <button
          type="button"
          className="customer-cancel-order-button"
          disabled={isCancelling}
          onClick={onCancel}
        >
          {isCancelling ? 'Cancelling…' : 'Cancel order'}
        </button>
      )}
    </section>
  );
}

export default CustomerOrderStatus;
