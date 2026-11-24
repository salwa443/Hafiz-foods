import { CircleCheckBig } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { useCustomerOrderStatus } from '../../hooks/useCustomerOrderStatus.js';
import CustomerOrderStatus from './CustomerOrderStatus.jsx';
import { getTableDisplayLabel } from '../../utils/tableDisplayLabel.js';
import { getOrderDisplayNumber } from '../../utils/orderDisplayNumber.js';

const PAYMENT_LABELS = {
  cash: 'Cash',
  pay_at_counter: 'Pay at counter',
  pay_at_table: 'Pay at table',
};

function OrderConfirmation({ order: initialOrder, qrToken, onClose }) {
  const {
    order,
    connectionStatus,
    isCancelling,
    cancellationError,
    cancelOrder,
  } = useCustomerOrderStatus({ initialOrder, qrToken });
  const tableDisplayLabel = getTableDisplayLabel(order);
  const displayOrderNumber = getOrderDisplayNumber(order);

  return (
    <section className="order-confirmation" aria-labelledby="order-confirmation-title">
      <CircleCheckBig size={48} aria-hidden="true" />
      <p className="eyebrow">Order confirmed</p>
      <h3 id="order-confirmation-title">Thank you — your order was placed</h3>
      <p>Please keep your short order number available if you need help from staff.</p>

      <dl className="order-confirmation-details">
        <div>
          <dt>Order number</dt>
          <dd>{displayOrderNumber}</dd>
        </div>
        <div>
          <dt>Table</dt>
          <dd>{tableDisplayLabel}</dd>
        </div>
        <div>
          <dt>Payment method</dt>
          <dd>{PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}</dd>
        </div>
        <div>
          <dt>Confirmed total</dt>
          <dd>{formatCurrency(order.totalAmount)}</dd>
        </div>
        <div>
          <dt>Order time</dt>
          <dd>
            <time dateTime={order.orderTime}>
              {new Date(order.orderTime).toLocaleString('en-PK')}
            </time>
          </dd>
        </div>
      </dl>

      <CustomerOrderStatus
        order={order}
        connectionStatus={connectionStatus}
        isCancelling={isCancelling}
        cancellationError={cancellationError}
        onCancel={cancelOrder}
      />

      <button type="button" className="primary-button" onClick={onClose}>
        Return to menu
      </button>
    </section>
  );
}

export default OrderConfirmation;
