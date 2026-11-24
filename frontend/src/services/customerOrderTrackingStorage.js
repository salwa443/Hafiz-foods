const TRACKING_STORAGE_VERSION = 1;
const TRACKING_STORAGE_PREFIX = 'customerOrderTracking:';
const MAX_TRACKING_REFERENCES = 20;
const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function getOrderTrackingStorageKey(tableId) {
  const normalizedTableId = Number(tableId);

  if (!Number.isInteger(normalizedTableId) || normalizedTableId <= 0) {
    throw new Error('A valid table ID is required for order tracking storage.');
  }

  return `${TRACKING_STORAGE_PREFIX}${normalizedTableId}`;
}

function getDefaultStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function sanitizeReference(reference) {
  if (
    !reference ||
    typeof reference.orderId !== 'string' ||
    !reference.orderId.trim() ||
    reference.orderId.trim().length > 80 ||
    typeof reference.trackingToken !== 'string' ||
    !TRACKING_TOKEN_PATTERN.test(reference.trackingToken)
  ) {
    return null;
  }

  const orderTime =
    typeof reference.orderTime === 'string' &&
    !Number.isNaN(Date.parse(reference.orderTime))
      ? reference.orderTime
      : null;

  return {
    orderId: reference.orderId.trim(),
    trackingToken: reference.trackingToken,
    orderTime,
  };
}

function readEnvelope(tableId, storage) {
  if (!storage) {
    return [];
  }

  try {
    const normalizedTableId = Number(tableId);
    const storedValue = storage.getItem(getOrderTrackingStorageKey(tableId));

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue);

    if (
      parsedValue.version !== TRACKING_STORAGE_VERSION ||
      parsedValue.tableId !== normalizedTableId ||
      !Array.isArray(parsedValue.orders)
    ) {
      return [];
    }

    const references = new Map();

    parsedValue.orders.forEach((reference) => {
      const sanitizedReference = sanitizeReference(reference);

      if (sanitizedReference) {
        references.set(sanitizedReference.orderId, sanitizedReference);
      }
    });

    return [...references.values()].slice(-MAX_TRACKING_REFERENCES);
  } catch {
    return [];
  }
}

export function listOrderTrackingReferences(
  tableId,
  storage = getDefaultStorage()
) {
  return readEnvelope(tableId, storage);
}

export function getOrderTrackingReference(
  tableId,
  orderId,
  storage = getDefaultStorage()
) {
  if (typeof orderId !== 'string' || !orderId.trim()) {
    return null;
  }

  return listOrderTrackingReferences(tableId, storage).find(
    (reference) => reference.orderId === orderId.trim()
  ) || null;
}

export function findOrderTrackingReference(
  orderId,
  storage = getDefaultStorage()
) {
  if (
    !storage ||
    typeof orderId !== 'string' ||
    !orderId.trim() ||
    typeof storage.key !== 'function' ||
    !Number.isInteger(storage.length)
  ) {
    return null;
  }

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (typeof key !== 'string' || !key.startsWith(TRACKING_STORAGE_PREFIX)) {
        continue;
      }

      const tableId = Number(key.slice(TRACKING_STORAGE_PREFIX.length));

      if (!Number.isInteger(tableId) || tableId <= 0) {
        continue;
      }

      const reference = getOrderTrackingReference(
        tableId,
        orderId,
        storage
      );

      if (reference) {
        return { tableId, ...reference };
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function addOrderTrackingReference(
  tableId,
  order,
  storage = getDefaultStorage()
) {
  if (!storage) {
    return false;
  }

  try {
    const reference = sanitizeReference(order);

    if (!reference) {
      return false;
    }

    const existing = listOrderTrackingReferences(tableId, storage).filter(
      (item) => item.orderId !== reference.orderId
    );
    const orders = [...existing, reference].slice(-MAX_TRACKING_REFERENCES);

    storage.setItem(
      getOrderTrackingStorageKey(tableId),
      JSON.stringify({
        version: TRACKING_STORAGE_VERSION,
        tableId: Number(tableId),
        orders,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function removeOrderTrackingReference(
  tableId,
  orderId,
  storage = getDefaultStorage()
) {
  if (!storage || typeof orderId !== 'string' || !orderId.trim()) {
    return false;
  }

  try {
    const key = getOrderTrackingStorageKey(tableId);
    const existing = listOrderTrackingReferences(tableId, storage);
    const orders = existing.filter(
      (reference) => reference.orderId !== orderId.trim()
    );

    if (orders.length === existing.length) {
      return false;
    }

    if (orders.length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(
        key,
        JSON.stringify({
          version: TRACKING_STORAGE_VERSION,
          tableId: Number(tableId),
          orders,
        })
      );
    }

    return true;
  } catch {
    return false;
  }
}
