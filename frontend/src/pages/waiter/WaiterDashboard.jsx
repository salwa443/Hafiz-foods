import { useAuth } from '../../hooks/useAuth.js';
import { RefreshCw, UtensilsCrossed } from 'lucide-react';
import { useWaiterOrders } from '../../hooks/useWaiterOrders.js';
import WaiterOrderCard from '../../components/waiter/WaiterOrderCard.jsx';

function WaiterDashboard() {
  const { logout, token, user } = useAuth();
  const { orders, isLoading, error, success, connectionStatus, pendingOrderId, retry, act } = useWaiterOrders(token);
  const unclaimed = orders.filter((order) => !order.assignedWaiter);
  const assigned = orders.filter((order) => order.assignedWaiter);

  return (
    <section className="waiter-dashboard">
      <header className="waiter-dashboard-header">
        <div><p className="eyebrow">Hafiz Foods service</p><h2>Ready Orders</h2><p>Welcome, {user.name}. Claim prepared orders and deliver them to the correct table.</p></div>
        <div className="waiter-header-actions"><span className={`waiter-connection ${connectionStatus}`}><i />{connectionStatus}</span><button className="secondary-button" onClick={logout}>Logout</button></div>
      </header>
      {error && <div className="waiter-message error"><p>{error}</p><button className="secondary-button" onClick={retry}><RefreshCw size={17}/>Retry</button></div>}
      {success && <p className="waiter-message success">{success}</p>}
      {isLoading ? <p className="status-message">Loading ready orders...</p> : orders.length === 0 ? (
        <div className="waiter-empty"><UtensilsCrossed size={34}/><h3>No orders are waiting</h3><p>New ready orders will appear here automatically.</p></div>
      ) : (
        <>
          <section className="waiter-queue"><div className="waiter-section-title"><h3>Unclaimed</h3><span>{unclaimed.length}</span></div><div className="waiter-order-grid">{unclaimed.map((order)=><WaiterOrderCard key={order.orderId} order={order} currentUserId={user.id} pending={pendingOrderId===order.orderId} onAction={act}/>)}</div></section>
          <section className="waiter-queue"><div className="waiter-section-title"><h3>Assigned Orders</h3><span>{assigned.length}</span></div><div className="waiter-order-grid">{assigned.map((order)=><WaiterOrderCard key={order.orderId} order={order} currentUserId={user.id} pending={pendingOrderId===order.orderId} onAction={act}/>)}</div></section>
        </>
      )}
    </section>
  );
}

export default WaiterDashboard;
