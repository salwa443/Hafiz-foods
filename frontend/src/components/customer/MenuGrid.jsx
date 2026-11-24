import MenuItemCard from './MenuItemCard.jsx';

function MenuGrid({ menuItems, onAddItem }) {
  return (
    <div className="customer-menu-grid">
      {menuItems.map((item) => (
        <MenuItemCard key={item.id} item={item} onAdd={onAddItem} />
      ))}
    </div>
  );
}

export default MenuGrid;
