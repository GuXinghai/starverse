# Blocked Or Uncertain

## UNCERT-001: Plain `tsc` reports named type imports from `.vue` files, but `vue-tsc` does not

Status: needs reproduction or owner decision

Suspicious item:
- `src/ui-app/app/appChatApp.logic.ts:178-179` imports `SearchConvoOption`, `SearchProjectOption`, `ConversationListItem`, and `ProjectListItem` from `.vue` SFC modules.

Evidence:
- `.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit --pretty false --incremental false` reports TS2614 for all four named imports from `"*.vue"`.
- `src/vite-env.d.ts` declares `*.vue` modules as default-only `DefineComponent`, which explains why plain `tsc` cannot see named SFC type exports.
- `src/ui-app/components/SearchModal.vue:6-7` does contain `export type SearchProjectOption` and `export type SearchConvoOption`.
- `src/ui-app/components/ConversationList.vue:5-16` does contain `export type ConversationListItem` and `export type ProjectListItem`.
- `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false` did not report these four TS2614 errors.

Why uncertain:
- The package build script uses `vue-tsc`, not plain `tsc`, for Vue-aware typechecking.
- The plain `tsc` result may reflect an unsupported validation command rather than runtime or build breakage.

Suggested next check:
- Decide whether `tsc -p tsconfig.json --noEmit` is an intended project gate.
- If it is intended, move shared option/list item types out of SFC modules or update declarations/tooling so plain TypeScript can resolve them.

## UNCERT-002: Runtime-only failures were not assessed because full tests require ABI-changing setup

Status: blocked by read-only audit constraints

Suspicious item:
- Full `npm test`, `db:verify`, and `verify:ssot` may reveal runtime DB, IPC, schema, or DTO issues beyond the compile blockers already found.

Evidence:
- `package.json` scripts run `npm run rebuild:node` before full DB-heavy validation.
- The audit rules prohibit modifying source/config/generated/native artifacts outside the audit directory.
- The Starverse ABI policy warns that `better-sqlite3` rebuilds switch the active ABI target.

Why uncertain:
- The audit intentionally avoided native rebuild churn and did not run DB-heavy tests.
- Current compile errors already block test execution quality, so runtime failures would be hard to attribute until typecheck blockers are fixed.

Suggested next check:
- In a separate authorized fix or validation phase, run `npm run rebuild:node` followed by scoped Vitest commands after the compile blockers are fixed.

## UNCERT-003: Node config project boundary for `appCsp.ts`

Status: resolved

Suspicious item:
- `tsconfig.node.json` can be made to pass by directly including `src/shared/security/appCsp.ts`, but that same file is already inside the root `tsconfig.json` `src/**/*.ts` include while the root project references `tsconfig.node.json`.

Evidence:
- With the direct include, `.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --tsBuildInfoFile docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo` passes.
- With the same direct include, `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false` fails with TS6305 for `src/shared/security/appCsp.ts`.
- `risk_reviewer` classified the overlap as a P1 release blocker.

Why uncertain:
- There are multiple credible architecture directions: move the CSP helper to a config-owned module, introduce a dedicated shared composite project, or change the current project-reference relationship.
- Choosing among those changes affects TypeScript project ownership, not just a local import typo.

Decision record:
- See `decision-points.md` DEC-001.

Resolution:
- The canonical CSP helper moved to `config/appCsp.ts`.
- `tsconfig.node.json` includes the config-owned helper and its config-owned regression test.
- `src/shared/security/appCsp.ts` and `src/shared/security/appCsp.test.ts` were removed, so the helper is no longer owned by both the root Vue project and the Node composite project.
- Root `vue-tsc` and the Node config typecheck both pass.
