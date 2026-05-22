# Next Actions

1. Optional DB-heavy validation: run `npm run rebuild:node`, then run `npx vitest --run infra/db/repo/fileTypeVerdictRepo.test.ts`, and keep native rebuild artifacts out of commits.
2. If DB-heavy validation is run, report the Starverse ABI policy fields and leave the final ABI target as `node` unless Electron smoke becomes the endpoint.
3. Keep `docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo` removed after any future Node config typecheck.
4. Decide later whether plain `tsc -p tsconfig.json --noEmit` is an intended gate for UNCERT-001. This remains separate from the five confirmed batches.
5. No source/config follow-up is currently required for DEC-001 or the five triaged batches.
