# TP-06 — Provider-instance-scoped Remote and Manual Model Catalog

Status: `complete`

## Goal

Implement per-provider-instance `/v1/models` synchronization, independent manual model CRUD, deterministic merged records and one provider-neutral picker/query source.

## Dependencies and prerequisite state

- TP-02 domain/schema, TP-03 registry and TP-05 network broker complete.
- Provider instance and endpoint revision are explicit inputs.
- No production chat sending.

## Current evidence

- Existing catalog persistence uses `provider_key` and `catalog_scope_key`: `infra/db/schema.sql:625-801`.
- Atomic scoped snapshot writer behavior in `infra/db/repo/modelCatalogRepo.ts:1984-2118` is a retain candidate.
- Current scope may include Base URL/credential fingerprint, which cannot define stable compatible identity.
- Existing picker/query core can render provider-scoped sources but lacks provider-instance identity.

## Production files and deletion scope

Create a compatible catalog source/sync/merge module under:

- `src/shared/modelCatalog/providers/openai-chat-compatible/`
- `electron/modelCatalog/compatibleCatalogSyncJob.ts`
- compatible repository/query modules under `infra/db/repo/` and `src/next/modelCatalog/`.

Modify provider catalog registry/query contracts and picker view model to carry `providerInstanceId` separately from protocol key.

Reuse transaction/snapshot/query primitives only after removing provider-key/credential-fingerprint identity assumptions. Do not reuse OpenRouter metadata tagging or LocalEndpoint `/models` diagnostics.

## Schema, config and data impact

- `compatible_model_records` stores separate `(instance, model, source)` rows.
- `compatible_catalog_snapshots` and sync state distinguish attempt, failure, success and empty success.
- Manual capabilities are explicit nullable/unknown fields and never written into remote records.
- Preferences continue to be implemented later against merged identity; old preferences reset in TP-16.

## Core invariants

- Model identity remains `(providerInstanceId, modelId)` across credential or endpoint revision changes.
- Remote sync cannot update/delete manual records.
- Failure retains last valid remote snapshot; empty success is not failure.
- Same-ID merge produces one item with per-field provenance.
- Unknown stays unknown; no native provider metadata inheritance.
- Picker/query/send cannot read raw remote/manual tables directly.
- Instance A models can never resolve instance B endpoint/credential.

## Implementation steps

1. Implement bounded `/models` request through TP-05 with safe credential/header/query injection.
2. Validate response envelope and model IDs; normalize duplicates and malformed rows with diagnostics.
3. Implement transactional snapshot apply affecting only `remote_sync` rows.
4. Implement manual add/edit/delete with explicit capability metadata.
5. Implement deterministic merged query and per-field source explanation.
6. Implement stale/inactive semantics, empty success, failure/backoff, manual refresh and bounded startup sync.
7. Extend catalog IPC/client/query and existing picker source contract with provider instance scope.
8. Add provider deletion/tombstone behavior without deleting route-pinned records.
9. Add A/B isolation tests covering same modelId, credential rotation and URL edits.

## Tests and gates

- Unit merge precedence/provenance tests.
- DB remote/manual isolation, snapshot transaction, failure/empty/duplicate/malformed tests.
- Sync retry/backoff/manual refresh/startup policy tests.
- Provider deletion/tombstone tests.
- Catalog query/pagination/search/source-label tests.
- A/B endpoint/model/credential isolation integration tests.
- `npm run rebuild:node` before DB-heavy tests.
- focused catalog smoke and `npm run test:model-catalog:smoke` after verifying it targets the new source where appropriate.
- `npx tsc --noEmit --pretty false`
- `npm run gate:network-egress`
- `git diff --check`

## Acceptance criteria

- Multiple instances with identical model IDs coexist without ambiguity.
- Remote/manual conflicts merge deterministically and remain reversible/diagnosable.
- Sync failure never destroys the last valid snapshot; empty success has distinct UI state.
- One merged source feeds query and picker.
- No chat send route exists.

## Prohibitions

- No second model picker.
- No OpenRouter/OpenAI capability inheritance.
- No credential fingerprint as model identity.
- No remote writeback into manual records or vice versa.
- No LocalEndpoint catalog reuse.

## Suggested commit

`feat(catalog): add compatible scoped merged model catalog`

## Stable contract for the next package

UI and runtime receive a stable merged model selection containing protocol key, providerInstanceId and modelId, plus source/capability diagnostics independent of current credentials.
