# TP-17 — Acceptance and Closeout

Status: `complete` — canonical touched-surface mandatory acceptance is green without live external traffic; the worktree is ready for independent Goal 3 review.

## Goal

Prove the rebuilt canonical provider satisfies every frozen Owner decision, production call chain, security boundary, persistence invariant and deletion requirement, then record an evidence-backed closeout without live external traffic.

## Dependencies and prerequisite state

- TP-01 through TP-16 complete with their package gates green.
- No package-specific exception, deferred contract, compatibility branch or unresolved Owner decision remains.
- The Goal 2 compatible scope contains only intentional implementation and acceptance artifacts; unrelated incoming dirty-worktree changes are separately recorded and excluded from acceptance claims.

## Production files and deletion scope

This package should add only missing acceptance fixtures/harnesses and final architecture evidence required to prove the completed implementation. Delete temporary mocks, probes, one-off scripts and compatibility characterization tests that are not part of the durable baseline.

## Schema, config and data impact

- Validate fresh schema boot and targeted-reset boot separately.
- Use synthetic keys, mock secure storage and controlled no-egress development transport fixtures only.
- Verify no test leaves credentials, endpoint state, catalog cache, conversations or native rebuild artifacts behind.
- Optional real-provider live smoke is a separately owner-operated procedure and is not part of automated acceptance.

## Core invariants

- Every frozen decision and global acceptance rule maps to executable evidence or a precise source-level invariant.
- End-to-end tests cross renderer, preload, IPC, Electron main, governed network, parser, domain events, display and SQLite.
- Security tests include connect-time address enforcement, redirects, header/query/body redaction and network-egress governance.
- Negative evidence proves aliases, fallbacks, dead runtime paths and legacy persistence readers are absent.
- No green result relies on external network availability or a real credential.

## Implementation steps

1. Reconcile `DECISION_COVERAGE_MATRIX.md` against implemented tests and source evidence; leave zero unowned rows.
2. Run package-level unit, schema, network, parser, reducer, UI and integration suites.
3. Run Electron/Playwright scenarios for CRUD, catalog, send, stop, reload and historical actions through the controlled development-only no-egress compatible fixture.
4. Run fresh-install and mixed-data targeted-reset scenarios.
5. Run full negative source searches and network-egress gate.
6. Run type, Vue type, lint/i18n/build and repository integrity gates required by touched surfaces.
7. Remove temporary acceptance artifacts and confirm Git/native-artifact hygiene.
8. Record exact commands, results, ABI switches, known environment blocks and final verdict.

## Tests and gates

- `npm run rebuild:node` before DB-heavy Node/Vitest acceptance.
- focused and full relevant Vitest suites.
- `npx tsc --noEmit --pretty false`
- `npx vue-tsc --noEmit`
- focused canonical lint, repository i18n/schema/source-guard gates; repository-wide dirty-worktree lint residuals are recorded separately and are not claimed as passed.
- `npm run gate:network-egress`
- Electron/Playwright against controlled no-egress development fixtures only.
- `npm run rebuild:electron` immediately before final Electron smoke; leave the ABI target matching the final required endpoint.
- `git diff --check`
- `git status --short --untracked-files=all`

## Acceptance criteria

- Decision coverage has zero unowned, untested or ambiguously satisfied frozen requirements.
- UI can create/edit/select multiple instances and complete compatible stream/non-stream conversations through the governed main path.
- Tools, reasoning, usage, multi-choice, errors, stop and reload retain exact provider-neutral semantics.
- SSRF, secret, provenance and endpoint/model-isolation adversarial suites pass.
- Targeted reset removes only incompatible compatible state and all legacy symbols remain absent.
- No real external API request, real key, temporary fallback or native artifact is included.
- Final closeout is `ready_for_release` only if every mandatory gate is green; otherwise it names the exact blocking evidence.

## Prohibitions

- No acceptance-by-documentation alone.
- No skipped failing gate reclassified as success.
- No live external endpoint in automated tests.
- No compatibility fixture retained solely to keep an old path green.
- No implementation changes hidden inside the closeout report.

## Suggested commit

`test(provider): close compatible rebuild acceptance`

## Stable contract for the next package

There is no next rebuild package. The resulting single canonical runtime and its evidence baseline become the maintained production contract.
