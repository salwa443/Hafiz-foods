import { CheckCircle2, Clock3, HandPlatter, PackageCheck } from 'lucide-react';
import { getWaiterOrderAction } from '../../utils/waiterOrderState.js';
import { getOrderDisplayNumber } from '../../utils/orderDisplayNumber.js';

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : 'Just now';
}

function WaiterOrderCard({ order, currentUserId, pending, onAction }) {
  const isMine = order.assignedWaiter?.id === currentUserId;
  const actionKey = getWaiterOrderAction(order, currentUserId);
  const actions = {
    claim: { key: 'claim', label: 'Claim Order', icon: HandPlatter },
    pickup: { key: 'pickup', label: 'Mark Picked Up', icon: PackageCheck },
    deliver: { key: 'deliver', label: 'Delivered to Table', icon: CheckCircle2 },
  };
  const action = actionKey ? actions[actionKey] : null;
  const ActionIcon = action?.icon;
  const displayOrderNumber = getOrderDisplayNumber(order);

  return (
    <article className={`waiter-order-card ${isMine ? 'assigned-to-me' : ''}`}>
      <header>
        <div><p className="eyebrow">Order number</p><h3>{displayOrderNumber}</h3></div>
        <strong>{order.tableDisplayLabel || order.tableNumber}</strong>
      </header>
      <p className="waiter-ready-time"><Clock3 size={15} /> Ready at {formatTime(order.readyAt)}</p>
      <ul>
        {order.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <b>{item.quantity}× {item.name}</b>
            {item.specialInstructions && <p><span>Note:</span> {item.specialInstructions}</p>}
          </li>
        ))}
      </ul>
      <div className="waiter-assignment">
        {order.assignedWaiter ? <span>Assigned to <b>{order.assignedWaiter.name}</b></span> : <span>Waiting for a waiter</span>}
        <span className="status-pill warning">{order.deliveryStatus.replace('_', ' ')}</span>
      </div>
      {action && (
        <button className="primary-button" disabled={pending} onClick={() => onAction(order.orderId, action.key)}>
          <ActionIcon size={18} /> {pending ? 'Updating...' : action.label}
        </button>
      )}
    </article>
  );
}

export default WaiterOrderCard;
