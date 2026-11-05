# Timestamp correction requiring architectural review

Observed 5 November 2026 during local Chrome verification. This is a confirmed operational issue, separate from checkout arithmetic and the previously discarded `completedAt` writes.

## Evidence

Read-only checks against the verified private demo server (`127.0.0.1:3307`, `mtm_dev_mytown_demo`) returned:

- MySQL session time zone: `SYSTEM`; system zone: `India Standard Time`.
- At the same observation: MySQL `NOW()` = `2026-11-05 12:55:34`; `UTC_TIMESTAMP()` = `2026-11-05 07:25:34`; Node clock = `2026-11-05T07:25:34Z`.
- An order created around `07:23:57Z` had an application `createdAt` of `2026-11-05T12:53:57Z`. Chrome, correctly using Asia/Calcutta, displayed 18:23:57 instead of 12:53:57.
- Installed Drizzle's `mysql-core/columns/timestamp.js` reads SQL timestamp strings using `new Date(value + "+0000")` and writes JavaScript dates as UTC strings. Database defaults generated in a non-UTC SQL session therefore disagree with application-generated timestamps.

Do not fix this by subtracting 5½ hours in the UI. That would corrupt correctly UTC-written timestamps and other environments. Existing records may mix default-generated and application-generated values.

## Proposed correction — not implemented

1. Review and require UTC SQL sessions on every connection, coordinated with Drizzle's UTC timestamp mapping. Check actual production/server time-zone settings first; do not assume they match this demo.
2. Verify database-default insert times, application-written dates, pool reconnects, timeline ordering and display in Asia/Kolkata against an external clock on isolated MySQL.
3. Independently assess historical affected rows before any correction/backfill. Preserve originals and an audit trail; no blanket time shift or historical migration rewrite.
4. Approve the deployment/database configuration change and any separate additive migration only after reviewing that evidence.

The accepted database URL parser, local namespace/option isolation, mysql2 configuration parity and existing production pool configuration have not been changed for this issue. No database time-zone command, historical data update or schema migration was executed.

## Previous completion-column issue

`delivery_assignments` has no `completedAt` column. The three previously ignored writes now explicitly update the existing `updatedAt` column. Order terminal events remain the persisted completion timeline. `updatedAt` is not represented as an immutable completion timestamp. A dedicated column, historical reconstruction and additional assignment-level semantics would require separate review. This small correction does not resolve the time-zone issue above.
