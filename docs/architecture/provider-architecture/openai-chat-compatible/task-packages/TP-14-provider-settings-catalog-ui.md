# TP-14 — Provider Settings, Catalog and Diagnostics UI

## Goal

Expose complete multi-instance provider configuration, model catalog/profile configuration and safe diagnostics in the renderer while keeping secrets and protocol internals behind preload/IPC contracts.

## Dependencies and prerequisite state

- TP-03 through TP-07 and TP-10 through TP-13 complete.
- Registry, credential references, immutable revisions, merged catalog, request/reasoning profiles, discovery review and persistence services are stable.
- Production compatible sending remains disabled until TP-15.

## Production files and deletion scope

Add or replace compatible-provider surfaces under the existing settings, model picker and chat composer architecture, including:

- provider-instance list/create/edit/delete;
- endpoint revision editor and credential update actions;
- remote model sync/manual model editor and source-aware merged catalog;
- request parameters, extra body, response-reasoning mappings, inline custom tags and discovery review;
- connection/catalog diagnostics and model/profile picker.

Delete renderer-visible Generic/legacy compatible labels and any UI path that represents a custom cloud endpoint through OpenRouter or LocalEndpoint settings.

## Schema, config and data impact

- UI writes domain commands, never tables or secret-bearing records directly.
- Base URL, non-secret query configuration, non-sensitive headers, organization/project, model entries and versioned profiles persist through the main-owned services.
- API keys, Basic passwords and sensitive header bundles are write-only renderer inputs; renderer receives status/last-updated metadata and opaque refs only.
- Persistent plain-HTTP endpoints display a clear warning without becoming a hidden modal fallback or protocol rewrite.

## Core invariants

- Model picker identity is `providerInstanceId + modelId`; display names are not identities.
- Every editable send-affecting value produces or selects an immutable revision/profile version.
- Secret values never return to the renderer, logs, validation errors or diagnostics payloads.
- Endpoint test and model sync use TP-05 governed transport and the same revision/credential resolution as eventual send.
- Remote/manual provenance and merge conflicts are visible; unknown capabilities are not inherited from another provider.
- Discovery suggestions require explicit accept/ignore action and cannot mutate an active response profile.
- UI does not expose internal source-lock mechanics as a user-tunable per-response switch.

## Implementation steps

1. Add preload/IPC view models and commands for instance CRUD, revisioning, credential status and deletion impact.
2. Build Base URL/auth/header/query/organization/project editors with validation and secret-safe affordances.
3. Build connection diagnostics with normalized DNS/TLS/proxy/auth/HTTP errors and redacted request context.
4. Build remote `/models` sync, manual model entry and deterministic merge/conflict presentation.
5. Add explicit capability/context/pricing provenance editors; keep unknown values unknown.
6. Add request parameter, tool, response-format, extra-body and request-reasoning profile editors.
7. Add structured reasoning mapping, two D15 modes, additive custom-tag and unknown-field discovery review UI.
8. Update picker/composer state to carry provider instance, model and immutable profile/revision identities.
9. Add accessible confirmation flows for delete/reset-impact actions without exposing secret values.

## Tests and gates

- Component tests for create/edit/delete multiple instances and credential status.
- Renderer/preload contract tests proving no secret reveal operation or payload.
- Header/query deny rules, plain-HTTP warning and validation-error redaction tests.
- Catalog sync/manual merge, provenance, conflict and unknown-capability tests.
- Picker isolation tests for identical model IDs on two instances.
- Profile/version selection and discovery accept/ignore tests.
- Locale-safe tests using translation keys/stable test IDs.
- `npx tsc --noEmit --pretty false`
- `npx vue-tsc --noEmit`
- focused Vitest and i18n gates.
- `npm run gate:network-egress`
- `git diff --check`

## Acceptance criteria

- Users can create, edit, distinguish, select and delete multiple compatible cloud instances.
- Endpoint diagnostics and catalog sync actually use the selected instance revision and opaque credential reference.
- The picker cannot mix model A with endpoint/credential B.
- Every Owner-approved request/reasoning/catalog control has a reachable and test-covered UI.
- No secret is readable by the renderer.
- The compatible runtime send path is still closed.

## Prohibitions

- No API key in query strings.
- No renderer direct fetch or renderer secret cache.
- No provider/model-name heuristics for capabilities or reasoning.
- No implicit default provider, auto-created endpoint or compatibility alias.
- No LocalEndpoint or OpenRouter settings reuse.

## Suggested commit

`feat(settings): configure compatible provider instances`

## Stable contract for the next package

TP-15 receives a UI-selected immutable route input containing provider instance, endpoint revision, model, credential ref and all versioned request/response/reasoning profiles, plus complete safe diagnostics services.

## Completion evidence — 2026-07-11

- Implemented renderer-safe multi-instance provider CRUD, endpoint/security/auth/header/query/organization/project editing, write-only credentials, explicit plain-HTTP warning, governed connection diagnostics and provider deletion cleanup.
- Implemented scoped remote/manual catalog management with explicit capability/context/pricing provenance, conflicts, stale state, manual deletion and identical-model isolation by provider instance.
- Implemented immutable same-lineage profile revisioning, the two D15 modes, ordered response-reasoning mappings, custom inline policy editing and explicit discovery accept/ignore. Discovery acceptance advances every pinned profile version exactly once and confirms the old candidate in the same SQLite transaction.
- Added a configuration-only picker selection carrying provider instance, model, endpoint, credential and all request/response/reasoning/inline profile pins. It remains outside `RuntimeProviderKey`; Composer and AppChatApp both fail closed with `compatible_send_not_enabled` until TP-15.
- Closed credential lifecycle review findings: auth clear and provider deletion tombstone endpoint/provider plus credential descriptors atomically in SQLite; safe-storage failures are retried for every authoritative credential ref without route, proxy or security-policy fallback.
- Focused acceptance: 16 files / 82 tests passed. Follow-up credential/send-boundary tests: 26 tests passed. `npx tsc --noEmit --pretty false`, `npx vue-tsc --noEmit`, `npm run gate:network-egress` and `git diff --check` passed. No real external request or credential was used; production compatible chat send remained unreachable.
