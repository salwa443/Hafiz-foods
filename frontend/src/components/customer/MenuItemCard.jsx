import { useState } from 'react';
import { formatCurrency } from '../../utils/formatCurrency.js';
import {
  menuImageFallbackUrl,
  resolveMenuImageUrl,
} from '../../utils/menuImageUrl.js';
import { Plus, UtensilsCrossed } from 'lucide-react';

function MenuItemCard({ item, onAdd }) {
  const imageUrl = resolveMenuImageUrl(item.image_url);
  const [failedImageUrl, setFailedImageUrl] = useState(null);
  const visibleImageUrl = failedImageUrl === imageUrl
    ? menuImageFallbackUrl
    : imageUrl;

  return (
    <article className={`customer-menu-card ${item.is_available ? '' : 'unavailable'}`}>
      <div className="customer-menu-image">
        <img
          src={visibleImageUrl}
          alt={failedImageUrl === imageUrl ? 'Hafiz Foods menu item placeholder' : item.name}
          onError={() => setFailedImageUrl(imageUrl)}
        />
        <span className="customer-menu-image-category">
          <UtensilsCrossed size={13} aria-hidden="true" /> {item.category_name}
        </span>
        {!item.is_available && <span className="customer-menu-sold-out">Sold out</span>}
      </div>
      <div className="customer-menu-card-body">
        <div className="customer-menu-card-heading">
          <h4>{item.name}</h4>
          <strong>{formatCurrency(item.price)}</strong>
        </div>
        <p>{item.description || 'No description available.'}</p>
        <div className="customer-menu-card-meta">
          <span className={item.is_available ? 'status-pill active' : 'status-pill inactive'}>
            {item.is_available ? 'Fresh & available' : 'Unavailable today'}
          </span>
        </div>
        <button
          type="button"
          className="primary-button customer-menu-add-button"
          disabled={!item.is_available}
          onClick={() => {
            if (item.is_available) {
              onAdd(item);
            }
          }}
        >
          {item.is_available ? <><Plus size={18} aria-hidden="true" /> Add to cart</> : 'Unavailable'}
        </button>
      </div>
    </article>
  );
}

export default MenuItemCard;
