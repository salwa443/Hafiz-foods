# Hafiz Foods

Hafiz Foods is a QR-based restaurant menu and table-ordering system. Customers scan a table QR code, browse the menu, order from their browser, and follow their order live. Admin, kitchen, and waiter dashboards support the restaurant workflow.

## What you can do

| Role | Workflow |
| --- | --- |
| Customer | Scan the table QR, search dishes or filter by category, customize cart lines with instructions, review prices and quantities, select a payment method, and place an order. Reopen saved orders from **Track Your Orders** in the same browser tab and cancel an eligible new order. |
| Admin | View menu summaries, manage categories and dishes, upload images, change availability, review archived records, manage tables, and generate, regenerate, download, or print table QR codes. Staff accounts can also be provisioned through the backend tools. |
| Kitchen | Load active orders, receive new orders live, view item quantities and instructions, and advance preparation status. |
| Waiter | Receive ready orders live, claim an order, mark it picked up, and mark it delivered. Other waiter sessions see the assignment. An admin can also perform pickup and delivery through the protected API. |

Customers use the system without creating an account. Cash, Pay at Counter, and Pay at Table are recorded choices. The system does not charge customers online.

## Architecture

- **Frontend** uses React, Vite, React Router, Axios, CSS, and Socket.IO Client.
- **Backend** uses Node.js, Express, PostgreSQL via `pg`, Socket.IO, JWT, bcrypt, Multer, and QR generation.
- **Data** includes staff roles and users, restaurant tables, categories, menu items, orders, order-item snapshots, and a schema entity for waiter requests. Order records also hold tracking hashes and delivery timestamps.
- **Order placement** revalidates table and item eligibility, computes totals from database prices, and saves order and item snapshots together in a transaction.
- **Kitchen and delivery** are separate flows. Kitchen status progresses from New → Accepted → Preparing → Ready → Completed. Customer cancellation is allowed only before acceptance. A ready order can be claimed by one waiter, picked up, and delivered. Row locks protect competing actions. Live events are published after successful commits.
- **Order numbers** show a short table-prefixed display label. APIs and tracking links use the full public order ID.

```text
backend/src/
  config/                 Environment and database connection
  database/               Migrations and setup scripts
  routes/ controllers/    REST endpoints
  models/ services/       Database access and business rules
  middleware/ validators/
  realtime/ tests/
frontend/
  public/assets/menu/     Bundled menu images and image credits
  src/                    Pages, routes, components, hooks, services and tests
  tests/                  Browser smoke scripts
```

## Local setup

Install PostgreSQL and a recent Node.js LTS release compatible with Vite 7, such as Node.js 22.12 or newer. Create an empty local PostgreSQL database named `qr_menu_ordering` and give your development database user access. From the repository root, use PowerShell:

```powershell
cd backend
npm.cmd ci
Copy-Item .env.example .env
```

Set `DATABASE_URL` to your local connection string and `JWT_SECRET` to a strong random secret in `backend/.env`. The example also documents `PORT`, `NODE_ENV`, `FRONTEND_URL`, and `JWT_EXPIRES_IN`. Set `FRONTEND_URL` to the browser origin used for QR links and CORS.

```powershell
npm.cmd run db:check
npm.cmd run db:migrate
npm.cmd run db:seed-expanded-menu
npm.cmd run dev
```

Migrations create the schema and seed the staff roles, tables T01–T05, and the starter menu. Run the expanded-menu seed on a fresh development database if you want the additional dishes. It updates matching menu records as well as inserting missing ones, so review it before running it against edited restaurant data.

Open a second terminal at the repository root:

```powershell
cd frontend
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

The default `VITE_API_BASE_URL` is `http://localhost:5000/api`. On shells where npm runs normally, the same commands work with `npm` instead of `npm.cmd`. Preserve existing `.env` files when setting up an existing checkout.

### Create staff accounts

From `backend/`, replace the example names, addresses, and password placeholders with your own local development values. Use distinct strong passwords. The setup scripts hash passwords with bcrypt.

```powershell
npm.cmd run db:create-admin -- "Local Admin" admin@example.com "<admin-password>"
npm.cmd run db:create-staff -- kitchen "Local Kitchen" kitchen@example.com "<kitchen-password>"
npm.cmd run db:create-staff -- waiter "Local Waiter" waiter@example.com "<waiter-password>"
```

See the [database setup notes](backend/src/database/README.md) for the script details.

## Open the application

| Page | Local address |
| --- | --- |
| Home | `http://localhost:5173/` |
| Staff login | `http://localhost:5173/staff/login` |
| Admin | `http://localhost:5173/admin` |
| Admin tables, categories, menu, and settings | `/admin/tables`, `/admin/categories`, `/admin/menu-items`, `/admin/settings` |
| Kitchen | `http://localhost:5173/kitchen` |
| Waiter | `http://localhost:5173/waiter` |
| Customer menu | `/menu/:tableNumber/:token`, opened from the table QR |
| Customer tracking | `/track/:orderId`, opened from **Track Your Orders** |
| Backend health | `http://localhost:5000/api/health` |

To test the full workflow, log in as admin, generate a QR for an active table, and open its menu in a customer browser session. Place an order, sign in as kitchen in a separate browser profile, and progress it to Ready. Open the waiter dashboard in another profile to claim, pick up, and deliver it. Keep the customer tracking page open to observe kitchen status updates. For a phone test, configure reachable frontend and backend addresses first. A phone's `localhost` points to the phone itself.

## REST and real-time interfaces

| API | Purpose |
| --- | --- |
| `GET /api/health` | Backend health |
| `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` | Staff authentication and session UI |
| `/api/admin/tables`, `/api/admin/categories`, `/api/admin/menu-items` | Admin-only management. See route definitions for methods and action paths. |
| `GET /api/public/tables/:tableNumber/access?token=…` | Validate table QR access |
| `GET /api/public/menu/categories`, `GET /api/public/menu/items` | Public menu data. Items accept `search` and `categoryId` filters. |
| `POST /api/public/tables/:tableNumber/orders?token=…` | Place an order with current QR authorization |
| `GET /api/public/orders/:orderId/tracking` | Retrieve a saved order with the `X-Order-Tracking-Token` header |
| `PATCH /api/public/tables/:tableNumber/orders/:orderId/cancel` | Cancel an eligible order using its tracking header. Legacy orders use active-table QR authorization. |
| `GET /api/kitchen/orders/active`, `PATCH /api/kitchen/orders/:orderId/status` | Kitchen queue and preparation updates |
| `GET /api/waiter/orders/ready`, `PATCH /api/waiter/orders/:orderId/{claim,pickup,deliver}` | Waiter queue and delivery actions |

Kitchen sockets receive `kitchen:order:new` and `kitchen:order:status-updated` in the private kitchen room. Waiter sockets receive `waiter:order:ready` and `waiter:order:updated` in the private waiter room. The `/customer` namespace authorizes each connection for its order room and delivers `customer:order:status-updated`. Tracking credentials for new orders go through the tracking header or socket handshake. PostgreSQL stores their hashes.

## Verification

Run from `backend/` against a dedicated development or test database. Some suites create fixtures or require the development server and staff setup.

```powershell
npm.cmd run lint
npm.cmd run test:public-table-access
npm.cmd run test:public-menu
npm.cmd run test:order-placement
npm.cmd run test:order-status-realtime
npm.cmd run test:customer-order-cancellation
npm.cmd run test:customer-order-tracking-api
npm.cmd run test:customer-tracking-socket-auth
npm.cmd run test:waiter-ready-orders
npm.cmd run test:auth
npm.cmd run test:fr11-integration
```

Run from `frontend/`:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run test:cart
npm.cmd run test:order-submission
npm.cmd run test:kitchen-status-controls
npm.cmd run test:customer-order-status
npm.cmd run test:customer-order-tracking-page
npm.cmd run test:waiter-orders
```

Run `npm.cmd run` in either directory for all available scripts. See [project progress and recorded verification](PROJECT_PROGRESS.md) for requirement coverage and browser test notes.

## Deployment and limitations

- Set the frontend's API URL before building. Serve the Vite build with a history fallback to `index.html` so direct menu and tracking links work. Use HTTPS and configure the backend's frontend origin before generating deployment QR codes.
- Keep `.env` files, database backups, and runtime uploads outside Git. Provide persistent storage for uploaded images. Bundled image credits are in [IMAGE_SOURCES.md](frontend/public/assets/menu/IMAGE_SOURCES.md).
- Saved tracking references are scoped to the browser tab and table through session storage. Another tab, device, or cleared storage may require a separate saved reference.
- Order placement has no server-side idempotency key. After an ambiguous network failure, confirm with staff before submitting again. Short display numbers can collide and are intended for conversation with staff.
- Waiter delivery is implemented separately from customer waiter calls (FR-09). The customer-request workflow, admin order history (FR-12), and reporting (FR-13) are outside the documented implementation.
