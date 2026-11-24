export function normalizeSpecialInstructions(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function createCartLineSignature(menuItemId, specialInstructions = '') {
  const normalizedMenuItemId = Number(menuItemId);

  if (!Number.isInteger(normalizedMenuItemId) || normalizedMenuItemId <= 0) {
    throw new Error('A valid menu item ID is required.');
  }

  return JSON.stringify([
    normalizedMenuItemId,
    normalizeSpecialInstructions(specialInstructions),
  ]);
}

export function priceToMinorUnits(price) {
  const numericPrice = Number(price);

  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    throw new Error('A valid non-negative menu item price is required.');
  }

  return Math.round(numericPrice * 100);
}

export function calculateLineSubtotalMinor(item) {
  if (!Number.isInteger(item?.unitPriceMinor) || item.unitPriceMinor < 0) {
    return 0;
  }

  if (!Number.isInteger(item.quantity) || item.quantity < 1) {
    return 0;
  }

  return item.unitPriceMinor * item.quantity;
}

export function calculateCartSubtotalMinor(items = []) {
  return items.reduce(
    (subtotal, item) => subtotal + calculateLineSubtotalMinor(item),
    0
  );
}

export function calculateCartTotalMinor(items = []) {
  return calculateCartSubtotalMinor(items);
}

export function calculateCartQuantity(items = []) {
  return items.reduce(
    (quantity, item) => quantity + (Number.isInteger(item.quantity) ? item.quantity : 0),
    0
  );
}
