# Area selection, startup and local phone testing

## How a shop becomes visible

Creating a Galla account or private inventory does not publish anything. An eligible owner saves accurate address/city/state/six-digit pincode in Business Details, selects supported products, consents and uses Go live. A successful signed production publication creates/reuses the town and pincode zone and maps the shop/products. Existing disabled areas remain disabled. The public app lists configured active towns/areas; configured areas can exist without a currently visible shop.

Town identity is case-insensitive city plus state; the pincode zone belongs to that town. This is an explicit service-area match, not a distance-radius search. GPS only suggests a pincode; the customer confirms the area. Listings also depend on current subscription/eligibility, consent, shop/open/publication state and supported items. Checkout independently verifies membership and authoritative stock.

For Ratangarh, Madhya Pradesh, 458226, use consistent city/state spelling and save the pincode in the public business address, then publish. Merely editing a private item/account does not put it online. The production connector must acknowledge the publication. New local fixtures do not copy or inspect your production shop.

## Try the new interface now

The current computer preview is http://127.0.0.1:5210/. It contains fictional shops, not production records. Choose Neemgaon Demo / 000000. To test customer checkout, open Account → Sign in → Local customer demo → Customer · Aarti Sharma. This existing development-only profile sends no OTP. It is enabled only in this ignored localhost configuration, with administrator demo access disabled.

The demo cookie is HTTP-only and SameSite=Lax for guarded loopback HTTP. Hosted authentication keeps its existing secure-cookie policy. Development login continues to reject production/cloud/public hosts and non-isolated databases. The local audience identifier is fictional; no credential is delivered to browser code.

No Play release is needed for local testing. The debug APK is `Apna-Mart-Startup-local-debug.apk`, package `in.apnamart.app.debug`. It connects to this computer preview, so installing it alone on another phone will not connect to the PC: 127.0.0.1 means that phone. For a physical phone, the owner enables USB debugging, connects it and personally accepts the computer authorization prompt. Then use the confirmed device ID with `adb -s DEVICE_ID reverse tcp:5210 tcp:5210` and install this debug APK on that test device only. Keep the PC preview running and USB connected. Do not install it on an unidentified device or upload it to Play.

Actual Google Play testers still have their previously published version. A reviewed update/rollout is separate from local APK installation. A native launcher change requires an Android build update; server-side frontend edits alone do not replace the installed launcher.

## Startup behavior

Android first displays a waiting page bundled in the APK, with the original logo, the accepted ivory/teal/amber palette, an indeterminate connection bar and optional local Snake game. It does not load remote HTML or expose a JavaScript device interface. Its WebView network loads/file/content access are disabled; assets and logo are packaged. Native code checks only the pinned owned HTTPS readiness endpoint, or approved loopback ports in a debuggable build. Redirects, provider HTML and oversized/non-ready JSON cannot authorize handoff. TLS validation remains enabled.

The waiting room stops scheduling requests in the background, has six-second socket timeouts, a 256-byte readiness response limit and at most twelve automatic attempts with backoff. On failure it offers explicit retry. After confirmed JSON readiness it opens the existing customer app, preserving normal same-origin cookies. The web page also shows a matching loader until its own readiness check passes; the game has no storage, tracking or network access. Progress reflects connection stages, not an invented server percentage. Slow/offline startup cannot auto-submit an order.

Render may send its platform wake-up page before serving our website HTML. The APK's packaged screen avoids that initial remote navigation. The browser loader can appear only after our HTML arrives; eliminating the provider page for first-time website visits requires serving the frontend independently. No hosting, DNS, keep-alive service, purchase or deployment was changed here.

## Verification — 27 November 2026

- 411 Mart regression tests passed, zero failed/skipped, on two isolated local `_test` databases.
- Startup browser checks: slow backend, indeterminate progress, game controls/collision/restart/pause, bounded exhaustion, stopped polling, rejected HTTP200 HTML/oversized JSON, valid JSON auto-open, cleanup and offline retry without network requests.
- Three Android origin-policy unit tests passed; web/backend production builds and TypeScript checks passed.
- Actual API36 emulator: packaged screen and Snake remained visible during repeated real localhost503 responses; valid JSON then launched MainActivity. Real customer UI/demo login and pickup checkout were verified after restoring the actual preview.
- Automated axe check reported no violations on the waiting screen. Physical phones and real-world Android permission/network behavior still require owner acceptance.

No production database/account, real SMS, Play release, Git push, DNS or hosting settings were touched. Earlier architecture/QA artifacts remain explicitly pinned snapshots; this document describes the additional startup follow-up.
