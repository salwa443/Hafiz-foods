const STATUS_LABELS = {
  connected: 'Live updates connected',
  connecting: 'Connecting to live updates…',
  disconnected: 'Live updates disconnected',
  error: 'Unable to connect to live updates',
};

function KitchenConnectionStatus({ status }) {
  return (
    <p className={`kitchen-connection-status ${status}`} role="status">
      <span aria-hidden="true" />
      {STATUS_LABELS[status] || STATUS_LABELS.disconnected}
    </p>
  );
}

export default KitchenConnectionStatus;
