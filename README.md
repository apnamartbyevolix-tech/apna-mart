# MyTown Market

**Latest local QA, 6 November 2026:** customer mobile OTP (local SMS simulation), revocable sessions and separately signed backend identities are implemented. The MyTown customer app and connected Apna online-shop module passed 476 recorded checks, including actual Android API36 WebView tests. Dependencies were patched and the complete dependency audit reported no known advisories. **Production/Google Play release remains blocked** by the work in [the current QA handoff](docs/PRODUCTION_QA_2026-11-06.md). Historical notes below describe earlier handoff states; see [current authentication setup](docs/CUSTOMER_AUTH_AND_SERVER_LINK.md) for the implemented login flow. No push, deployment or Play upload was performed.

**Local engineering follow-up, 5 November 2026:** the supplied application is preserved. A disabled Apna Galla adapter boundary, local Ollama help and a Capacitor Android debug preview have been added. Public selling and real ERP synchronization remain blocked pending approved sandbox APIs. See [implementation and API gaps](docs/INTEGRATION_IMPLEMENTATION.md) and [local setup, verification and Android limits](docs/LOCAL_DEMO_HANDOFF.md). Original handoff/phase notes below record the earlier state; they are not claims of current ERP or Play readiness.

Responsive, mobile-first marketplace software for independent local shops. The existing web application supports customer discovery and cash orders, merchant fulfillment, optional rider deliveries, and administration. Phase 2A now adds authoritative cart quotes, explicit price/address reconfirmation and checkout recovery.

Public catalogue and new-order creation remain closed until real Apna Galla eligibility is verified. Local demo operation is separate from public-launch readiness. See [the Slice 2 handoff](docs/PHASE_2A_SLICE_2.md), [browser evidence](docs/LOCAL_BROWSER_VERIFICATION.md), and [the timestamp decision requiring review](docs/TIMESTAMP_REVIEW.md). No live ERP integration, online payments or native APK is claimed.

## Architecture

- **Client:** React, TypeScript, Vite, Wouter, Tailwind; responsive customer, vendor, rider and admin areas.
- **Server:** Express and tRPC; server-owned identity/role authorization, pricing, town/zone scope, order transitions, inventory changes and audit records.
- **Persistence:** Drizzle ORM and MySQL-compatible SQL. Migrations are additive. Demo data is fictional and inserted by an idempotent seeder.
- **Media:** authenticated vendor image-upload procedure, MIME/size allowlist, durable platform storage.
- **Authentication:** Manus OAuth session from the starter, with the first admin matched against the protected owner-email allowlist.

## Run and build

The initialized Manus Preview is available from the project workspace. For local development in an environment with project variables configured:

```sh
pnpm dev
```

For Windows PowerShell with Node on `PATH`, the equivalent development command is:

```powershell
$env:NODE_ENV = 'development'
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
.\node_modules\.bin\tsx.cmd watch server/_core/index.ts
```

Use your private local `.env` for the demo connection and signing secret. Development personas require the existing explicit `MTM_ENABLE_DEV_AUTH=1` opt-in and a permitted localhost `mtm_dev_*`/`mtm_e2e_*` database; the administrator persona separately requires `ALLOW_DEV_ADMIN_LOGIN=1`. These settings are never public pilot authentication. Do not put credentials in this document or run the integration suite against the demo database.

Use the configured `PORT` (default `3000`). Build and serve the production bundle with:

```sh
pnpm build
pnpm start
```

The project's deploy build and runtime contract are managed through the WebDev project settings; do not copy private credentials into client code or a committed `.env` file.

## Safe verification

Typecheck and run the default suite:

```sh
pnpm check
pnpm test
```

The default `pnpm test` intentionally skips database-backed integration tests. To run them, use **only** a separate disposable MySQL/MariaDB database hosted at `localhost` or `127.0.0.1` whose database name starts with `mtm_e2e_`. Do not use the shared Manus-managed database or any production/staging DSN.

Local development authentication uses only `mtm_dev_*`, `mtm_local_*`, `mtm_test_*` or `mtm_e2e_*` names with a nonempty alphanumeric/underscore suffix. Local/test connections are parsed into explicit driver options. URL fragments, driver target/transport overrides and arbitrary query options are rejected; only one plain `charset` option is supported. Do not add `host`, `database`, `port`, `socketPath`, `stream` or `uri` query parameters. This prevents mysql2 from interpreting a different target from the one checked by the safety guard. A persistent demo database is not an integration-test database.

Example (replace the local database name/user values; use a fresh one-off test secret):

```sh
MTM_RUN_ISOLATED_DB_TESTS=1 \
DATABASE_URL='mysql://test_user:test_password@127.0.0.1:3306/mtm_e2e_example' \
MANUS_JWT_SECRET="$(openssl rand -hex 32)" \
pnpm exec vitest run server/marketplace/workflow.integration.test.ts
```

The suite rejects non-local hosts or database names outside `mtm_e2e_*`, and uses only its local database for workflow fixtures. The protected owner-email bootstrap case runs only when the project-provided `MYTOWN_ADMIN_EMAIL` is present. Apply checked-in migrations to that disposable database before running the suite. If reusing a local database, keep it disposable and do not treat it as production data.

**Caution:** `pnpm db:migrate` applies pending migrations to whichever `DATABASE_URL` is active. `pnpm db:seed-demo` inserts fictional demo rows additively, but still writes to that database. Confirm the target DSN before either command. Never use `db:push` as a substitute for a reviewed migration.

## Current scope and launch gates

Working initial checkout methods are Cash on Delivery and Cash on Pickup. The customer-only order handover code is locally displayed, rate-limited after five bad guesses, and required for rider/pickup completion. Cash received is separately reported; only an exact admin-verified amount is marked collected. Product/shop/media, price and order queries are scoped by authorized role, owner, and selected service area. Customers can save/unsave shops; only an owner of a delivered order can create one shop review for that order; in-app support messages are private to the customer and admin inbox.

The requested **SMS OTP is not connected**: sign-in is real Manus OAuth, not phone-number OTP. Do not market OTP as available or invent demo credentials/codes. No verified online payment gateway, customer push/SMS channel, live map/GPS tracking, automatic rider matching or payout transfer is connected. Privacy policy and customer account deletion also remain public-launch requirements. The demo stores fictional merchants/products, not real participating businesses. The web app is not a native Android APK; package the mobile experience separately if native distribution is required.

No external publication, remote repository push or paid-provider activation has been performed as part of this build. See [`plan.md`](./plan.md) for design/architecture decisions and [`TODO.md`](./TODO.md) for the full outcome and remaining-work tracker.
