import { formatCurrency } from '../../utils/formatCurrency.js';

function CartSummary({ subtotalMinor, totalMinor }) {
  return (
    <dl className="cart-summary">
      <div>
        <dt>Subtotal</dt>
        <dd>{formatCurrency(subtotalMinor / 100)}</dd>
      </div>
      <div className="cart-summary-total">
        <dt>Total</dt>
        <dd>{formatCurrency(totalMinor / 100)}</dd>
      </div>
    </dl>
  );
}

export default CartSummary;
