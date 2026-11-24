const PAYMENT_METHODS = [
  {
    value: 'cash',
    label: 'Cash',
    description: 'Pay with cash when your order is served.',
  },
  {
    value: 'pay_at_counter',
    label: 'Pay at counter',
    description: 'Pay at the restaurant counter.',
  },
  {
    value: 'pay_at_table',
    label: 'Pay at table',
    description: 'Ask staff to collect payment at your table.',
  },
];

function PaymentMethodSelector({ value, onChange, disabled = false }) {
  return (
    <fieldset className="payment-method-selector">
      <legend>Payment method</legend>
      <p>Select how you would like to pay. No online payment will be taken.</p>

      <div className="payment-method-options">
        {PAYMENT_METHODS.map((method) => (
          <label
            className={`payment-method-option${value === method.value ? ' selected' : ''}`}
            key={method.value}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={method.value}
              checked={value === method.value}
              disabled={disabled}
              onChange={(event) => onChange(event.target.value)}
            />
            <span>
              <strong>{method.label}</strong>
              <small>{method.description}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default PaymentMethodSelector;
