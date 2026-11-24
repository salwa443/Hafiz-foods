import { formatCurrency } from '../../utils/formatCurrency.js';
import { useState } from 'react';
import { menuImageFallbackUrl, resolveMenuImageUrl } from '../../utils/menuImageUrl.js';

function MenuItemThumbnail({ item }) {
  const resolvedImageUrl = resolveMenuImageUrl(item.image_url);
  const [hasFailed, setHasFailed] = useState(false);

  return (
    <img
      className="menu-thumb"
      src={hasFailed ? menuImageFallbackUrl : resolvedImageUrl}
      alt={hasFailed ? `${item.name} placeholder` : item.name}
      onError={() => setHasFailed(true)}
    />
  );
}

function MenuItemTable({
  isLoading,
  menuItems,
  onEdit,
  onToggleAvailability,
  onDeactivate,
  pendingActionId,
}) {
  if (isLoading) {
    return <p className="status-message">Loading menu items...</p>;
  }

  if (menuItems.length === 0) {
    return <p className="status-message">No menu items have been added yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Image</th>
            <th>Name</th>
            <th>Category</th>
            <th>Price</th>
            <th>Availability</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {menuItems.map((item) => (
            <tr key={item.id}>
              <td>
                <MenuItemThumbnail item={item} />
              </td>
              <td>{item.name}</td>
              <td>{item.category_name}</td>
              <td>{formatCurrency(item.price)}</td>
              <td>
                <span className={item.is_available ? 'status-pill active' : 'status-pill inactive'}>
                  {item.is_available ? 'Available' : 'Unavailable'}
                </span>
              </td>
              <td>
                <span className={item.is_active ? 'status-pill active' : 'status-pill inactive'}>
                  {item.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <div className="row-actions">
                  <button
                    type="button"
                    disabled={pendingActionId === item.id}
                    onClick={() => onEdit(item)}
                  >
                    Edit
                  </button>
                  {item.is_active && (
                    <>
                      <button
                        type="button"
                        disabled={pendingActionId === item.id}
                        onClick={() => onToggleAvailability(item)}
                      >
                        {pendingActionId === item.id
                          ? 'Updating...'
                          : item.is_available
                            ? 'Mark Unavailable'
                            : 'Mark Available'}
                      </button>
                      <button
                        type="button"
                        disabled={pendingActionId === item.id}
                        onClick={() => onDeactivate(item.id)}
                      >
                        {pendingActionId === item.id ? 'Working...' : 'Deactivate'}
                      </button>
                    </>
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

export default MenuItemTable;
