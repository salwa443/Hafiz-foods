import { createCartLineSignature } from '../utils/cartCalculations.js';

const CART_STORAGE_VERSION = 1;
const CART_STORAGE_PREFIX = 'customerCart:';

export function getCartStorageKey(tableId) {
  const normalizedTableId = Number(tableId);

  if (!Number.isInteger(normalizedTableId) || normalizedTableId <= 0) {
    throw new Error('A valid table ID is required for cart storage.');
  }

  return `${CART_STORAGE_PREFIX}${normalizedTableId}`;
}

function getDefaultStorage() {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

function sanitizeStoredItem(item) {
  if (
    !item ||
    !Number.isInteger(item.menuItemId) ||
    item.menuItemId <= 0 ||
    typeof item.name !== 'string' ||
    !item.name.trim() ||
    !Number.isInteger(item.unitPriceMinor) ||
    item.unitPriceMinor < 0 ||
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    typeof item.specialInstructions !== 'string'
  ) {
    return null;
  }

  const specialInstructions = item.specialInstructions.trim();

  return {
    lineId: createCartLineSignature(item.menuItemId, specialInstructions),
    menuItemId: item.menuItemId,
    name: item.name.trim(),
    imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
    unitPriceMinor: item.unitPriceMinor,
    quantity: item.quantity,
    specialInstructions,
  };
}

function mergeStoredItems(items) {
  const mergedItems = new Map();

  items.forEach((item) => {
    const sanitizedItem = sanitizeStoredItem(item);

    if (!sanitizedItem) {
      return;
    }

    const existingItem = mergedItems.get(sanitizedItem.lineId);

    mergedItems.set(
      sanitizedItem.lineId,
      existingItem
        ? { ...existingItem, quantity: existingItem.quantity + sanitizedItem.quantity }
        : sanitizedItem
    );
  });

  return [...mergedItems.values()];
}

export function loadStoredCart(tableId, storage = getDefaultStorage()) {
  if (!storage) {
    return { items: [] };
  }

  try {
    const key = getCartStorageKey(tableId);
    const storedValue = storage.getItem(key);

    if (!storedValue) {
      return { items: [] };
    }

    const parsedValue = JSON.parse(storedValue);

    if (
      parsedValue.version !== CART_STORAGE_VERSION ||
      parsedValue.tableId !== Number(tableId) ||
      !Array.isArray(parsedValue.items)
    ) {
      return { items: [] };
    }

    return { items: mergeStoredItems(parsedValue.items) };
  } catch {
    return { items: [] };
  }
}

export function saveStoredCart(tableId, items, storage = getDefaultStorage()) {
  if (!storage) {
    return;
  }

  const key = getCartStorageKey(tableId);

  if (!Array.isArray(items) || items.length === 0) {
    storage.removeItem(key);
    return;
  }

  storage.setItem(
    key,
    JSON.stringify({
      version: CART_STORAGE_VERSION,
      tableId: Number(tableId),
      items,
    })
  );
}

export function clearStoredCart(tableId, storage = getDefaultStorage()) {
  if (storage) {
    storage.removeItem(getCartStorageKey(tableId));
  }
}
