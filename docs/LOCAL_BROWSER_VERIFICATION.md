# Local browser verification — 5 November 2026

Actual headed Google Chrome driven with the requested Playwright CLI skill, not API tests labelled as browser E2E. Existing user browser profiles were not imported. The local demo remains available at `http://127.0.0.1:3000` on loopback only. Desktop and 390 × 844 mobile viewport were exercised; this is not a real Android-device or APK test.

## Data and authorization

Before app/database writes, validated the shared local URL parser result and independently checked `DATABASE()`, server port and absolute data directory. Demo server: private port 3307 and `mtm_dev_mytown_demo`. Integration server: separate private port 3308 and `mtm_e2e_*` namespace. The user's MySQL80/shared/production databases were not used or reset.

Used existing server-controlled local customer/vendor/admin personas behind explicit development-auth and loopback checks. These sessions are not real OAuth/production authentication evidence. Created `DEMO - Browser Test Kirana` through merchant application UI, approved it through admin UI, opened it, configured delivery/pickup and created `DEMO Rice Pack` through merchant UI. Explicitly labelled only this new fictional shop/product as demo data using scoped local ORM updates. Existing unowned seed shops were not attached to a user.

## Observed passing journeys

1. Customer development sign-in, active town/locality selection, local catalogue, search and product details; a merchant application stays pending until admin approval.
2. Approved merchant opens the shop, saves ₹20 delivery fee, enables pickup, creates a ₹150 product with 25 units. Fictional labels are retained; newly created products now inherit the shop's demo flag.
3. Add product, retain cart through navigation/reload, review cash pickup quote. Place order remains disabled until explicit confirmation.
4. Change the fictional product price from ₹150 to ₹160 after confirmation. Submission is rejected; zero orders and unchanged stock verified independently. Current ₹160 quote is displayed, consent is cleared, error receives focus and explicit reconfirmation is required.
5. Reconfirm cash pickup. One order is created; merchant accepts/prepares/readies it. Only the customer can see the handover proof. After account switching, merchant access to the customer's private order detail returns 404 and does not show cached proof. Merchant enters customer proof and exact cash; pickup completes, payment becomes collected and proof disappears from customer terminal history.
6. Customer saves an owned address in the selected service zone. Buy again uses current listings. COD quote totals ₹160 + ₹20 = ₹180. Merchant accepts/prepares/readies/dispatches and completes seller delivery using the customer proof and actual cash. Customer sees delivered/collected history. No platform rider is required.
7. Independent ORM checks confirm two delivered orders, exact ₹160/₹180 cash records and stock 25 → 23.
8. Order the remaining 23 units for ₹3,700 COD. Intercept and abort only the successful checkout response after the server commits, simulating a lost response. Reload: stock is exhausted and new checkout is disabled. **Check previous submission** uses existing private order history to recover order 3 without another checkout write. Database checks confirm exactly one additional order and zero stock.
9. Cancel that recovered unpaid order through the customer's confirmation dialog. Verify cancelled status, voided payment, reversed ledger and restoration of 23 units. Final demo state: two delivered orders, one cancelled order, 23 units available.
10. Inject malformed cart JSON: application shows a recovery notice and an empty cart without substituting products. Block the page's localStorage getter: signed-in app and cart render, with a storage warning. Close that injected page afterward and return to normal browser storage.
11. Attempt to add another seller's product and dismiss the replacement prompt: original seller/item retained. Clear locality: items stay editable, checkout disables and recovery guidance appears. Restore locality: checkout works and displays the current server-owned delivery address.
12. Final mobile checkout measurement: viewport width 390, document scroll width 390, zero broken images. Product quantities/removal, confirmation checkbox and authoritative INR total remain usable.

## Artifacts

Local, gitignored files under `D:/town mart/output/playwright/`:

- `stale-price-mobile.png`
- `cod-completed-mobile.png`
- `recovered-and-cancelled-mobile.png`
- `storage-disabled-mobile.png`
- `final-quote-mobile.png`
- `final-demo-desktop.png`

Snapshots and diagnostic console logs are gitignored in `.playwright-cli/`; do not publish browser sessions/logs as release artifacts. Expected conflict/404 and simulated network-failure logs are part of negative tests, not a claim of zero browser console errors. Early automation had stale refs during HMR, an incorrect option label and a login-navigation race; those commands were corrected and the affected workflows rerun using observable completion. Native confirmation dialogs were explicitly handled. No assertion was relaxed to hide an application failure.

## Limits

Real Manus OAuth is not configured, owner bootstrap was tested separately with a disposable identity, the timestamp offset needs review, external image uploads/storage are not connected, and no live Apna Galla/subscriber/POS concurrency was exercised. Privacy/deletion, commercial settlement/refund policy and connected ERP phases remain outstanding. No push, deployment, gateway activation or public merchant bypass occurred.
