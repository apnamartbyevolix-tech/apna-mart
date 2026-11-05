# Phase 2A — slice 1 handoff

5 November 2026. Scope: catalogue/category consistency and checkout eligibility, plus the confirmed migration-entry-point safety gap. **Stop here for architectural review.** This is not completion of all Phase 2A or permission to launch.

## Sprint 0 review completed first

Actual diffs of accepted commits `296caec` and `979a468` were independently reviewed against the five requested checks. No confirmed introduced defect was found. One pre-existing P1 gap was confirmed: Drizzle migration configuration did not activate shared local/test URL validation. A three-line configuration change now invokes the accepted parser before exporting the URL, with eight import-level regression cases. Ordinary production connection behavior is unchanged. See `SPRINT_0_SECURITY_REVIEW.md` for the exact findings and scope.

Both accepted commits remain intact and are ancestors of the current branch. No broad refactor, new dependency or migration was introduced.

## First implementation slice

- Home, search and shop product lists now exclude disabled/regulated **product** categories, rather than relying only on the merchant's primary category.
- Category searches find matching products even if their merchant has a different primary category. Shop results retain their existing primary-category grouping.
- Product detail checks both product category and merchant category.
- Checkout revalidates the shop and product categories inside the existing locked transaction before stock, order, payment or ledger writes. New tests verify unchanged stock and absence of order/payment/ledger effects on rejection.
- Until verified Apna Galla eligibility exists, catalogue home/search/shop/product and new-order placement are restricted to isolated local development/test requests. Production/public preview fail closed before database access; remote requests with a forged local Host are rejected. No enable-public-selling flag, fake subscriber state or live connector was added.
- Existing private order history/detail, merchant/rider fulfillment, support, cash and recovery procedures remain available under their existing authorization. Local COD/pickup, lockout, return and rider-conflict workflows still pass.
- Existing React screens, styles, routes and tRPC response shapes are preserved. Closed-shop detail retains its existing informational behavior; new orders still require an open approved merchant.

## Customer workflow assessment and next priorities

| Priority | Current assessment | Next work after review |
| --- | --- | --- |
| Town/locality | Active-area API scoping exists; wrong delivery zone is regression-tested. Browser storage/location/cart recovery remains incomplete. | Guard storage failures and make location/cart changes recoverable without redesign. |
| Merchant/product discovery | Open/approved town/zone checks preserved; category parity fixed in this slice. Public selling deliberately closed pending real eligibility. | Review the local-only boundary, then jointly design verified eligibility; no public bypass. |
| Categories/search/filtering | Cross-category product search and restricted-category exclusions now pass real MySQL tests. | Browser UX verification; retain merchant primary-category grouping unless requirements change. |
| Product/pricing | Search/detail price values agree from current data; existing server pricing is preserved. | Cart still uses saved prices; implement a server quote and reconfirm changed totals. |
| One-seller cart | Existing add flow and server ownership checks remain; restoration/replacement and locality changes need work. | Normalize restored/replaced lines and provide stale/unavailable-item recovery with focused tests. |
| Server checkout | Category/stock/address/payment checks and transaction/idempotency behavior are preserved and exercised. | Quote agreement and full request retry identity; approve any request-hash migration before creating it. |
| COD/Cash on Pickup | Existing seller delivery/pickup and cash workflows pass isolated database tests. No gateway/OTP added. | Browser confirmation and documented financial/admin verification semantics. |
| Confirmation/history/handover | Existing owner-scoped history/code, persistent lockout/reset, rider conflicts and return handling pass. | Bounded refresh and real customer/merchant browser authentication/journey verification. |

## Exact files changed for this handoff

Security follow-up:

1. `drizzle.config.ts` — activate shared local/test validation before migration configuration export.
2. `server/marketplace/migration-config.test.ts` — eight configuration regressions.
3. `docs/SPRINT_0_SECURITY_REVIEW.md` — actual diff review and confirmed finding.

Phase 2A slice:

4. `server/routers.ts` — catalogue release boundary, category filters, cross-category search and checkout category checks.
5. `server/marketplace/catalog-access.test.ts` — twelve production/preview/local-boundary regressions without DB access.
6. `server/marketplace/workflow.integration.test.ts` — six additional real-MySQL cases, isolated catalogue fixtures and unchanged existing assertions.
7. `docs/PHASE_2A_SLICE_1.md` — this assessment/evidence/review handoff.

Selective tooling evaluation requested during implementation:

8. `docs/ENGINEERING_WORKFLOW.md` — ECC/Ponytail conflicts, the four adopted procedures and measurable evidence. ECC marketplace is registered, but the hook/MCP-bearing plugin is not installed/enabled. Existing Ponytail remains enabled. JSON plugin inventory was saved outside the repository at `C:/Users/Ayush/.codex/visualizations/2026/11/04/01a1a6e9-ab12-77d3-aaec-d18050ac79f9/plugin-list.json`.

Pre-existing audit/roadmap/open-decisions/Sunday-plan documents, migration 0008's newline modification and handoff ZIP/patch files were not folded into these implementation changes or deleted. `package.json`, `pnpm-lock.yaml`, all SQL migrations and schema are unchanged by this slice.

## Executed checks and TDD evidence

| Run | Result |
| --- | --- |
| Independent review's original configuration cases | 41 passed. |
| Parser + migration configuration focused run | 49 passed. |
| Catalogue-boundary RED before runtime edit | 12 failed for missing pre-DB release/local checks. No syntax/setup failure was counted as RED. |
| MySQL catalogue RED before runtime edit | 5 failed, 11 passed, 1 skipped. Failures reproduced cross-category omission and restricted-category visibility. |
| Focused migration/catalogue GREEN | 20 passed (8 + 12). |
| **Complete Vitest run with isolated MySQL enabled** | **157 passed, 0 failed, 1 skipped; all 8 files passed.** Includes 16 passing real-MySQL workflows. |
| Installed `tsc --noEmit` | Passed, exit 0. Existing configuration excludes test files. |
| Installed `vite build` then `esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` | Passed. Existing non-module runtime-config-script warning remains. |

Tests used the pre-existing disposable `mtm_e2e_*` fixture on loopback port 3308. Before running, the runner checked the shared parsed options and queried the actual database, port and data directory. Credentials/signing values stayed in private local configuration and were redacted from child output. Persistent demo port 3307 and existing service port 3306 were not used for fixtures. No destructive resets/deletes, production/shared writes or new migrations were run.

The actual full-suite process was `node node_modules/vitest/vitest.mjs run`, with `NODE_ENV=test`, `MTM_RUN_ISOLATED_DB_TESTS=1`, dev-auth flags off and the private fixture's DB/session configuration. No claim is made that a bare `pnpm test` executes DB tests: its normal safety default still skips them.

## Remaining launch blockers and explicit unresolved issues

1. **Owner bootstrap:** `server/marketplace/workflow.integration.test.ts` still conditionally skips the protected-owner case when `MYTOWN_ADMIN_EMAIL` is absent. This accounts for the one skipped test. Configure the actual protected owner identity in an isolated approved test environment and verify owner versus ordinary identities; do not fabricate a production owner or remove the skip to obtain a green count.
2. **Real browser authentication:** Manus OAuth login/callback/cookie/logout and actual owner/customer/merchant browser identity have not been verified. Direct tRPC caller tests are not browser E2E. Public launch remains blocked.
3. **Completion timestamp:** `executeFailedDeliveryTransition` and rider completion/decline still write `deliveryAssignments.completedAt`, absent from `drizzle/schema.ts` and migrations. Drizzle discards it; timeline/updatedAt still persist. This slice intentionally does not add a column or change that workflow. Architect must approve consistent event usage or a new additive nullable timestamp migration with focused persistence regressions.
4. **Actual eligibility/integration:** no verified tenant/subscription/consent/listing projection or ERP stock/sale API exists here. Catalogue/new orders remain local-only. The colleague's APIs, joint contract approval and failure/reconciliation tests are required before opening public selling.
5. **Remaining customer work:** storage/session cache/cart recovery, authoritative price quote/reconfirmation, tracking refresh and media serving/fallback issues remain. Broader privacy/deletion, refund/settlement operations and production readiness remain on the roadmap.

No remote push, public deployment, live ERP call, new application dependency or ECC hook/MCP activation occurred. Architectural review is requested for the local-only catalogue policy and category/checkout consistency diff before the next implementation slice.
