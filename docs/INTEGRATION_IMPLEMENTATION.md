# MyTown Market local integration implementation

5 November 2026. Source: supplied `MyTown-Market-Apna-Galla-Handoff-abdc208 (1).zip`.

## Inspected state and small steps

Read README, integration contract v1.1.0-draft, security review, implementation roadmap, Phase 2A slices 1/2, checkout source and timestamp review. Preserve React/TypeScript/Vite/Wouter, Express/tRPC and Drizzle/MySQL. The supplied ZIP has no Git history; the first local commit records its exact source baseline, not reconstructed upstream ancestry. Existing checkout transactions, customer-key idempotency, server prices, category/area validation, handover codes and return recovery stay authoritative.

1. Add a server-only typed adapter and signed, bounded HTTPS transport, tested with synthetic responses. Keep runtime disabled until reviewed wire mappings and sandbox credentials exist.
2. Preserve the existing local-only public-catalogue guard. A mock result never verifies a seller for public listing. Do not connect the separate Apna Galla production database.
3. Run all existing tests with separate disposable loopback demo/test databases and original additive migrations. No marketplace table is necessary for an inactive adapter. Durable outbox/schema and reservation/order wiring follow approved wire/lifecycle facts.
4. Reuse the customer web build through Capacitor. Add a debug-only same-origin localhost preview using ADB reverse; release builds must bundle the customer assets and require approved HTTPS auth/API integration.
5. Provide local authenticated Ollama app-help, isolated from customer records, pricing and order tools, with bounded input/concurrency/timeout and a clear unavailable response.

## Contract route mapping and approval gaps

| Supplied route | Intended local boundary | Status |
|---|---|---|
| `POST /api/v1/merchants/verify` | `verifyMerchant` | Await exact body/response and feature eligibility mapping |
| `POST /api/v1/inventory/reserve` | `reserveStock` | Await body/response, merchant/item/unit IDs and hold expiry representation |
| `POST /api/v1/inventory/commit` | `commitStock` | Await wire fields, response, recovery/status lookup |
| `POST /api/v1/inventory/release` | `releaseStock` | Await wire fields, reasons and damaged/partial-return behavior |
| `POST /api/v1/orders/sale-post` | `postSale` | `order:any` is underspecified; no fabricated financial payload |
| MyTown `/api/v1/webhooks/catalog-sync` | Future authenticated inbound handler | Await event schema, versioning, IDs, ordering/deletion and replay semantics |
| MyTown `/api/v1/webhooks/subscription` | Future authenticated inbound handler | Await exact subscription/consent state and ordering/revocation rules |
| MyTown `GET /api/v1/reconciliation/audit` | Future reconciliation | Await query/response, authorization and remote audit source |

The supplied document explicitly says architecture proposal/draft requiring joint sign-off. Its TypeScript interface is an internal contract, not a specification of HTTP JSON fields. No ERP route was inferred from similarly named POS APIs in another repository.

Required facts: approved staging/sandbox base URL and certificate; approved merchant consent/linking procedure; platform key/shared signing secret provisioning and rotation; signature encoding/header format and replay boundary/future-clock skew; exact request/response/error schemas for every route; stable tenant/merchant/item/unit/location mapping; marketplace-enabled subscription mapping and verification freshness/revocation; reservation status/TTL lookup and ambiguous timeout recovery; sale posting tax/price/discount/payment fields and proof milestone; partial return/damage semantics; idempotency conflict/retention/in-progress behavior; webhook IDs/order/retries; reconciliation permissions and examples. Confirm commit allocation versus delivery stock deduction to prevent double posting. Do not request production credentials.

## Environment variable names

Existing: `DATABASE_URL`, `MANUS_JWT_SECRET`, `NODE_ENV`, `HOST`, `PORT`, `MTM_ENABLE_DEV_AUTH`, `ALLOW_DEV_ADMIN_LOGIN`, `MTM_RUN_ISOLATED_DB_TESTS`, `MYTOWN_ADMIN_EMAIL`, `MANUS_PROJECT_ID`, `MANUS_OAUTH_API_URL`, `MANUS_OAUTH_PORTAL_URL`.

Connector names reserved for a future approved sandbox: `APNA_GALLA_SANDBOX_BASE_URL`, `APNA_GALLA_API_KEY`, `APNA_GALLA_SIGNING_SECRET`. Setting these alone does **not** enable the connector. An approved wire codec and exact allowed sandbox host are also required in server code.

Local AI: `MTM_LOCAL_ASSISTANT_ENABLED`, `MTM_OLLAMA_MODEL`. The URL is fixed to loopback; no public Ollama listener or customer data tools are exposed.

Android debug only: `MTM_ANDROID_PREVIEW_URL` (only `http://127.0.0.1:5205`); run `adb reverse tcp:5205 tcp:5205`. Omit this variable for bundled assets. No ERP secret is used in Android or Vite variables.

## Release blockers

Real ERP integration remains blocked by the facts above. Public catalogue/new order access stays closed. Existing OAuth provider approval, privacy/retention/deletion policies, storage provider, operational backup/monitoring and upstream timestamp review remain launch requirements. A debug APK is not Play readiness: permanent package identity, signing, verified native authentication, approved API origin, real-device and Play track review are separate. No deployment, push or paid activation is authorized.

Execution results and local access instructions are recorded separately after verification.
