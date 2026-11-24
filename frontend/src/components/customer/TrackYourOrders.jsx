import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ChevronDown } from 'lucide-react';
import { listOrderTrackingReferences } from '../../services/customerOrderTrackingStorage.js';
import { getOrderDisplayNumber } from '../../utils/orderDisplayNumber.js';

function formatOrderTime(orderTime) {
  if (!orderTime) {
    return 'Time unavailable';
  }

  return new Date(orderTime).toLocaleString('en-PK');
}

function TrackYourOrders({ tableId, tableDisplayLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const orders = isOpen ? listOrderTrackingReferences(tableId) : [];

  return (
    <div className="track-your-orders">
      <button
        type="button"
        className="secondary-button track-your-orders-toggle"
        aria-expanded={isOpen}
        aria-controls="saved-customer-orders"
        onClick={() => setIsOpen((value) => !value)}
      >
        <ClipboardList size={19} aria-hidden="true" />
        Track Your Orders
        <ChevronDown
          size={18}
          className={isOpen ? 'track-your-orders-chevron open' : 'track-your-orders-chevron'}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <section id="saved-customer-orders" className="track-your-orders-panel">
          <h3>Saved orders for this table</h3>
          {orders.length === 0 ? (
            <p className="track-your-orders-empty">
              You have no saved orders for this table in this browser session.
            </p>
          ) : (
            <ul className="track-your-orders-list">
              {orders.map((order) => (
                <li key={order.orderId}>
                  <div>
                    <strong>{getOrderDisplayNumber(order.orderId, tableDisplayLabel)}</strong>
                    <time dateTime={order.orderTime || undefined}>
                      {formatOrderTime(order.orderTime)}
                    </time>
                  </div>
                  <Link
                    className="secondary-button track-your-orders-link"
                    to={`/track/${encodeURIComponent(order.orderId)}`}
                  >
                    View status
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default TrackYourOrders;
