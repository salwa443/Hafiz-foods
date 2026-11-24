function QRCodePanel({ isLoading, onDownload, onPrint, qrInfo }) {
  if (isLoading) {
    return (
      <section className="qr-panel">
        <h3>QR Preview</h3>
        <p className="status-message">Loading QR code...</p>
      </section>
    );
  }

  if (!qrInfo) {
    return (
      <section className="qr-panel">
        <h3>QR Preview</h3>
        <p className="status-message">Select Preview QR or Generate QR for an active table.</p>
      </section>
    );
  }

  const tableLabel = qrInfo.tableDisplayLabel || qrInfo.tableNumber;

  return (
    <section className="qr-panel">
      <div>
        <p className="eyebrow">QR Code</p>
        <h3>Table {tableLabel}</h3>
      </div>
      {qrInfo.qrImageDataUrl ? (
        <div className="qr-preview-card">
          <img src={qrInfo.qrImageDataUrl} alt={`QR code for table ${tableLabel}`} />
          <div>
            <strong>QR URL</strong>
            <p>{qrInfo.qrUrl}</p>
          </div>
        </div>
      ) : (
        <p className="status-message">QR information is available. Generate the QR preview to view the image.</p>
      )}
      <div className="form-actions">
        <button className="primary-button" type="button" onClick={() => onDownload(qrInfo)}>
          Download PNG
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!qrInfo.qrImageDataUrl}
          onClick={() => onPrint(qrInfo)}
        >
          Print QR
        </button>
      </div>
    </section>
  );
}

export default QRCodePanel;
