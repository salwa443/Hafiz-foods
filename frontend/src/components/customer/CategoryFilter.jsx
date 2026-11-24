function CategoryFilter({ categories, selectedCategoryId, onSelect }) {
  return (
    <div className="customer-category-filter" aria-label="Filter menu by category">
      <button
        type="button"
        className={selectedCategoryId === null ? 'selected' : ''}
        aria-pressed={selectedCategoryId === null}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {categories.map((category) => {
        const isSelected = selectedCategoryId === category.id;

        return (
          <button
            key={category.id}
            type="button"
            className={isSelected ? 'selected' : ''}
            aria-pressed={isSelected}
            onClick={() => onSelect(category.id)}
          >
            {category.name}
          </button>
        );
      })}
    </div>
  );
}

export default CategoryFilter;
