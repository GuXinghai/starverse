# Repair Phase 4b: catalog consistency and settings saves

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-24

This is the second part of repair Phase 4 (effective-rule refresh and configuration consistency, D-6) from [repair-plan.md](repair-plan.md) section 3. It covers the two items left after [repair-phase-4a.md](repair-phase-4a.md):

- **R4-08:** catalog policy persists, unchanged content does not bump revisions, a stale `syncing` row recovers, picker queries do not discard each other.
- **R4-09:** settings saves cannot overwrite unloaded values, partial saves are reported, panel races are guarded, one undecodable rule row does not block every save (D-4).

Each fix has a test that names its finding or item ID, and each was checked against the reverted source (section 3).

- No provider or network requests were made. Tests used in-memory databases, synthetic catalogs and synthetic rule rows.
- D-4 holds: a failure in one row, owner or step is isolated and reported; nothing was deleted to make a check pass.
- D-6 and D-8 are untouched in this phase.

## 1. Scope and repository state

| Item | Value |
|---|---|
| Branch | `codex/static-review-repairs`, on top of `d25470d4` (Phase 4a) |
| Untouched working-tree content | `world_map_experiment/__pycache__/` (untracked, preserved, not committed) |
| Subagents | Two read-only Sonnet mapping agents ran before implementation (R4-01 activation/revision map; verification of R4-05..R4-09 findings). No subagent edited files; all conclusions and every edit are the coordinator's |

## 2. Changes by item

### R4-08: catalog policy, revisions, stuck `syncing`, picker sequencing

**P1-01 (+P3a-03): catalog policy now persists.** `electron/ipc/storeIpc.ts` accepted only a fixed list of config keys, so the per-provider `policyV2` key written by the settings panel was refused and the choice was lost on restart. The allowlist now also accepts `providerCatalog.<registered provider key>.policyV2`, and only for a registered key. A write must decode as a catalog policy (`isCatalogPolicyV2`); anything else is refused. `providerCatalog` is not a prefix pass-through, so no other sub-key is reachable.

**P3a-02 + P3a-14: unchanged content no longer looks like a new catalog.**
- *Cause:* every provider source stamps its own fetch time into each item, at several depths (`firstSeenAtMs`, `lastSeenAtMs`, `syncedAtMs`, `fetchedAtMs`, `updatedAtMs`, `observedAtMs`). The snapshot digest covered those, so a refresh that returned the same models produced a new digest and a new snapshot. Every open send then failed with `ACTIVE_CATALOG_CHANGED`.
- *Digest:* `infra/db/repo/catalogSnapshotDigestV2.ts` hashes the items with those keys removed recursively. Tests with fake clocks cover Anthropic, DeepSeek, Google, OpenAI and OpenRouter: the same models fetched at a different time keep the digest, different models change it.
- *Revision policy:* `authority_revision` now moves only when the **active snapshot changes**: an automatic commit with a different digest, `applyPendingSnapshot`, and the scope clears. It no longer moves on `beginSync`, `failSync`, a manual (staged) commit, an unchanged-content commit or `discardPending`.
- *Immutability check:* when the digest already exists, the stored row is reused. Counts, codec, completeness and adapter revision must match, and if the raw JSON differs only in the fetch-time keys it is accepted; any other difference is still `STATE_INVALID`.
- *Item identity:* each item must carry `providerKey`, `modelId`, `modelKey === providerKey::modelId`, and any embedded observation must match the same provider and native model id.

**P3a-05: a scope stuck in `syncing` recovers.**
- `CatalogScopeCoordinatorV2` races the adapter against an abort promise, so an adapter that ignores the abort signal still ends in a failed attempt and the scope can sync again.
- `ModelCatalogV2Repo.recoverInterruptedSyncs()` returns a `syncing` row left by a dead process to `idle` (or `ok` when a catalog is active) and clears its attempt id. It runs once when the availability IPC registers; a failure there is logged, not fatal.

**P6a-07: picker queries do not discard each other.**
- *Renderer store:* a mutation (apply or discard) is current iff its own mutation token matches. It no longer also needs the query token or an unchanged authority revision, so a query that lands first no longer strands the route in `syncing`. A query token still needs both.
- *Picker:* `fetchPage` kept one global sequence number, so a single-provider refresh discarded an in-flight all-provider fetch. It now tracks ownership per provider: each result is applied only for the providers this call still owns, and loading and hydrating state follow the count of fetches in flight.
- *Apply/discard failures:* a rejected service call is converted into the existing failure branch (`MODEL_CATALOG_RENDERER_APPLY_FAILED` / `…DISCARD_FAILED`).

### R4-09: settings saves, partial saves, panel races, undecodable rule rows

**P6a-02: the proxy panel cannot overwrite what it never loaded.** `NetworkProxySettingsPanel.vue` has a `loaded` flag. After a failed load its controls are disabled and `save()` persists nothing, so the default draft can no longer replace the stored proxy settings.

**P6a-03: partial saves are reported.** `SettingsPanel.vue` validates the catalog draft before writing anything, then writes in a fixed order with the proxy apply last. A failure announces what was already saved and what was not, and skips the later writes. A rejected provider-override write is shown instead of "saved". A rejected proxy apply no longer stops the other settings from being saved. New `settings.runtime.*` strings exist in `en-US` and `zh-CN` and in the message schema.

**P6a-05: compatible-provider panel.** `compatible/CompatibleProviderSettingsPanel.vue`:
- *Snapshot:* `save()` reads the provider id, name, auth mode, credential and whether a new secret was typed before its first `await`, so a change made while the request is in flight cannot alter what is sent.
- *Selection:* instance rows are disabled while a request runs, and model, discovery, diagnostics and sync results are applied only if the instance they were requested for is still selected.
- *Failures:* test connection, credential delete, discovery ignore and accept, manual add and manual delete now report an error instead of ending as an unhandled rejection. Accepting a discovery field with an unreadable reasoning profile reports the parse error and sends nothing.
- *Silent drops:* a username-only edit of basic credentials is refused with `compatible_basic_password_required` instead of being dropped. A manual context length or output limit must be a positive integer; anything else is refused with `compatible_manual_limit_invalid` instead of reaching main as NaN, a negative number or a fraction.

**P3a-07: one undecodable rule row no longer blocks every save (D-4).**
- *Cause:* persisted rule state is re-derived strictly on read. A row that no longer decodes (a decoder tightened by an update, or damage) made every listing throw, and listings sit on the save path.
- *Fix:* `listReadableOwnershipSnapshots()` on the V1 and V2 core repos returns the rows that decode and names the ones that do not. User-rule saves, request-rule publication (prepare and write sides), and the materialization stage and prepare steps use it, so both sides of each compare see the same set. The unreadable row is **left in place, untouched**, and a warning names its owner.
- *Draft:* `readDraftHeader()` reads the draft's identity without decoding its content, and `cancelDraft` and `discard` use it, so a draft that no longer decodes can still be cancelled.
- *Not deleted:* nothing is deleted or rewritten automatically. The affected owner's rules are simply not part of the publication until the row is repaired.

## 3. Tests added or changed

| File | IDs | Change |
|---|---|---|
| `electron/ipc/storeIpc.test.ts` | P1-01, P3a-03 | 3 new: every registered provider's policy key reads, writes and deletes; `providerCatalog` is not a prefix pass-through; an undecodable policy is refused |
| `infra/db/repo/catalogSnapshotDigestV2.test.ts` (new) | P3a-02 | 10 tests: for each of 5 providers, same models at another time keep the digest, different models change it |
| `electron/services/catalogScopeCoordinatorV2.revision.test.ts` (new) | P3a-02, P3a-14, P3a-05 | 4 tests: unchanged catalog keeps digest, snapshot and revision; only active changes move the revision; a hung adapter ends in an error and the scope syncs again; a dead `syncing` row is recovered at startup |
| `src/next/modelCatalog/catalogRuntimeStoreV2.test.ts` | P6a-07 | 1 new: a mutation result survives a query that landed first, and an older query is still discarded |
| `src/ui-app/components/ModelPickerDialog.test.ts` | P6a-07 | 1 new: a single-provider refresh does not discard the slower providers of a running fetch |
| `src/ui-app/components/NetworkProxySettingsPanel.test.ts` | P6a-02 | 2 new: failed load disables and saves nothing; a loaded draft still saves |
| `src/ui-app/components/SettingsPanel.test.ts` | P6a-03, P1-01 | 5 new: rejected override shown; accepted override written once; mid-save failure report; proxy last; invalid draft rejected before any write |
| `src/ui-app/components/compatible/CompatibleProviderSettingsPanel.test.ts` | P6a-05 | 14 new (9 tests plus 5 cases of one `it.each`): snapshot at click, username-only basic edit, rows disabled while busy, late model and discovery lists ignored, five failure paths reported, invalid manual limits refused |
| `electron/services/userCapabilityRulesV2Service.test.ts` | P3a-07 | 2 new: a user save succeeds beside an undecodable owner row, which is left in place; an undecodable draft is cancelled by identity |

The undecodable fixtures are valid JSON that satisfies the table's own CHECK constraints but carries a field a later decoder no longer accepts, which is the shape an upgrade produces.

**Assertions changed because they encoded a superseded policy** (each has an explanatory comment in the test; the old policy bumped the authority revision on every state change):

1. `infra/db/repo/modelCatalogV2Repo.test.ts`, after a failed sync: revision 4 → 2.
2. `infra/db/repo/modelCatalogV2Repo.test.ts`, after applying a pending snapshot: revision 5 → 3.
3. `infra/db/repo/modelCatalogV2Repo.test.ts`, after `clearCurrent`: revision 7 → 4.
4. `infra/db/repo/modelCatalogV2Repo.test.ts`, after `clearAllScopes`: revision 10 → 6.
5. `electron/services/catalogScopeCoordinatorV2.test.ts`, after the first failed attempt: revision 2 → 1.

No other existing assertion was changed. The only other edit to an existing test line is the `vi` import added to `userCapabilityRulesV2Service.test.ts`.

**Mutation checks.** Each new test was run with its source reverted (or, for the digest, with the key filter disabled), failed for the stated reason, and passed after restore:

| Reverted source | Failing tests |
|---|---|
| `storeIpc.ts` | 1 of 3 (the provider-policy round trip) |
| `NetworkProxySettingsPanel.vue` | 1 of 2 (failed load saves nothing) |
| `SettingsPanel.vue` | 3 of 5 |
| `catalogRuntimeStoreV2.ts` | 1 of 1 |
| `ModelPickerDialog.vue` | 1 of 1 |
| `catalogScopeCoordinatorV2.ts` + `modelCatalogV2Repo.ts` | 4 of 4 |
| digest key filter disabled | 5 of 10 (the "same models" case for each provider) |
| `CompatibleProviderSettingsPanel.vue` | 14 of 14 |
| `userCapabilityRulesV2Service.ts` + draft repo + request-rules repo | 2 of 2 |

The other tests in those files are positive controls or pass at HEAD by design.

## 4. Checks run

| Check | Result |
|---|---|
| Touched and new tests, scoped runs | pass (storeIpc, NetworkProxy, SettingsPanel, store, picker, coordinator and repo, digest, compatible panel 26, user rules 16) |
| Mutation checks | every new test fails without its fix (counts in section 3) |
| `npx vue-tsc --noEmit` | exit 0 |
| `node scripts/check-test-partitions.mjs` | PASS (unit 364, ui 91, integration 221) |
| ESLint on changed files | 0 errors, 47 warnings (function length and complexity) |
| Unit partition | 10 failing, baseline 13; no new failure |
| UI partition | 14 failing, baseline 18; no new failure |
| Integration partition | 36 failing, baseline 40; no new failure |
| Offline isolated Electron smoke (profile outside the repository, deleted afterwards) | starts cleanly, renderer snapshot taken; the only log diagnostics are the expected offline GitHub requests of the cloud-rules candidate check |

The baseline failures are the pre-existing red CI in files this phase did not touch (mostly 5 s timeouts). The names that failed in the baseline and passed in this run are timing flakes, not fixes made by this phase. No real provider request was made.

## 5. Limitations

- **Digest change on upgrade.** The digest definition changed, so the first refresh of an existing database creates one new snapshot for each scope, and the revision moves once.
- **Reused snapshots keep their first fetch time.** When a refresh returns the same content, the stored snapshot is reused, so its stored fetch timestamps are those of the first fetch; the scope's `lastSucceededAtMs` does advance.
- **Recovery runs at registration.** `recoverInterruptedSyncs` runs when the availability IPC registers; a failure there is only logged.
- **Proxy panel has no retry** after a failed load; reopening Settings reloads it.
- **P6a-07, filter part not changed.** The finding also noted that catalog rows bypass the client text filter. That part was not changed.
- **Picker apply/discard catch** has no dedicated picker test; the store test covers the token rules and the catch converts into an existing, tested failure branch.
- **Undecodable owner rows are skipped, not repaired.** The affected owner's rules are absent from the next publication until the row is fixed, and there is no in-app way to inspect or repair it. The user's own committed row is still read strictly, so an undecodable **user** row (as opposed to another owner's) still fails `openDraft` and `saveDraft`; that needs a quarantine design and was not attempted.
- **Undecodable draft has no UI path.** `cancelDraft` works by identity, but the renderer learns the identity from `readDraft`, which still throws for such a draft. A control that exposes the identity needs a new channel and panel work.
- **Other strict listings remain.** The cloud-rules application service still lists owners strictly; it is not on a user-save path.
- **Not observed at runtime:** a real sync, a real picker refresh and a real settings save against provider data. Offline mode allows no provider request, so these are covered by the tests in section 3 only.

## 6. Deferred work

- Phase 5: files, conversation actions and content correctness (R5-01 to R5-03 and the rest of that table).
- A quarantine design for an undecodable user owner row, and an in-app route to a draft that no longer decodes (see section 5).
- R6-04: signature checking for cloud rule releases (P3a-01), referenced by OQ-4.
- The R2-06 follow-ups R2-06a–e stay tracked separately.
