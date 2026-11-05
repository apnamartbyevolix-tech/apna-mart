# Focused Sprint 0 security review — 5 November 2026

Reviewed actual diffs of `296caec942849601e6642bf3746af5697485c61d` and `979a4687c17c6b0d33bba8a4fc6543c805ec2ac4`, their callers, surrounding authentication and installed mysql2 behavior. Both accepted commits remain intact. An independent Security Review subagent and the implementation engineer inspected the changes. This is a focused review, not a penetration test or public-launch approval.

## Results

**No confirmed security defect introduced by either accepted commit.**

| Check | Finding |
| --- | --- |
| Exact namespaces | Anchored patterns require `mtm_dev_`, `mtm_local_`, `mtm_test_` or `mtm_e2e_`, plus a nonempty safe suffix. Integration requires `mtm_e2e_`. Encoded separators/malformed escapes and misleading prefixes are rejected. |
| Rejection before pools | `getDb` validates outside pool initialization and cannot fall back to a raw URL after rejection. Only one plain charset option survives; driver target/transport overrides do not. |
| Activation/production | Integration and both dev-auth flags activate the shared parser. Production/preview local modes fail closed. Ordinary production with flags disabled retains the existing raw-string Drizzle connection behavior. |
| Identity/privilege | No client-controlled identity/role path was added. Server personas, explicit dev-admin enablement, loopback/cloud/request guards and production rejection of dev identities remain. |
| Real lifecycle tests | Rider conflict checks now reach actual dispatched status first. Return recovery uses actual item IDs/quantities and retains stock, state and duplicate-recovery assertions. No business-rule assertion was weakened. |

## Confirmed pre-existing finding and correction

**P1 — migration configuration did not use the shared local/test guard.** `drizzle.config.ts` exported raw `DATABASE_URL`, even under isolated-test/dev-auth flags. A parser-only probe of a synthetic local-looking URL with `?host=remote.invalid&database=shared_shop` showed that mysql2 would resolve a different target. No connection was opened; the same configuration existed before Sprint 0.

The minimal follow-up calls `databaseConnectionConfig` before exporting the existing URL. Keeping the URL shape preserves existing charset handling and ordinary production behavior; the allowed charset option cannot change target or transport. New config-import regressions check unsafe URLs, both development flags, valid local charset handling and normal production behavior. No migration or database write is needed to test the correction.

Independent review executed the original 41 database-configuration cases successfully. Final follow-up/default/integration results are recorded in `PHASE_2A_SLICE_1.md` after execution.

## Remaining separate issues

- The protected owner-bootstrap test is still conditional on an actual protected owner email; no fake production owner configuration is introduced.
- Real browser/OAuth authentication has not been verified.
- `deliveryAssignments.completedAt` writes target a field absent from schema/migrations and are discarded. Existing order events/updatedAt remain the available persistence. A separate reviewed fix must choose consistent event usage or a new additive column.
- Subscriber eligibility/consent and public-selling enforcement are not supplied by these database commits. No live ERP call, public listing, push or deployment was performed during review.
