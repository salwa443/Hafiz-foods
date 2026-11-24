import { ShoppingCart } from 'lucide-react';

function CartButton({ itemCount, onClick }) {
  return (
    <button
      type="button"
      className="customer-cart-button"
      aria-label={`Open cart with ${itemCount} item${itemCount === 1 ? '' : 's'}`}
      onClick={onClick}
    >
      <ShoppingCart size={21} aria-hidden="true" />
      <span>Cart</span>
      <span className="customer-cart-badge" aria-hidden="true">
        {itemCount}
      </span>
    </button>
  );
}

export default CartButton;
