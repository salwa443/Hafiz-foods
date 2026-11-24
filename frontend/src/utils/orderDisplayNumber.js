import { getTableDisplayLabel } from './tableDisplayLabel.js';

export function getOrderDisplayNumber(order, fallbackTableLabel = '') {
  const orderId = typeof order === 'string' ? order : order?.orderId;
  if (!orderId) return '';

  const compactId = orderId.replace(/^ORD-/i, '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const shortId = compactId.slice(-5) || 'ORDER';
  const tableLabel = typeof order === 'string'
    ? fallbackTableLabel
    : getTableDisplayLabel(order) || fallbackTableLabel;

  return tableLabel ? `${tableLabel}-${shortId}` : shortId;
}
