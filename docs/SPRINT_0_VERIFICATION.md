# Database isolation fix — verification and architectural review

5 November 2026. Branch: `codex/launch-readiness`. Database guard commit: `296caec`. This is an implementation checkpoint, not a full launch-readiness declaration.

## Change and compatibility

One shared parser now supplies local/test mysql2 connection options, replacing separate URL checks that the driver could reinterpret. Dev authentication and workflow guards use the same parser. Production connections retain the existing driver behavior when local/test modes are disabled.

Local/test URLs reject target/transport options, arbitrary query options, fragments, invalid encodings, unsafe database names and invalid execution modes. A single plain charset remains supported because an existing caller/test already uses it. Development names require an exact documented prefix and nonempty safe suffix; bare `mtm_dev` and misleading `mtm_devproduction` are intentionally rejected.

No package dependencies, migrations, financial/inventory business rules, public authentication bypasses or new infrastructure services were added to the application. Local test infrastructure uses the already installed MySQL binary. Ponytail is applied to implementation size; business/security requirements and tests take precedence.

## Actual evidence

- Installed TypeScript `tsc --noEmit`: passed. The existing tsconfig excludes test files.
- Installed Vitest default suite: **121 passed, 11 skipped**. Includes 41 new effective-configuration regression cases. Driver pool construction checks actual mysql2 options without opening sockets.
- Installed Vite production build and esbuild server bundle: passed. Existing runtime config script warning remains.
- Applied all nine checked-in migrations and seeded only a separate new `mtm_e2e_*` database on loopback port **3308**. It is separate from persistent demo port 3307 and existing MySQL service port 3306. Credentials/configuration stay outside Git and were not printed.
- First actual workflow execution: **8 passed, 2 failed, 1 skipped**. Failures were stale test calls: completing delivery from `ready` before dispatch, and the obsolete return API without item quantities.
- Corrected focused suite: **10 passed, 1 skipped**. Rider protection is now checked after the rider genuinely dispatches; dispatch/completion/failure conflict assertions remain. Return recovery uses actual order-item IDs and quantities, checks disposition totals, persisted order/stock state and duplicate rejection.
- Protected owner bootstrap remains skipped because no protected owner email was configured. No real OAuth browser/provider login was tested.

The default and focused counts are separate runs, not a claim that one combined suite was executed. No destructive resets/deletes, production/shared DB writes, push or deployment occurred. Existing handoff ZIP/patch files and the migration 0008 newline modification were preserved.

## Architectural review required before release

Review this concrete diff and its tests for:

1. Exact local database namespace policy and deliberate URL-option restriction.
2. Validation/driver configuration parity and failure before pool creation.
3. Preserved normal production connection behavior; this patch does not implement the missing subscriber/Go Live public-selling gate.
4. Accurate workflow fixtures and unchanged fulfillment, cash and return rules.

The local changes are prepared for review; architectural sign-off has not been claimed. Remaining roadmap work includes category/checkout parity, authoritative price review, session/privacy behavior, media, operational financial flows, and production readiness. The unmapped completion timestamp is still a separate known issue. Public ERP connection remains the colleague's responsibility and requires joint validation, not just an adapter interface.
