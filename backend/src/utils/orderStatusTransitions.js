export const ORDER_STATUSES = Object.freeze([
  'new',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'cancelled',
]);

export const ORDER_STATUS_ACTORS = Object.freeze({
  KITCHEN: 'kitchen',
  CUSTOMER: 'customer',
});

export const TERMINAL_ORDER_STATUSES = Object.freeze(['completed', 'cancelled']);

export const ORDER_TRANSITION_ERROR_CODES = Object.freeze({
  UNKNOWN_CURRENT_STATUS: 'UNKNOWN_CURRENT_STATUS',
  UNKNOWN_REQUESTED_STATUS: 'UNKNOWN_REQUESTED_STATUS',
  UNKNOWN_ACTOR: 'UNKNOWN_ACTOR',
  DUPLICATE_TRANSITION: 'DUPLICATE_TRANSITION',
  TERMINAL_STATUS: 'TERMINAL_STATUS',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  ACTOR_NOT_AUTHORIZED: 'ACTOR_NOT_AUTHORIZED',
});

const transitionRules = Object.freeze([
  Object.freeze({ currentStatus: 'new', nextStatus: 'accepted', actor: 'kitchen' }),
  Object.freeze({ currentStatus: 'accepted', nextStatus: 'preparing', actor: 'kitchen' }),
  Object.freeze({ currentStatus: 'preparing', nextStatus: 'ready', actor: 'kitchen' }),
  Object.freeze({ currentStatus: 'ready', nextStatus: 'completed', actor: 'kitchen' }),
  Object.freeze({ currentStatus: 'new', nextStatus: 'cancelled', actor: 'customer' }),
]);

export const ORDER_STATUS_TRANSITIONS = transitionRules;

export function isKnownOrderStatus(status) {
  return ORDER_STATUSES.includes(status);
}

export function isTerminalOrderStatus(status) {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

export function validateOrderStatusTransition({ currentStatus, nextStatus, actor }) {
  if (!isKnownOrderStatus(currentStatus)) {
    return {
      valid: false,
      code: ORDER_TRANSITION_ERROR_CODES.UNKNOWN_CURRENT_STATUS,
      message: 'Current order status is not recognized.',
    };
  }

  if (!isKnownOrderStatus(nextStatus)) {
    return {
      valid: false,
      code: ORDER_TRANSITION_ERROR_CODES.UNKNOWN_REQUESTED_STATUS,
      message: 'Requested order status is not recognized.',
    };
  }

  if (!Object.values(ORDER_STATUS_ACTORS).includes(actor)) {
    return {
      valid: false,
      code: ORDER_TRANSITION_ERROR_CODES.UNKNOWN_ACTOR,
      message: 'Order status actor is not recognized.',
    };
  }

  if (currentStatus === nextStatus) {
    return {
      valid: false,
      code: ORDER_TRANSITION_ERROR_CODES.DUPLICATE_TRANSITION,
      message: 'Order is already in the requested status.',
    };
  }

  if (isTerminalOrderStatus(currentStatus)) {
    return {
      valid: false,
      code: ORDER_TRANSITION_ERROR_CODES.TERMINAL_STATUS,
      message: 'A completed or cancelled order cannot change status.',
    };
  }

  const matchingTransition = transitionRules.find(
    (rule) =>
      rule.currentStatus === currentStatus && rule.nextStatus === nextStatus
  );

  if (!matchingTransition) {
    return {
      valid: false,
      code: ORDER_TRANSITION_ERROR_CODES.INVALID_TRANSITION,
      message: `Order cannot move from ${currentStatus} to ${nextStatus}.`,
    };
  }

  if (matchingTransition.actor !== actor) {
    return {
      valid: false,
      code: ORDER_TRANSITION_ERROR_CODES.ACTOR_NOT_AUTHORIZED,
      message: 'This actor is not authorized for the requested transition.',
    };
  }

  return { valid: true, code: null, message: null };
}
