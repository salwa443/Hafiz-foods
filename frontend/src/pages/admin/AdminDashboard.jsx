import { useEffect, useState } from 'react';
import AdminSummaryCards from '../../components/admin/AdminSummaryCards.jsx';
import { getAdminSummary } from '../../services/adminCategoryService.js';

function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    getAdminSummary()
      .then((data) => {
        if (isMounted) {
          setSummary(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Could not load admin dashboard summary.');
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
  }, []);

  return (
    <section className="admin-dashboard">
      <div className="dashboard-heading">
        <div>
          <h2>Dashboard</h2>
          <p>Live menu-management summary from the backend.</p>
        </div>
        {isLoading && <p className="status-message">Loading summary...</p>}
      </div>
      {errorMessage && <p className="form-error">{errorMessage}</p>}
      <AdminSummaryCards isLoading={isLoading} summary={summary} />
    </section>
  );
}

export default AdminDashboard;
