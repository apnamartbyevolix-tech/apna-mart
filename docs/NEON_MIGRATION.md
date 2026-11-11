# PostgreSQL migration and connected-release evidence — 11 November 2026

The owner approved Neon as the free fallback after a lasting free MariaDB plan
could not be verified. No MariaDB resource was provisioned.

Neon organization apna-mart is on Free. Project morning-forest-32902141 uses
PostgreSQL 17 in Singapore, database apna_mart, fixed 0.25 CU, with account-managed
idle suspension. The reviewed two migrations are applied: 31 application tables,
14 enums, stock-confirmation, durable outbox and automatic timestamp safeguards.
No demo accounts, customer records or fictitious listings were copied to Neon.

The runtime uses Drizzle/node-postgres, explicit TLS verification, bounded
pooling, native RETURNING, conflict targets, PostgreSQL time/boolean/JSON
expressions and case-insensitive catalogue searches. OTP/session persistence,
transactional checkout and the seller bridge were converted. Local test guards
reject remote hosts, ambiguous URL options, production execution and databases
outside the disposable mtm_e2e_*_test namespace.

Verified locally:
- TypeScript and application build passed.
- Full application suite: 311 passed, zero skipped, including authentication,
  checkout races, pricing changes, stock limits, fulfilment and permissions.
- Clean Drizzle CLI migration and repeat/no-op migration passed on a disposable
  localhost database. SQL stock/outbox/idempotency/timestamp checks passed.
- Paired PostgreSQL apps: 13 connected marketplace scenarios passed, including
  price/offer changes, one ERP invoice, safe retries, tenant isolation, stock
  confirmation outages, handover lockout and balanced accounting vouchers.
- The additive Galla launch migration and catalogue-refresh triggers passed on
  localhost, with changes rolled back. A counter sale attempting to consume
  online-reserved stock was rejected with no stock or invoice change.
- Galla connector/pricing unit checks: 25 passed. Galla API and frontend builds
  passed before final release verification.
- TLS-verified read-only connections succeeded to both cloud databases. Mart's
  pooled runtime driver also passed certificate verification.

Test evidence: D:/Codex Output/Apna galla production chat (3)/Apna Mart Launch/2026-11-11/.
All database-mutating automated tests used dedicated disposable localhost
*_test databases and fictional accounts. Operator accounts were preserved.

Rollout remains gated on the Galla migration-owner connection, final builds,
secret checks, deployment status and HTTPS/domain verification. Its runtime
account correctly lacks migration permission; do not grant it extra privileges.
Real SMS delivery and physical-phone acceptance are not established by local
simulated tests. Never represent these checks as production load testing.

Rollback: pause new online orders and drain/reconcile pending reservations
before disabling the connector or reverting reservation protection. Preserve
idempotency records and invoices. Do not delete customer or financial records.