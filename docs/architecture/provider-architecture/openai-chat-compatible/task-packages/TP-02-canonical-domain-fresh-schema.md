# TP-02 — Canonical Domain Model and Fresh Schema SSOT

Status: `complete`

## Goal

Introduce the provider-neutral domain types and fresh SQLite schema for the canonical `openai_chat_compatible` system, without registry UI, network calls or production sending.

## Dependencies and prerequisite state

- TP-01 complete and merged.
- No old compatible identity or fixture remains.
- Existing fresh schema/runtime bootstrap behavior is characterized before changes.

## Production files and deletion scope

Create a dedicated module such as `src/shared/provider/openai-chat-compatible/` containing canonical IDs, validated domain types, JSON validators and repository contracts.

Modify:

- `infra/db/schema.sql` as the sole fresh-schema definition.
- `infra/db/types.ts`, `infra/db/validation.ts`, `infra/db/dbMethodsRegistry.ts`.
- `infra/db/worker/runtime.ts` and `infra/db/worker/handlers/convoMessageHandlers.ts` only to register new repositories and remove duplicate bootstrap schema creation.
- `src/next/ipc/contracts/dbBridgeContracts.ts` for typed non-secret records.

Add repository modules/tests for provider instances, immutable revisions/profiles, model sources, sync state, route provenance, route choices, discovery and raw extension records.

Delete any upgrade/source-guard logic that would independently create or reshape these new tables. Do not delete unrelated native-provider migrations.

## Schema, config and data impact

Implement the tables and constraints in Master Plan Section 5. All profile/mapping/revision records are immutable and versioned. Secrets are references only. Provider deletion uses a tombstone; referenced revisions/profiles use `RESTRICT`; dependent non-routed drafts may cascade only where explicitly safe.

No legacy migration is written. TP-16 will perform targeted reset of old data.

## Core invariants

- `openai_chat_compatible` is the only protocol key.
- IDs are opaque and immutable; names/URLs never act as IDs.
- Every JSON column validates at write and IPC boundaries.
- Fresh schema is the single structural SSOT.
- SQLite contains no bearer token, password or sensitive header value.
- Provider/model identity is `(providerInstanceId, modelId)`.
- Versioned records cannot be mutated in place after use.

## Implementation steps

1. Define branded/validated IDs and every domain object listed in Master Plan Section 4.
2. Define lifecycle/status enums and renderer-safe projections.
3. Add all fresh tables, FKs, unique constraints, checks and indexes.
4. Add repository interfaces and transaction boundaries without live runtime callers.
5. Add JSON schemas for auth descriptors, ordinary headers/query, profiles, mappings, diagnostics and bounded raw values.
6. Make runtime bootstrap consume `schema.sql` rather than duplicating new DDL.
7. Add schema-introspection tests and compile-time exhaustiveness tests.
8. Add explicit tests proving secret-like fields are rejected from SQLite inputs.

## Tests and gates

- Run `npm run rebuild:node` before DB-heavy tests.
- Fresh empty DB schema tests: tables, columns, FKs, indexes, check constraints.
- Repository CRUD/version immutability/tombstone/restrict/cascade tests.
- JSON validation and secret-boundary tests.
- `npx tsc --noEmit --pretty false`
- `npm run verify:ssot`
- `npm run gate:network-egress`
- `git diff --check`

## Acceptance criteria

- A fresh DB can create and round-trip every non-secret domain record.
- Invalid references, duplicate revisions/source rows and mutable-version updates fail.
- Schema/runtime bootstrap cannot drift through a second new-provider DDL path.
- No network/UI/send behavior exists.
- ABI reporting follows AGENTS.md and final target is Node after DB tests.

## Prohibitions

- No old schema compatibility migration.
- No raw secrets in test snapshots or SQLite.
- No production provider registration or send path.
- No Generic or LocalEndpoint type reuse.
- No JSON-only replacement for relational identity/FKs.

## Suggested commit

`feat(provider): add compatible domain and fresh schema`

## Stable contract for the next package

TP-03 receives immutable provider/endpoint/profile/credential descriptor types, validated repository APIs and a fresh-schema SSOT suitable for secure registry construction.
