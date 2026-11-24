import { useState } from 'react';

const emptyForm = {
  tableNumber: '',
  status: 'available',
};

function TableForm({ isSaving, onCancel, onSubmit, selectedTable }) {
  const [formData, setFormData] = useState(() => {
    if (selectedTable) {
      return {
        tableNumber: selectedTable.table_number || '',
        status: selectedTable.status || 'available',
      };
    }

    return emptyForm;
  });
  const [validationError, setValidationError] = useState('');

  function handleChange(event) {
    const { name, value } = event.target;

    setValidationError('');
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const tableNumber = formData.tableNumber.trim();

    if (!tableNumber) {
      setValidationError('Table number is required.');
      return;
    }

    if (!/^[A-Za-z0-9_-]+$/.test(tableNumber)) {
      setValidationError('Table number may only contain letters, numbers, underscores and hyphens.');
      return;
    }

    await onSubmit({
      tableNumber,
      status: formData.status,
    });

    if (!selectedTable) {
      setFormData(emptyForm);
      setValidationError('');
      event.target.reset();
    }
  }

  return (
    <form className="management-form" onSubmit={handleSubmit}>
      <h3>{selectedTable ? 'Edit Table' : 'Add Table'}</h3>
      <label>
        Table Number
        <input
          name="tableNumber"
          value={formData.tableNumber}
          maxLength={20}
          onChange={handleChange}
          required
          aria-invalid={validationError.includes('Table number') ? 'true' : 'false'}
        />
      </label>
      <label>
        Status
        <select name="status" value={formData.status} onChange={handleChange}>
          <option value="available">Available</option>
          {selectedTable?.status === 'occupied' && (
            <option value="occupied">Occupied (managed by active orders)</option>
          )}
          <option value="inactive">Inactive</option>
        </select>
      </label>
      {validationError && <p className="form-error">{validationError}</p>}
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Table'}
        </button>
        {selectedTable && (
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default TableForm;
