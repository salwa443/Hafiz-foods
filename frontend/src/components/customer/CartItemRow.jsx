import { Trash2 } from 'lucide-react';
import { calculateLineSubtotalMinor } from '../../utils/cartCalculations.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import QuantityControl from './QuantityControl.jsx';

function CartItemRow({ item, onIncrease, onDecrease, onRemove }) {
  return (
    <article className="cart-item-row">
      <div className="cart-item-heading">
        <div>
          <h4>{item.name}</h4>
          <p>{formatCurrency(item.unitPriceMinor / 100)} each</p>
        </div>
        <strong>{formatCurrency(calculateLineSubtotalMinor(item) / 100)}</strong>
      </div>

      {item.specialInstructions && (
        <p className="cart-item-instructions">
          <span>Instructions:</span> {item.specialInstructions}
        </p>
      )}

      <div className="cart-item-actions">
        <QuantityControl
          quantity={item.quantity}
          itemName={item.name}
          onIncrease={() => onIncrease(item.lineId)}
          onDecrease={() => onDecrease(item.lineId)}
        />
        <button
          type="button"
          className="cart-remove-button"
          aria-label={`Remove ${item.name} from cart`}
          onClick={() => onRemove(item.lineId)}
        >
          <Trash2 size={18} aria-hidden="true" />
          <span>Remove</span>
        </button>
      </div>
    </article>
  );
}

export default CartItemRow;
