export function formatTableDisplayLabel(tableNumber, tableId) {
  const existingLabel = typeof tableNumber === 'string'
    ? tableNumber.trim().match(/^T(\d+)$/i)
    : null;

  if (existingLabel) {
    return `T${existingLabel[1].padStart(2, '0')}`;
  }

  const numericId = Number(tableId);

  if (Number.isInteger(numericId) && numericId > 0) {
    return `T${String(numericId).padStart(2, '0')}`;
  }

  return tableNumber;
}
