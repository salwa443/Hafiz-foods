import { useEffect, useRef } from 'react';
import { ShoppingBasket, X } from 'lucide-react';
import { useCart } from '../../hooks/useCart.js';
import CartItemRow from './CartItemRow.jsx';
import CartSummary from './CartSummary.jsx';

function CartPanel({ onClose, onReview }) {
  const dialogRef = useRef(null);
  const {
    items,
    subtotalMinor,
    totalMinor,
    increaseQuantity,
    decreaseQuantity,
    removeItem,
  } = useCart();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  function closeDialog() {
    dialogRef.current?.close();
  }

  function reviewOrder() {
    dialogRef.current?.close();
    onReview();
  }

  return (
    <dialog
      ref={dialogRef}
      className="cart-panel"
      aria-labelledby="cart-panel-title"
      onClose={onClose}
    >
      <div className="cart-panel-content">
        <header className="cart-panel-header">
          <div>
            <p className="eyebrow">Your selection</p>
            <h3 id="cart-panel-title">Cart</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close cart"
            title="Close cart"
            onClick={closeDialog}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="cart-empty-state">
            <ShoppingBasket size={34} aria-hidden="true" />
            <h4>Your cart is empty</h4>
            <p>Add an available menu item to see it here.</p>
            <button type="button" className="secondary-button" onClick={closeDialog}>
              Browse menu
            </button>
          </div>
        ) : (
          <>
            <div className="cart-item-list">
              {items.map((item) => (
                <CartItemRow
                  key={item.lineId}
                  item={item}
                  onIncrease={increaseQuantity}
                  onDecrease={decreaseQuantity}
                  onRemove={removeItem}
                />
              ))}
            </div>
            <CartSummary subtotalMinor={subtotalMinor} totalMinor={totalMinor} />
            <div className="cart-review-action">
              <button type="button" className="primary-button" onClick={reviewOrder}>
                Review order
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

export default CartPanel;
