import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <section className="page-section">
      <h2>Page Not Found</h2>
      <p>The requested page does not exist.</p>
      <Link className="button-link" to="/">
        Go Home
      </Link>
    </section>
  );
}

export default NotFoundPage;
