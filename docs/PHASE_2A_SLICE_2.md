# Phase 2A Slice 2 — implementation and verification handoff

5 November 2026. Started from `c63dab3` on `codex/launch-readiness`. The owner subsequently requested completing the working journey and testing it in a real browser with demo data. This handoff covers quotation/reconfirmation/recovery and confirmed browser/operational corrections. It does **not** declare every roadmap phase or a connected launch complete. Architectural review is still required for these critical workflow changes.

Implementation commits: `467da48` (server/shared and regressions), `10fb5a1` (customer review/recovery and browser corrections). Final verification and browser readiness recorded **5 November 2026, 16:42 IST (11:12 UTC)**. Documentation is committed separately. The final demo is running on loopback and left open in Chrome.

## Inspection and implementation

- Existing checkout already calculated server prices inside a MySQL transaction, used customer/key uniqueness and stored item/payment/ledger/event snapshots. Its browser estimate did not represent confirmed current prices; retries returned an existing order without comparing the intended request. Browser restoration accepted incomplete money/product data, and several storage reads could throw during rendering.
- `prepareCheckout` extracts existing locked merchant/category/town/zone/address/product validation without a broad router refactor. Both the new authenticated `marketplace.quoteOrder` and order placement call it, reusing `calculateOrderTotals`. Quotes include current product names/units/quantities/prices, delivery/pickup, minimum, owned address preview, delivery/platform fees and payable integer paise. Internal commission is omitted from quote totals. Existing zero tax/discount behavior is preserved; no tax policy was invented.
- Checkout recalculates under locks and compares the reviewed quote fingerprint **before** inventory, order, item, event, payment or ledger writes. Current availability, category eligibility, service area, address ownership and stock remain authoritative. Quotes reserve nothing. A stock reduction that still covers the requested quantity does not invalidate an otherwise identical quote; insufficient stock always blocks placement.
- Quote identity includes the complete customer intent and current reviewed item/fee/address snapshot. The hash is a comparison with recalculated server data, not a client-authoritative price or a credential. Missing/mismatched quotes cannot create orders. Price/fee/address changes require explicit new consent. Product/seller substitution is never automatic.
- Existing customer/key uniqueness remains. The initial placed event atomically stores `checkoutRequestV1`, a SHA-256 hash of canonical customer/shop/town/zone/items/address/fulfillment/payment/notes/substitution intent. Item ordering and absent/empty note text have stable semantics. Quote fingerprints are separate from immutable request intent, so an exact retry still finds its successful order after catalogue/stock changes.
- A customer-row lock serializes same-customer checkout retries, including last-unit retries. A full-suite regression exposed an index-gap deadlock when the subsequent absent-order lookup also used `FOR UPDATE`: a waiting competing customer could block the winner's order insertion. That unnecessary second locking read was removed. Customer serialization and current product/shop locking remain. Five fresh competing-customer rounds now assert exactly one winner and a stock conflict for the loser, with no losing-order effects.
- Reusing a key for different request content returns `CONFLICT`. Old orders without the new event metadata fail closed with order-history guidance; no guessed backfill or misleading duplicate success. New exact duplicates do not depend on a currently orderable catalogue or a new quote.
- Browser cart parsing rejects malformed, negative/fractional money, invalid IDs/quantities, duplicates, mixed sellers and oversized arrays as a whole with a recovery notice. It does not silently pick a different seller/item. Unavailable storage keeps the tab usable and displays a persistence warning. Town/locality preferences and auth storage writes are guarded.
- Checkout renders authoritative server amounts and address, explicit consent, inline errors with focus, editable quantities/removal and locality recovery links. Full intent scopes stable UUID retry keys. Lost responses can be recovered through **Check previous submission**, which uses existing customer-only `myOrders` and creates no checkout effects; it works after reload even when the successful order exhausted stock. A newer edited cart is not cleared by an older response/recovery.
- Logout cancels/removes prior query data while retaining the auth observer. Local sign-in routing remains usable without configured OAuth; backend development-auth/role restrictions are unchanged. Customer order detail refreshes every ten seconds in the foreground while active, stops at terminal status and offers manual refresh.
- Added local fallback media/favicon, product image error handling, preserved browser zoom and adjusted only the new quote-recovery controls for mobile layout. Newly created products inherit their fictional merchant's demo status.
- Replaced unmapped assignment `completedAt` writes with existing `updatedAt`; completion events remain the persisted timeline. A separate confirmed default-timestamp offset is documented in `TIMESTAMP_REVIEW.md`, without modifying accepted production connection behavior.

## Migration decision

**No migration, new table, request-hash column or migration-metadata change.** Existing `order_events.metadata` is durable and inserted in the same transaction as the order; its existing order index supports retry lookup. This is sufficient for immutable request comparison under the current append-only event workflow. A dedicated column becomes a reviewed proposal only if event pruning/mutation or query scale makes that mechanism insufficient. Historical orders retain their original data and use safe history-based recovery.

## Executed verification

Used the installed project binaries (the Windows package-manager shim is not required): `tsc --noEmit`, `vitest run`, `vite build`, and esbuild for `server/_core/index.ts` with the repository's build flags. No application dependency or lockfile change.

| Check | Actual final result |
| --- | --- |
| TypeScript | Passed, exit 0. Existing tsconfig excludes test files. |
| Default suite with DB URL blank and isolated-test opt-in disabled | 172 passed, 0 failed, 35 integration cases skipped as designed. |
| Complete suite with verified disposable localhost MySQL and isolated-test opt-in | **207 passed, 0 failed, 0 skipped; 9 files.** |
| Included database workflows | 35 passed, including five competing-customer rounds within the oversell case. |
| Client storage/request-identity helpers | 24 passed. |
| Existing seller delivery regressions | All 68 retained and passed. |
| Production Vite + esbuild | Passed, exit 0. Existing non-module dynamic config-script warning remains. |
| Exact changed-code/caller review and whitespace check | Completed; confirmed defects corrected, no validation/test removal. |
| Actual headed Chrome desktop/mobile | Passed the documented journeys in `LOCAL_BROWSER_VERIFICATION.md`; not substituted with API evidence. |

MySQL execution validated the shared parser result, exact database, port 3308 and absolute disposable server data directory before running. Owner bootstrap was enabled with an isolated `.invalid` owner email and **executed successfully**. No real owner's credentials or provider identity was used. Real OAuth bootstrap remains a release gate.

Observed RED evidence: unconfirmed checkout created an order; conflicting key reuse returned success; negative/fractional pricing/rates were accepted; a fictional merchant's new product lost its demo flag; quote omitted the authoritative address; competing-customer checkout produced `ER_LOCK_DEADLOCK`. Tests retained their expected business outcomes; fixes were applied before GREEN. A first cart-test import path and early browser harness timing/selector mistakes were corrected and are not counted as useful business-logic RED evidence. The intermediate 206-pass/1-fail full run was not reported as passing; the final 207-pass run followed the deadlock correction.

## Exact files changed

Server/shared and tests:

- `D:/town mart/shared/checkout.ts` — shared validated intent and canonical identity.
- `D:/town mart/server/marketplace/checkout.ts` — shared preparation/quote and durable retry comparison.
- `D:/town mart/server/routers.ts` — quote route, checked checkout, demo inheritance and existing assignment timestamp writes.
- `D:/town mart/server/marketplace/domain.ts` — integer/non-negative money and rate validation.
- `D:/town mart/server/marketplace/domain.test.ts` — invalid authoritative money regressions.
- `D:/town mart/server/marketplace/catalog-access.test.ts` — quote release boundary.
- `D:/town mart/server/marketplace/workflow.integration.test.ts` — current-quote callers plus checkout/address/concurrency/no-effect regressions; existing workflows preserved.

Client, assets and test discovery:

- `D:/town mart/client/src/lib/cart.ts`
- `D:/town mart/client/src/lib/cart.test.ts`
- `D:/town mart/client/src/pages/CheckoutPage.tsx` — extracted existing checkout screen with authoritative review/recovery.
- `D:/town mart/client/src/pages/CustomerPages.tsx` — preserved checkout export/routes, editable cart recovery and active order refresh.
- `D:/town mart/client/src/components/MarketChrome.tsx`
- `D:/town mart/client/src/_core/hooks/useAuth.ts`
- `D:/town mart/client/src/main.tsx`
- `D:/town mart/client/src/components/MarketCards.tsx`
- `D:/town mart/client/src/pages/MarketPages.tsx`
- `D:/town mart/client/src/lib/marketplace.ts`
- `D:/town mart/client/src/index.css`
- `D:/town mart/client/index.html`
- `D:/town mart/client/public/mytown-mark.svg`
- `D:/town mart/client/public/product-placeholder.svg`
- `D:/town mart/vitest.config.ts`

Documentation/artifact exclusion:

- `D:/town mart/.gitignore`
- `D:/town mart/README.md`
- `D:/town mart/TODO.md`
- `D:/town mart/docs/PHASE_2A_SLICE_2.md`
- `D:/town mart/docs/LOCAL_BROWSER_VERIFICATION.md`
- `D:/town mart/docs/TIMESTAMP_REVIEW.md`

Pre-existing owner changes were left intact and excluded: `docs/PROJECT_COMPLETION_AUDIT.md`, the newline-only `drizzle/0008_order_items_missing_quantity.sql` change, untracked `docs/MYTOWN_MARKET_ROADMAP.md`, `docs/OPEN_DECISIONS.md`, `docs/SUNDAY_LAUNCH_PLAN.md`, `mytownmarket_phase1.zip` and `phase1.patch`. Accepted `296caec` and `979a468` remain intact ancestors. Parser/pool/migration configuration, schema, historical migrations, package manifest and lockfile are unchanged.

## Remaining phases and launch blockers

1. **Review this critical slice and timestamp proposal.** Default-generated SQL times are wrong on the non-UTC demo session; existing production configuration must be audited before approving a coordinated UTC-session change/historical correction. No immutable assignment completion column exists.
2. **Real authentication/owner verification.** Configure and exercise the actual Manus OAuth provider with the authorized owner. Disposable bootstrap and server-controlled local personas are useful tests, not public authentication approval.
3. **Privacy and operations.** Approve privacy/data-sharing/consent, deletion/retention exceptions and operational ownership, then implement/test the actual policy. Provider storage/uploads, monitoring, backup/restore and low-end real-device checks remain unverified. Do not fabricate legal/commercial terms or promise deletion of records that must be retained.
4. **Merchant/admin financial completion.** Agree sales-suspension handling of existing obligations, commission/refund/COD liability and settlement semantics before new financial persistence/statements. Preserve the handoff's distinction between seller-retained COD and platform cash received. Existing collection, variance reconciliation, cancellation and return recovery remain tested; that does not complete new settlement/refund phases.
5. **Joint Apna Galla contract and implementation.** Colleague supplies actual APIs, tenant/item/unit mapping, verified subscription/consent, reservation/commit/release behavior and sale-posting milestone. Review durable event/retry/reconciliation and partial-failure handling before adding schema or activating a connector. No shared ERP database or independent double stock decrement. Real subscriber/POS concurrency cannot be verified without those services.
6. **Connected pilot/release gate.** Prove verified seller eligibility, cross-system inventory and financial recovery, real auth/privacy/operations and obtain explicit release approval. Public catalogue/quotes/new orders still fail closed outside isolated local operation. Native APK, gateways, SMS OTP, live GPS and automated payouts remain deferred.

No push, deployment, destructive database operation, live ERP/payment activation, unreviewed hook, broad architecture rewrite or public merchant bypass was performed.
