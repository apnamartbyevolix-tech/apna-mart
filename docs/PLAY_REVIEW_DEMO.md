# Dedicated Play reviewer access

The ordinary customer experience still signs in with phone OTP. The optional
password demo opens the same customer screens against a **different database**
containing fictional shops, products, addresses and orders. It does not send OTPs,
reserve stock in Apna Galla, deliver goods or take payments. A visible banner
explains this throughout the demo. It is not a Platform, vendor or rider login.

## Required server environment names

- `MTM_REVIEW_DEMO_ENABLED`: disabled unless explicitly set to `1`.
- `MTM_REVIEW_DATABASE_URL`: dedicated database and separate database role.
- `MTM_REVIEW_USERNAME`: dedicated demo username.
- `MTM_REVIEW_PASSWORD_HASH`: salted scrypt hash, never a plaintext password.
- `MTM_REVIEW_SESSION_SECRET`: separate random session-signing secret.
- `MTM_AUTH_ORIGINS`: existing explicit HTTPS sign-in origin allowlist.
- `MTM_REVIEW_PROVISION_CONFIRM`: initializer-only confirmation value described below.

Keep all values in protected local files or the backend environment manager.
Never add them to `VITE_*`, source control, screenshots, logs or Android assets.
The public status route returns only whether demo sign-in is enabled.

## Provisioning and deployment order

1. Create an empty database named `mtm_review_demo` with a distinct restricted
   login role. Do not use a branch copied from customer records. Do not grant
   this role access to the production application's tables or other database roles.
   Keep the existing `DATABASE_URL` unchanged.
2. Generate a unique password, a random 16-byte salt, and a 64-byte scrypt hash
   using N=32768, r=8, p=1. The stored format is
   `scrypt-v1:<32 lowercase hex salt characters>:<128 lowercase hex hash characters>`.
   Generate an independent random session secret of at least 32 bytes encoded
   as base64url. Store the plaintext reviewer password privately for Play Console.
3. In a controlled backend environment set the required server variables and
   `MTM_REVIEW_PROVISION_CONFIRM=fictional-review-only-v1`, then run
   `pnpm exec tsx server/review-demo/provision.ts` from the project root.
   The initializer refuses any unmarked database containing tables. It applies
   the existing Drizzle migrations only to the new database, creates fictional
   fixtures and an explicit purpose marker. On a marked database a rerun is a
   no-op; it does not reset reviewer orders or stock.
4. Remove the initializer confirmation variable from the running service.
   Deploy the tested source with demo configuration enabled. Normal customer
   data and the existing OTP configuration stay unchanged. A configuration
   error prevents startup; a demo database outage never falls back to real data.
5. Open **Sign in → Open demo sign-in**, use the private credentials, choose
   **Demo Town / Fictional Market**, and review browsing, pickup/COD checkout,
   addresses, favourites, orders and support. Enter fictional information only.
   The seeded address uses a deliberately non-callable phone placeholder.
6. Check the actual Play-installed app, then enter the reusable credentials and
   instructions in Play Console. Do not claim that the demo validates live
   seller eligibility, stock synchronisation, SMS delivery or public launch.

The password account has no automatic expiry. Sessions expire after seven days,
or one day of inactivity, and can be revoked by signing out. Reviewers can sign
back in with the same supplied credentials. Password changes require a new hash
and updated Play Console details. Rotating the demo session secret invalidates
all demo cookies without changing ordinary customer sessions.

## Isolation and security

An authenticated, signed demo cookie selects the separate database for the entire
asynchronous tRPC request. Session lookup, rate limiting, all reads and all writes
use that database. Normal and demo requests can run concurrently; the process
environment is never rewritten to switch a connection. Invalid, expired, revoked
or forged demo cookies fail closed instead of falling back to OAuth or another
customer's cookie. The database must have the initializer's purpose marker.

Demo sessions are restricted to customer, account, support and marketplace
procedures. Administrator, vendor, rider, development-persona and local-assistant
procedures are denied. Normal sign-in clears the demo cookie. The demo login
clears ordinary customer cookies. Browser cart/location preferences are cleared
when entering or leaving the demo to avoid mixing identifiers between databases.

Password verification uses asynchronous scrypt and constant-time comparisons.
Login attempts are rate limited in the demo database by keyed IP fingerprints,
with a cap on concurrent password work. Sessions use random signed HttpOnly,
SameSite cookies, secure `__Host-` cookies in production, and hashed database
tokens. Mutations require an allowed origin. Errors never echo credentials.

The normal production catalogue/checkout restriction remains in place. Real
shopping must not be opened until approved seller eligibility and full live
ordering have been verified. Fictional demo shops do not become public sellers.

## Verification, 25 November 2026

- Full suite: **340 passed, zero failed, zero skipped**.
- Includes 24 new checks covering password/cookie validation, configuration,
  separate databases/roles, simultaneous request scopes, privileged route denial,
  cross-origin rejection, session revocation and idempotent demo checkout.
- Checkout produced no external requests or connector outbox entries even when
  the production connector flag was present in the isolated test process.
- All database-mutating automated tests used two disposable localhost databases
  ending in `_test`, with separately provisioned test users. No operator account
  or production customer record was used.
- TypeScript check and web/server build passed.
- Hosted configuration and Play-installed verification remain separate release
  steps; passing local tests does not prove that either is complete.
