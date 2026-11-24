function CategoryTable({ categories, isLoading, onEdit, onDeactivate, pendingDeactivateId }) {
  if (isLoading) {
    return <p className="status-message">Loading categories...</p>;
  }

  if (categories.length === 0) {
    return <p className="status-message">No categories found.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Order</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id}>
              <td>{category.name}</td>
              <td>{category.description || '-'}</td>
              <td>{category.display_order}</td>
              <td>
                <span className={category.is_active ? 'status-pill active' : 'status-pill inactive'}>
                  {category.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <div className="row-actions">
                  <button type="button" onClick={() => onEdit(category)}>
                    Edit
                  </button>
                  {category.is_active && (
                    <button
                      type="button"
                      disabled={pendingDeactivateId === category.id}
                      onClick={() => onDeactivate(category.id)}
                    >
                      {pendingDeactivateId === category.id ? 'Deactivating...' : 'Deactivate'}
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

export default CategoryTable;
