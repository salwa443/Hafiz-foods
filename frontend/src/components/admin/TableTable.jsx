import { getTableDisplayLabel } from '../../utils/tableDisplayLabel.js';

function statusClassName(value) {
  if (value === 'available') {
    return 'status-pill active';
  }

  if (value === 'occupied') {
    return 'status-pill warning';
  }

  return 'status-pill inactive';
}

function TableTable({
  isLoading,
  onDeactivate,
  onEdit,
  onGenerateQr,
  onPreviewQr,
  onRegenerateQr,
  onReactivate,
  pendingAction,
  selectedQrTableId,
  tables,
}) {
  if (isLoading) {
    return <p className="status-message">Loading tables...</p>;
  }

  if (tables.length === 0) {
    return <p className="status-message">No restaurant tables have been added yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table admin-table-management">
        <thead>
          <tr>
            <th>Table</th>
            <th>Status</th>
            <th>State</th>
            <th>QR Code</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((table) => (
            <tr key={table.id}>
              <td>{getTableDisplayLabel(table)}</td>
              <td>
                <span className={statusClassName(table.status)}>
                  {table.status.charAt(0).toUpperCase() + table.status.slice(1)}
                </span>
              </td>
              <td>
                <span className={table.is_active ? 'status-pill active' : 'status-pill inactive'}>
                  {table.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>{table.qr_code_data ? 'Available' : 'Not generated'}</td>
              <td>
                <div className="row-actions">
                  <button
                    type="button"
                    disabled={!table.is_active || pendingAction?.id === table.id}
                    onClick={() => onEdit(table)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={!table.is_active || pendingAction?.id === table.id}
                    onClick={() => onGenerateQr(table)}
                  >
                    Generate QR
                  </button>
                  <button
                    type="button"
                    disabled={!table.is_active || pendingAction?.id === table.id}
                    onClick={() => onRegenerateQr(table)}
                  >
                    Regenerate QR
                  </button>
                  <button
                    type="button"
                    disabled={!table.is_active || pendingAction?.id === table.id}
                    onClick={() => onPreviewQr(table)}
                  >
                    {selectedQrTableId === table.id ? 'Refresh Preview' : 'Preview QR'}
                  </button>
                  {table.is_active && (
                    <button
                      type="button"
                      disabled={pendingAction?.id === table.id}
                      onClick={() => onDeactivate(table.id)}
                    >
                      {pendingAction?.type === 'deactivate' && pendingAction.id === table.id
                        ? 'Deactivating...'
                        : 'Deactivate'}
                    </button>
                  )}
                  {!table.is_active && (
                    <button
                      type="button"
                      disabled={pendingAction?.id === table.id}
                      onClick={() => onReactivate(table)}
                    >
                      {pendingAction?.type === 'reactivate' && pendingAction.id === table.id
                        ? 'Reactivating...'
                        : 'Reactivate Table'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TableTable;
