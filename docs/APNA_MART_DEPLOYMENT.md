# Apna Mart deployment

The application uses PostgreSQL on Neon Free and a Render Free Node web service
in Singapore. Express serves the API and React bundle from the same origin,
https://apna-mart.in. Cloudflare provides DNS. No paid service is approved.

The PostgreSQL schema and Drizzle migration history live in drizzle/postgres.
Legacy MySQL schema/history remain as a reference; the application no longer
connects through mysql2. Never seed demo records or enable local authentication
on a hosted service.

The build installs locked dependencies, compiles TypeScript and bundles the app.
Startup applies the reviewed PostgreSQL migrations before serving requests.
The GitHub verification workflow runs against a disposable localhost PostgreSQL
17 database; deployment waits for its checks. Use DIRECT_DATABASE_URL for
migrations and the pooled DATABASE_URL for the service, both with verified TLS.

The production connector uses the fixed HTTPS peer api.apnagalla.in, HMAC and
pinned Ed25519 server identities. Sandbox execution stays disabled. The existing
SANDBOX_URL/KEY/SECRET variable names remain for wire compatibility and do not
permit sandbox execution in production. Keep all values in secret environment
settings, outside Git and Android bundles.

Apna Galla Pro owners publish their selected supported items with explicit
consent. Public name, business address/phone, selected names/prices/units and
counted availability are shared. Customer records and purchase costs are not
part of the public catalogue. Shops need real address, city and state in
Business Details. The launch supports INR, zero-GST ordinary whole-unit stock,
up to 30 shared items, cash on delivery/pickup and seller-managed fulfilment.
Unknown stock/cost is not made known by publication.

## Town and pincode matching

Signing up or adding private inventory does not publish a shop. An eligible
owner saves the public shop address, city, state and six-digit postal code,
selects supported items and explicitly publishes through Go live. A signed
publication creates or reuses the town and its pincode service area. Town
identity is case-insensitive city plus state; zone identity is scoped to that
town. This is manual area selection, not GPS or delivery-radius matching.

The connector persists postalCode as well as the zone name/slug and repairs
missing postalCode values on subsequent signed publications. It preserves
existing disabled areas. An operator can separately enable a real town/area
on an explicit owner request without publishing fictional shops. Customer
browsing remains area-scoped; delivery additionally validates the selected
address against that service area.

The 26 November follow-up passed the complete isolated PostgreSQL suite:
345 passed, 0 failed, 0 skipped, including pincode persistence, repeated
publication, cross-town isolation and disabled-area preservation. Typecheck
and production build passed. No schema migration was needed.

Customer browsing and checkout use the explicit production connector, rather
than the former local-only marketplace gate. Discovery refreshes eligibility
only for the selected service area (four concurrent checks, one 2.5-second
attempt per merchant). Listings require a live, unexpired link verified within
15 seconds. Failed checks hide the seller; checkout separately verifies the
merchant and reserves stock. Only mapped, non-demo products from non-demo
linked sellers are public in production. Local connected fixtures retain their
demo labels, and reviewer access still uses its separate fictional database.
Customer credentials cannot access legacy merchant procedures; signed Apna
Galla vendor requests retain access, including handling existing paused-shop
orders. No database migration is required by this change.

Reservations protect counter stock. Accepted order prices are preserved when
an offer changes. Durable retry identities and database triggers protect order
transitions and exactly-once sale/release/return work. Invoice posting uses
existing accounting services and preserves balanced vouchers and unknown costs.

Customer sign-in uses the configured APITXT account. Real delivery needs owner
acceptance; automated tests use simulated SMS only. Privacy and account-deletion
request pages are included. Deletion requests create an owned support ticket;
they do not claim to erase invoices or records automatically.

Free Render compute sleeps when idle; Neon Free has quotas and idle suspension.
No keep-alive cron, paid upgrade or payment method is part of this deployment.

See NEON_MIGRATION.md for validation and rollout status. Keep production secrets
and private deployment evidence in the protected local launch folder.

## Installable Android test build

Set MTM_ANDROID_LIVE_TEST=1 when running pnpm android:sync to connect the debug
APK to exactly https://apna-mart.in. It uses same-origin browser authentication
and contains no service credentials. This mode cannot be combined with the
localhost preview or MTM_ANDROID_RELEASE=1. Gradle also rejects release tasks
when a remote preview URL remains in the native config. The .debug package and
test label distinguish this install from a reviewed store release. Physical
phone acceptance and Play signing remain separate; do not upload a debug APK.
