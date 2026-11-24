import { useEffect, useMemo, useState } from 'react';
import MenuItemForm from '../../components/admin/MenuItemForm.jsx';
import MenuItemTable from '../../components/admin/MenuItemTable.jsx';
import { getCategories } from '../../services/adminCategoryService.js';
import {
  createMenuItem,
  deactivateMenuItem,
  getMenuItems,
  updateMenuItem,
  updateMenuItemAvailability,
} from '../../services/adminMenuItemService.js';

function MenuItemManagementPage() {
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingActionId, setPendingActionId] = useState(null);
  const [showArchivedItems, setShowArchivedItems] = useState(false);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories]
  );

  async function loadData() {
    const [categoryData, menuItemData] = await Promise.all([
      getCategories({ includeInactive: true }),
      getMenuItems({ includeInactive: showArchivedItems }),
    ]);
    setCategories(categoryData);
    setMenuItems(menuItemData);
  }

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getCategories({ includeInactive: true }),
      getMenuItems({ includeInactive: showArchivedItems }),
    ])
      .then(([categoryData, menuItemData]) => {
        if (isMounted) {
          setCategories(categoryData);
          setMenuItems(menuItemData);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Could not load menu management data.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [showArchivedItems]);

  async function handleSubmit(payload) {
    setIsSaving(true);
    setMessage('');
    setErrorMessage('');

    try {
      if (selectedItem) {
        await updateMenuItem(selectedItem.id, payload);
        setMessage('Menu item updated successfully.');
      } else {
        await createMenuItem(payload);
        setMessage('Menu item created successfully.');
      }

      setSelectedItem(null);
      await loadData();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Menu item save failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleAvailability(item) {
    setPendingActionId(item.id);
    setMessage('');
    setErrorMessage('');

    try {
      await updateMenuItemAvailability(item.id, !item.is_available);
      setMessage('Menu item availability updated.');
      await loadData();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Availability update failed.');
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleDeactivate(id) {
    const confirmed = window.confirm('Deactivate this menu item? It will no longer be active.');

    if (!confirmed) {
      return;
    }

    setMessage('');
    setErrorMessage('');
    setPendingActionId(id);

    try {
      await deactivateMenuItem(id);
      setMessage('Menu item deactivated.');
      await loadData();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Menu item deactivation failed.');
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div className="management-grid">
      <MenuItemForm
        key={selectedItem?.id || 'new-menu-item'}
        activeCategories={activeCategories}
        selectedItem={selectedItem}
        onSubmit={handleSubmit}
        onCancel={() => setSelectedItem(null)}
        isSaving={isSaving}
      />
      <section className="management-list">
        <div className="management-list-heading">
          <div>
            <h3>{showArchivedItems ? 'All Menu Items' : 'Active Menu Items'}</h3>
            <p>
              {showArchivedItems
                ? 'Archived items are shown for review and remain excluded from the customer menu.'
                : 'Only active items are shown. Use the archive filter to review deactivated records.'}
            </p>
          </div>
          <label className="archive-filter-control">
            <input
              type="checkbox"
              checked={showArchivedItems}
              onChange={(event) => setShowArchivedItems(event.target.checked)}
            />
            Show Archived Items
          </label>
        </div>
        {message && <p className="success-message">{message}</p>}
        {errorMessage && <p className="form-error">{errorMessage}</p>}
        <MenuItemTable
          isLoading={isLoading}
          menuItems={menuItems}
          onEdit={setSelectedItem}
          onToggleAvailability={handleToggleAvailability}
          onDeactivate={handleDeactivate}
          pendingActionId={pendingActionId}
        />
      </section>
    </div>
  );
}

export default MenuItemManagementPage;
