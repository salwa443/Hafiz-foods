import { useState } from 'react';

const emptyForm = {
  name: '',
  description: '',
  displayOrder: 0,
};

function CategoryForm({ selectedCategory, onSubmit, onCancel, isSaving }) {
  const [formData, setFormData] = useState(() => {
    if (selectedCategory) {
      return {
        name: selectedCategory.name || '',
        description: selectedCategory.description || '',
        displayOrder: selectedCategory.display_order ?? 0,
      };
    }

    return emptyForm;
  });
  const [validationMessage, setValidationMessage] = useState('');

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setValidationMessage('');

    if (!formData.name.trim()) {
      setValidationMessage('Category name is required.');
      return;
    }

    if (Number(formData.displayOrder) < 0) {
      setValidationMessage('Display order must be zero or greater.');
      return;
    }

    await onSubmit({
      ...formData,
      name: formData.name.trim(),
      description: formData.description.trim(),
      displayOrder: Number(formData.displayOrder),
    });

    if (!selectedCategory) {
      setFormData(emptyForm);
    }
  }

  return (
    <form className="management-form" onSubmit={handleSubmit}>
      <h3>{selectedCategory ? 'Edit Category' : 'Add Category'}</h3>
      <label>
        Name
        <input
          name="name"
          aria-invalid={Boolean(validationMessage && !formData.name.trim())}
          value={formData.name}
          onChange={handleChange}
          maxLength={120}
          required
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows="3"
        />
      </label>
      <label>
        Display Order
        <input
          name="displayOrder"
          type="number"
          min="0"
          value={formData.displayOrder}
          onChange={handleChange}
        />
      </label>
      {validationMessage && <p className="form-error">{validationMessage}</p>}
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Category'}
        </button>
        {selectedCategory && (
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default CategoryForm;
