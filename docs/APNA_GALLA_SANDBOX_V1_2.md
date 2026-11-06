# Apna Galla / MyTown local integration proof — 1.2-sandbox

This implements the owner's authorized isolated sandbox experiment. The supplied
`1.1.0-draft` contract remains the production authority. Its missing wire schemas
have been resolved **only for this localhost proof**, not represented as approved
production routes or commercial policy. Production activation remains disabled.

## Boundaries and prerequisites

- Keep React/TypeScript/Vite, Express/tRPC and Drizzle/MySQL intact.
- Apna Galla remains Nest/Prisma/PostgreSQL and owns item prices, subscription
  eligibility, physical stock and financial posting.
- Only explicitly approved pilot tenants with an active real subscription,
  active organization/company and INR configuration can publish. No paid plan
  automatically receives a marketplace entitlement. `MYTOWN_MARKETPLACE` is an
  explicit isolated fixture grant, not a new Pro benefit.
- Both databases must be disposable localhost databases ending `_test`.
- The local API listens on loopback. Server-to-server requests use TLS 1.3,
  a task-local CA trusted per process, HMAC and persisted UUIDv4 request keys.
  No system CA, browser security permission or TLS verification is bypassed.
- No API key, signing secret, password, database URL or session state belongs in
  source control, frontend bundles, screenshots or deliverable archives.

## Owner flow in Apna Galla

Home → **Take your shop online** → choose up to 30 items → review the storefront
preview and sharing consent → **Go live in sandbox**.

Only the authenticated shop owner/admin can manage this connection. A company's
scope comes from its validated membership. The shared fields are shop name and
selected SKU, item name, selling price, unit and available quantity. Purchase
costs, customer records, tax identifiers and private accounts are excluded.

Pause prevents new reservations immediately at the source. Catalogue publication
is acknowledged separately; an unavailable destination produces a visible sync
error and retains its durable outbox event. Counter billing stays available.

## Supported proof scope

One seller per order, seller-managed delivery or pickup, COD/Cash on Pickup,
INR, whole-count ordinary stock items with counted inventory, positive integer
paise prices and no GST. No serials, variants, batches, bundles, fractional units,
delivery/platform fees, commissions, promotions or payment gateways are enabled
for the connected sandbox seller. Existing standalone features remain intact.
Unsupported items are not exported and unsupported checkout totals fail closed.

## Wire agreement for this experiment

All Apna requests are POST, JSON, at most 64 KiB. The following headers are used:

- `X-Apna-Galla-Key`: server key, never shipped to browsers.
- `X-Apna-Galla-Timestamp`: integer Unix seconds, maximum clock skew 120 seconds.
- `X-Apna-Galla-Signature`: lowercase hex HMAC-SHA256 of `timestamp + '.' + rawBody`.
- `Idempotency-Key`: UUIDv4 retained with the durable operation.

Every body contains `revision: "1.2-sandbox"` and `merchantId`, which is the
Apna company UUID. Item identity is the merchant-scoped SKU captured at reservation; the server
resolves actual item ID, primary unit, branch and stock location. MyTown IDs are
local mappings, never accepted as Apna item or owner identities.

| Draft route | Additional input | Confirmed response |
|---|---|---|
| `/api/v1/merchants/verify` | none | `isValid`, `tier`, `expiresAt`, `marketplaceEnabled`, `currency`, `live` |
| `/api/v1/inventory/reserve` | `reference`, `items[{sku,quantity,pricePaise}]` | `success`, `reservationId`, `expiresAt`, `expiresInSeconds`, `totalPaise` |
| `/api/v1/inventory/commit` | `reservationId`, `orderNumber` | `success` |
| `/api/v1/inventory/release` | `reservationId`, optional `orderNumber`, `disposition[{sku,restocked,damaged,missing}]` | `success` |
| `/api/v1/orders/sale-post` | `reservationId`, `orderNumber`, `totalPaise`, `cashCollectedPaise` | `success`, `invoiceId`, optional `invoiceNumber` |

MyTown receives signed POST `/api/internal/apna/catalogue` with `revision`,
`merchantId`, monotonic `version`, `live`, `shop:{name}`, eligibility snapshot and
`items[{sku,name,unit,pricePaise,quantity}]`. It independently verifies a live
merchant with Apna before accepting publication. Older catalogue versions cannot
overwrite newer versions. Browser reads also refresh linked-shop eligibility;
failed verification hides the seller. Checkout verifies eligibility freshly.

Successful operation retries return the stored response. Reusing a request key
with different input is rejected. Reservations last ten minutes until committed;
committed stock never expires automatically. Failed verification or unknown API
outcomes cannot be treated as eligibility or completed stock confirmation.

## Orders, inventory and accounting

1. MyTown produces the existing server-authoritative quote.
2. Before placement, its server persists a reservation request key and immutable
   item/price body. Apna checks current prices, availability and selected items
   while holding the same item locks used by counter stock posting.
3. MyTown saves its order and a COMMIT outbox event in one MySQL transaction.
   Duplicate checkout requests return the original order. The source hold's
   unexpired retry allowance supports last-unit retries without trusting a client
   stock override. No network call runs inside either checkout transaction.
4. MyTown's database refuses fulfilment transitions until stock commitment is
   confirmed. The customer sees “Awaiting shop confirmation” when appropriate.
5. Only verified handover plus the exact recorded cash amount queues the sale.
   Apna posts the immutable accepted price snapshot through its existing POS,
   inventory, costing and accounting services in one PostgreSQL transaction.
   The snapshot trace is labelled `MYTOWN_SNAPSHOT_V1`, not historical import.
6. Cancellation releases the hold without increasing physical stock: reserving
   had never deducted it. Delivery failure alone does not release stock.
7. Return inspection releases intact units and records damaged/missing units
   through canonical stock adjustments and loss journals. It does not fabricate
   a sale, payment, refund, customer debt or unknown purchase cost.

Both sides retain durable delivery state and retry using the original request
identity. Remote errors are sanitized; credentials and request bodies are not
logged. A cash variance waits for reconciliation instead of fabricating payment.

## Environment variable names

Apna: `DATABASE_URL`, `JWT_SECRET`, `PLATFORM_JWT_SECRET`, `MFA_ENCRYPTION_KEY`,
`NODE_ENV`, `PORT`, `FRONTEND_ORIGIN`, `PUBLIC_APP_URL`, `API_ORIGIN`,
`MYTOWN_SANDBOX_ENABLED`, `MYTOWN_SANDBOX_URL`, `MYTOWN_STOREFRONT_URL`,
`MYTOWN_SANDBOX_KEY`, `MYTOWN_SANDBOX_SECRET`, `NODE_EXTRA_CA_CERTS`.

MyTown: `DATABASE_URL`, `MANUS_JWT_SECRET`, `MANUS_PROJECT_ID`, `NODE_ENV`, `HOST`,
`PORT`, `MTM_APNA_SANDBOX_ENABLED`, `APNA_SANDBOX_URL`, `APNA_SANDBOX_KEY`,
`APNA_SANDBOX_SECRET`, `APNA_SANDBOX_TOWN_ID`, `APNA_SANDBOX_ZONE_ID`,
`APNA_SANDBOX_CATEGORY_ID`, `APNA_SANDBOX_VENDOR_USER_ID`, `NODE_EXTRA_CA_CERTS`.

Existing isolated persona controls remain `MTM_ENABLE_DEV_AUTH`,
`ALLOW_DEV_ADMIN_LOGIN` and `MTM_RUN_ISOLATED_DB_TESTS`; they must never become
production authentication. Existing provider/bootstrap variables are explicitly
disabled in the local runner. Schema migrations use a separate local migration
identity where trigger-creation privileges are required; runtime grants are not
expanded.

## Production blockers

1. Sign off real API schemas, merchant-scoped credential/rotation policy,
   production URLs, delivery acknowledgments and webhook replay policy.
2. Approve actual subscription-tier eligibility, data-sharing terms, seller
   account mapping, town/service-area onboarding and real public profile fields.
3. Define supported tax/fee/currency, promotion, return, settlement and cash
   reconciliation policies beyond this deliberately narrow proof.
4. Review migration privileges, database RLS, outbox retry/dead-letter monitoring,
   retention, periodic subscription revocation checks and production load limits.
5. Finish approved staging/UAT and Android release verification. The earlier
   debug APK is a separate local preview; these changes are not a Play release.

Do not remove the sandbox gates, point fixtures at live data, push or deploy to
work around these blockers. No production launch is claimed by this document.
