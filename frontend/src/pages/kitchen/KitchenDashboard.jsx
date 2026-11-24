import { useAuth } from '../../hooks/useAuth.js';
import { useKitchenOrders } from '../../hooks/useKitchenOrders.js';
import KitchenConnectionStatus from '../../components/kitchen/KitchenConnectionStatus.jsx';
import KitchenOrderGrid from '../../components/kitchen/KitchenOrderGrid.jsx';

function KitchenDashboard() {
  const { logout, token, user } = useAuth();
  const {
    orders,
    isLoading,
    error,
    connectionStatus,
    pendingOrderIds,
    actionErrors,
    retry,
    changeStatus,
  } = useKitchenOrders(token);

  return (
    <section className="page-section kitchen-dashboard">
      <header className="kitchen-dashboard-header">
        <div>
          <p className="eyebrow">Hafiz Foods Kitchen</p>
          <h2>Kitchen Dashboard</h2>
          <p>Signed in as {user.name}. New orders appear automatically.</p>
        </div>
        <div className="kitchen-dashboard-actions">
          <KitchenConnectionStatus status={connectionStatus} />
          <button className="secondary-button" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {isLoading && <p className="status-message">Loading active kitchen orders…</p>}

      {error && !isLoading && (
        <div className="kitchen-load-error" role="alert">
          <p>{error}</p>
          <button type="button" className="secondary-button" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {!isLoading && (
        <KitchenOrderGrid
          orders={orders}
          pendingOrderIds={pendingOrderIds}
          actionErrors={actionErrors}
          onChangeStatus={changeStatus}
        />
      )}
    </section>
  );
}

export default KitchenDashboard;
