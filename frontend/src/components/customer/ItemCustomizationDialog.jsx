import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency.js';
import QuantityControl from './QuantityControl.jsx';

function ItemCustomizationDialog({ item, onAdd, onClose }) {
  const dialogRef = useRef(null);
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  function handleSubmit(event) {
    event.preventDefault();

    if (!item.is_available) {
      return;
    }

    onAdd({ quantity, specialInstructions });
  }

  return (
    <dialog
      ref={dialogRef}
      className="item-dialog"
      aria-labelledby="item-dialog-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <form className="item-dialog-content" onSubmit={handleSubmit}>
        <div className="item-dialog-header">
          <div>
            <p className="eyebrow">Add to cart</p>
            <h3 id="item-dialog-title">{item.name}</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close item details"
            title="Close"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <p className="item-dialog-description">
          {item.description || 'No description available.'}
        </p>

        <div className="item-dialog-price-row">
          <span>{item.category_name}</span>
          <strong>{formatCurrency(item.price)}</strong>
        </div>

        <div className="item-dialog-field">
          <span className="item-dialog-label">Quantity</span>
          <QuantityControl
            quantity={quantity}
            itemName={item.name}
            onIncrease={() => setQuantity((current) => current + 1)}
            onDecrease={() => setQuantity((current) => Math.max(1, current - 1))}
          />
        </div>

        <label className="item-dialog-field">
          <span className="item-dialog-label">Special instructions (optional)</span>
          <textarea
            rows="4"
            value={specialInstructions}
            placeholder="Example: no onions"
            onChange={(event) => setSpecialInstructions(event.target.value)}
          />
        </label>

        <div className="item-dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={!item.is_available}>
            Add {quantity} to cart
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default ItemCustomizationDialog;
