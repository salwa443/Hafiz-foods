import { getKitchenOrderAction } from '../../utils/kitchenOrderActions.js';
import { getTableDisplayLabel } from '../../utils/tableDisplayLabel.js';
import { getOrderDisplayNumber } from '../../utils/orderDisplayNumber.js';

function KitchenOrderCard({ order, isPending, actionError, onChangeStatus }) {
  const action = getKitchenOrderAction(order.status);
  const tableDisplayLabel = getTableDisplayLabel(order);
  const displayOrderNumber = getOrderDisplayNumber(order);

  return (
    <article className="kitchen-order-card">
      <header className="kitchen-order-card-header">
        <div>
          <p className="eyebrow">Order number</p>
          <h3>{displayOrderNumber}</h3>
        </div>
        <strong>Table {tableDisplayLabel}</strong>
      </header>

      <div className="kitchen-order-meta">
        <span className="status-pill active">{order.status}</span>
        <time dateTime={order.orderTime}>
          {new Date(order.orderTime).toLocaleString('en-PK')}
        </time>
      </div>

      <ul className="kitchen-order-items">
        {order.items.map((item, index) => (
          <li key={`${order.orderId}-${index}-${item.name}`}>
            <div>
              <strong>{item.quantity} × {item.name}</strong>
              {item.specialInstructions && (
                <p><span>Instructions:</span> {item.specialInstructions}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {actionError && (
        <p className="kitchen-order-action-error" role="alert">{actionError}</p>
      )}

      {action && (
        <footer className="kitchen-order-card-actions">
          <button
            type="button"
            className="primary-button"
            disabled={isPending}
            aria-label={`${action.label} ${displayOrderNumber}`}
            onClick={() => onChangeStatus(order.orderId, action.targetStatus)}
          >
            {isPending ? 'Updating…' : action.label}
          </button>
        </footer>
      )}
    </article>
  );
}

export default KitchenOrderCard;
