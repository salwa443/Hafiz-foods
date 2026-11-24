import { Link } from 'react-router-dom';

function UnauthorizedPage() {
  return (
    <section className="page-section">
      <h2>Access Denied</h2>
      <p>Your staff role does not have permission to view this page.</p>
      <Link className="button-link" to="/">
        Go Home
      </Link>
    </section>
  );
}

export default UnauthorizedPage;
