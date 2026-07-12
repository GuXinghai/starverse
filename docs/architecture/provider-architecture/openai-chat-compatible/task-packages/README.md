# OpenAI Chat Completions-compatible Task Packages

## Status legend

- `planned`: contract frozen; implementation not started.
- `in_progress`: implementation Goal has explicitly started the package.
- `blocked`: package cannot proceed after the documented blocked audit.
- `complete`: package acceptance and gates are green and its working-tree scope is reviewable and commit-ready for Goal 3.

TP-01 through TP-17 are complete. Goal 2 keeps all implementation changes uncommitted until the independent Goal 3 review.

## Execution order

| Order | Package | Status | Depends on | Production send allowed afterward? |
| ---: | --- | --- | --- | --- |
| 1 | [TP-01 Legacy Identity Excision](TP-01-legacy-identity-excision.md) | complete | none | no |
| 2 | [TP-02 Canonical Domain and Fresh Schema](TP-02-canonical-domain-fresh-schema.md) | complete | TP-01 | no |
| 3 | [TP-03 Provider Registry and Credentials](TP-03-provider-registry-credentials.md) | complete | TP-02 | no |
| 4 | [TP-04 Endpoint Revision and Route Provenance](TP-04-endpoint-revision-route-provenance.md) | complete | TP-02, TP-03 | no |
| 5 | [TP-05 Governed Network Security](TP-05-governed-network-security.md) | complete | TP-03 | no |
| 6 | [TP-06 Scoped Merged Catalog](TP-06-scoped-merged-catalog.md) | complete | TP-02, TP-03, TP-05 | no |
| 7 | [TP-07 Request and Message Builder](TP-07-request-message-builder.md) | complete | TP-02, TP-03, TP-04 | no |
| 8 | [TP-08 Wire Parser and Error Model](TP-08-wire-parser-error-model.md) | complete | TP-02, TP-05 | no |
| 9 | [TP-09 Tool Calling Contract](TP-09-tool-calling-contract.md) | complete | TP-04, TP-07, TP-08 | no |
| 10 | [TP-10 Extension, Raw Retention and Discovery Core](TP-10-extension-raw-discovery-core.md) | complete | TP-02, TP-04, TP-08 | no |
| 11 | [TP-11 Reasoning Mapping and Source Lock](TP-11-reasoning-mapping-source-lock.md) | complete | TP-04, TP-07, TP-08, TP-10 | no |
| 12 | [TP-12 Inline Think Parser and Custom Tags](TP-12-inline-think-custom-tags.md) | complete | TP-08, TP-10, TP-11 | no |
| 13 | [TP-13 Display, Persistence and Reload](TP-13-display-persistence-reload.md) | complete | TP-04, TP-08–TP-12 | no |
| 14 | [TP-14 Provider, Catalog, Profile and Diagnostics UI](TP-14-provider-settings-catalog-ui.md) | complete | TP-03, TP-06, TP-07, TP-10–TP-13 | no |
| 15 | [TP-15 Production Send and Historical Lifecycle](TP-15-production-send-history-lifecycle.md) | complete | TP-04–TP-14 | yes, after acceptance |
| 16 | [TP-16 Targeted Reset and Final Legacy Cleanup](TP-16-targeted-reset-final-cleanup.md) | complete | TP-01–TP-15 | yes |
| 17 | [TP-17 Full Acceptance and Closeout](TP-17-acceptance-closeout.md) | complete | TP-01–TP-16 | ready for independent Goal 3 review |

## Hard execution rules

1. Implement one package at a time in order unless the dependency graph explicitly permits parallel work.
2. Each package ends in one reviewable, commit-ready working-tree scope only after its own acceptance is green; Goal 2 does not create commits.
3. Never stage or overwrite unrelated dirty worktree changes.
4. No temporary alias, fallback, dual identity, LocalEndpoint bridge, Generic fixture production path, renderer/Node direct fetch, or compatibility migration.
5. TP-15 is the first package allowed to create a production-compatible outbound send.
6. TP-16 performs targeted destructive reset only after the new path is complete.
7. Update `PROGRESS_LEDGER.md` after every material implementation result and before context handoff.

## Required package completion record

For every package, the implementation Goal must record in `PROGRESS_LEDGER.md`:

- commit/working-tree scope;
- production and deleted files;
- schema/config/reset effects;
- commands and results;
- acceptance evidence;
- remaining blockers;
- stable handoff contract for the next package.
