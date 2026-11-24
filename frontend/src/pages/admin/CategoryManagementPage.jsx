import { useEffect, useState } from 'react';
import CategoryForm from '../../components/admin/CategoryForm.jsx';
import CategoryTable from '../../components/admin/CategoryTable.jsx';
import {
  createCategory,
  deactivateCategory,
  getCategories,
  updateCategory,
} from '../../services/adminCategoryService.js';

function CategoryManagementPage() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeactivateId, setPendingDeactivateId] = useState(null);
  const [showArchivedCategories, setShowArchivedCategories] = useState(false);

  async function loadCategories() {
    const data = await getCategories({ includeInactive: showArchivedCategories });
    setCategories(data);
  }

  useEffect(() => {
    let isMounted = true;

    getCategories({ includeInactive: showArchivedCategories })
      .then((data) => {
        if (isMounted) {
          setCategories(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Could not load categories.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [showArchivedCategories]);

  async function handleSubmit(payload) {
    setIsSaving(true);
    setMessage('');
    setErrorMessage('');

    try {
      if (selectedCategory) {
        await updateCategory(selectedCategory.id, payload);
        setMessage('Category updated successfully.');
      } else {
        await createCategory(payload);
        setMessage('Category created successfully.');
      }

      setSelectedCategory(null);
      await loadCategories();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Category save failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate(id) {
    const confirmed = window.confirm(
      'Deactivate this category? Existing menu items will remain unchanged.'
    );

    if (!confirmed) {
      return;
    }

    setMessage('');
    setErrorMessage('');
    setPendingDeactivateId(id);

    try {
      await deactivateCategory(id);
      setMessage('Category deactivated. Existing items were not deactivated.');
      await loadCategories();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Category deactivation failed.');
    } finally {
      setPendingDeactivateId(null);
    }
  }

  return (
    <div className="management-grid">
      <CategoryForm
        key={selectedCategory?.id || 'new-category'}
        selectedCategory={selectedCategory}
        onSubmit={handleSubmit}
        onCancel={() => setSelectedCategory(null)}
        isSaving={isSaving}
      />
      <section className="management-list">
        <div className="management-list-heading">
          <div>
            <h3>{showArchivedCategories ? 'All Categories' : 'Active Categories'}</h3>
            <p>
              {showArchivedCategories
                ? 'Archived test and deactivated categories are shown for maintenance only.'
                : 'Only genuine active menu categories are shown.'}
            </p>
          </div>
          <label className="archive-filter-control">
            <input
              type="checkbox"
              checked={showArchivedCategories}
              onChange={(event) => setShowArchivedCategories(event.target.checked)}
            />
            Show Archived Categories
          </label>
        </div>
        {message && <p className="success-message">{message}</p>}
        {errorMessage && <p className="form-error">{errorMessage}</p>}
        <CategoryTable
          categories={categories}
          isLoading={isLoading}
          onEdit={setSelectedCategory}
          onDeactivate={handleDeactivate}
          pendingDeactivateId={pendingDeactivateId}
        />
      </section>
    </div>
  );
}

export default CategoryManagementPage;
