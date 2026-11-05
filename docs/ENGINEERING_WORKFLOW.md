# MyTown Market — selected Ponytail/ECC workflows

5 November 2026. Project requirements and the architect's review/release rules take precedence. Preserve React/TypeScript/Vite, Express/tRPC, Drizzle/MySQL, the existing UI, validation and tests. Use Ponytail for implementation size; use only the reviewed ECC methods below. This document does not enable plugin automation.

## Conflicts identified before adoption

| Upstream suggestion | Project decision |
| --- | --- |
| ECC plugin declares a SessionStart bootstrap and an MCP server running `npx -y chrome-devtools-mcp@1.10.1` | Marketplace registered for inspection; full ECC plugin **not installed/enabled**. No ECC hook/bootstrap/MCP command executed. Preserve existing Ponytail configuration. |
| ECC TDD: 80% blanket coverage, tests for every change and no skipped tests | Require focused behavioral regressions for critical workflow changes. Preserve intentional isolated-DB/owner-bootstrap skips and report them honestly. Do not install a coverage provider or remove tests to meet a percentage. |
| ECC: commit each RED/GREEN/refactor stage | Keep observed RED/GREEN evidence in the slice report, then create small verified commits. Do not rewrite accepted commits or require failing-test commits on the working branch. |
| ECC review: file/function size thresholds and broad cleanup | Review concrete changed behavior/callers. No broad router refactor, formatter sweep or dependency change to satisfy generic thresholds. Ponytail's smallest correct fix wins after safety/business requirements. |
| ECC examples: Next.js/Supabase/Jest/Stripe, package-manager detector, Playwright install/CI templates | Keep the actual stack and Vitest commands. No copied framework patterns, installers, new application/test dependencies, provider calls or CI publishing. |
| ECC flaky-test quarantine/retries or mocked critical money/stock behavior | Do not hide failures or weaken assertions. Use disposable localhost `mtm_e2e_*` MySQL for persistence/concurrency; label mocked/API/browser evidence separately. |
| ECC proactive agents/model selections and global operator workflows | No automatic model switch, agents, rule installation, memory capture or hooks. Existing project execution/approval boundaries remain. |

## Adopted procedure

1. **Planning:** for each reviewed slice, identify acceptance behavior, exact files, affected callers/fixtures, risks and a stopping boundary. Reuse the existing roadmap; avoid a new planning artifact for trivial edits.
2. **TDD:** for new critical behavior, add a focused regression and execute it against the current code. Record the intended RED failure; implement the smallest correction; rerun the same target to GREEN. Keep plan → test → observed result mapping. Never call an unrelated syntax/setup failure useful RED evidence.
3. **Code review:** inspect the exact diff plus surrounding callers and trust boundaries. Report only reproducible/confirmed findings with file/line, trigger, impact and minimal correction. Keep pre-existing blockers separate. Zero findings is acceptable. Critical workflow changes still require the senior architect's review; an automated review does not replace it.
4. **End-to-end checks:** preserve the critical journeys: location → search/category → product → one-seller cart → current server quote → COD/pickup → history/status → handover; also cancellation, role isolation and failed-return stock/money recovery. Use already available browser tooling and semantic selectors/observable completion, not arbitrary sleeps. Keep fixtures local/disposable. Record actual browser/device, result and artifacts; API caller tests alone are not browser E2E. Real authentication and owner bootstrap remain release gates.
5. **Verification/report:** run applicable existing typecheck, Vitest, isolated MySQL and build checks, then stop at the requested slice boundary. Give exact pass/fail/skip counts, changed files, remaining risks and no push/deploy without authorization. Re-run broader checks only when new changes/failures justify it.

## Measurable value and current evidence

- Independent Sprint 0 review identified one real migration-entry-point gap rather than inventing refactoring findings. The shared-parser follow-up has eight config-import regressions; the existing 41 parser cases remain.
- First Phase 2A RED runs reproduced **12 missing catalogue-access boundary failures** and **5 real MySQL catalogue/category failures** before runtime changes. The unchanged wrong-zone behavior also remains tested.
- Focused post-fix run: **20 passed** (12 catalogue-boundary + 8 migration config cases). Complete isolated-MySQL-enabled suite: **157 passed, 0 failed, 1 skipped**. Slice details are in `PHASE_2A_SLICE_1.md`.
- No new package dependencies or ECC runtime/hook activation. No browser E2E or percentage-coverage result is claimed by this evaluation.

## Reviewed upstream sources

ECC **2.2.3**, commit `b38be6a7f6350964d59328b52f0624e1d1d552d1`:

- [Planner](https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/agents/planner.md).
- [TDD workflow](https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/skills/tdd-workflow/SKILL.md).
- [Code reviewer](https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/agents/code-reviewer.md).
- [E2E patterns](https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/skills/e2e-testing/SKILL.md).
- [Plugin manifest](https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/.codex-plugin/plugin.json), [Codex hooks](https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/hooks/codex-hooks.json), [MCP configuration](https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/.mcp.json).

Ponytail **5.3.3** remains installed/enabled. Its reviewed instruction is `C:/Users/Ayush/.codex/plugins/cache/ponytail/ponytail/5.3.3/skills/ponytail/SKILL.md`. Its implementation-size preference does not override business, security, financial, inventory, database or review requirements.
