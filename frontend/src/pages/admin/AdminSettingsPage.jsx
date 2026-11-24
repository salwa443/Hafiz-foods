import MenuItemManagementPage from './MenuItemManagementPage.jsx';

function AdminSettingsPage() {
  return (
    <section className="admin-settings-page">
      <header className="admin-settings-heading">
        <div>
          <p className="eyebrow">Admin settings</p>
          <h3>Menu item controls</h3>
          <p>
            Add new dishes, edit menu information and prices, update images,
            control availability, or safely deactivate an item.
          </p>
        </div>
      </header>

      <MenuItemManagementPage />
    </section>
  );
}

export default AdminSettingsPage;
