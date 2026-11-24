import { useEffect, useRef, useState } from 'react';
import { resolveMenuImageUrl } from '../../utils/menuImageUrl.js';

const emptyForm = {
  categoryId: '',
  name: '',
  description: '',
  price: '',
  isAvailable: true,
  image: null,
  imagePreviewUrl: '',
};

function MenuItemForm({ activeCategories, selectedItem, onSubmit, onCancel, isSaving }) {
  const previewObjectUrlRef = useRef('');
  const [validationError, setValidationError] = useState('');
  const [formData, setFormData] = useState(() => {
    if (selectedItem) {
      return {
        categoryId: selectedItem.category_id,
        name: selectedItem.name || '',
        description: selectedItem.description || '',
        price: selectedItem.price || '',
        isAvailable: Boolean(selectedItem.is_available),
        image: null,
        imagePreviewUrl: '',
      };
    }

    return emptyForm;
  });

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

  function handleChange(event) {
    const { checked, files, name, type, value } = event.target;

    setValidationError('');

    if (type === 'file') {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }

      const image = files[0] || null;
      const imagePreviewUrl = image ? URL.createObjectURL(image) : '';
      previewObjectUrlRef.current = imagePreviewUrl;

      setFormData((current) => ({
        ...current,
        image,
        imagePreviewUrl,
      }));
      return;
    }

    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const name = formData.name.trim();
    const description = formData.description.trim();
    const price = Number(formData.price);
    const categoryId = Number(formData.categoryId);

    if (!categoryId) {
      setValidationError('Please select an active category.');
      return;
    }

    if (!name) {
      setValidationError('Menu item name is required.');
      return;
    }

    if (Number.isNaN(price) || price < 0) {
      setValidationError('Price must be zero or greater.');
      return;
    }

    await onSubmit({
      ...formData,
      categoryId,
      description,
      name,
      price,
    });

    if (!selectedItem) {
      setFormData(emptyForm);
      setValidationError('');
      event.target.reset();
    }
  }

  const existingImagePreview =
    selectedItem?.image_url && !formData.imagePreviewUrl
      ? resolveMenuImageUrl(selectedItem.image_url)
      : '';
  const previewSrc = formData.imagePreviewUrl || existingImagePreview;

  return (
    <form className="management-form" onSubmit={handleSubmit}>
      <h3>{selectedItem ? 'Edit Menu Item' : 'Add Menu Item'}</h3>
      <label>
        Category
        <select
          name="categoryId"
          value={formData.categoryId}
          onChange={handleChange}
          required
          disabled={activeCategories.length === 0}
        >
          <option value="">Select category</option>
          {activeCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      {activeCategories.length === 0 && (
        <p className="form-error">Create an active category before adding menu items.</p>
      )}
      <label>
        Name
        <input
          name="name"
          value={formData.name}
          onChange={handleChange}
          maxLength={160}
          required
          aria-invalid={validationError.includes('name') ? 'true' : 'false'}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows="3"
          maxLength={1500}
        />
      </label>
      <label>
        Price
        <input
          name="price"
          type="number"
          min="0"
          step="0.01"
          value={formData.price}
          onChange={handleChange}
          required
          aria-invalid={validationError.includes('Price') ? 'true' : 'false'}
        />
      </label>
      <label>
        Image
        <input
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleChange}
        />
      </label>
      {previewSrc && (
        <div className="image-preview">
          <span>{formData.image ? 'Selected Image Preview' : 'Current Image'}</span>
          <img src={previewSrc} alt="Selected menu item" />
        </div>
      )}
      <label className="checkbox-row">
        <input
          name="isAvailable"
          type="checkbox"
          checked={formData.isAvailable}
          onChange={handleChange}
        />
        Available
      </label>
      {validationError && <p className="form-error">{validationError}</p>}
      <div className="form-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={isSaving || activeCategories.length === 0}
        >
          {isSaving ? 'Saving...' : 'Save Item'}
        </button>
        {selectedItem && (
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default MenuItemForm;
