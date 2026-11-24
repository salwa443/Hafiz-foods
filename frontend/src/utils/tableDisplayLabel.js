export function getTableDisplayLabel(table) {
  if (!table) return '';

  return table.tableDisplayLabel ||
    table.table_display_label ||
    table.tableNumber ||
    table.table_number ||
    '';
}
