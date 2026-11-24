import { Search, X } from 'lucide-react';

function MenuSearch({ value, onChange }) {
  return (
    <div className="customer-menu-search">
      <label className="visually-hidden" htmlFor="customer-menu-search-input">
        Search menu items by name
      </label>
      <Search size={20} aria-hidden="true" />
      <input
        id="customer-menu-search-input"
        type="search"
        value={value}
        placeholder="What are you craving?"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          className="customer-menu-search-clear"
          aria-label="Clear menu search"
          title="Clear search"
          onClick={() => onChange('')}
        >
          <X size={19} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default MenuSearch;
