import { NavLink, Outlet } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';

function AdminShell() {
  const { logout, user } = useAuth();

  return (
    <section className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Hafiz Foods Admin</p>
          <h2>Restaurant Management</h2>
          <p>Signed in as {user.name}</p>
        </div>
        <button className="secondary-button" type="button" onClick={logout}>
          Logout
        </button>
      </header>

      <nav className="admin-tabs" aria-label="Admin navigation">
        <NavLink end to="/admin">
          Dashboard
        </NavLink>
        <NavLink to="/admin/tables">Tables</NavLink>
        <NavLink to="/admin/categories">Categories</NavLink>
        <NavLink className="admin-settings-link" to="/admin/settings">
          <Settings size={17} aria-hidden="true" /> Settings
        </NavLink>
      </nav>

      <Outlet />
    </section>
  );
}

export default AdminShell;
