# Production QA handoff — 6 November 2026

**Local test candidate verified. Production and Google Play release are not ready.** This run covers MyTown customers and the connected Apna online-shop workflow, not every Apna ERP feature or Ollama answer quality.

## Recorded results

| Layer | Passed | Failed |
| --- | ---: | ---: |
| Unit/integration: MyTown 266, Apna targeted 14 | 280 | 0 |
| Actual HTTP/database checks | 82 | 0 |
| Playwright CLI desktop/mobile browser checks | 96 | 0 |
| Playwright CLI on actual Android WebView | 9 | 0 |
| Automated accessibility route samples | 9 | 0 |
| **Total recorded checks** | **476** | **0** |

MyTown's final complete suite: 18 files, 266 tests, no skipped tests. Original tests remain. Tests used dedicated disposable localhost databases ending in `_test`, fictional customers and the test shopkeeper. The application operator account, production records and unrelated ERP working-tree changes were preserved.

TypeScript, Vite/Express bundle, Capacitor sync and Android debug build passed. APK signature verified. The debug package was installed on dedicated emulator-5562 (API36), and Playwright CLI attached to its actual WebView verified discovery, simulated OTP, cookie/session restoration and background/force-stop/relaunch persistence. The release task correctly rejected its localhost preview URL. Physical devices and Play installs were not tested.

Final full dependency audit, including development dependencies: zero known critical/high/moderate/low advisories at scan time. That result does not establish immunity to unknown vulnerabilities. A pre-existing JSX-location plugin peer warning remains: its declared Vite4/5 range differs from the project's Vite7, while actual builds/browser checks passed.

## Corrections made

- Address edits validate ownership and update default selection atomically while locking the customer's row. Rejected foreign-address edits no longer clear the existing default. Concurrent default saves serialize.
- Missing or inaccessible orders show the existing safe “Order not found” state. Lazy loading avoids a nested main landmark.
- Corrected customer text/action contrast and verified-phone readability. All nine sampled shopping/account/support routes passed automated WCAG A/AA checks after corrections; manual accessibility acceptance is still needed.
- Updated compatible runtime dependencies and patched Capacitor to 7.6.9. Updated package manager/test tooling, preserved the existing Wouter patch and pinned specific transitive security fixes. Added safety/compatibility tests for both help and diagram math rendering.

## Important successful scenarios

- Browser price tampering was replaced by an authoritative quote; changing quantity invalidated confirmation. Rapid repeated clicks resolved to one order.
- An accepted order response was deliberately dropped. After reload, the recovery UI opened the already-created order without another submission.
- Quote outages disabled submission, retained cart lines and required fresh confirmation after recovery.
- The browser-created order reached Apna, was accepted/prepared/readied in its owner UI, completed with private handover proof and recorded cash, and mapped to one ERP invoice with the agreed total. Accounting vouchers balanced.
- Browser cancellation released the reservation. Paired tests also covered offer caps/expiry, closed/paused shops, invalid signatures, subscriber/scope isolation, stock outages, retries, failed handover lockout, inspected returns and cash-shortfall reconciliation.

Warm localhost search smoke: 30 read-only requests, concurrency five, no errors; median 66ms, p95 195ms. These measurements do not establish production capacity, mobile-network performance or cold-start speed.

## Release work remaining

1. Choose MyTown's real HTTPS frontend/API arrangement and backend host. Implement/review production connector scopes and entitlement configuration against isolated staging. The current connector deliberately rejects non-local sandbox use; do not remove guards as a deployment shortcut.
2. Verify owner-approved real APITXT delivery and any assigned template/whitelist requirements. The key is already private; this run used simulated SMS only. Complete phone recovery, spend limits and trusted-proxy/rate-limit configuration.
3. Supply an accurate public privacy policy, functional in-app and web account-deletion request paths, support contact, approved retention and fulfillment procedures. No customer or financial records were deleted to fake compliance.
4. Approve the permanent Android package ID and release-key custody; configure the approved HTTPS environment, remove preview/dev flags and build a signed AAB. Current package `in.mytownmarket.customer.preview.debug` needs the PC and ADB reverse. Target/compile API36, minimum API24.
5. Agree or expand pilot limitations: INR, zero-GST ordinary whole-unit stock, 30 shared items, latest 100 orders. Add production pagination, scale tests, backups/restore, monitoring, retention jobs and rollback verification.
6. Complete physical-device, slow-network, screen-reader/large-text, operational and Google Play pre-launch acceptance. Play internal testing supports up to 100 testers and can start before all app setup is complete, but still needs a distributable functioning build. If the account is a new personal account subject to Google's rule, production access requires 12 closed testers opted in continuously for 14 days; account type was not inspected.

## Evidence and repeating tests

Task output: `D:/Codex Output/Apna galla production chat (3)/MyTown Market/2026-11-06/production-qa/`.

- `QA_REPORT.md`: full findings, limits, next steps and official Google references.
- `REPORT.html`: searchable local report and screenshots.
- `TEST_CASES.csv` / `QA_RESULTS.json`: every recorded check and evidence source.
- `vitest-results.json` / `apna-vitest-results.json`: individual test results.
- `MANUAL_ACCEPTANCE.md`: staged manual/device checklist.

The output folder's `run-checks.cjs unit` helper loads only the prepared disposable database configuration. `run-paired.cjs` and browser scripts reproduce bounded sandbox checks. Keep private fixture/SMS/session files out of source control and handoffs. Do not replace the test configuration with a production database. The original `pnpm test` intentionally skips DB integration without explicitly guarded test configuration; such skips are not equivalent to this complete run.

No finite suite proves all possible inputs, races, attacks or devices are covered. No production load test, live SMS, external deployment, Git push or Google Play upload was performed.

## Current official references

- [Google Play internal/closed/open testing](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en).
- [New personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
- [Account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
- [Target API requirements](https://developer.android.com/google/play/requirements/target-sdk).
- [Signed bundle upload and Play App Signing](https://developer.android.com/studio/publish/upload-bundle?hl=en).
