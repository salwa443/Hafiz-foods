# Project Progress Summary

QR Code-Based Paperless Menu & Table Ordering System

Last updated: 2026-11-23

## Completed Functional Requirements

| Functional Requirement | Module | Status |
| --- | --- | --- |
| FR-10 | Authentication | Completed |
| FR-11 | Menu Management | Completed |
| FR-01 | Table and QR Management | Completed |
| FR-02 | QR-Based Customer Access | Completed |
| FR-03 | Digital Menu | Completed |
| FR-04 | Item Customization and Cart | Completed |
| FR-05 | Order Placement | In Progress (Manual browser verification pending) |
| FR-06 | Real-Time Kitchen Orders | In Progress (Final manual browser verification pending) |
| FR-07 | Kitchen Order Processing | Completed |

## FR-03 Digital Menu

Status: Completed

Implemented public APIs:

- `GET /api/public/menu/categories`
- `GET /api/public/menu/items?search=&categoryId=`

Implemented frontend:

- `DigitalMenuSection` loads the customer menu after successful QR validation.
- `MenuItemCard` and `MenuGrid` display item names, descriptions, prices, images, categories, and availability.
- `MenuSearch` provides debounced item-name search with clear functionality.
- `CategoryFilter` provides dynamic single-category filtering with an All option.
- The existing `/menu/:tableNumber/:token` route preserves the validated table context.

Final verification results:

- Backend lint: Passed
- Frontend lint: Passed
- Frontend production build: Passed
- FR-03 public menu smoke tests: 14/14 passed
- FR-02 public table access tests: 14/14 passed
- FR-10 authentication tests: 13/13 passed
- FR-11 menu management tests: 16/16 passed
- FR-11 integration tests: 12/12 passed

Verified behavior:

- Only active categories and active menu items are returned.
- Items belonging to inactive categories are excluded.
- Unavailable items remain visible and clearly marked.
- Search and category filters work independently and together.
- The public menu works without customer authentication.
- The menu loads only after successful QR validation and displays the correct table number.

Remaining manual testing limitations:

- A physical mobile-phone QR scan should be repeated in the final deployment environment.
- Rapid typing and category switching were verified through request cancellation logic and API testing, but no Playwright or Puppeteer interaction suite is installed.
- Legacy seed image paths under `/assets/menu/` are unavailable; the customer UI displays its failed-image placeholder for those records without altering the seed data.
- Identifiable active categories left by earlier integration tests remain in the database and were not changed during FR-03 verification.

## FR-04 Item Customization and Cart

Status: Completed

Implemented frontend:

- Table-scoped `CartProvider`, reducer, calculation helpers, and `sessionStorage` persistence.
- Cart lines merge only when menu item identity and normalized special instructions match.
- Item dialog with quantity selection and optional item-level special instructions.
- Unavailable menu items cannot be added.
- Cart button displays the sum of all item quantities.
- Responsive cart drawer displays item names, unit prices, quantities, line subtotals, and special instructions.
- Quantity controls enforce a minimum of one, with a separate Remove action.
- Subtotal and total use integer minor-unit calculations and remain equal because no extra charges apply.
- Empty carts, zero-priced items, malformed stored carts, and table-specific cart restoration are supported.
- Cart restoration occurs only after successful QR validation, and QR tokens are never stored.

Final verification results:

- FR-04 cart core and integration tests: 16/16 passed
- Backend lint: Passed
- Frontend lint: Passed
- Frontend production build: Passed
- FR-03 public menu tests: 14/14 passed
- FR-02 public table access tests: 14/14 passed
- FR-01 table management tests: 15/15 passed
- FR-01 QR tests: 13/13 passed
- FR-01 integration tests: 14/14 passed
- FR-10 authentication tests: 13/13 passed
- FR-11 menu management tests: 16/16 passed
- FR-11 integration tests: 12/12 passed

Remaining manual testing limitations:

- No Playwright or Puppeteer interaction suite is installed, so dialog typing, drawer interaction, and keyboard focus flow still require a final manual browser pass.
- A valid QR page was rendered successfully in headless Chrome and showed the table context, cart quantity badge, and Add to cart controls.
- Order placement, payment, backend repricing, and database order storage are intentionally deferred to FR-05.

## Current Stop Point

FR-04 is complete and verified. FR-05 automated backend, frontend, database, and regression verification passed; final manual browser interaction verification is pending. FR-06 Steps 2-5 infrastructure, broadcasting, active-order loading, and kitchen frontend integration are complete; final browser integration verification is pending. FR-07 is complete after automated verification and the real-browser multi-session acceptance pass.

## FR-07 Kitchen Order Processing

Status: Completed

Implemented Step 2 transition policy:

- Centralized valid transitions: `new -> accepted`, `accepted -> preparing`, `preparing -> ready`, `ready -> completed`, and customer-only `new -> cancelled`.
- `completed` and `cancelled` are terminal states.
- Reusable checks identify known statuses, terminal statuses, duplicate transitions, invalid transitions, unknown actors, and actor authorization failures.
- Stable transition error codes and safe messages are available for later service/controller HTTP mapping.
- The kitchen status request validator accepts only `accepted`, `preparing`, `ready`, or `completed` and rejects missing, empty, non-string, null, unknown, cancellation, and unexpected request fields.
- Client-supplied current status and actor values are not accepted.
- No route, controller, database update, Socket.IO status event, customer cancellation flow, or frontend behavior was added in this step.

Step 2 verification:

- FR-07 transition and validator tests: 29/29 passed
- Backend lint: Passed
- FR-05 order placement regression: 45/45 passed
- FR-06 active kitchen orders regression: 15/15 passed
- FR-06 kitchen broadcasting regression: 9/9 passed
- FR-10 authentication regression: 13/13 passed with the required live backend

Implemented Step 3 transaction-safe status service:

- Accepts a public Order ID, requested target status, and trusted backend actor.
- Starts a PostgreSQL transaction and locks the matching order row with `SELECT ... FOR UPDATE`.
- Reads the authoritative current status from the locked database row and applies the centralized Step 2 transition policy.
- Uses stable service errors for not-found, conflict, invalid actor/status, and actor authorization outcomes.
- Updates only valid transitions, returns a sanitized order/table/item snapshot, and commits on success.
- Rolls back on not-found, invalid transition, authorization failure, and unexpected database/update failures.
- Concurrent duplicate acceptance permits one success; the loser observes the committed state and receives a conflict.
- Concurrent kitchen acceptance versus customer cancellation permits exactly one committed winner.
- No REST route, controller, Socket.IO event, customer cancellation endpoint, frontend behavior, or migration was added.

Step 3 verification:

- FR-07 order status service tests: 58/58 passed
- FR-07 transition and validator regression: 29/29 passed
- FR-05 order placement regression: 45/45 passed
- FR-06 active kitchen orders regression: 15/15 passed
- FR-06 kitchen broadcasting regression: 9/9 passed
- Backend lint: Passed
- Isolated cleanup verified: 0 FR-07 Step 3 test orders and 0 test tables remain

Implemented Step 4 protected kitchen status API:

- Added `PATCH /api/kitchen/orders/:orderId/status` under the existing kitchen router.
- Existing `authMiddleware` and `requireKitchenStaff` protect the endpoint; admin, waiter, and unauthenticated requests are rejected.
- Request validation accepts only the kitchen target statuses `accepted`, `preparing`, `ready`, and `completed`, rejects unexpected fields, and validates the public Order ID path parameter.
- The controller always supplies the trusted backend actor `kitchen`; actor identity and current status are never accepted from the request body.
- Successful responses return the sanitized committed order snapshot from the Step 3 service.
- Service errors map to 400, 403, 404, or 409 as appropriate; unexpected service/database failures map to a generic 500 response.
- API errors no longer expose stack traces in development or production responses.
- No customer cancellation endpoint, Socket.IO status event, frontend behavior, or migration was added.

Step 4 verification:

- FR-07 protected kitchen status API tests: 72/72 passed
- FR-07 order status service regression: 58/58 passed
- FR-07 transition and validator regression: 29/29 passed
- FR-05 order placement regression: 45/45 passed
- FR-06 active kitchen orders regression: 15/15 passed
- FR-06 kitchen broadcasting regression: 9/9 passed
- FR-10 authentication regression: 13/13 passed
- Backend lint: Passed
- Isolated cleanup verified: 0 FR-07 Step 4 test orders, tables, and users remain

Implemented Step 5 QR-validated customer cancellation API:

- Added public endpoint `PATCH /api/public/tables/:tableNumber/orders/:orderId/cancel?token=<qr-token>` without customer JWT authentication.
- Reuses the existing `findActiveTableByNumberAndQrToken()` lookup and public table/QR validators.
- Missing, invalid, regenerated, or inactive-table QR tokens cannot authorize cancellation.
- The transaction-safe status service now optionally checks a trusted expected table ID against the association on the locked order row.
- Unknown and cross-table orders use the same not-found response so table association is not disclosed.
- The controller supplies the trusted backend actor `customer` and fixed target status `cancelled`; request bodies cannot supply actor, current status, table ID, or target status.
- Only `new` orders can be cancelled. Accepted, preparing, ready, completed, and already-cancelled orders return conflict responses without changing state.
- Kitchen acceptance and customer cancellation continue to serialize through `SELECT ... FOR UPDATE`, allowing exactly one committed winner.
- Successful responses return only the sanitized order snapshot and never include QR tokens or internal database IDs.
- Existing request URL sanitization redacts the QR token from development logs.
- No Socket.IO status event, frontend behavior, migration, or FR-08 functionality was added.

Step 5 verification:

- FR-07 customer order cancellation tests: 34/34 passed
- FR-07 order status service regression: 58/58 passed
- FR-07 protected kitchen status API regression: 72/72 passed
- FR-01 QR generation regression: 13/13 passed
- FR-02 public table access regression: 14/14 passed
- FR-05 order placement regression: 45/45 passed
- FR-10 authentication regression: 13/13 passed
- Request-log sanitization regression: 3/3 passed
- Backend lint: Passed
- Isolated cleanup verified: 0 FR-07 Step 5 test orders and tables remain

Implemented Step 6 ready-order active loading:

- `GET /api/kitchen/orders/active` now returns `new`, `accepted`, `preparing`, and `ready` orders.
- `completed` and `cancelled` orders remain excluded.
- Ready orders remain available after dashboard loading or reconnection until kitchen staff marks them completed.
- Existing kitchen authentication, role authorization, response structure, historical snapshots, public Order IDs, sanitization, deduplication behavior, and oldest-first sorting are unchanged.
- No endpoint, Socket.IO event, frontend file, schema, migration, or FR-08 behavior was added.

Step 6 verification:

- FR-06/FR-07 active kitchen orders tests: 15/15 passed
- FR-07 protected kitchen status API regression: 72/72 passed
- FR-07 customer cancellation regression: 34/34 passed
- FR-07 order status service regression: 58/58 passed
- FR-06 kitchen broadcasting regression: 9/9 passed
- FR-06 Socket.IO infrastructure regression: 10/10 passed
- FR-10 authentication regression: 13/13 passed
- Backend lint: Passed

Implemented Step 7 post-commit status publishing:

- Added `kitchen:order:status-updated` publication to the authenticated `kitchen` room after successful status commits.
- Kitchen payloads contain only public Order ID, table number, order time, committed status, updated timestamp, and historical item name/quantity/instruction snapshots.
- Added the scoped `customer:order:status-updated` publishing contract for room `customer-order:<publicOrderId>`.
- Customer payloads contain only public Order ID, table number, committed status, and updated timestamp.
- Both protected kitchen transitions and QR-validated customer cancellations publish through the same centralized post-commit service path.
- Failed, duplicate, invalid, rolled-back, and failed-database updates publish no status event.
- Missing Socket.IO and publication exceptions cannot fail or roll back an already committed REST status update.
- Existing `kitchen:order:new` behavior is unchanged.
- No customer namespace/authentication, frontend behavior, migration, or FR-08 functionality was added.

Step 7 verification:

- FR-07 order status realtime tests: 28/28 passed
- FR-07 protected kitchen status API regression: 72/72 passed
- FR-07 customer cancellation regression: 34/34 passed
- FR-07 order status service regression: 58/58 passed
- FR-06 new-order broadcasting regression: 9/9 passed
- FR-06 Socket.IO infrastructure regression: 10/10 passed
- FR-05 order placement regression: 45/45 passed
- FR-10 authentication regression: 13/13 passed
- Backend lint: Passed
- Isolated cleanup verified: 0 FR-07 Step 7 test orders remain

Implemented Step 8 secure customer Socket.IO namespace:

- Added the separate `/customer` namespace without changing the existing default kitchen namespace.
- Customer credentials are accepted only through Socket.IO handshake `auth`: table number, public Order ID, and QR token.
- Handshake values use the same table-number and QR-token limits/patterns as public REST validation.
- Authentication reuses `findActiveTableByNumberAndQrToken()` and a parameterized public-order/table lookup.
- Invalid, missing, regenerated, inactive-table, unknown-order, and cross-table credentials receive sanitized socket authentication failures.
- Authenticated customers are server-joined only to `customer-order:<publicOrderId>`; client-emitted arbitrary join requests have no effect.
- Customer credentials cannot access the default kitchen namespace or kitchen room, and kitchen JWT credentials alone cannot access the customer namespace.
- Step 7 customer status publication now targets the `/customer` namespace and only the matching order room.
- Customer disconnects rely on Socket.IO's safe automatic room cleanup.
- QR handshake credentials are not logged or persisted.
- No frontend behavior, tracking UI, migration, transition change, or FR-08 functionality was added.

Step 8 verification:

- FR-07 customer socket authentication tests: 21/21 passed
- FR-07 order status realtime regression: 28/28 passed
- FR-07 protected kitchen status API regression: 72/72 passed
- FR-07 customer cancellation regression: 34/34 passed
- FR-06 new-order broadcasting regression: 9/9 passed
- FR-06 Socket.IO infrastructure regression: 10/10 passed
- FR-02 public table access regression: 14/14 passed
- FR-10 authentication regression: 13/13 passed
- Backend lint: Passed
- Isolated cleanup verified: 0 FR-07 Step 8 test orders remain

Implemented Step 9 kitchen status controls and realtime state:

- Kitchen cards expose exactly one valid action: Accept Order, Start Preparing, Mark Ready, or Mark Completed according to current status.
- Completed and cancelled orders expose no action and are removed from the active dashboard state.
- The existing Axios client calls `PATCH /api/kitchen/orders/:orderId/status` with only the target `status`; its existing staff JWT interceptor remains authoritative.
- Per-order pending state disables duplicate submissions and no status is displayed optimistically before API confirmation.
- Transition failures preserve the prior status, show a safe per-order message, and resynchronize through the active-orders API to handle another kitchen session winning a race.
- The existing kitchen session now merges `kitchen:order:status-updated` by public Order ID while preserving `kitchen:order:new`, oldest-first sorting, reconnect synchronization, buffering, and listener cleanup.
- Confirmed REST responses and realtime events share the same merge/removal function, avoiding competing order state.
- Added responsive card action/error styling without changing customer frontend files.
- No backend contract, transition rule, database schema, migration, customer UI, or FR-08 functionality was added.

Step 9 verification:

- FR-07 kitchen status controls tests: 29/29 passed
- FR-06 kitchen frontend session regression: 20/20 passed
- Frontend lint: Passed
- Frontend production build: Passed (1,851 modules transformed)
- FR-06/FR-07 active kitchen orders backend regression: 15/15 passed
- FR-07 protected kitchen status API regression: 72/72 passed
- FR-07 order status realtime regression: 28/28 passed
- FR-07 customer cancellation regression: 34/34 passed
- FR-07 customer socket authentication regression: 21/21 passed
- FR-06 Socket.IO infrastructure regression: 10/10 passed
- Backend lint: Passed

Implemented Step 10 customer live status and cancellation UI:

- Added a reusable `/customer` Socket.IO client using only handshake `auth` with the validated table number, public Order ID, and in-memory QR token.
- QR credentials are never placed in the Socket.IO URL, localStorage, sessionStorage, logs, or visible UI.
- Added a single customer order-status session/hook initialized from the committed FR-05 confirmation response.
- Matching `customer:order:status-updated` events update server-confirmed status/timestamp; unrelated and stale backward events are ignored.
- Socket connection, disconnection, reconnection state, listener cleanup, and safe fallback messaging are supported without duplicate listeners.
- The confirmation now displays public Order ID, table number, live connection state, and progress through New, Accepted, Preparing, Ready, and Completed, with a separate cancelled state.
- Cancellation is available only while the confirmed status is `new`, uses the existing QR-validated cancellation endpoint, prevents duplicate submissions, and updates only after backend confirmation.
- A 409 conflict retains the last confirmed status and accurately states that the kitchen accepted first; no public refresh endpoint was invented.
- Existing cart clearing, order confirmation values, payment display, and return-to-menu behavior remain intact.
- No backend contract, database schema, migration, account flow, public status endpoint, or FR-08 functionality was added.

Step 10 verification:

- FR-07 customer order status frontend tests: 42/42 passed
- FR-05 customer order submission frontend regression: 22/22 passed
- FR-07 kitchen status controls frontend regression: 29/29 passed
- FR-06 kitchen frontend session regression: 20/20 passed
- Frontend lint: Passed
- Frontend production build: Passed (1,855 modules transformed)
- FR-07 customer cancellation backend regression: 34/34 passed
- FR-07 customer socket authentication regression: 21/21 passed
- FR-07 order status realtime regression: 28/28 passed
- FR-07 protected kitchen status API regression: 72/72 passed
- FR-06/FR-07 active kitchen orders regression: 15/15 passed
- FR-10 authentication regression: 13/13 passed
- Backend lint: Passed

Known limitations:

- Because no public order-status refresh endpoint exists by design, a customer reconnect cannot recover a status event missed while fully disconnected; the UI retains the last confirmed status.
- Reopening an order after leaving its confirmation screen is unsupported and belongs to FR-08.
- Network interruption can show the kitchen loading error; reconnecting and using Retry restores active orders.
- No separate kitchen connection indicator was visible during the final manual browser pass.

Final automated verification:

- Centralized transition/validator tests: 29/29 passed
- Transaction-safe status service tests: 58/58 passed
- Protected kitchen status API tests: 72/72 passed
- QR-validated customer cancellation tests: 34/34 passed
- Post-commit order-status realtime tests: 28/28 passed
- Customer namespace authentication/room isolation tests: 21/21 passed
- Active kitchen orders tests: 15/15 passed
- Kitchen status controls frontend tests: 29/29 passed
- Customer live status/cancellation frontend tests: 42/42 passed
- FR-05 backend order placement regression: 45/45 passed
- FR-05 frontend order review/submission regressions: 8/8 and 22/22 passed
- FR-06 new-order broadcasting regression: 9/9 passed
- FR-06 Socket.IO infrastructure regression: 10/10 passed
- FR-06 kitchen frontend session regression: 20/20 passed
- FR-04 cart regression: 16/16 passed
- FR-10 authentication regression: 13/13 passed
- Request-log token sanitization regression: 3/3 passed
- Backend lint and frontend lint: Passed
- Frontend production build: Passed (1,855 modules transformed)
- Isolated backend suites verified cleanup of their FR-07 test orders, tables, and users

Final security/integration review:

- Order creation publishes `kitchen:order:new` only after commit, and status changes publish only after their own successful commit.
- Failed, duplicate, unauthorized, and rolled-back transitions publish no status event.
- Kitchen REST and Socket.IO access remain JWT-authenticated and kitchen-role scoped.
- Customer cancellation and `/customer` Socket.IO access require the current active-table QR token and matching public Order ID/table relationship.
- Customers join only `customer-order:<publicOrderId>` and do not receive kitchen or unrelated customer-room events.
- Event payloads exclude QR tokens, JWTs, internal IDs, prices, payment data, and unrelated order data.
- QR tokens remain in memory for the customer session, are not placed in Socket.IO URLs or browser storage, and are redacted from REST request logs.
- API and socket errors are sanitized; API responses do not expose stack traces or SQL details.

Final manual browser verification completed:

- New customer orders appeared automatically on the kitchen dashboard without refresh.
- `new -> accepted -> preparing -> ready -> completed` processing passed.
- Customer live status updates and cancellation before acceptance passed.
- Cancelled orders disappeared automatically from the kitchen dashboard.
- The cancellation option disappeared after kitchen acceptance.
- Two kitchen sessions received synchronized updates, and logging out of one did not affect the other.
- Network reconnect plus Retry restored active orders after a loading error.
- Kitchen mobile responsive layout passed.

## FR-06 Real-Time Kitchen Orders

Status: In Progress (Final manual browser verification pending)

Implemented infrastructure:

- Socket.IO is attached to the existing Node HTTP server without changing Express REST routing.
- Socket handshakes reuse the existing JWT `verifyToken()` service and active-user database check.
- Only the existing `kitchen` role is authorized, consistently with `requireKitchenStaff`; admin and waiter sockets are rejected.
- Authorized sockets join the private `kitchen` room.
- Missing, invalid, and expired tokens receive sanitized connection errors.
- The event name `kitchen:order:new` is emitted once to the private kitchen room after each successful order commit.
- Socket disconnection relies on Socket.IO's automatic room cleanup.

Implemented Step 3 broadcasting:

- Kitchen payloads contain only Order ID, table number, committed order time, status, and trusted item name/quantity/instructions snapshots.
- Event publication occurs strictly after PostgreSQL `COMMIT`, outside the transaction.
- Failed and rolled-back orders do not publish events.
- Missing/disconnected socket clients and publisher failures cannot convert a committed order into an HTTP failure.
- The existing FR-05 customer response remains unchanged.

Step 2 verification:

- Backend lint: Passed
- Socket.IO infrastructure tests: 10/10 passed
- FR-05 order placement regression: 45/45 passed
- FR-10 authentication regression: 13/13 passed
- Backend health check: HTTP 200
- Isolated socket test users remaining after cleanup: 0

Step 3 verification:

- Kitchen order broadcast tests: 9/9 passed
- Socket.IO infrastructure regression: 10/10 passed
- FR-05 backend order placement regression: 45/45 passed
- FR-05 frontend review/submission regressions: 8/8 and 22/22 passed
- FR-04 cart regression: 16/16 passed
- FR-03 public menu regression: 14/14 passed
- FR-02 public table access regression: 14/14 passed
- FR-01 table management, QR, and integration regressions: 15/15, 13/13, and 14/14 passed
- FR-10 authentication regression: 13/13 passed
- FR-11 menu management and integration regressions: 16/16 and 12/12 passed
- Backend lint, frontend lint, frontend production build, and backend health check passed
- Remaining isolated FR-06 broadcast test records: 0

Implemented Step 4 active-order loading:

- Protected endpoint: `GET /api/kitchen/orders/active`.
- Existing `authMiddleware` and `requireKitchenStaff` protect the route.
- Only `new`, `accepted`, and `preparing` orders are returned; `ready`, `completed`, and `cancelled` are excluded.
- Results are ordered by database order time from oldest to newest.
- Items use historical name snapshots with quantities and special instructions.
- Responses omit internal IDs, QR/authentication data, payment information, and prices.
- Empty lists return a successful response and unexpected database failures are sanitized.

Step 4 verification:

- Active kitchen orders API tests: 15/15 passed
- Socket.IO infrastructure regression: 10/10 passed
- Kitchen broadcast regression: 9/9 passed
- FR-05 backend order placement regression: 45/45 passed
- FR-05 frontend review/submission regressions: 8/8 and 22/22 passed
- FR-04 cart regression: 16/16 passed
- FR-03 public menu regression: 14/14 passed
- FR-02 public table access regression: 14/14 passed
- FR-01 table management, QR, and integration regressions: 15/15, 13/13, and 14/14 passed
- FR-10 authentication regression: 13/13 passed
- FR-11 menu management and integration regressions: 16/16 and 12/12 passed
- Backend lint, frontend lint, frontend production build, and backend health check passed
- Remaining isolated FR-06 test records: 0

Implemented Step 5 frontend integration:

- The protected kitchen route reuses the existing `RoleRoute` and kitchen-only role rule.
- A reusable Socket.IO client sends the staff JWT only through the handshake `auth` object.
- Initial active orders load from `GET /api/kitchen/orders/active`.
- The session subscribes to `kitchen:order:new`, buffers events during API synchronization, and merges by public Order ID.
- Socket reconnection triggers authoritative active-order synchronization and removes duplicate cards.
- Socket listeners and the connection are cleaned up when the dashboard unmounts or the authenticated session ends.
- The responsive dashboard includes loading, API error/retry, connection status, empty state, and basic order cards.
- No order-status controls or FR-07 actions are present.

Step 5 verification:

- Kitchen frontend state/session tests: 20/20 passed
- Frontend lint and production build: Passed
- Socket.IO infrastructure regression: 10/10 passed
- Kitchen broadcast regression: 9/9 passed
- Active kitchen orders API regression: 15/15 passed
- FR-05 backend order placement regression: 45/45 passed
- FR-05 frontend review/submission regressions: 8/8 and 22/22 passed
- FR-04 cart regression: 16/16 passed
- FR-03 public menu regression: 14/14 passed
- FR-02 public table access regression: 14/14 passed
- FR-01 table management, QR, and integration regressions: 15/15, 13/13, and 14/14 passed
- FR-10 authentication regression: 13/13 passed
- FR-11 menu management and integration regressions: 16/16 and 12/12 passed
- Backend lint and health check: Passed
- Remaining isolated FR-06 backend test records: 0

Step 5 manual limitation:

- No browser automation interaction suite was executed. Live two-browser delivery, responsive visual layout, network interruption, reconnection, and logout cleanup require the documented manual browser pass before final FR-06 completion.

Step 6 final automated verification:

- Socket.IO infrastructure tests: 10/10 passed
- Kitchen post-commit broadcast tests: 9/9 passed
- Protected active-orders API tests: 15/15 passed
- Kitchen frontend session/state tests: 20/20 passed
- FR-05 backend order placement tests: 45/45 passed
- FR-05 frontend review/submission tests: 8/8 and 22/22 passed
- FR-04 cart tests: 16/16 passed
- FR-03 public menu tests: 14/14 passed
- FR-02 public table access tests: 14/14 passed
- FR-01 table management, QR, and integration tests: 15/15, 13/13, and 14/14 passed
- FR-10 authentication tests: 13/13 passed
- FR-11 menu management and integration tests: 16/16 and 12/12 passed
- Backend lint, frontend lint, frontend production build, and backend health check passed
- Request-log sanitization tests: 3/3 passed
- A final security review found that development request logs included raw QR query tokens. Request logging now redacts the `token` value, and the affected kitchen broadcast and FR-05 order-placement regressions still pass.
- Cleanup confirmed zero FR-06 test tables, categories, menu items, users, and orders; T01-T05 remain intact

Step 6 unverified browser acceptance scenarios:

- Complete QR-to-order-to-kitchen-card workflow across separate customer and kitchen browser sessions.
- Two simultaneous kitchen browser sessions receiving one card each without refresh.
- Browser network interruption, visible disconnected state, reconnect synchronization, and missed-order recovery.
- Desktop/mobile visual layout, long-instruction wrapping, and horizontal-overflow inspection.
- Browser logout causing the live socket connection to disconnect.

FR-06 must remain In Progress until these scenarios pass a real manual browser session or reliable browser interaction automation.

Remaining FR-06 work:

- Complete live browser integration, responsive, reconnection, and multi-client verification.
- Mark FR-06 Completed only after the documented browser acceptance scenarios pass.

## FR-05 Order Placement

Status: In Progress (Manual browser verification pending)

Implemented public API:

- `POST /api/public/tables/:tableNumber/orders?token=:token`

Implemented backend behavior:

- Public order placement without customer authentication.
- QR token and active-table revalidation inside a database transaction.
- Active category, active menu item, and availability revalidation with row locks.
- Trusted database price calculations using integer minor units without floating-point arithmetic.
- Aggregation of identical menu item and normalized-instruction lines while preserving different instructions separately.
- UUID-based public Order IDs, trusted timestamps, item name/price snapshots, and all three assignment payment methods.
- Atomic order and order-item storage with rollback on any failure.
- Sanitized public responses that exclude QR tokens and internal database IDs.

Backend verification results:

- Backend lint: Passed
- FR-05 order placement smoke tests: 45/45 passed
- FR-03 public menu smoke tests: 14/14 passed
- FR-02 public table access tests: 14/14 passed
- FR-01 table management tests: 15/15 passed
- FR-01 QR tests: 13/13 passed
- FR-01 integration tests: 14/14 passed
- FR-10 authentication tests: 13/13 passed
- FR-11 menu management tests: 16/16 passed
- FR-11 integration tests: 12/12 passed

Implemented frontend behavior:

- Customer order review displays the validated table, cart lines, instructions, subtotal, and total.
- Exactly one assignment payment method can be selected: Cash, Pay at counter, or Pay at table.
- Request payloads contain only payment method, menu item IDs, quantities, and special instructions.
- The validated table number and in-memory QR token are used for public order submission.
- Pending submission disables controls and rejects repeated clicks without retrying the request.
- Safe validation, invalid-QR, unavailable-item, server, and ambiguous-network messages preserve the cart on failure.
- Successful committed responses clear the table-scoped cart and retain a confirmation view showing only backend-confirmed values.

Frontend verification results:

- Frontend lint: Passed
- Frontend production build: Passed
- FR-05 order payload/review tests: 8/8 passed
- FR-05 order submission tests: 22/22 passed
- FR-04 cart regression tests: 16/16 passed
- FR-03 public menu regression tests: 14/14 passed
- FR-02 public table access regression tests: 14/14 passed

Remaining FR-05 work:

- Complete the documented desktop/mobile manual browser interaction pass before marking FR-05 Completed.
- The current API does not provide an idempotency key, so a deliberate repeated submission can create multiple orders. The server does not automatically retry ambiguous requests.

Final automated verification results:

- Backend order placement and database transaction tests: 45/45 passed.
- Frontend order payload/review tests: 8/8 passed.
- Frontend order submission tests: 22/22 passed.
- FR-04 cart regression tests: 16/16 passed.
- FR-03 public menu regression tests: 14/14 passed.
- FR-02 public table access regression tests: 14/14 passed.
- FR-01 table management, QR, and integration tests: 15/15, 13/13, and 14/14 passed.
- FR-10 authentication tests: 13/13 passed.
- FR-11 menu management and integration tests: 16/16 and 12/12 passed.
- Backend lint, frontend lint, and frontend production build passed.
- Database cleanup confirmed zero FR-05 test tables, categories, items, and orders; T01-T05 remain intact.
- No duplicate persisted Order IDs were found.

Browser-verification limitation:

- Headless Chrome rendered the validated table and isolated menu item, but raw CDP mouse/keyboard input did not activate React's Add-to-cart handler in this environment. The verifier cleaned up all isolated records after every attempt. The complete interactive desktop/mobile workflow therefore remains a manual verification item.
# Waiter Ready Orders and Delivery Workflow

Status: Implemented (automated verification passed; manual multi-browser visual verification remains)

Implemented:

- Protected waiter ready-order queue with historical item snapshots and accurate ready timestamps.
- Transaction-safe first-waiter claiming with assignment and claim timestamps.
- Assigned-waiter/admin pickup and delivery authorization.
- Separate waiter Socket.IO room and real-time ready, claim, pickup, and delivery updates.
- Responsive waiter dashboard with unclaimed and assigned queues.
- Database migrations `006_add_waiter_order_delivery.sql` and `007_add_order_ready_at.sql`.

Verification:

- Waiter backend workflow and authorization: 13/13 passed.
- Waiter frontend state: 8/8 passed.
- Socket infrastructure: 10/10 passed.
- FR-07 order status service/realtime/API/cancellation: 58/58, 30/30, 72/72, and 46/46 passed.
- FR-06 kitchen active orders/broadcast: 15/15 and 9/9 passed.
- FR-05 order placement: 51/51 passed.
- Table availability lifecycle: 12/12 passed.
- Authentication: 13/13 passed.
- Public table access: 14/14 passed.
- Menu management: 16/16 passed.
- Frontend kitchen state/status controls: 20/20 and 29/29 passed.
- Backend lint, frontend lint, frontend production build, and PostgreSQL connection check passed.

Manual limitation:

- A real two-waiter browser pass is still recommended to visually verify responsive layout and live synchronization under an actual network interruption.
