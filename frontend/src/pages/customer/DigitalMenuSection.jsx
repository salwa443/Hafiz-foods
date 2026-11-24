import { useEffect, useState } from 'react';
import axios from 'axios';
import CategoryFilter from '../../components/customer/CategoryFilter.jsx';
import ItemCustomizationDialog from '../../components/customer/ItemCustomizationDialog.jsx';
import MenuGrid from '../../components/customer/MenuGrid.jsx';
import MenuSearch from '../../components/customer/MenuSearch.jsx';
import { useCart } from '../../hooks/useCart.js';
import {
  getPublicCategories,
  getPublicMenuItems,
} from '../../services/publicMenuService.js';
import { RefreshCw, SearchX, UtensilsCrossed } from 'lucide-react';

function DigitalMenuSection() {
  const { addItem } = useCart();
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [categoriesStatus, setCategoriesStatus] = useState('loading');
  const [itemsStatus, setItemsStatus] = useState('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 300);

    return () => window.clearTimeout(debounceTimer);
  }, [searchText]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      setCategoriesStatus('loading');

      try {
        const loadedCategories = await getPublicCategories({
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setCategories(loadedCategories);
          setCategoriesStatus('success');
        }
      } catch (error) {
        if (!controller.signal.aborted && !axios.isCancel(error)) {
          setCategories([]);
          setCategoriesStatus('error');
        }
      }
    }

    loadCategories();

    return () => {
      controller.abort();
    };
  }, [retryKey]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMenuItems() {
      setItemsStatus('loading');

      try {
        const loadedMenuItems = await getPublicMenuItems({
          search: debouncedSearch,
          categoryId: selectedCategoryId,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setMenuItems(loadedMenuItems);
          setItemsStatus('success');
        }
      } catch (error) {
        if (!controller.signal.aborted && !axios.isCancel(error)) {
          setMenuItems([]);
          setItemsStatus('error');
        }
      }
    }

    loadMenuItems();

    return () => {
      controller.abort();
    };
  }, [debouncedSearch, selectedCategoryId, retryKey]);

  const hasFilters = Boolean(searchText.trim()) || selectedCategoryId !== null;
  const isLoading = categoriesStatus === 'loading' || itemsStatus === 'loading';
  const hasError = categoriesStatus === 'error' || itemsStatus === 'error';

  function clearFilters() {
    setSearchText('');
    setSelectedCategoryId(null);
  }

  function addSelectedItem(options) {
    if (!selectedItem?.is_available) {
      return;
    }

    addItem(selectedItem, options);
    setSelectedItem(null);
  }

  return (
    <section className="digital-menu-section" aria-live="polite">
      <div className="digital-menu-heading">
        <div>
          <p className="eyebrow">Explore our kitchen</p>
          <h3>Find your next favourite</h3>
          <p>Prepared fresh, served generously, and made to satisfy.</p>
        </div>
        {categories.length > 0 && (
          <p>{categories.length} active categories</p>
        )}
      </div>

      <div className="customer-menu-controls">
        <MenuSearch value={searchText} onChange={setSearchText} />
        <CategoryFilter
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />
      </div>

      {isLoading && (
        <div className="customer-menu-loading" role="status">
          <span className="visually-hidden">Loading menu items...</span>
          {[1, 2, 3].map((placeholder) => (
            <div className="menu-card-skeleton" key={placeholder} aria-hidden="true">
              <div /><span /><span /><span />
            </div>
          ))}
        </div>
      )}

      {hasError && !isLoading && (
        <div className="customer-menu-feedback">
          <span className="customer-feedback-icon error" aria-hidden="true"><RefreshCw /></span>
          <h4>We couldn&apos;t reach the kitchen</h4>
          <p className="form-error">
            We could not load the menu right now. Please try again.
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setRetryKey((currentKey) => currentKey + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !hasError && menuItems.length === 0 && (
        <div className="customer-menu-feedback">
          <span className="customer-feedback-icon" aria-hidden="true">
            {hasFilters ? <SearchX /> : <UtensilsCrossed />}
          </span>
          <h4>{hasFilters ? 'No matching dishes' : 'The menu is taking a break'}</h4>
          <p className="status-message">
            {hasFilters
              ? 'No menu items match your search and category.'
              : 'No menu items are available right now.'}
          </p>
          {hasFilters && (
            <button type="button" className="secondary-button" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {!isLoading && !hasError && menuItems.length > 0 && (
        <MenuGrid menuItems={menuItems} onAddItem={setSelectedItem} />
      )}

      {selectedItem && (
        <ItemCustomizationDialog
          key={selectedItem.id}
          item={selectedItem}
          onAdd={addSelectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </section>
  );
}

export default DigitalMenuSection;
