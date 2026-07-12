# TP-16 — Targeted Destructive Reset and Final Legacy Cleanup

Status: complete (2026-07-11). Exact legacy provider/source/config state is previewable and confirmation-gated; ambiguous conversation ownership is reported and never deleted. Synthetic mixed-data, rollback, idempotence, config interruption, secure-ref retry, fresh-schema and negative-source gates are green. No real user data was reset.

## Goal

Delete incompatible persisted state and the final legacy/alias/fallback code only after the canonical runtime is complete, while preserving unrelated native-provider, LocalEndpoint, project and asset data.

## Dependencies and prerequisite state

- TP-01 through TP-15 complete.
- Fresh schema boots independently and canonical sends/reloads pass without reading legacy state.
- A deterministic census can identify incompatible compatible-provider rows and secure-storage records.

## Production files and deletion scope

Delete the remaining compatibility-only migrations, aliases, guards, fixtures, fallback branches, deprecated store keys and dead source paths named in TP-01. Add only the bounded reset command/service, dry-run report and negative legacy-presence gates required by the Owner decision.

## Schema, config and data impact

Repository evidence clarification: the deleted Generic implementation was fixture-only and never wrote production route provenance. A providerless conversation or an OpenRouter conversation therefore cannot be proven to be legacy-compatible from its missing provider or model/Base-URL text alone. Such rows are included in the redacted census as `ambiguous` with destructive action `stopped`; they are not deletion targets. Only exact legacy identity recorded in a confirmed ownership column may be deleted.

Targeted deletion includes only records that cannot satisfy the new canonical identity/provenance contracts, such as:

- legacy compatible provider aliases and OpenRouter custom-endpoint identities;
- providerless or legacy-fallback compatible conversations/messages/streams;
- incompatible endpoint/profile/catalog/preference/cache rows;
- obsolete credential refs and orphaned compatible secure-storage entries;
- deprecated compatible localStorage/electron-store/config keys.

Preserve native OpenAI/OpenRouter/DeepSeek/Anthropic/Gemini data, the independent LocalEndpoint product, unrelated conversations, projects, assets and attachments. No historical conversion is attempted.

## Core invariants

- Reset is predicate-based, previewable, transactional where storage permits and idempotent.
- Secure-storage cleanup follows committed database/config deletion and can be safely retried.
- A false-positive deletion of unrelated provider or LocalEndpoint state is a release blocker.
- No legacy reader, migration, alias, fallback or dual-write remains after reset.
- Fresh-install and post-reset schemas are behaviorally identical for the canonical provider.

## Implementation steps

1. Implement a read-only census grouped by database table, config namespace, cache and secure-store key.
2. Freeze exact inclusion/exclusion predicates and produce a redacted dry-run count report.
3. Implement transactional database/config cleanup with rollback on failure.
4. Implement idempotent orphan credential cleanup without revealing values.
5. Remove deprecated compatible migrations, readers, dual writes, aliases and fallbacks.
6. Remove runtime-dead Generic fixtures/tests and any temporary compatibility guard no longer needed.
7. Add source and schema negative gates for all prohibited identities and fallback symbols.
8. Compare fresh-install and reset-existing behavior using synthetic fixtures only.

## Tests and gates

- Dry-run determinism and exact predicate tests.
- Mixed-data fixtures proving unrelated native provider and LocalEndpoint preservation.
- Transaction rollback, interruption and idempotent rerun tests.
- Orphan secure-ref cleanup tests with mock secure storage.
- Fresh boot versus post-reset canonical equivalence tests.
- Negative full-repository searches for every alias, deprecated API and fallback.
- Run `npm run rebuild:node` before schema/repository tests.
- `npx tsc --noEmit --pretty false`
- focused migration/reset Vitest.
- `npm run gate:network-egress`
- `git diff --check`

## Acceptance criteria

- Only the documented incompatible compatible-provider state is deleted.
- Native providers, independent LocalEndpoint and unrelated user data are demonstrably preserved.
- Running reset twice is safe and leaves no additional target state.
- No legacy compatible identity, migration, fallback, dual-write or runtime-dead implementation remains.
- Fresh schema and reset result satisfy the same canonical contracts.

## Prohibitions

- No whole-database wipe.
- No historical migration or compatibility reader.
- No deletion based only on display name, model ID or unscoped URL substring.
- No secret-value logging or renderer exposure.
- No preservation shim for old provider keys.

## Suggested commit

`refactor(provider): remove legacy compatible state`

## Stable contract for the next package

TP-17 receives a single canonical implementation, clean persisted-state boundary, explicit preservation proof and a repository-level list of prohibited legacy symbols that must remain absent.
