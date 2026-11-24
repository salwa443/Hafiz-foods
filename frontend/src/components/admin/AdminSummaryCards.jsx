function AdminSummaryCards({ isLoading, summary }) {
  const cards = [
    ['Active Categories', summary?.active_categories ?? 0],
    ['Active Menu Items', summary?.active_menu_items ?? 0],
    ['Available Items', summary?.available_menu_items ?? 0],
    ['Unavailable Items', summary?.unavailable_menu_items ?? 0],
  ];

  return (
    <div className="summary-grid">
      {cards.map(([label, value]) => (
        <article className="summary-card" key={label}>
          <p>{label}</p>
          <strong>{isLoading ? '-' : value}</strong>
        </article>
      ))}
    </div>
  );
}

export default AdminSummaryCards;
