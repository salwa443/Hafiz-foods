import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { QrCode, TriangleAlert } from 'lucide-react';
import { validateCustomerTableAccess } from '../../services/customerTableService.js';
import { CartProvider } from '../../context/CartContext.jsx';
import CustomerMenuExperience from './CustomerMenuExperience.jsx';

function TableEntryPage() {
  const { tableNumber, token } = useParams();
  const [table, setTable] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const controller = new AbortController();

    async function validateAccess() {
      if (!tableNumber || !token) {
        setTable(null);
        setStatus('error');
        return;
      }

      setStatus('loading');

      try {
        const validatedTable = await validateCustomerTableAccess(tableNumber, token, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setTable(validatedTable);
          setStatus('success');
        }
      } catch (error) {
        if (!controller.signal.aborted && !axios.isCancel(error)) {
          setTable(null);
          setStatus('error');
        }
      }
    }

    validateAccess();

    return () => {
      controller.abort();
    };
  }, [tableNumber, token]);

  if (status === 'success') {
    return (
      <CartProvider key={table.id} tableId={table.id}>
        <CustomerMenuExperience table={table} qrToken={token} />
      </CartProvider>
    );
  }

  return (
    <section className="customer-entry-page" aria-live="polite">
      <div className="customer-entry-panel">
        {status === 'loading' && (
          <>
            <div className="customer-entry-icon loading" aria-hidden="true">
              <QrCode size={34} />
            </div>
            <p className="eyebrow">Checking QR code</p>
            <h2>Opening your table</h2>
            <p>Please wait while we confirm this restaurant table.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="customer-entry-icon error" aria-hidden="true">
              <TriangleAlert size={34} />
            </div>
            <p className="eyebrow">QR unavailable</p>
            <h2>This QR code cannot be used</h2>
            <p>Please ask a staff member for help or scan the QR code at your table again.</p>
          </>
        )}
      </div>
    </section>
  );
}

export default TableEntryPage;
