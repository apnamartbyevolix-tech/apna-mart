# MyTown Market — Architecture and Implementation Plan

## Product and Phase 1 scope

Build a usable, responsive, mobile-first local marketplace for small-town India with four separated experiences: customer storefront, vendor operations, rider delivery, and platform administration. Start with one demo town and explicitly fictional sample merchants; model city and service-area ownership now so expansion does not require a schema rewrite. Phase 1 covers shop discovery, products and inventory, one-shop cart/checkout, COD and cash pickup, server-side order/stock handling, vendor fulfillment, admin operations, manual rider assignment, handover proof, and accurate order/financial records. Customer-facing routes remain lightweight and usable on affordable Android phones and slower connections.

This phase delivers responsive web experiences, not a native Android APK. Not in the current launch claim: real SMS OTP, verified gateway payments, customer push/SMS notifications, live GPS, automatic rider matching, settlement transfers, or production-participating merchants. The starter offers secure Manus OAuth and server sessions. The build uses that real authentication for the available sign-in path, stores mobile number as contact data, and keeps requested SMS OTP as an explicit provider-dependent gap rather than faking a code or bypassing auth. A public launch requiring phone OTP must select/configure an SMS provider and complete privacy/account-deletion workflows.

## Architecture

Use the initialized WebDev `web-db-user` stack: React 19 + TypeScript + Vite + Wouter and Tailwind on the client; Express + tRPC on the server; Drizzle ORM with the managed MySQL-compatible database for persistent transactional state. Reuse starter OAuth/session validation and tRPC context rather than inventing a second session protocol. The server owns role/record authorization, service-area checks, fee/price calculation, checkout idempotency, inventory changes, order transitions, delivery assignments, handover verification, support-ticket ownership, post-delivery review eligibility, and audit events. Never trust client-supplied totals or role claims.

Core database entities: users; cities/localities/service zones; vendor profiles and hours; configurable categories; products and stock/availability; saved addresses; orders and immutable order-item/fee/price/address snapshots; order status events; delivery partners and assignment/events; payment records; commission/fee ledger entries; audit records; customer-owned favorite shops; completed-order shop reviews; and private support tickets/messages. Use integer paise for INR arithmetic. Order and inventory writes are atomic, protect stock against concurrent orders, and recover safely from repeated idempotency keys. State changes are validated against actor and current state; eligible cancellations restore stock and void uncollected cash records. Delivery handover codes are derived server-side, never stored in plaintext, suppressed from the owner-facing order view while locked, and persistently locked after five bad attempts until an audited admin reset. Rider data, customer addresses/phones, vendor orders and finances are minimized by role and ownership; support messages remain visible only to their customer and administrators, and a shop can be reviewed only once for a delivered order.

The database is shared by development and publication. Migrations are additive and deterministic; never truncate, reset, or replace user-edited records. Seed only unmistakably fictional demonstration merchants/products, use stable idempotent keys, and label them as demo data. Do not represent a payment or settlement as collected/paid without a corresponding real recorded event. Use local disposable MySQL/MariaDB only for integration tests; the integration suite rejects non-local hosts and databases not named `mtm_e2e_*`.

## Project structure

- `client/src/App.tsx` and `client/src/pages/`: customer marketplace, vendor/rider workspaces, admin console, login and guarded routes.
- `client/src/components/`: shared navigation, cards, forms, dialogs, order timeline, price summary and status badges.
- `client/src/lib/`: typed tRPC client and client-safe marketplace adapters/formatters.
- `client/public/manus-routes.json`: static page-route manifest aligned with application routes.
- `server/routers.ts`: public/authenticated/admin procedure roots, separated into marketplace, vendor, rider and admin operations.
- `server/marketplace/`: domain rules, pure tests, and opt-in isolated MySQL workflow tests covering cross-role orders, support, favorites, reviews, cash and ownership.
- `server/db.ts` and `drizzle/`: persistence, relational schema and additive migrations.
- `server/seed-demo.ts`: add-only fictional town/shop/product/category demo rows.
- `server/storage.ts`: durable project media operations; upload endpoints enforce owner/vendor role, content type and size.
- `shared/`: role/status/category/unit contracts shared between client and server.
- `public/` and `client/public/`: brand mark and browser metadata; product/shop uploads use platform storage rather than local disk.

## Implementation sequence

1. Replace starter page with responsive MyTown Market shell, navigation, visual system, and distinct customer/vendor/rider/admin entry points.
2. Add relational marketplace schema, deterministic additive migrations, one fictional demo town, sample shops/products/categories, and typed server procedures.
3. Implement public town/locality-aware discovery and whitelisted shop/category/product details; keep regulated categories disabled and avoid exposing exact stock or private vendor fields.
4. Implement real starter OAuth identity/session, customer profile/address handling, one-merchant cart, server-validated checkout, COD/pickup order/payment/ledger snapshots, idempotency, stock reservation, and policy-constrained cancellation.
5. Implement vendor onboarding/approval, storefront/catalog/inventory actions, owner-scoped uploaded images, delivery settings, and accept/prepare/ready/reject transitions.
6. Implement admin queue/dashboard, order timeline, manual rider assignment, city/zone/category/fee configuration, audited actions, and cash variance review/reconciliation.
7. Implement rider delivery actions, customer-only handover proof with persistent five-guess lockout/admin recovery, cash collection report, customer order history/status/reorder/cancellation, private customer/admin support threads, customer-owned saved shops, and post-delivery shop reviews.
8. Run TypeScript diagnostics, unit/auth/domain tests, an opt-in isolated local-MySQL workflow suite, production build, health/route-manifest checks, and read-only requirements/security review. Do not test with destructive writes to the shared database.

## Material integration constraints

The requested mobile-number OTP requires an SMS provider not supplied or selected. Keep real authentication, do not expose credentials, and do not issue a pretend OTP. The initial admin is provisioned only by matching the protected owner-supplied email against the verified Manus OAuth identity; there is no role switcher or public admin signup. In-app private support tickets/admin replies, favorites and verified completed-order reviews are implemented; email/SMS notifications, verified online payments, map SDK/GPS and payout settlement require additional real integrations/product work and remain incomplete. Privacy policy and deletion workflow are also required before public launch. Use only COD and cash pickup in the working flow. Directions links open an external maps app; no live map data or rider tracking is claimed. Native APK creation is outside this responsive web stack; deliver the functioning Android-sized web experience and list native packaging separately. Do not publish, activate paid services, or push to a remote Git repository without explicit permission.

## Design

**Design movement:** Contemporary neighborhood-market editorial commerce, with the clarity of a well-organized local provisions shop rather than a warehouse dashboard.

**Core principles:** Make locality and merchant identity visible; keep product, price and availability easy to scan; use clear labels and large tap targets; disclose order and fee rules before commitment.

**Color philosophy:** Warm white and oat-gray surfaces keep the app calm and readable. Leaf green signals local freshness and primary actions. Deep forest text and restrained saffron offer accents preserve contrast and a familiar market warmth.

**Layout paradigm:** Customer discovery is a vertically paced storefront with a location/search masthead, horizontally browsable category chips, and compact shop/product rows. Vendor and rider tasks use one-column action queues. Admin uses a responsive side rail with dense but readable tables and summary cards.

**Signature elements:** A location-pin/leaf mark; small shop-locality chips paired with open/closed status; simple offer tags shaped like market price labels.

**Interaction philosophy:** Give immediate feedback for cart and order actions, protect irreversible checkout with a review step, explain one-shop cart boundaries in context, and use prominent plain-language status/actions instead of hidden gestures.

**Animation:** Keep transitions short and subtle (roughly 120–180 ms) for drawer, cart count, and status changes; honor reduced-motion preferences; never delay task completion with decorative motion.

**Typography system:** Inter/system sans for controls, product data and navigation; a restrained Georgia/system-serif accent for campaign headlines only. Avoid blocking on remote fonts.

**Brand essence:** “Everyday shopping from the shops around your home.” Personality: neighborly, dependable, practical.

**Brand voice:** Short, helpful, specific. Example lines: “From shops around your home.” “One shop per order, so your local seller can pack it right.”

**Wordmark & logo:** A compact location pin with an open shop-awning shape and one leaf as the center cutout; pair with a custom-spaced MyTown Market wordmark.

**Signature brand color:** Market leaf green `#16834A`.
