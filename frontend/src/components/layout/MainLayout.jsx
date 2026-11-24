import { Link, NavLink, Outlet } from 'react-router-dom';
import { UtensilsCrossed } from 'lucide-react';

function MainLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="site-brand" to="/" aria-label="Hafiz Foods home">
          <span className="site-brand-mark" aria-hidden="true">
            <UtensilsCrossed size={22} strokeWidth={2.3} />
          </span>
          <div>
            <p className="eyebrow">Freshly prepared</p>
            <h1>Hafiz Foods</h1>
          </div>
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/staff/login">Staff Login</NavLink>
        </nav>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;
