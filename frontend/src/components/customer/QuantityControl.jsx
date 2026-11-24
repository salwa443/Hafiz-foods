import { Minus, Plus } from 'lucide-react';

function QuantityControl({ quantity, onIncrease, onDecrease, itemName = 'item' }) {
  const isAtMinimum = quantity <= 1;

  return (
    <div className="quantity-control" aria-label={`Quantity for ${itemName}`}>
      <button
        type="button"
        aria-label={`Decrease quantity for ${itemName}`}
        title="Decrease quantity"
        disabled={isAtMinimum}
        onClick={onDecrease}
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <output aria-live="polite" aria-label={`Quantity: ${quantity}`}>
        {quantity}
      </output>
      <button
        type="button"
        aria-label={`Increase quantity for ${itemName}`}
        title="Increase quantity"
        onClick={onIncrease}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

export default QuantityControl;
