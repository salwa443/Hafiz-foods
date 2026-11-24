import { useEffect, useState } from 'react';
import QRCodePanel from '../../components/admin/QRCodePanel.jsx';
import TableForm from '../../components/admin/TableForm.jsx';
import TableTable from '../../components/admin/TableTable.jsx';
import {
  createTable,
  deactivateTable,
  downloadTableQr,
  generateTableQr,
  getTables,
  regenerateTableQr,
  reactivateTable,
  updateTable,
} from '../../services/adminTableService.js';

function printQr(qrInfo) {
  const tableLabel = qrInfo.tableDisplayLabel || qrInfo.tableNumber;
  const printWindow = window.open('', '_blank', 'width=720,height=840');

  if (!printWindow) {
    throw new Error('Could not open the print window. Please allow pop-ups for this site.');
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Table ${tableLabel} QR Code</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 32px;
            color: #102a43;
            text-align: center;
          }
          .print-sheet {
            display: grid;
            gap: 18px;
            justify-items: center;
            margin: 0 auto;
            max-width: 520px;
            border: 2px solid #102a43;
            padding: 28px;
          }
          h1, p { margin: 0; }
          img {
            width: 360px;
            height: 360px;
          }
          .url {
            overflow-wrap: anywhere;
            font-size: 12px;
            color: #52606d;
          }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <main class="print-sheet">
          <p>Hafiz Foods</p>
          <h1>Table ${tableLabel}</h1>
          <img src="${qrInfo.qrImageDataUrl}" alt="QR code for table ${tableLabel}" />
          <p>Scan to open this table's menu.</p>
          <p class="url">${qrInfo.qrUrl}</p>
          <button type="button" onclick="window.print()">Print</button>
        </main>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function TableManagementPage() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedQr, setSelectedQr] = useState(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [showArchivedTables, setShowArchivedTables] = useState(false);

  async function loadTables() {
    const data = await getTables({ includeInactive: showArchivedTables });
    setTables(data);
  }

  useEffect(() => {
    let isMounted = true;

    getTables({ includeInactive: showArchivedTables })
      .then((data) => {
        if (isMounted) {
          setTables(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Could not load restaurant tables.');
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
  }, [showArchivedTables]);

  async function handleSubmit(payload) {
    setIsSaving(true);
    setMessage('');
    setErrorMessage('');

    try {
      if (selectedTable) {
        await updateTable(selectedTable.id, payload);
        setMessage('Table updated successfully.');
      } else {
        await createTable(payload);
        setMessage('Table created successfully.');
      }

      setSelectedTable(null);
      await loadTables();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Table save failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate(id) {
    const confirmed = window.confirm(
      'Deactivate this table? It will remain in history but will no longer be treated as active.'
    );

    if (!confirmed) {
      return;
    }

    setMessage('');
    setErrorMessage('');
    setPendingAction({ id, type: 'deactivate' });

    try {
      await deactivateTable(id);
      if (selectedQr?.tableId === id) {
        setSelectedQr(null);
      }
      setMessage('Table deactivated successfully.');
      await loadTables();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Table deactivation failed.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleReactivate(table) {
    const confirmed = window.confirm(
      `Reactivate ${table.table_number}? Its existing QR code and order history will be preserved.`
    );

    if (!confirmed) {
      return;
    }

    setMessage('');
    setErrorMessage('');
    setPendingAction({ id: table.id, type: 'reactivate' });

    try {
      await reactivateTable(table.id);
      setMessage('Table reactivated successfully.');
      await loadTables();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Table reactivation failed.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleGenerateQr(table) {
    setMessage('');
    setErrorMessage('');
    setIsQrLoading(true);
    setPendingAction({ id: table.id, type: 'generate-qr' });

    try {
      const qr = await generateTableQr(table.id);
      setSelectedQr(qr);
      setMessage('QR code generated successfully.');
      await loadTables();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'QR code generation failed.');
    } finally {
      setIsQrLoading(false);
      setPendingAction(null);
    }
  }

  async function handleRegenerateQr(table) {
    const confirmed = window.confirm(
      'Regenerate this QR code? The previous printed QR code will stop working.'
    );

    if (!confirmed) {
      return;
    }

    setMessage('');
    setErrorMessage('');
    setIsQrLoading(true);
    setPendingAction({ id: table.id, type: 'regenerate-qr' });

    try {
      const qr = await regenerateTableQr(table.id);
      setSelectedQr(qr);
      setMessage('QR code regenerated. Previous QR code is now invalid.');
      await loadTables();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'QR code regeneration failed.');
    } finally {
      setIsQrLoading(false);
      setPendingAction(null);
    }
  }

  async function handleDownloadQr(qrInfo) {
    setMessage('');
    setErrorMessage('');

    try {
      const blob = await downloadTableQr(qrInfo.tableId);
      downloadBlob(blob, `table-${qrInfo.tableDisplayLabel || qrInfo.tableNumber}-qr.png`);
      setMessage('QR code download started.');
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'QR code download failed.');
    }
  }

  function handlePrintQr(qrInfo) {
    try {
      printQr(qrInfo);
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  return (
    <div className="management-grid table-management-grid">
      <div className="table-management-sidebar">
        <TableForm
          key={selectedTable?.id || 'new-table'}
          selectedTable={selectedTable}
          onSubmit={handleSubmit}
          onCancel={() => setSelectedTable(null)}
          isSaving={isSaving}
        />
        <QRCodePanel
          isLoading={isQrLoading}
          qrInfo={selectedQr}
          onDownload={handleDownloadQr}
          onPrint={handlePrintQr}
        />
      </div>
      <section className="management-list">
        <div className="management-list-heading">
          <div>
            <h3>{showArchivedTables ? 'All Restaurant Tables' : 'Active Restaurant Tables'}</h3>
            <p>
              {showArchivedTables
                ? 'Archived tables are shown for review and can be reactivated explicitly.'
                : 'Only active restaurant tables are shown.'}
            </p>
          </div>
          <label className="archive-filter-control">
            <input
              type="checkbox"
              checked={showArchivedTables}
              onChange={(event) => setShowArchivedTables(event.target.checked)}
            />
            Show Archived Tables
          </label>
        </div>
        {message && <p className="success-message">{message}</p>}
        {errorMessage && <p className="form-error">{errorMessage}</p>}
        <TableTable
          tables={tables}
          isLoading={isLoading}
          selectedQrTableId={selectedQr?.tableId}
          pendingAction={pendingAction}
          onEdit={setSelectedTable}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
          onGenerateQr={handleGenerateQr}
          onRegenerateQr={handleRegenerateQr}
          onPreviewQr={handleGenerateQr}
        />
      </section>
    </div>
  );
}

export default TableManagementPage;
