import {
  createCartLineSignature,
  normalizeSpecialInstructions,
  priceToMinorUnits,
} from '../utils/cartCalculations.js';

export const CART_ACTIONS = Object.freeze({
  ADD_ITEM: 'ADD_ITEM',
  REMOVE_ITEM: 'REMOVE_ITEM',
  INCREASE_QUANTITY: 'INCREASE_QUANTITY',
  DECREASE_QUANTITY: 'DECREASE_QUANTITY',
  UPDATE_INSTRUCTIONS: 'UPDATE_INSTRUCTIONS',
  CLEAR_CART: 'CLEAR_CART',
  RESTORE_CART: 'RESTORE_CART',
});

export const initialCartState = Object.freeze({ items: [] });

function createCartItem(menuItem, quantity, specialInstructions) {
  const normalizedQuantity = Number(quantity);

  if (
    !menuItem ||
    menuItem.is_available !== true ||
    !Number.isInteger(normalizedQuantity) ||
    normalizedQuantity < 1
  ) {
    return null;
  }

  try {
    const normalizedInstructions = normalizeSpecialInstructions(specialInstructions);
    const lineId = createCartLineSignature(menuItem.id, normalizedInstructions);

    return {
      lineId,
      menuItemId: Number(menuItem.id),
      name: String(menuItem.name || '').trim(),
      imageUrl: menuItem.image_url || null,
      unitPriceMinor: priceToMinorUnits(menuItem.price),
      quantity: normalizedQuantity,
      specialInstructions: normalizedInstructions,
    };
  } catch {
    return null;
  }
}

function addItem(state, payload) {
  const itemToAdd = createCartItem(
    payload?.menuItem,
    payload?.quantity ?? 1,
    payload?.specialInstructions
  );

  if (!itemToAdd || !itemToAdd.name) {
    return state;
  }

  const existingIndex = state.items.findIndex(
    (item) => item.lineId === itemToAdd.lineId
  );

  if (existingIndex === -1) {
    return { items: [...state.items, itemToAdd] };
  }

  return {
    items: state.items.map((item, index) =>
      index === existingIndex
        ? { ...item, quantity: item.quantity + itemToAdd.quantity }
        : item
    ),
  };
}

function updateInstructions(state, payload) {
  const currentItem = state.items.find((item) => item.lineId === payload?.lineId);

  if (!currentItem) {
    return state;
  }

  const specialInstructions = normalizeSpecialInstructions(payload.specialInstructions);
  const updatedLineId = createCartLineSignature(
    currentItem.menuItemId,
    specialInstructions
  );

  if (updatedLineId === currentItem.lineId) {
    return state;
  }

  const matchingItem = state.items.find((item) => item.lineId === updatedLineId);

  if (matchingItem) {
    return {
      items: state.items
        .filter((item) => item.lineId !== currentItem.lineId)
        .map((item) =>
          item.lineId === matchingItem.lineId
            ? { ...item, quantity: item.quantity + currentItem.quantity }
            : item
        ),
    };
  }

  return {
    items: state.items.map((item) =>
      item.lineId === currentItem.lineId
        ? { ...item, lineId: updatedLineId, specialInstructions }
        : item
    ),
  };
}

export function cartReducer(state, action) {
  switch (action.type) {
    case CART_ACTIONS.ADD_ITEM:
      return addItem(state, action.payload);

    case CART_ACTIONS.REMOVE_ITEM:
      return {
        items: state.items.filter((item) => item.lineId !== action.payload?.lineId),
      };

    case CART_ACTIONS.INCREASE_QUANTITY:
      return {
        items: state.items.map((item) =>
          item.lineId === action.payload?.lineId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ),
      };

    case CART_ACTIONS.DECREASE_QUANTITY:
      return {
        items: state.items.map((item) =>
          item.lineId === action.payload?.lineId && item.quantity > 1
            ? { ...item, quantity: item.quantity - 1 }
            : item
        ),
      };

    case CART_ACTIONS.UPDATE_INSTRUCTIONS:
      return updateInstructions(state, action.payload);

    case CART_ACTIONS.CLEAR_CART:
      return { items: [] };

    case CART_ACTIONS.RESTORE_CART:
      return {
        items: Array.isArray(action.payload?.items) ? action.payload.items : [],
      };

    default:
      return state;
  }
}
