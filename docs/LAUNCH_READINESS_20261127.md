# Apna Mart launch readiness — 27 November 2026

Local implementation work only. No production changes, push, DNS changes or Play upload are authorized by this work log. Preserve existing accounts, operator access and unrelated Galla Gradle edits.

## Accepted product decisions

- Offers/products-first consumer marketplace; sellers operate through Galla.
- Ivory `#FAF7F0` / teal `#123D36` / amber `#F4B544`, approximately 65/30/5 for interface emphasis.
- English, Hindi and Hinglish; pincode first, optional user-triggered GPS with confirmation/fallback.
- Phone verification + returning four-digit PIN; no Clerk migration.
- Larger paginated ordinary whole-unit catalogues, including eligible GST products. Existing accounting remains authoritative. Weighted/variant/batch/serial/bundle expansion is deferred.
- One shop per order, seller delivery/pickup, COD/Cash on Pickup. No new gateway, marketing SMS or calling.
- Free/local resources while testing. No Ollama at launch. Monthly VPS decision follows representative load testing; do not purchase services.

## Delivery ledger

- [ ] Baseline: current suites, isolated PostgreSQL, browser/mobile evidence.
- [ ] Shared UI, responsive navigation, pincode selection, translated customer journeys.
- [ ] Discovery, product/shop, cart, checkout, account/order UX and failure recovery.
- [ ] Bounded resources: queries, sync, retries, uploads, health checks and SMS.
- [ ] Cursor pagination and signed, backward-compatible GST catalogue/quote snapshots.
- [ ] Galla publishing readiness and full order/invoice reconciliation.
- [ ] Security boundary, accessibility, connectivity/device and 20-scenario regression matrix.
- [ ] Source-backed Archify diagrams for each app and their connection.
- [ ] Local load/soak, restore/rollback evidence and launch/runbook documentation.

## Verification rules

Database-mutating automated checks require disposable localhost `_test` databases and fictional principals. Simulated SMS only. Never load hosted keys into a test process. Keep exact pass/fail/skip evidence, distinguish browser/device checks from API tests, and do not claim a full audit or production capacity from old/local results. Screenshots/logs belong in `D:/Codex Output/Apna galla production chat (3)/Apna Mart Redesign/2026-11-27/`.

Reviewed tools: Archify `d6b0f71f25a3337ed2fcd09c973cacf67be7baba`, Ponytail `ebd8654c2c627f721eb8f9c0d1bd4090a29f9e10`; selected ECC methods from ENGINEERING_WORKFLOW.md, with no hooks or automatic delegation.
