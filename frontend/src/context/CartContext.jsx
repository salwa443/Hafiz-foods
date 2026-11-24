import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { CartContext } from './CartContextCore.js';
import {
  CART_ACTIONS,
  cartReducer,
} from '../reducers/cartReducer.js';
import {
  calculateCartQuantity,
  calculateCartSubtotalMinor,
  calculateCartTotalMinor,
} from '../utils/cartCalculations.js';
import {
  clearStoredCart,
  loadStoredCart,
  saveStoredCart,
} from '../services/cartStorageService.js';

export function CartProvider({ tableId, children }) {
  const [state, dispatch] = useReducer(
    cartReducer,
    tableId,
    (validatedTableId) => loadStoredCart(validatedTableId)
  );

  useEffect(() => {
    saveStoredCart(tableId, state.items);
  }, [state.items, tableId]);

  const addItem = useCallback((menuItem, options = {}) => {
    dispatch({
      type: CART_ACTIONS.ADD_ITEM,
      payload: {
        menuItem,
        quantity: options.quantity ?? 1,
        specialInstructions: options.specialInstructions || '',
      },
    });
  }, []);

  const removeItem = useCallback((lineId) => {
    dispatch({ type: CART_ACTIONS.REMOVE_ITEM, payload: { lineId } });
  }, []);

  const increaseQuantity = useCallback((lineId) => {
    dispatch({ type: CART_ACTIONS.INCREASE_QUANTITY, payload: { lineId } });
  }, []);

  const decreaseQuantity = useCallback((lineId) => {
    dispatch({ type: CART_ACTIONS.DECREASE_QUANTITY, payload: { lineId } });
  }, []);

  const updateInstructions = useCallback((lineId, specialInstructions) => {
    dispatch({
      type: CART_ACTIONS.UPDATE_INSTRUCTIONS,
      payload: { lineId, specialInstructions },
    });
  }, []);

  const clearCart = useCallback(() => {
    clearStoredCart(tableId);
    dispatch({ type: CART_ACTIONS.CLEAR_CART });
  }, [tableId]);

  const value = useMemo(() => {
    const subtotalMinor = calculateCartSubtotalMinor(state.items);

    return {
      items: state.items,
      itemCount: calculateCartQuantity(state.items),
      subtotalMinor,
      totalMinor: calculateCartTotalMinor(state.items),
      addItem,
      removeItem,
      increaseQuantity,
      decreaseQuantity,
      updateInstructions,
      clearCart,
    };
  }, [
    state.items,
    addItem,
    removeItem,
    increaseQuantity,
    decreaseQuantity,
    updateInstructions,
    clearCart,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
