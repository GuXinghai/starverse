# Decision Points

## DEC-001: Node config ownership for the app CSP helper

Status: resolved

Trigger:
- Batch 5 attempted to satisfy `tsconfig.node.json` by including `src/shared/security/appCsp.ts` in the Node composite project.
- That made `.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --tsBuildInfoFile docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo` pass.
- It then caused the root Vue-aware check to fail with:
  `error TS6305: Output file 'D:/Starverse/src/shared/security/appCsp.d.ts' has not been built from source file 'D:/Starverse/src/shared/security/appCsp.ts'.`
- `risk_reviewer` classified the overlapping project ownership as a P1 release blocker.

Affected files:
- `tsconfig.node.json`
- `tsconfig.json`
- `vite.config.ts`
- `src/shared/security/appCsp.ts`
- `src/shared/security/appCsp.test.ts`

Options:

1. Move the CSP helper to a config-owned module outside `src`.
   - Example target: `config/appCsp.ts` or another project-owned config/build helper path.
   - Update `vite.config.ts` and the CSP unit test import to the new owner.
   - Include the config-owned helper in `tsconfig.node.json`.
   - Pros: one canonical owner, no root/composite overlap, keeps the CSP contract shared without duplicating logic.
   - Cons: file move/import churn; owner must accept that this helper is build/config code rather than renderer `src` code.

2. Keep the helper under `src` and introduce a dedicated shared composite project.
   - Pros: preserves current `src/shared/security/appCsp.ts` path and keeps a formal shared project boundary.
   - Cons: larger TypeScript project architecture change; likely requires declaration output/build coordination and broader validation.

3. Keep the helper under `src` and change the existing project-reference relationship.
   - Examples: remove or alter the root reference to `tsconfig.node.json`, or make the Node config project non-composite.
   - Pros: may reduce file movement.
   - Cons: changes TypeScript project semantics for the repo, affects build expectations beyond this audit, and needs owner confirmation.

4. Duplicate or inline the CSP helper in `vite.config.ts`.
   - Pros: fastest way to satisfy `tsconfig.node.json`.
   - Cons: violates the repair principle against duplicate aliases/shims and creates CSP drift risk.

Recommended choice:
- Option 1. The current usage evidence shows `appCsp` is consumed by `vite.config.ts` and its unit test, not by runtime app code. A config-owned single source keeps the contract canonical while avoiding the root/composite TypeScript ownership conflict.

Exact next prompt:
```text
Proceed with DEC-001 Option 1. Move the app CSP helper out of src into a config-owned TypeScript module, update vite.config.ts and the CSP unit test imports, remove the overlapping src/shared/security/appCsp.ts ownership, update tsconfig.node.json to include only the config-owned helper, keep CSP behavior unchanged, and rerun vue-tsc, tsc -p tsconfig.node.json with the audit-local tsBuildInfoFile, git diff --check, the CSP unit test, and the targeted file-type tests. Do not change dependencies, lockfiles, generated outputs, native artifacts, staging, or commits.
```

Resolution:
- Implemented the shared-boundary fix by moving the canonical CSP helper to `config/appCsp.ts`.
- Moved the CSP regression tests to `config/appCsp.test.ts`.
- Updated `vite.config.ts` to import from `./config/appCsp`.
- Updated `tsconfig.node.json` to include `vite.config.ts`, `config/appCsp.ts`, and `config/appCsp.test.ts`.
- Removed `src/shared/security/appCsp.ts` and `src/shared/security/appCsp.test.ts` so no CSP helper source remains double-owned by the root Vue project and the Node composite project.

Validation:
- `git diff --check`: passed.
- `.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --tsBuildInfoFile docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo`: passed; audit-local build-info removed afterward.
- `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false`: passed.
- `npx vitest --run config/appCsp.test.ts src/next/file-type/externalProcessRunner.test.ts src/next/file-type/fileTypeStaticPolicy.test.ts src/next/file-type/conversionRuntimePackage.test.ts src/next/file-type/enginePackageContract.test.ts src/next/file-type/packagingRegressionSmoke.test.ts src/next/file-type/pluginCatalogSignature.test.ts`: passed, 7 files and 153 tests.
- `rg -n "appCsp" tsconfig.json tsconfig.node.json vite.config.ts config src/shared/security`: found only the config-owned references.

Risk review:
- `risk_reviewer` reported no P0 or P1 findings.
- `risk_reviewer` confirmed CSP semantics did not drift and the Node TS project now owns the config helper without the prior `src/shared/security` overlap.
