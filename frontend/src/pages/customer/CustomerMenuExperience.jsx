import { useState } from 'react';
import CartButton from '../../components/customer/CartButton.jsx';
import CartPanel from '../../components/customer/CartPanel.jsx';
import OrderReviewDialog from '../../components/customer/OrderReviewDialog.jsx';
import TrackYourOrders from '../../components/customer/TrackYourOrders.jsx';
import { useCart } from '../../hooks/useCart.js';
import DigitalMenuSection from './DigitalMenuSection.jsx';
import { getTableDisplayLabel } from '../../utils/tableDisplayLabel.js';
import { Clock3, MapPin, Sparkles } from 'lucide-react';

function CustomerMenuExperience({ table, qrToken }) {
  const tableDisplayLabel = getTableDisplayLabel(table);
  const { items, itemCount, subtotalMinor, totalMinor, clearCart } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  function openReview() {
    setIsCartOpen(false);
    setIsReviewOpen(true);
  }

  return (
    <section className="customer-menu-page" aria-live="polite">
      <div className="customer-menu-hero">
        <div className="customer-menu-hero-copy">
          <p className="customer-menu-kicker"><Sparkles size={16} /> Welcome to Hafiz Foods</p>
          <h2>Fresh flavours,<br /><em>made for your table.</em></h2>
          <p>Explore our kitchen favourites and order whenever you&apos;re ready.</p>
          <div className="customer-menu-quick-info">
            <span><MapPin size={16} /> Table {tableDisplayLabel}</span>
            <span><Clock3 size={16} /> Freshly prepared</span>
          </div>
        </div>
        <div className="customer-menu-hero-actions">
          <TrackYourOrders tableId={table.id} tableDisplayLabel={tableDisplayLabel} />
          <div className="customer-table-badge" aria-label={`Confirmed table ${tableDisplayLabel}`}>
            <small>Your table</small><strong>{tableDisplayLabel}</strong>
          </div>
          <CartButton itemCount={itemCount} onClick={() => setIsCartOpen(true)} />
        </div>
      </div>

      <DigitalMenuSection />

      {isCartOpen && (
        <CartPanel onClose={() => setIsCartOpen(false)} onReview={openReview} />
      )}
      {isReviewOpen && (
        <OrderReviewDialog
          tableId={table.id}
          tableNumber={table.tableNumber}
          tableDisplayLabel={tableDisplayLabel}
          qrToken={qrToken}
          items={items}
          subtotalMinor={subtotalMinor}
          totalMinor={totalMinor}
          onConfirmed={clearCart}
          onClose={(wasConfirmed) => {
            setIsReviewOpen(false);
            setIsCartOpen(!wasConfirmed);
          }}
        />
      )}
    </section>
  );
}

export default CustomerMenuExperience;
