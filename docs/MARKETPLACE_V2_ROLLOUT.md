# Marketplace v2 extension and coordinated rollout

This documents a local opt-in extension of the existing signed connector, not an externally approved API specification. Source remains authoritative. No production flag/database changed during verification.

## Snapshot and arithmetic

Routes stay unchanged. Sandbox revision `2.0-sandbox`, production `2.0`; absent flags keep legacy `1.2-sandbox`/`1.2`. Each v2 item has strict `tax`: `schema:1`, integer `netUnitPaise`, nullable integer `offerNetUnitPaise`, integer `gstBps`, nullable `hsn`. Galla master selling rate is net/pre-GST; Mart price includes GST.

Whole-line GST rounds half-up with integer arithmetic: 100 × 3 paise at 5% = 315 paise, although one inclusive unit rounds to 3 paise. Checkout shows authoritative line totals and included GST, never adding tax twice. Accepted snapshots survive master changes. JSON field order is ignored; changed/additional fields are rejected.

Migration `0003_marketplace_tax_snapshots.sql` adds nullable `products.taxMeta` and `order_items.taxSnapshot` JSON columns. Legacy orders remain supported. Unknown cost/profit stays unknown. Changed stock configuration cannot silently skip an accepted inventory deduction.

## Bounds and eligibility

V2: one atomic replacement of 500 whole-unit products, signed body <=512 KiB. Legacy: 30/64 KiB. Only the authenticated catalogue path gains the larger allowance; other signed requests stay <=64 KiB. Product IDs persist across updates. Customer pages default 24/max50; owner pages contain 50.

Publication/reservation require active eligible membership and consent. GST additionally requires regular-registration configuration, GST_INVOICES entitlement and electronic reporting NOT_REQUIRED. REQUIRED/UNSURE is blocked because there is no government IRN provider integration. A flag is not a legal compliance determination.

Connected checkout retains the existing zero delivery/platform fee and zero commission constraint; seller-managed delivery itself remains supported. The current signed sale contract does not encode separate delivery/platform charges. Do not enable such fees in connected shops without a separately agreed accounting extension.

## Environment variable names

| Mart | Galla | Purpose/default |
|---|---|---|
| MTM_APNA_CATALOGUE_V2 | MYTOWN_CATALOGUE_V2 | `1` / `true` opt-in; default off |
| MTM_APNA_CONNECTOR_MODE | MYTOWN_CONNECTOR_MODE | Existing explicit production mode |
| MTM_APNA_SANDBOX_ENABLED | MYTOWN_SANDBOX_ENABLED | Isolated localhost proof only |
| APNA_SANDBOX_URL | MYTOWN_SANDBOX_URL | Existing pinned HTTPS peer |
| APNA_SANDBOX_KEY, APNA_SANDBOX_SECRET | MYTOWN_SANDBOX_KEY, MYTOWN_SANDBOX_SECRET | Server-only HMAC credentials |
| MYTOWN_LINK_AUTH, MYTOWN_LINK_SELF, MYTOWN_LINK_KEY_ID, MYTOWN_LINK_PRIVATE_KEY_B64, MYTOWN_LINK_PEER_KEYS_JSON | Same names, own identities | Pinned Ed25519 identity; never frontend values |
| MTM_SMS_DAILY_LIMIT, MTM_SMS_MONTHLY_LIMIT | SMS_DAILY_LIMIT, SMS_MONTHLY_LIMIT | Persistent India-calendar ceilings, 100/day and 1,000/month; zero disables sending |
| MTM_LOCATION_DAILY_LIMIT | — | Optional reverse lookup, 1,000/process/UTC day; cached matches remain usable |

Mart uses APITXT; this Galla checkout uses Twilio. Preserve their separate provider settings. Invalid ceilings fail closed; ambiguous provider failures consume a reserved slot. Count limits are not rupee-denominated billing caps.

## Release order — separate authorization required

1. Fresh backups, recorded versions, isolated restore rehearsal and planned writing pause if needed.
2. Apply additive Mart migration normally; verify legacy paths. Never restore development fixtures into production.
3. Deploy both compatible backends with v2 off. Verify TLS, pinned keys, clock synchronization and no public development shortcuts.
4. Coordinate Mart `1` and Galla `true`. Galla refreshes previously consented live listings after a revision change. Do not send v2 to an old parser.
5. Canary one approved shop: inclusive quote, one hold/order, owner handover/exact cash, one invoice, correct stock/balanced ledger, images/area and pause/unlist.
6. Broaden after observing queue age, errors and costs. Preserve outbox keys/bodies and accepted snapshots.

Automatic order dispatch stops after eight attempts. Explicit owner-scoped retry retains durable key/body. Exact customer checkout-submission lookup recovers lost responses independently of paginated history.

## Rollback

Pause new v2 publication/reservation, retain columns and compatible handlers for accepted v2 commit/release/sale work. Verify histories before frontend rollback. Never drop nullable columns, discard failed work or make another bill to repair an ambiguous response. Reconcile original order/cash/invoice/stock identities.
