import { ArrowRight, ChevronDown, Clock3, QrCode, Sparkles, UtensilsCrossed } from 'lucide-react';
import { Link } from 'react-router-dom';

const orderingSteps = [
  {
    number: '01',
    title: 'Scan at your table',
    description: 'Your secure QR opens the menu and identifies your table automatically.',
    detail: 'Open your phone camera, point it at the QR code displayed on your table, and tap the Hafiz Foods link. No app or customer account is required.',
    icon: <QrCode />,
  },
  {
    number: '02',
    title: 'Choose your favourites',
    description: 'Browse real dishes, add instructions, and review everything in your cart.',
    detail: 'Search the live menu, filter by category, open an available dish, choose its quantity, and add any special instructions before placing it in your cart.',
    icon: <UtensilsCrossed />,
  },
  {
    number: '03',
    title: 'Order and relax',
    description: 'Send your order to the kitchen and follow its progress live from your phone.',
    detail: 'Review your table and cart, select a payment method, then submit. Use Track Your Orders on your table menu to reopen live status updates safely.',
    icon: <Clock3 />,
  },
];

function HomePage() {
  return (
    <section className="home-page">
      <div className="home-hero">
        <div className="home-hero-content">
          <p className="home-kicker"><Sparkles size={16} /> Made fresh. Served with heart.</p>
          <h2>Good food makes every table feel like home.</h2>
          <p className="home-hero-copy">
            Discover handcrafted burgers, oven-fresh pizza, refreshing drinks, and sweet
            finishes—prepared for your table at Hafiz Foods.
          </p>
          <div className="home-hero-actions">
            <a className="home-primary-link" href="#how-it-works">
              How ordering works <ArrowRight size={18} />
            </a>
            <Link className="home-secondary-link" to="/staff/login">Staff login</Link>
          </div>
          <dl className="home-highlights" aria-label="Restaurant highlights">
            <div><dt>10+</dt><dd>Fresh favourites</dd></div>
            <div><dt>4</dt><dd>Tasty categories</dd></div>
            <div><dt>100%</dt><dd>Paperless ordering</dd></div>
          </dl>
        </div>

        <div className="home-hero-gallery" aria-label="Featured dishes from Hafiz Foods">
          <figure className="home-feature-image home-feature-image-main">
            <img src="/assets/menu/classic-beef-burger.jpg" alt="Classic beef burger from Hafiz Foods" />
            <figcaption>Signature burgers</figcaption>
          </figure>
          <figure className="home-feature-image home-feature-image-small">
            <img src="/assets/menu/margherita-pizza.jpg" alt="Margherita pizza from Hafiz Foods" />
            <figcaption>Oven-fresh pizza</figcaption>
          </figure>
        </div>
      </div>

      <div className="home-process" id="how-it-works">
        <div className="home-section-heading">
          <p className="eyebrow">Simple table ordering</p>
          <h3>Your meal is only a few taps away</h3>
        </div>
        <div className="home-process-grid">
          {orderingSteps.map(({ number, title, description, detail, icon }) => (
            <details className="home-process-card" key={number}>
              <summary aria-label={`Open step ${number}: ${title}`}>
                <span className="home-process-icon">{icon}</span>
                <p className="eyebrow">Step {number}</p>
                <h4>{title}</h4>
                <p>{description}</p>
                <span className="home-process-open-label">
                  <span className="home-process-label-open">Open details</span>
                  <span className="home-process-label-close">Close details</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </span>
              </summary>
              <div className="home-process-detail">
                <p>{detail}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HomePage;
