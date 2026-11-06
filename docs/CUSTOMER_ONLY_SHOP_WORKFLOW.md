# Customer-only MyTown and unified Apna Galla shop — local pilot

This is an extension of the supplied React/TypeScript/Vite + Express/tRPC + Drizzle/MySQL project. Apna Galla continues to use its existing Nest/Prisma/Postgres stack. Nothing in this phase is deployed or approved for production.

## Customer experience

- MyTown is a public shopping application: location selection, product-first search with suggestions, categories, real active offers/festival collections, product details, one-shop cart, checkout and customer order tracking.
- The public bundle no longer routes to merchant, platform-admin or rider workspaces. Customer sign-in offers only the isolated fictional customer persona in the local demo. Working server-side administration and delivery services remain intact.
- Product cards use existing product photos where available. Connected items without an approved public photo show labelled illustrations; private Apna attachments are not exposed.
- COD and Cash on Pickup remain the only payment choices. Shops manage delivery or pickup. No payment gateway, cross-shop checkout or invented delivery promise was added.

## Shopkeeper experience in Apna Galla

Open Retail Home → Go Live / Online Shop at the existing MyTown route.

1. Choose supported, counted items and confirm sharing consent. A valid subscription with pilot entitlement is required before the public shop can be listed.
2. Manage Overview, Orders, Products, Offers and Shop settings inside Apna Galla.
3. Accept → Prepare → Ready → customer pickup, or Dispatch for seller-managed delivery.
4. Confirm the customer's own handover code and actual cash. Existing attempt limits and cash-variance rules remain authoritative.
5. A delivered order with confirmed cash posts exactly one ERP invoice, receipt and stock movement. A shortfall remains pending for the existing administrator reconciliation workflow.
6. Reject/cancel to release stock. A failed delivery requires physical inspection separating intact, damaged and missing units. No failed-delivery sale is invented.
7. Pause hides the shop and prevents new reservations while allowing existing orders to finish.

Order sound is opt-in, works only while this web workspace is open, and is not push notification delivery. The workspace refreshes visible data approximately every ten seconds and identifies connection errors. The local list is bounded to the latest 100 orders.

## Offers and pricing

Owners can create scheduled percentage or fixed-amount-per-unit discounts for a snapshot of selected items, all current supported items, or a current inventory category. Festival labels group genuine active offers.

- The reference is the actual recorded normal selling price; no fake MRP or saving is generated.
- One lowest applicable offer wins, without stacking. Percent calculations round each unit to integer paise, half up, identically at the counter and online.
- Optional per-item per-order quantity caps are checked on the server. Split counter lines cannot bypass the aggregate cap.
- Counter offers are evaluated at checkout time; backdating a document cannot revive an expired offer. Accepted online orders retain their immutable agreed price if an offer later ends or is paused.
- Scheduled transitions mark the catalogue dirty. Public reads and checkout also stop using expired offer prices even when catalogue delivery is delayed.
- Cost/margin previews are owner-only. Unknown cost stays unknown. Gross margin excludes overheads. Costs are not sent in public catalogue payloads.
- Pilot support remains INR, zero-GST, ordinary whole-unit stock items. Variants, batches, serials, bundles and complex units are excluded.

## Server boundary and migrations

The existing signed catalogue/reservation/commit/release/sale sandbox protocol remains revision 1.2. A new explicitly local **1.3-sandbox** bridge, POST /api/internal/apna/vendor, exposes only overview, orders, detail, status, inspected returns and limited shop settings. It is not an invented production API contract.

Apna resolves the company from authenticated owner membership. MyTown resolves that merchant's linked seller internally; browser-supplied seller identity is never trusted. HMAC authenticates timestamp + exact raw body over strict TLS 1.3. Bounds, request deadlines, durable mutation keys and changed-body conflict rejection are retained. The original order procedures enforce status, ownership, handover, cash and inventory rules.

Known validation errors that intentionally record failed handover attempts commit those security records before returning the error. They are not rolled back by the bridge or replayed as additional attempts.

Additive migrations:

- MyTown drizzle/0010_apna_vendor_requests.sql: durable bridge responses and optional product offer metadata, with matching Drizzle snapshot/journal.
- Apna prisma/migrations/20261106140000_unified_shop: company-scoped offers and owner action identities, with forced row-level security.

No production database, operator account or external service is used. Runtime flags still fail closed outside explicitly approved loopback *_test databases.

Required existing environment variable names, never values:

| Apna server | MyTown server |
| --- | --- |
| DATABASE_URL | DATABASE_URL |
| MYTOWN_SANDBOX_ENABLED | MTM_APNA_SANDBOX_ENABLED |
| MYTOWN_SANDBOX_URL | APNA_SANDBOX_URL |
| MYTOWN_SANDBOX_KEY | APNA_SANDBOX_KEY |
| MYTOWN_SANDBOX_SECRET | APNA_SANDBOX_SECRET |
| MYTOWN_STOREFRONT_URL | APNA_SANDBOX_TOWN_ID / APNA_SANDBOX_ZONE_ID / APNA_SANDBOX_CATEGORY_ID |
| NODE_EXTRA_CA_CERTS (local test CA only) | NODE_EXTRA_CA_CERTS (local test CA only) |

Keep all keys server-side and outside source control. Reuse the private prepared runner configuration; do not seed or alter another environment.

## Local setup and checks

Use the existing prepared connection/run.cjs modes: migratePG, migrate, migrateTest, api, web and mytown. The MyTown migrations require a schema administrator only when applying database triggers; the application runtime keeps its restricted grants.

Web verification: pnpm check, existing Vitest suite, Vite customer build; Apna TypeScript builds, Prisma validation and targeted signature/offer tests. Task-local end-to-end checks exercise actual owner/customer HTTP requests across both disposable databases.

Android remains Capacitor. For the connected debug preview use MTM_ANDROID_PREVIEW_URL=http://127.0.0.1:5206 and adb reverse tcp:5206 tcp:5206. The older isolated 5205 preview remains supported. Omit the variable and rebuild/sync bundled web assets for a release candidate. Release tasks reject a localhost server URL. The debug APK is not a Play Store release.

## Launch blockers

- Signed-off production Apna API/eligibility contract, service identities, approved endpoint configuration and security review remain required.
- Production customer authentication, privacy/account deletion, push delivery, payment-variance administration and support operations must be approved and verified. Existing platform-admin backend controls were preserved; a new production admin portal was not invented.
- Shop location/service area provisioning and public product photo permissions require a production workflow. Daily opening hours are configurable in India time, including overnight windows; weekly calendars are outside this pilot. Manual pause always wins, and existing orders remain manageable after closing.
- Current pilot bounds (latest 100 orders, bounded discovery catalogue, 30 shared items, no nonzero tax/fees) need production pagination/capacity work before broad rollout.
- Existing debug Android packaging does not establish Play Store readiness, production signing or production integration.

No Git push, deployment, DNS change or production migration was performed.

The prepared seller mapping also uses APNA_SANDBOX_VENDOR_USER_ID, and existing authentication/session variables remain required. This is a configured fictional sandbox identity, never a browser-provided seller ID.
