# Local demo and Android handoff

5 November 2026. Local work only; no remote repository, deployment, production login, production database or public seller activation.

## Source and local access

This is the supplied MyTown Market application, with its React/TypeScript/Vite frontend, Express/tRPC backend and Drizzle/MySQL schema retained. It is running separately from the existing Apna Galla app. It has not been inserted into the marketing website or exposed publicly.

On the prepared PC, open **http://127.0.0.1:5205/login**. Select an existing local persona button; these are server-owned demo identities, not email/password accounts:

| Button | Fictional identity | Email label |
|---|---|---|
| Customer | Aarti Sharma | dev-customer@mytownmarket.test |
| Merchant / Vendor | Rajesh Kirana | dev-vendor@mytownmarket.test |
| Delivery Rider | Vikram Singh | dev-rider@mytownmarket.test |
| Platform Administrator | Local Dev Administrator | dev-admin@mytownmarket.test |

No password is required for this strictly loopback-only demo. The server must explicitly enable development auth and the separate admin flag; these identities are refused in production. Demo merchants/products are fictional. The merchant persona owns the DEMO Sunrise Kirana fixture. Demo rider fixtures are separate from real workers. Do not enter real customer data into this demo.

The prepared PC uses separate MySQL databases for demo and destructive tests, each ending `_test`; only the test DB has the required `mtm_e2e_` prefix. Both are on loopback port 3313, in this task's private data directory. The app DB user is granted access only to those two databases. SQL sessions use UTC in the new isolated instance; no production time zones or historical timestamps were changed.

## Starting the prepared copy

Source is under the chat output folder's `MyTown Market/2026-11-05/source`. Private DB credentials/session key and runtime settings are under its sibling `Private` directory, outside Git and outside the source ZIP.

From the source directory on this PC:

```powershell
node ../run-local.cjs serve
```

Use the supplied local `Start-Local.ps1` helper from the parent task directory if the isolated MySQL server is stopped. Do not start a second app process if port 5205 is already serving the preview. Existing Apna Galla ports/services are unrelated.

For a fresh machine, install the locked dependencies with `pnpm install --frozen-lockfile`. Configure the variable names in `.env.example` privately. Provision a new MySQL database/user on loopback with the accepted development namespace and `_test` suffix; use a separate `mtm_e2e_*_test` database for integration tests. Apply original additive migrations using `pnpm db:migrate`, seed fictional catalogue rows using `pnpm db:seed-demo`, and optionally execute `scripts/seed-local-personas.ts` only under its explicit local-development guards. On Windows set `NODE_ENV` to development, loopback HOST and PORT before invoking `tsx server/_core/index.ts`, as in the original README. Never use `db:push` against existing books.

## API integration status

The local adapter has typed operations from the supplied draft, a signed TLS-1.3 sandbox transport, exact approved-host checking, bounded requests/responses, timeouts, limited retries, stable caller-supplied idempotency keys, redacted errors and an explicit unconfigured state. Wire encoders/decoders must be supplied from a signed-off HTTP specification; no invented field mapping is active. Production catalogue and checkout still fail closed before DB access. No mock subscriber can open public selling.

The proposed marketplace routes were not found in the separate local Apna Galla backend during a read-only source search. The next integration step is to define and implement those approved sandbox APIs, verify reservation/commit/release/sale semantics and merchant consent/eligibility, then wire durable local outbox/reconciliation and webhook processing. Those pieces are not falsely represented as implemented. See `INTEGRATION_IMPLEMENTATION.md` for exact missing facts.

## Local Ollama

Ollama runs only on `127.0.0.1:11434`, using the already installed `qwen3.5:4b`. Sign in to the local MyTown demo, open **Support**, then use **Ask MyTown · local AI help**. The feature is authenticated and refused in production/public previews. It sends the user's question and fixed app-help instructions to the local model, with no customer-record lookup or order tools. Do not type private records into it. It cannot modify orders, reserve stock, verify subscriptions, research the market or train itself on customer records.

Questions are bounded, rate-limited and served one at a time with a timeout. Errors never substitute invented stock or money. Fixed handover guidance stays visible and app records remain authoritative. Generated explanations can be wrong; a real successful answer is not an accuracy guarantee.

Use the existing `D:/Ollama/Start-Ollama.ps1` to start the local Ollama server. A cold model may need a warm-up before the 45-second interactive deadline. A real local model response and Hinglish browser answer were verified. Running a large model, full emulator and Gradle simultaneously exhausted this PC's memory during an intermediate check; sequential checks succeeded. Avoid starting all three together.

## Android debug preview

Capacitor reuses the customer web app. No separate React Native/Flutter frontend or backend rewrite was introduced. Current provisional package is `in.mytownmarket.customer.preview.debug`, minimum API 24, target/compile API 36. It is debug-signed; `apksigner` verifies its signature. Owner approval of a permanent package ID is still needed before a real release.

The test APK uses the existing live localhost web preview through ADB reverse, preserving same-origin cookies and the loopback-only auth boundary:

```powershell
$env:MTM_ANDROID_PREVIEW_URL = 'http://127.0.0.1:5205'
pnpm android:sync
adb reverse tcp:5205 tcp:5205
.\android\gradlew.bat -p android assembleDebug --no-daemon --max-workers=2
```

Set the installed JDK/SDK paths in `JAVA_HOME` and `ANDROID_HOME`, and an ignored `android/local.properties` for the SDK. On this PC those tools/caches already live under `D:/ApnaGalla-Android-Tools`. The debug cleartext exception is limited to loopback; release manifests do not include it. Normal app backup is disabled. Native insets protect the web controls from system bars. A release task explicitly rejects a generated config containing a localhost server URL.

This APK requires the PC/server and the ADB reverse connection. It is **not** a standalone production Android app or Play-ready build. Bundled assets are supported when the preview variable is omitted, but approved API origin, real native auth/OAuth routing, permanent ID, release signing, privacy/data safety and physical-device acceptance must be completed before release. Secrets stay on Express, never in the APK or Vite variables.

## Verification and remaining gates

The original default baseline passed 172 tests and intentionally skipped 35 DB cases. Final isolated MySQL execution passed all **220 tests, 0 failures, 0 skipped**, including those original 35 workflows and 13 new adapter/AI regressions. TypeScript and the Vite/esbuild web build passed. Existing tests and validation were preserved. Security-sensitive handover guidance uses reviewed fixed app facts; model output mentioning handover/OTP falls back to those facts.

Browser verification used a real headed browser: customer persona login, service-area selection, catalogue/cart, below-minimum rejection, a reviewed two-item-quantity pickup quote at the seeded price, explicit confirmation and saved order detail; responsive home screenshots at 390/1440px with no horizontal overflow; a real Ollama reply in Support. Nothing here changes real shop stock.

The native debug build and signature verification passed; a dedicated emulator installed/started it and native WebView customer login was verified against the isolated API. See the final task report for the last artifact hashes, screenshots and native safe-area check. No physical phone or Play installation is claimed. A deliberately rejected release-build invocation is evidence of the localhost guard, not a successful release build.

The first temporary MariaDB fixture failed two existing JSON-metadata idempotency tests. No business logic or assertion was weakened: verification was switched to the specified MySQL engine and all tests passed. Temporary data and credentials are private and excluded from deliverables.

Other handoff launch gates remain: actual Manus OAuth/customer/merchant/admin identity, approved privacy/consent/deletion/retention, remote storage/media verification, operational backups/monitoring, settlement/refund decisions, ERP stock concurrency and native release acceptance. No payment gateway, SMS provider, live GPS, public listing bypass or automated payouts were added.

References: [Capacitor existing-web-app setup](https://capacitorjs.com/docs/getting-started), [Ollama chat API](https://docs.ollama.com/api/chat), [MySQL Windows ZIP setup](https://dev.mysql.com/doc/refman/8.4/en/windows-install-archive.html). The attached contract remains the authority for integration design; these platform docs do not define Apna Galla wire fields.
