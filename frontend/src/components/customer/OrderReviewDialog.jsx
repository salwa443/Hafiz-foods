import { useEffect, useRef, useState } from 'react';
import { ClipboardList, X } from 'lucide-react';
import { calculateLineSubtotalMinor } from '../../utils/cartCalculations.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { buildOrderPayload } from '../../utils/orderPayload.js';
import {
  getOrderSubmitButtonState,
  submitOrderOnce,
} from '../../utils/orderSubmission.js';
import { placeCustomerOrder } from '../../services/customerOrderService.js';
import { addOrderTrackingReference } from '../../services/customerOrderTrackingStorage.js';
import PaymentMethodSelector from './PaymentMethodSelector.jsx';
import CartSummary from './CartSummary.jsx';
import OrderConfirmation from './OrderConfirmation.jsx';

function OrderReviewDialog({
  tableId,
  tableNumber,
  tableDisplayLabel,
  qrToken,
  items,
  subtotalMinor,
  totalMinor,
  onConfirmed,
  onClose,
}) {
  const dialogRef = useRef(null);
  const submissionLock = useRef(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const submitButton = getOrderSubmitButtonState(isSubmitting);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  async function submitOrder() {
    setErrorMessage('');

    await submitOrderOnce({
      submissionLock,
      request: () =>
        placeCustomerOrder(
          tableNumber,
          qrToken,
          buildOrderPayload(items, paymentMethod)
        ),
      onPending: setIsSubmitting,
      onSuccess: (order) => {
        addOrderTrackingReference(tableId, order);
        setConfirmedOrder(order);
        onConfirmed();
      },
      onError: setErrorMessage,
    });
  }

  if (confirmedOrder) {
    return (
      <dialog
        ref={dialogRef}
        className="order-review-dialog"
        aria-labelledby="order-confirmation-title"
        onClose={() => onClose(true)}
      >
        <OrderConfirmation
          order={confirmedOrder}
          qrToken={qrToken}
          onClose={() => dialogRef.current?.close()}
        />
      </dialog>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="order-review-dialog"
      aria-labelledby="order-review-title"
      aria-busy={isSubmitting}
      onCancel={(event) => {
        if (isSubmitting) event.preventDefault();
      }}
      onClose={() => onClose(false)}
    >
      <div className="order-review-content">
        <header className="order-review-header">
          <div>
            <p className="eyebrow">Final check</p>
            <h3 id="order-review-title">Review your order</h3>
            <p className="order-review-table">Table {tableDisplayLabel || tableNumber}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close order review"
            title="Close order review"
            disabled={isSubmitting}
            onClick={() => dialogRef.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <section className="order-review-section" aria-labelledby="review-items-title">
          <div className="order-review-section-heading">
            <ClipboardList size={20} aria-hidden="true" />
            <h4 id="review-items-title">Order items</h4>
          </div>
          <div className="order-review-items">
            {items.map((item) => (
              <article className="order-review-item" key={item.lineId}>
                <div>
                  <h5>{item.name}</h5>
                  <p>
                    {item.quantity} × {formatCurrency(item.unitPriceMinor / 100)}
                  </p>
                </div>
                <strong>{formatCurrency(calculateLineSubtotalMinor(item) / 100)}</strong>
                {item.specialInstructions && (
                  <p className="order-review-instructions">
                    <span>Instructions:</span> {item.specialInstructions}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        <PaymentMethodSelector
          value={paymentMethod}
          onChange={setPaymentMethod}
          disabled={isSubmitting}
        />
        <CartSummary subtotalMinor={subtotalMinor} totalMinor={totalMinor} />

        {errorMessage && (
          <div className="order-submit-error" role="alert">
            <strong>We could not confirm your order</strong>
            <p>{errorMessage}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setErrorMessage('')}
            >
              Dismiss message
            </button>
          </div>
        )}

        <footer className="order-review-footer">
          <p>
            {isSubmitting
              ? 'Confirming your order. Please do not close this page.'
              : 'Your order will be sent to the restaurant when you confirm.'}
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={isSubmitting}
            onClick={() => dialogRef.current?.close()}
          >
            Back to cart
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={submitButton.disabled}
            onClick={submitOrder}
          >
            {submitButton.label}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

export default OrderReviewDialog;
