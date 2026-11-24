const STATUS_ACTIONS = Object.freeze({
  new: Object.freeze({ label: 'Accept Order', targetStatus: 'accepted' }),
  accepted: Object.freeze({ label: 'Start Preparing', targetStatus: 'preparing' }),
  preparing: Object.freeze({ label: 'Mark Ready', targetStatus: 'ready' }),
  ready: Object.freeze({ label: 'Mark Completed', targetStatus: 'completed' }),
});

export function getKitchenOrderAction(status) {
  return STATUS_ACTIONS[status] || null;
}
