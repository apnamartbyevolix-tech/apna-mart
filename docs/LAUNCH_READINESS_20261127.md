# Apna Mart launch readiness — 27 November 2026

## Result

The agreed local redesign and workflow implementation is complete for the supported scope. This is a tested release candidate, not production certification. No push, hosted migration, DNS change, provider SMS, purchase or Play upload occurred. Operator accounts and unrelated Galla Android edits were preserved.

The interface uses ivory #FAF7F0, teal #123D36 and amber #F4B544, approximately 65/30/5 for emphasis. The original logo remains. Products/offers lead discovery; five balanced navigation destinations stay consistent across widths. Pincode comes first; optional GPS suggests an area for explicit confirmation. Sellers operate through Galla. English, Hindi and Hinglish controls are available; narrative/legal copy still needs full translation review.

## Implemented

- Cursor-paged category, shop, offers, search and order history; bounded search and next-page retry. Reorder fetches exact previous IDs rather than the first catalogue page. Removed misleading discount sorting over incomplete data.
- Phone OTP signup/reset and returning PIN retained. Local demo appears only when explicitly enabled on permitted localhost. No Clerk or launch AI.
- One seller/order, seller delivery/pickup, COD/Cash on Pickup. Fresh server quote and explicit review required. Duplicate taps/lost responses recover one order. Offline mutations never queue for automatic submission on reconnect.
- Opt-in v2 nullable tax snapshots, inclusive prices, whole-line GST, accepted price/tax/HSN retention and balanced Galla postings. Unknown cost/profit stays unknown. Up to 500 whole-unit items; weighted/variant/batch/serial/bundle expansion deferred.
- Server-only signing, owner-scoped recovery, eight-attempt retry cap, idle backoff, request/body/concurrency limits, persistent SMS ceilings and optional location quota. No new gateway, marketing SMS or calls.
- Existing Capacitor app retained. Release pins owned HTTPS; loopback HTTP is debug-only. Location declarations do not grant permission automatically.

## Local verification

All mutations used fictional identities and dedicated localhost `_test` databases; no operator account.

| Check | Result | Scope |
|---|---|---|
| Mart regression | 410 passed; zero failed/skipped | Local DB, simulated providers |
| Galla targeted regression | 69 passed; zero failed/skipped | Marketplace and OTP ceiling units |
| Browser signup/cart/checkout | 14 assertions | Fictional OTP, desktop Chrome |
| Lost response/back-forward | 4 assertions | Deliberately dropped local response |
| Accessibility/reflow/connectivity | 22 assertions; zero axe violations on 13 routes | Emulated widths, automated checks |
| GPS/offline checkout | 6 assertions | Mocked GPS, no real permission changes |
| Galla accounting | 19 assertions | Real services/DB; ACK simulated in this separate proof |
| Paired Galla–Mart | 8 assertions | Real TLS 1.3, Ed25519/HMAC, current handlers and two local DBs; no mocked transport |
| Android | Debug APK built/installed/launched; 5 assertions | API36 emulator, not physical-device certification |
| Backup | 31 public tables match counts/content digests after restore | Fictional database |
| Local reads | 600/600 HTTP 200 | 200-request burst p95 2395 ms; 20-concurrent exercise p95 107 ms; laptop, not shopper capacity |

TypeScript/build results are in the local handover. Runtime advisory scan found zero known advisories at scan time; this does not prove no vulnerabilities.

## Hosted release gates

1. Additive Mart migration first, compatible backends next, coordinated v2 flags last. See MARKETPLACE_V2_ROLLOUT.md. Accepted orders retain their revision.
2. Verify real-shop GST applicability. Unsupported/uncertain electronic reporting stays blocked. This is not legal/tax certification.
3. Physical Android acceptance: permissions, process death, keyboard, notifications, native back, rotation, system font scale and full OTP/PIN/session journeys. Review shipped privacy/location declarations.
4. Finish narrative/legal translations and verify actual photography, service areas and merchant onboarding. Production photos were not replaced by fixtures.
5. Representative checkout/catalogue/owner load and long soak on the selected VPS. Target 200 shops/200 simultaneous shoppers remains unverified.
6. Review provider prices and SMS ceilings. Defaults 100/day and 1,000/month per app may block legitimate launch traffic if too low.
7. Edge/origin protection, service resource caps, offsite backups, restoration and alerts. Process limits are not an invoice cap.
8. Final hosted release authorization and Play acceptance. Hosted/Play versions were not changed.

## Tools and evidence

Archify d6b0f71f25a3337ed2fcd09c973cacf67be7baba and Ponytail ebd8654c2c627f721eb8f9c0d1bd4090a29f9e10 reviewed locally. Selected ECC practices follow ENGINEERING_WORKFLOW.md. No hooks, watchers, automatic delegation or paid extraction. Diagrams explain committed source; they are not live monitoring.

See QA_EDGE_CASE_MATRIX_20261127.md and VPS_OPERATIONS_PLAN_20261127.md. Scripts, JSON, screenshots and debug APK are outside Git in the dated output folder. Do not distribute its private subdirectory/database dump.
