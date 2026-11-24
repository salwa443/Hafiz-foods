const PAYMENT_METHODS = new Set(['cash', 'pay_at_counter', 'pay_at_table']);

export function buildOrderPayload(cartItems, paymentMethod) {
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    throw new Error('Please select a valid payment method.');
  }

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('The cart must contain at least one item.');
  }

  return {
    paymentMethod,
    items: cartItems.map((item) => {
      const menuItemId = Number(item?.menuItemId);
      const quantity = Number(item?.quantity);

      if (!Number.isInteger(menuItemId) || menuItemId < 1) {
        throw new Error('The cart contains an invalid menu item.');
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error('The cart contains an invalid quantity.');
      }

      return {
        menuItemId,
        quantity,
        specialInstructions:
          typeof item.specialInstructions === 'string'
            ? item.specialInstructions.trim()
            : '',
      };
    }),
  };
}
