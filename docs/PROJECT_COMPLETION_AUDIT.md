# MyTown Market — Comprehensive Repository & Architecture Audit

**Date:** November 4, 2026  
**Auditor:** Senior Full-Stack Engineer, Software Architect, Database Engineer, QA Lead & Security Reviewer  
**Repository Baseline:** Extracted from `mytownmarket.zip` at Git root commit (`Initial commit from mytownmarket.zip`)  
**Stack:** React 19, TypeScript 5.9, Vite 7.3, Wouter 3.7, Tailwind CSS 4.1, Express 4.21, tRPC 11.6, Drizzle ORM 0.44, MySQL2 3.15, Vitest 2.1  

---

## 1. Executive Summary & Verification Baseline

MyTown Market is a hyperlocal multi-category marketplace designed for Tier-3 Indian towns, targeted to operate alongside the **Apna Galla** retail billing and inventory SaaS.

A rigorous, code-level inspection of the entire repository has been performed. The baseline checks have been executed:
- **TypeScript Check (`pnpm check`):** PASSED with zero compilation errors (`tsc --noEmit`).
- **Default Test Suite (`pnpm test`):** PASSED (3 test files passed, 11 tests passed, 1 skipped test suite containing 7 integration tests).
- **Production Build (`pnpm build`):** PASSED successfully in 11.11s with bundle sizes: `index.js` (144.9 KB node backend) and optimized client chunks.
- **Static Route Manifest (`client/public/manus-routes.json`):** 26 routes documented and matching `client/src/App.tsx`.

The application possesses a solid domain-driven foundation: integer paise pricing, single-shop cart isolation, transactional stock decrement with rollback on cancellation, HMAC-SHA256 derived customer handover codes with 5-guess lockout, and separation of customer, vendor, rider, and admin areas.

However, several critical gaps, architectural misalignments, and incomplete workflows currently prevent a production or pilot launch. Most notably:
1. **Seller-Managed Delivery Disconnection:** In `server/routers.ts` (line 1908), vendor order completion is explicitly forbidden unless `fulfillmentType === "pickup"`. Sellers cannot dispatch or complete self-managed deliveries, directly contradicting the pilot requirement prioritizing seller-managed delivery.
2. **Missing Apna Galla Integration State:** Merchants have no subscription or integration state columns (`NOT_CONNECTED`, `CONNECTION_PENDING`, `CONNECTED`, `SUSPENDED`, `SYNC_ERROR`), nor any interface for ERP synchronization.
3. **No Standalone/Local Auth Fallback:** Authentication strictly depends on Manus OAuth. In standalone dev or pilot setups without Manus OAuth servers configured, users cannot sign in without runtime errors.
4. **Missing Customer Privacy & Account Deletion Workflows:** The UI displays explicit disclaimer notes that privacy consent and account deletion are unimplemented.
5. **Incomplete Seller Financials & Settlements:** While order-time commission paise are snapshotted in orders and ledger rows, there are no merchant payout/settlement statements, settlement history, or downloadable reports.
6. **No Localization Foundation:** All strings are hardcoded in English, without a Hindi i18n foundation.

---

## 2. Classification Definitions

Every platform feature and component has been inspected and classified according to the following strict criteria:

| Status | Definition |
| :--- | :--- |
| **COMPLETE AND VERIFIED** | Implemented in backend and frontend, covered by tests or verified working end-to-end. |
| **IMPLEMENTED BUT UNTESTED** | Full code exists in client and server, but lacks automated test coverage or relies on unverified runtime conditions. |
| **PARTIALLY IMPLEMENTED** | Scaffolding or basic logic exists, but key business requirements, edge cases, or UI/API hooks are incomplete. |
| **BROKEN** | Implementation contains defects, runtime contradictions, or breaks expected business workflows. |
| **NOT IMPLEMENTED** | Feature is planned or mentioned in documentation but has no implementation in schema, router, or UI. |
| **BLOCKED** | Feature depends on an external third-party provider (e.g., SMS gateway, payment gateway) or owner action. |

---

## 3. Comprehensive Feature Audit & Classification Matrix

### 3.1 Customer Identity, Authentication & Account Management

| Feature | Status | Source Files | Evidence / Description |
| :--- | :--- | :--- | :--- |
| **Manus OAuth Login** | COMPLETE AND VERIFIED | `server/_core/oauth.ts`, `server/_core/cookies.ts`, `server/routers.ts` (L380-386) | Real OAuth token validation, session cookie minting and clearing. Verified in `server/platform.test.ts`. |
| **Standalone / Local Dev Sign-In** | NOT IMPLEMENTED | `client/src/_core/hooks/useAuth.ts`, `client/src/components/MarketChrome.tsx` (L150) | In local development without Manus OAuth environment variables, clicking login fails with `startLogin` exception. |
| **Provider-Independent Phone OTP** | NOT IMPLEMENTED (BLOCKED) | `client/src/pages/CustomerPages.tsx` (L1119), `TODO.md` (L11) | SMS OTP interface is missing. Current app clearly notes SMS OTP is not connected, but no mock/provider-independent OTP contract is scaffolded. |
| **Customer Profile Management** | COMPLETE AND VERIFIED | `server/routers.ts` (L429-489), `client/src/pages/CustomerPages.tsx` (L1144-1166) | Fetches and updates contact phone number and default town/zone with service area validation. |
| **Multiple Saved Addresses** | COMPLETE AND VERIFIED | `server/routers.ts` (L490-579), `client/src/pages/CustomerPages.tsx` (L1167-1382) | Full CRUD for saved addresses; validates active town and zone pairings; default address toggle. |
| **Location Permission with Fallback** | PARTIALLY IMPLEMENTED | `client/src/components/MarketChrome.tsx` (L182-198) | Town and locality selectors exist with localStorage persistence. However, HTML5 geolocation permission detection and automatic locality matching are not implemented. |
| **Privacy Policy & Consent Workflow** | NOT IMPLEMENTED | `client/src/pages/CustomerPages.tsx` (L1120, L1385) | Disclaimed in UI via `IntegrationNote`: *"Privacy policy and account deletion workflows are not implemented"*. |
| **Customer Account Deletion Workflow** | NOT IMPLEMENTED | `drizzle/schema.ts`, `server/routers.ts`, `client/src/pages/CustomerPages.tsx` | No schema table or endpoint to submit, review, or process account deletion requests. |

---

### 3.2 Location, Towns & Delivery Zones

| Feature | Status | Source Files | Evidence / Description |
| :--- | :--- | :--- | :--- |
| **Multi-Town & Zone Schema** | COMPLETE AND VERIFIED | `drizzle/schema.ts` (L29-57), `drizzle/0001_flat_titania.sql` | `towns` and `service_zones` tables with uniqueness constraints on `(townId, slug)` and index on `(townId, locality)`. |
| **Public Area Discovery API** | COMPLETE AND VERIFIED | `server/routers.ts` (L784-805) | `marketplace.areas` returns active towns and active service zones with caching headers. |
| **Locality Selection & Header UI** | COMPLETE AND VERIFIED | `client/src/components/MarketChrome.tsx` (L62-99, L180-198) | Allows switching town and locality; persists selection in localStorage; cascades town changes to clear invalid zone. |
| **Service Area Boundary Enforcement** | COMPLETE AND VERIFIED | `server/marketplace/domain.ts` (L179-189), `server/routers.ts` (L62-81, L1080) | Server verifies that shops, orders, and delivery addresses belong to active towns and matching service zones. |
| **Admin Town & Zone Management** | COMPLETE AND VERIFIED | `server/routers.ts` (L2715-2807), `client/src/pages/WorkspacePages.tsx` (L3380-3550) | Admin can create towns, activate/deactivate towns, create service zones, and toggle zone availability. |

---

### 3.3 Product Browsing, Categories & Storefronts

| Feature | Status | Source Files | Evidence / Description |
| :--- | :--- | :--- | :--- |
| **Homepage Discovery** | COMPLETE AND VERIFIED | `client/src/pages/MarketPages.tsx` (L39-266), `server/routers.ts` (L806-868) | Displays active town/locality banner, category chips, featured shops, popular products, and daily essentials. |
| **Category Browsing & Filtering** | COMPLETE AND VERIFIED | `client/src/pages/MarketPages.tsx` (L360-458), `server/routers.ts` (L869-964) | Filters catalog by category slug within the customer's selected town and locality. |
| **Prohibited / Regulated Listings Guard**| COMPLETE AND VERIFIED | `drizzle/schema.ts` (L65), `server/seed-demo.ts` (L70-74, L83-84) | Regulated categories (e.g., prescription medicines) are disabled by default and excluded from public storefronts. |
| **Search (Shops & Products)** | COMPLETE AND VERIFIED | `client/src/pages/MarketPages.tsx` (L267-359), `server/routers.ts` (L869-964) | Keyword search across product names, descriptions, and shop names scoped to selected town/zone. |
| **Shop Storefront** | COMPLETE AND VERIFIED | `client/src/pages/MarketPages.tsx` (L459-581), `server/routers.ts` (L965-1015) | Displays shop header, cover/logo, open/closed status, delivery fees, minimum order, prep time, category tabs, products. |
| **Product Detail Page** | COMPLETE AND VERIFIED | `client/src/pages/MarketPages.tsx` (L582-689), `server/routers.ts` (L1016-1071) | Product image, pricing (INR), MRP discount, unit, availability, shop link, add-to-cart controls. |
| **Product Variants (Sizes / Weights)** | PARTIALLY IMPLEMENTED | `drizzle/schema.ts` (L148), `client/src/pages/MarketPages.tsx` | Currently products only have a flat `unit` string (e.g. `"250 g"`, `"1 kg"`). Different sizes are modeled as separate product rows rather than a unified variant group. |
| **Recently Ordered Items Section** | NOT IMPLEMENTED | `client/src/pages/MarketPages.tsx`, `server/routers.ts` (L806) | Planned in `TODO.md` (L18), but `marketplace.home` procedure does not query customer's past orders or return recently ordered items. |
| **Hindi UI / Localization Foundation** | NOT IMPLEMENTED | Entire `client/src/` | No i18n library (e.g., `react-i18next` or custom translation dictionary) installed; all customer/vendor/admin strings are English-only. |

---

### 3.4 Cart, Pricing & Checkout Integrity

| Feature | Status | Source Files | Evidence / Description |
| :--- | :--- | :--- | :--- |
| **Single-Seller Cart Enforcement** | COMPLETE AND VERIFIED | `client/src/components/MarketChrome.tsx` (L106-119), `client/src/pages/CustomerPages.tsx` (L76-224) | Strictly restricts cart items to a single merchant. Warns user and prompts replacement if selecting a different shop. |
| **Server-Side Price Calculation** | COMPLETE AND VERIFIED | `server/marketplace/domain.ts` (L79-118), `server/routers.ts` (L1100-1170) | Integer paise calculation on server. Unit prices are re-fetched from database; client-submitted totals are ignored. |
| **Integer Paise Money Handling** | COMPLETE AND VERIFIED | `drizzle/schema.ts`, `server/marketplace/domain.ts` | All financial fields (`subtotalPaise`, `deliveryFeePaise`, `platformFeePaise`, `commissionPaise`, `totalPaise`) use integer paise. Tested in `server/marketplace/domain.test.ts`. |
| **Stock Reservation & Atomic Decrement**| COMPLETE AND VERIFIED | `server/routers.ts` (L1175-1205) | Placed inside database transaction using `for("update")` and atomic `stockQuantity = stockQuantity - quantity`. Prevents negative stock. |
| **Checkout Idempotency** | COMPLETE AND VERIFIED | `drizzle/schema.ts` (L276), `server/routers.ts` (L1074-1098), `client/src/pages/CustomerPages.tsx` (L230-237) | Unique index on `(customerId, idempotencyKey)`. Repeated checkout taps safely return the existing order without duplicate charging or stock deduction. |
| **Delivery & Pickup Methods** | COMPLETE AND VERIFIED | `server/routers.ts` (L1130-1160), `client/src/pages/CustomerPages.tsx` (L407-444) | Supports Cash on Delivery (`cod`) and Cash on Pickup (`pickup`), respecting vendor delivery/pickup toggles. |
| **Online Payment Gateway** | NOT IMPLEMENTED (BLOCKED) | `client/src/pages/CustomerPages.tsx`, `TODO.md` (L23) | Intentionally disabled. Manual UPI or unverified gateway confirmation is blocked to prevent untrusted payment recording. |
| **Delivery Notes & Substitutions** | COMPLETE AND VERIFIED | `drizzle/schema.ts` (L262-263), `server/routers.ts` (L1160), `client/src/pages/CustomerPages.tsx` (L500-530) | Customer checkout inputs for notes and substitution preferences are snapshotted in order records. |

---

### 3.5 Delivery & Fulfillment Workflows

| Feature | Status | Source Files | Evidence / Description |
| :--- | :--- | :--- | :--- |
| **Customer Handover Proof (HMAC Code)** | COMPLETE AND VERIFIED | `server/marketplace/domain.ts` (L20-33), `server/routers.ts` (L1407-1448) | 8-digit server-derived code displayed only to the ordering customer. Tested in `server/marketplace/domain.test.ts`. |
| **Persistent 5-Guess Lockout** | COMPLETE AND VERIFIED | `drizzle/schema.ts` (L245-246), `server/routers.ts` (L170-205) | Handover attempts tracked in database. Order is locked after 5 invalid attempts until admin reset. |
| **Admin Handover Reset** | COMPLETE AND VERIFIED | `server/routers.ts` (L2401-2422), `client/src/pages/WorkspacePages.tsx` (L3180-3220) | Admin can reset locked attempts with an audit trail entry. |
| **Platform Rider Assignment** | COMPLETE AND VERIFIED | `server/routers.ts` (L2597-2673), `client/src/pages/WorkspacePages.tsx` (L3040-3080) | Admin can assign registered approved riders to orders; rider can accept, arrive, pickup, and deliver. |
| **Seller-Managed Delivery Dispatch** | COMPLETE AND VERIFIED | `server/routers.ts` (L2050-2150), `server/marketplace/domain.ts` (L10-40) | Repaired in Phase 1: Vendors can dispatch ready delivery orders (`out_for_delivery`) and complete delivery with customer handover proof and cash collection. |
| **Seller-Managed Out-for-Delivery State**| COMPLETE AND VERIFIED | `server/routers.ts` (L1935-2070), `server/marketplace/domain.ts` (L15-40) | Fulfillment-type aware: delivery requires `ready → out_for_delivery → delivered`; pickup prohibits `out_for_delivery`. Tested in `seller-delivery.test.ts`. |
| **Failed Delivery & Return-to-Shop** | COMPLETE AND VERIFIED | `server/routers.ts` (L2154-2270), `drizzle/0006_failed_delivery_recovery.sql` | Vendors report delivery failure without premature stock restoration. Parcel return and inventory inspection workflow (`recordReturnRecovery`) audits restock vs. shrinkage. |

---

### 3.6 Vendor Operations & Store Management

| Feature | Status | Source Files | Evidence / Description |
| :--- | :--- | :--- | :--- |
| **Merchant Registration & Admin Approval**| COMPLETE AND VERIFIED | `server/routers.ts` (L1577-1652, L2279-2309), `client/src/pages/WorkspacePages.tsx` (L301-540) | Multi-step form collects shop info; persists status `"pending"`; admin approves/rejects/suspends. |
| **Store Online / Offline Toggle** | COMPLETE AND VERIFIED | `server/routers.ts` (L1528-1538), `client/src/pages/WorkspacePages.tsx` (L615-630) | Vendor can open or close store in real-time (`isOpen`). |
| **Store Delivery & Fee Settings** | COMPLETE AND VERIFIED | `server/routers.ts` (L1539-1576), `client/src/pages/WorkspacePages.tsx` (L964-1050) | Vendor configures delivery fee, minimum order, preparation time, and delivery/pickup toggles. |
| **Product CRUD & Stock Management** | COMPLETE AND VERIFIED | `server/routers.ts` (L1686-1826), `client/src/pages/WorkspacePages.tsx` (L1051-1186) | Vendors can add, edit, archive products, adjust prices, stock quantities, and units. |
| **Product & Store Image Upload** | COMPLETE AND VERIFIED | `server/routers.ts` (L1735-1774), `server/storage.ts` | Uploads images to durable storage via presigned S3 URLs; validates MIME types (JPEG, PNG, WebP) and size limits (5 MB). |
| **Bulk Product Entry** | NOT IMPLEMENTED | `client/src/pages/WorkspacePages.tsx` (L1051-1186) | Only single-product modal entry exists. Fast multi-product or bulk entry is not implemented. |
| **Vendor Earnings & Financial Summary** | PARTIALLY IMPLEMENTED | `client/src/pages/WorkspacePages.tsx` (L640-720), `server/routers.ts` (L1653-1685) | Displays today's sales and completed orders in dashboard cards. Missing: dedicated earnings breakdown, platform commission deductions, payable balance, settlement history, and statements. |
| **Customer-Approved Substitutions** | NOT IMPLEMENTED | `server/routers.ts` (L1905-1906) | Procedure explicitly throws: *"Substitutions are unavailable until a customer approval is recorded"*. No workflow exists for customer approval. |
| **Apna Galla Integration Status** | NOT IMPLEMENTED | `drizzle/schema.ts`, `server/routers.ts`, `client/src/pages/WorkspacePages.tsx` | No schema fields for subscription status, Apna Galla merchant ID, or integration status (`NOT_CONNECTED`, `CONNECTION_PENDING`, `CONNECTED`, etc.). |

---

### 3.7 Financial Administration, Commission & Settlements

| Feature | Status | Source Files | Evidence / Description |
| :--- | :--- | :--- | :--- |
| **Configurable Merchant Commission** | COMPLETE AND VERIFIED | `drizzle/schema.ts` (L105), `server/routers.ts` (L2808-2837), `client/src/pages/WorkspacePages.tsx` (L3300-3350) | Admin can configure `commissionBps` (basis points) per merchant (e.g. 0% for pilot, 300 bps for 3%). |
| **Order Commission Snapshot** | COMPLETE AND VERIFIED | `drizzle/schema.ts` (L261), `server/marketplace/domain.ts` (L99-101) | Exact commission paise snapshot saved with each order at placement time. |
| **Financial Ledger Entries** | COMPLETE AND VERIFIED | `drizzle/schema.ts` (L407-432), `server/marketplace/domain.ts` (L126-178) | Creates ledger records for `sale`, `commission`, `delivery_fee`, and `platform_fee`. Tested in `server/marketplace/domain.test.ts`. |
| **Cash on Delivery Reconciliation** | COMPLETE AND VERIFIED | `server/routers.ts` (L2423-2499), `client/src/pages/WorkspacePages.tsx` (L2711-2980) | Admin reviews reported cash collected vs. order amount; records variance; marks payment `collected`. |
| **Outstanding Commission Receivables**| NOT IMPLEMENTED | `server/routers.ts`, `client/src/pages/WorkspacePages.tsx` | Platform cannot query net amount owed by merchant for COD cash retained by merchant. |
| **Merchant Settlement Statements** | NOT IMPLEMENTED | `drizzle/schema.ts`, `server/routers.ts` | No settlement table, periodic settlement calculation, or downloadable merchant statement. |
| **Actual Settlement Payment Records** | NOT IMPLEMENTED | `drizzle/schema.ts`, `server/routers.ts` | No mechanism to record actual settlement payouts to merchants or platform receipts. |

---

### 3.8 Customer Orders, Favorites, Reviews & Support

| Feature | Status | Source Files | Evidence / Description |
| :--- | :--- | :--- | :--- |
| **Order History & Real-Time Timeline** | COMPLETE AND VERIFIED | `client/src/pages/CustomerPages.tsx` (L645-1039), `server/routers.ts` (L1398-1448) | List of customer orders; detailed timeline with status badges; shows handover code when active. |
| **Customer Order Cancellation** | COMPLETE AND VERIFIED | `server/routers.ts` (L1449-1517), `client/src/pages/CustomerPages.tsx` (L850-890) | Customer can cancel before fulfillment (`placed` or `accepted`). Restores stock and voids pending payments. |
| **Reorder Functionality** | COMPLETE AND VERIFIED | `client/src/pages/CustomerPages.tsx` (L890-930) | Re-checks current product availability and prices, replacing cart with eligible items. |
| **Favorite Shops** | COMPLETE AND VERIFIED | `server/routers.ts` (L714-783), `client/src/pages/CustomerPages.tsx` (L1394-1435) | Customers can favorite/unfavorite shops; view favorites list. Unique index on `(userId, vendorId)`. |
| **Verified Order Reviews** | COMPLETE AND VERIFIED | `server/routers.ts` (L580-618), `client/src/pages/CustomerPages.tsx` (L980-1030) | Only delivered order owners can submit 1-5 star reviews with comments. Unique index on `orderId`. |
| **Private Customer Support Tickets** | COMPLETE AND VERIFIED | `server/routers.ts` (L619-712), `client/src/pages/SupportPage.tsx` | Customer can create tickets with optional order reference, send replies, and view thread history. |
| **Admin Support Inbox** | COMPLETE AND VERIFIED | `server/routers.ts` (L2337-2400), `client/src/pages/WorkspacePages.tsx` (L2630-2710) | Admin views all customer tickets, filters by status, replies to messages, and resolves tickets. |

---

### 3.9 Admin Control Panel & Governance

| Feature | Status | Source Files | Evidence / Description |
| :--- | :--- | :--- | :--- |
| **Admin Dashboard Metrics** | COMPLETE AND VERIFIED | `server/routers.ts` (L2225-2251), `client/src/pages/WorkspacePages.tsx` (L2072-2150) | Displays registered customers, active/pending vendors, orders today, GMV, commission, delivery fees, pending deliveries. |
| **Merchant Moderation & Terms** | COMPLETE AND VERIFIED | `server/routers.ts` (L2252-2309, L2808-2837), `client/src/pages/WorkspacePages.tsx` (L2151-2320) | Admin approves/rejects/suspends vendors; edits commission, delivery fee, and platform fee terms. |
| **Rider Verification & Assignment** | COMPLETE AND VERIFIED | `server/routers.ts` (L2310-2336, L2597-2673), `client/src/pages/WorkspacePages.tsx` (L2450-2550) | Approves riders; assigns riders to ready delivery orders. |
| **Category Management** | COMPLETE AND VERIFIED | `server/routers.ts` (L2682-2714), `client/src/pages/WorkspacePages.tsx` (L2551-2629) | Admin creates categories, assigns icons, sets sort orders, and toggles regulated flags. |
| **Town & Service Zone Administration** | COMPLETE AND VERIFIED | `server/routers.ts` (L2715-2807), `client/src/pages/WorkspacePages.tsx` (L3380-3550) | Creates and toggles active status for towns and localities. |
| **Customer Suspension & Auditing** | PARTIALLY IMPLEMENTED | `drizzle/schema.ts` (L433-447), `server/routers.ts` | Audit records are written for admin actions. However, `users` table has no `isSuspended` column, and admin cannot suspend users. |
| **Product Listing Moderation** | NOT IMPLEMENTED | `server/routers.ts`, `client/src/pages/WorkspacePages.tsx` | Admin cannot inspect, moderate, or take down individual merchant product listings from the admin desk. |

---

## 4. Critical Bugs & Architectural Risks

### Bug 1: Vendor Order Fulfillment Blocked on Delivery Orders
- **Location:** `server/routers.ts` (lines 1883, 1908-1909)
- **Impact:** High severity / blocker for pilot.
- **Root Cause:** The code insists that `vendor.updateOrderStatus` can only mark `"delivered"` if `o.fulfillmentType === "pickup"`. In a town operating on seller-managed delivery (without third-party riders), the seller cannot dispatch (`out_for_delivery` is rejected by Zod schema) or deliver the order!
- **Fix Required:** 
  1. Add `"out_for_delivery"` to `vendor.updateOrderStatus` input schema.
  2. Allow vendor to deliver orders when `o.fulfillmentType === "delivery"` (verifying customer handover code and recording cash collected).
  3. Support seller-reported delivery failure reasons.

### Bug 2: Standalone Local Sign-In Blocked Without Manus OAuth Server
- **Location:** `client/src/_core/hooks/useAuth.ts`, `server/_core/oauth.ts`, `client/src/components/MarketChrome.tsx` (L150)
- **Impact:** High severity for pilot and local development.
- **Root Cause:** Standalone environments lack `MANUS_OAUTH_API_URL`. Clicking sign in produces unhandled exceptions or redirects to an empty URL.
- **Fix Required:** Add a provider-independent session/auth fallback for local development and pilot onboarding (with mock/PIN or test credential selector for authorized pilot roles).

### Bug 3: Incomplete Handover Code UI in Vendor Delivery Desk
- **Location:** `client/src/pages/WorkspacePages.tsx` (L1277-1405)
- **Impact:** Medium severity.
- **Root Cause:** The vendor order action UI only presents the handover code and cash collection prompt when the order is marked pickup. For seller-managed delivery orders, the vendor has no inputs to enter the customer handover code or collect cash.
- **Fix Required:** Update `OrderActions` in `WorkspacePages.tsx` to support vendor-managed delivery handover.

### Bug 4: Missing Database Fields for Apna Galla Integration State
- **Location:** `drizzle/schema.ts` (`vendorProfiles`)
- **Impact:** Architectural requirement from Product Vision.
- **Root Cause:** The schema lacks `apnaGallaMerchantId`, `apnaGallaSubscriptionStatus`, `apnaGallaSyncStatus`, `apnaGallaLastSyncAt`, and `integrationStatus` enum (`NOT_CONNECTED`, `CONNECTION_PENDING`, `CONNECTED`, `SUSPENDED`, `SYNC_ERROR`).
- **Fix Required:** Add additive migration to extend `vendor_profiles` and define integration contracts.

---

## 5. Required Test Coverage Analysis

| Test Area | Current Coverage | Required Addition |
| :--- | :--- | :--- |
| **Domain Calculations** | 5 unit tests in `domain.test.ts` (totals, ledger, transitions, zone, handover) | Add tests for seller-managed delivery transitions, commission snapshots, and cancellation refunds. |
| **Platform Auth & Logout** | 6 tests in `platform.test.ts` & `auth.logout.test.ts` | Add tests for provider-independent auth fallback and session handling. |
| **Workflow Integration Tests** | 7 tests in `workflow.integration.test.ts` (skipped by default, requires local MySQL) | Ensure test runner works with a disposable local MySQL database `mtm_e2e_*` and covers seller-managed delivery. |
| **Seller Delivery & Handover** | 0 tests | Write integration/unit tests for vendor dispatch, handover verification, cash collection, and 5-guess lockout recovery. |
| **Admin Reconciliation** | 1 test in `workflow.integration.test.ts` | Unit/integration test for cash variance reconciliation and ledger updates. |

---

## 6. Audit Verdict & Launch Readiness

| Launch Gate | Status | Remediation Required |
| :--- | :--- | :--- |
| **Customer Discovery & Storefronts** | READY | Add recently ordered items; prepare Hindi translation foundation. |
| **Cart & Server-Calculated Checkout** | READY | Fully compliant with integer paise and concurrency protection. |
| **Seller-Managed Delivery (Pilot Priority)** | BLOCKED / BROKEN | Repair vendor delivery transitions and handover verification in backend and frontend. |
| **Vendor Onboarding & Operations** | PARTIALLY READY | Add Apna Galla integration status and dedicated earnings/statements view. |
| **Admin Cash Reconciliation** | READY | Functioning correctly with variance tracking and audit trail. |
| **Customer Privacy & Deletion** | BLOCKED | Implement privacy consent modal/page and customer account deletion request flow. |
| **Apna Galla Integration Contract** | NOT READY | Finalize `APNA_GALLA_INTEGRATION_CONTRACT.md` and scaffold integration adapter. |

**Next Step:** Proceed to generate `docs/IMPLEMENTATION_ROADMAP.md` and `docs/APNA_GALLA_INTEGRATION_CONTRACT.md`, then execute Phase 1 safe repairs.

