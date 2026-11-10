# Apna Mart deployment candidate

The customer application is being renamed from MyTown Market to Apna Mart.
The owner selected MySQL. Its existing Drizzle/MySQL schema and migrations
remain authoritative. Neon agent setup is independent and does not convert
this application to PostgreSQL.

## Proposed deployment

- Private repository: `apnamartbyevolix-tech/apna-mart`, branch `main`.
- Render workspace: `apna's workspace`, owned by `apnamartbyevolix@gmail.com`.
- Domain: `https://apna-mart.in`.
- One Render Node service serves Express and the compiled React application.
- Use a separate managed MySQL database with verified TLS and backups.
- Cloudflare manages the domain/DNS. Apna Galla keeps its existing hosts and
  database; its shop records and operator account are preserved.

`render.yaml` is a configuration candidate, not evidence of a working launch.
It proposes Singapore and the smallest paid web compute plan; confirm the
database region and the owner's spending approval before provisioning.
Automatic deployment is explicitly off until the connected release passes.

The build installs the locked dependencies and produces the browser and server
bundles. The pre-deploy step applies the checked-in Drizzle migrations before
the new server starts. Never run the demo seeder against production. Review
the database backup and test these migrations in isolated staging first.

## Secret configuration

Supply `DATABASE_URL`, `MANUS_JWT_SECRET`, `MTM_OTP_SECRET` and
`APITXT_AUTH_KEY` through Render's secret environment. Set the real provider
template identifier only if the SMS account requires one. Keep credentials,
provider keys, signing material and `.env` files outside Git and the APK.
Use durable database storage; Render's local filesystem is not an upload store.

The approved auth origin is the exact HTTPS domain. Preview domains do not
automatically get production API access. Native Android authentication needs
its own reviewed origin/API arrangement before an installable live release.

## Required connected-release work

The current Apna connector is deliberately local-only. The deployment file
keeps it disabled and must not be used to announce a connected marketplace.
Implement the production host allowlists, server identities, authorization,
real location/vendor mappings and rollout scope on both backends. Preserve
stock reservations, durable retry identities, quote validation, handover and
balanced accounting. Do not remove sandbox checks as a deployment shortcut.

The existing limited pilot covers INR, zero-GST ordinary whole-unit stock,
30 shared items and the latest 100 orders. Confirm or expand those limits
before public rollout. See `CUSTOMER_ONLY_SHOP_WORKFLOW.md` and
`PRODUCTION_QA_2026-11-06.md` for the full existing boundary.

Before launch, verify real OTP delivery and abuse controls, proxy/IP handling,
public privacy/support/deletion paths, media storage, backup/restore, rollback
and a full customer-to-shopkeeper order on isolated staging. Build the final
APKs only after compatible services and HTTPS login are verified. The current
Android preview identity and localhost configuration are not a live APK.

## Local validation of the rename

`pnpm check` and `pnpm build` passed on 10 November 2026. The name changes
preserve stored cart keys, internal routes and service identifiers. No customer
data migration or production account change is part of the rename.
