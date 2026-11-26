# Apna Mart testing release 1.1.1 (Android code 3)

26 November 2026, India time.

The previous local-only shopping gate prevented real customer discovery and
checkout despite the production ERP connector being configured. Public routes
now require that pinned connection and fresh eligibility. Favorites, product
details and checkout use the same publication rules. Unmapped, paused, stale,
expired and fictional sellers cannot fall back to standalone production sales.
Merchant operations remain in Apna Galla.

Eligibility checks no longer block every API request while checking every
merchant. They run for the selected area or checkout seller with bounded
concurrency and short verification timeouts. Existing durable stock-operation
retry identities, order authorization and accounting behavior are preserved.

Mobile location selectors have persistent labels, larger touch targets and
bounded text. Header account text and product actions fit narrow screens.
The existing green/cream design and desktop layout are retained.

## Verification

- Complete isolated PostgreSQL suite: **344 passed, 0 failed, 0 skipped**.
- TypeScript check and production web/server build passed.
- Browser checks: 11 customer pages at widths 360, 390, 430, 768, 1024, 1280
  and 1440: **77 checks**, no horizontal page overflow or page script errors.
- Fictional browser journeys: sign-in, location, adding Rice and Soap, reviewed
  INR 100 COD order, history, cancellation, buy-again and pickup order passed.
- New database regression covers missing ERP links, fictional records,
  unmapped products, stale verification, paused links and expired eligibility.
- Android release bundle/APK built with the existing upload key; signature,
  permanent package, target SDK, non-debuggable status and bundled-secret
  checks passed. Native installation/review results are recorded separately
  in the local release evidence; a build does not imply Google approval.

No production records were used by automated tests. No schema migration or
payment gateway was added. Current end-to-end browser checks use the isolated
review database; the older complete paired ERP HTTP run is not claimed as a
newly executed test of this release. Real owner activation, actual SMS delivery,
physical-device acceptance and Google review remain separate checks. Free
Render cold starts can still delay opening the app; this release does not
remove the hosting plan's idle suspension.
