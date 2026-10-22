# Static Review — Phase 2a: Epoch Data Root and Credentials

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22
**Review type**: Phased static review (read-only). No application code changed; nothing built, run, tested, or rebuilt.
**Baseline**: branch `codex/basic-operation-exploration`, HEAD `aec217cd`. See [phase-0.md](phase-0.md) and [phase-1.md](phase-1.md).

---

## 1. Scope and coverage

**Reviewed**
- Epoch-2 data root: `electron/data-epoch/*` (reset journal and store, reset inventory, root manifest, data/root/database coordinators, fresh DB initializer, committed bootstrap, schema-mismatch recovery and prompt, corrupt-config recovery and prompt, owned delete, Windows lease, POSIX backend, attachment blob store, config projection), `electron/bootstrap/epoch2ApplicationRuntime.ts`.
- Native addon: `native/epoch-win32/src/addon.cc`, `binding.gyp` (N-API boundary, handle lifetime, reparse handling, size limits).
- Credentials: `electron/credentials/*`, credential IPC (`generationV2CredentialSettingsIpc.ts`, `openAICompatibleV2Ipc.ts` mutation paths).
- Config persistence: `electron/config/configSchema.ts`, `electron/mainV2.ts:65-87` (`maintainConfig`, integrity), electron-store open.
- `tools/provider-key-vault` (shipping status only).

**Coordinator direct reads**: `dataEpochCoordinatorCore.ts`, `resetInventory.ts`, `resetJournalStore.ts`, `epochRootCoordinatorCore.ts`, `schemaMismatchRecoveryPrompt.ts`, `configProjection.ts:70-105`, `configSchema.ts:418-426`, plus the owner-decision document `docs/architecture/generation-compiler-v2/tp2-data-epoch-reset-credentials.md`.

**Deferred**: SQL schema, repositories, transactions (Phase 2b); attachment row/blob call sites in `generationV2ComposerIpc.ts` (Phase 5b).

---

## 2. Subagent configuration and contributions

- Two concurrent read-only Explore subagents, model `sonnet`, effort `high` (exact "Sonnet 5.5" version not confirmable through the tool).
- **2a-A** — reset journal, recovery flows, lease, fresh DB, blob store, native addon.
- **2a-B** — safeStorage, mutation queue, credential exposure, OpenAI-compatible credential storage, config schema/migration, projection, Linux permissions.
- Process note: 2a-B started two background read-only shell commands (a `grep` and an inline `node` script) that timed out. The coordinator stopped the agent after its report to ensure nothing remained running. No repo files were changed.
- The coordinator re-verified P2a-01, P2a-02, P2a-03, and P2a-04 directly against source.

---

## 3. Findings (ordered by severity)

### P2a-01 — Medium — A crash between epoch-root creation and the journal write leaves the app permanently unable to start
- **Rationale**: First-launch only and a small window, but the result is a permanent startup failure with no in-app recovery.
- **Status**: Statically confirmed; crash timing requires runtime verification.
- **Evidence**:
  - `electron/data-epoch/epochRootCoordinatorCore.ts:33-37` — at phase `config_replaced`, `ensureEpoch2RootAuthority` creates the epoch root, then `writeEpoch2ResetJournalAtomic` advances to `epoch_root_created`.
  - `electron/data-epoch/epoch2CommittedBootstrap.ts:33-36, 63-71` — any phase ≤ `config_replaced` re-enters `runEpoch2ResetThroughConfigReplacement` **before** `ensureEpoch2DatabaseCreated` (`:74`), which is the only caller path to `ensureEpoch2RootCreated`.
  - `electron/data-epoch/dataEpochCoordinatorCore.ts:85-91` — if the epoch root exists, it throws `EPOCH2_RESET_LIVE_WORKSPACE_PROTECTED`.
- **Path**: First start → journal reaches `config_replaced` → root directory created → crash or journal write failure → every later start throws at `:91` → `epoch2MainEntry.ts` shows a code-only error and quits.
- **Counterevidence**: The throw is a deliberate safety guard and no data is lost. `epochRootCoordinatorCore.test.ts` tests `ensureEpoch2RootCreated` directly, not through the bootstrap gate.
- **Repair direction**: In bootstrap, treat "`config_replaced` + marker-valid epoch root" as resumable (skip the reset, continue to `ensureEpoch2DatabaseCreated`), or let the reset accept that state.
- **Verification**: Bootstrap-level test injecting a failure after root creation, then restarting.

### P2a-02 — Medium — Schema-recovery consent text is wrong about credentials, and the user is not told where data went
- **Rationale**: The user consents to text that misstates what is reset; custom provider configuration and keys disappear without explanation.
- **Status**: Statically confirmed.
- **Evidence**:
  - `electron/data-epoch/schemaMismatchRecoveryPrompt.ts:12` — detail text says "应用配置和凭据不会被重置" ("app config and credentials will not be reset").
  - OpenAI-compatible providers, endpoints, and encrypted credentials live in the DB (`infra/db/v2/openAIChatCompatibleSchema.sql`, `electron/credentials/openAICompatibleCredentialV2Service.ts:202`), so they move to the backup with the DB.
  - The dialog does not give the backup location; after success the notice goes to stderr only (`epoch2MainEntry.ts`, `startWithSchemaMismatchRecovery`), unlike corrupt-config recovery which shows a UI notice.
  - Attachment blobs under the epoch `assets` root remain, orphaned (the new DB has no rows for them).
  - The dialog strings are hard-coded Chinese, not localized.
- **Counterevidence**: Consent is required; the default button is Exit; automatic approval requires an environment variable. The five standard provider credentials in `config.json` do survive.
- **Repair direction**: Correct the text (custom providers and their keys are reset), state the backup path, show a post-recovery notice, localize, and decide how to handle orphaned blobs.
- **Verification**: Prompt snapshot test; Electron smoke with a forced schema mismatch.

### P2a-03 — Medium (legacy upgrade only) — Legacy config projection aborts the upgrade on recoverable settings
- **Rationale**: Blocks startup for users upgrading from pre-epoch builds with valid but unmapped settings; reach depends on how many legacy installs exist.
- **Status**: Statically confirmed.
- **Evidence**:
  - `electron/data-epoch/configProjection.ts:76-86` (`legacyProxyToV2`) maps only `mode: 'system' | 'direct'`; `src/shared/network/proxyPolicy.ts:1-6` also defines `fixed_servers`, `pac_script`, `auto_detect`. `:99-102` throws `EPOCH2_CONFIG_INVALID` for anything else.
  - Similar hard failures for unrecognized credential envelopes (`EPOCH2_CREDENTIAL_INVALID`, ~`:41-49`) and malformed catalog policy (~`:106-138`).
  - The comment at `:93-95` states the intended policy is to preserve malformed proxy data so it blocks only its network scope; the legacy branch does the opposite.
- **Path**: `bootstrapEpoch2ToCommitted` → `runEpoch2ResetThroughConfigReplacement` → `prepareEpoch2ConfigReplacement` → `projectEpoch2Config` throws → only `EPOCH2_CONFIG_CORRUPT` has a recovery flow, so the app quits on every start.
- **Counterevidence**: No destructive step has run yet (journal stays at `prepared`), so data is preserved. Projection runs only during the one-time legacy reset; a renderer-writable key cannot trigger it later.
- **Repair direction**: Degrade instead of throwing (preserve or quarantine unknown values, or map legacy modes), or offer consent-gated "continue without this setting".
- **Verification**: Projection tests for each legacy proxy mode and malformed catalog/credential shapes.

### P2a-04 — Low (latent) — `safeClearConfig` cannot work in the ESM main bundle; if fixed, it would write an unprotected credential copy
- **Status**: `require` in an ESM module statically confirmed; runtime behaviour should be verified.
- **Evidence**: `electron/config/configSchema.ts:422` — `const fs = require('fs')`; `package.json` `"type": "module"`; no `createRequire` import. The resulting `ReferenceError` is swallowed by `safeClearConfig`, so `store-clear-safe` (`electron/ipc/storeIpc.ts`) clears nothing. `electron/ipc/storeIpc.test.ts` mocks `safeClearConfig`, so the real function is untested.
- **Latent issues if repaired**: The backup is a full `JSON.stringify` of config, including `providerCredentials`, written with default file mode, never cleaned up, and outside the Linux permission set. `clear()` followed by key-by-key restore is non-atomic.
- **Reachability**: No renderer caller (exposed only in `electron/preload.ts:21`).
- **Repair direction**: Remove the channel, or reimplement with atomic replace, `0600` mode, and credential keys excluded from the backup.

### P2a-05 — Low — Schema-mismatch recovery cannot resume after a crash
- **Status**: Statically confirmed; failure windows require runtime verification.
- **Evidence**: `electron/data-epoch/schemaMismatchRecovery.ts` renames sidecars (`-journal`, `-wal`, `-shm`), then the DB, then regresses the journal via `writeEpoch2ResetJournalRecoveryAtomic` (`resetJournalStore.ts:89-107`). A crash after the DB rename but before the journal regression leaves a `committed` journal with no DB; the missing-file code is not a recoverable startup code. Sidecars are moved before the main file, so a failed main rename separates them.
- **Counterevidence**: Data is safe in the backup directory; consent defaults to Exit; the window is small.
- **Repair direction**: Persist a recovery-intent record first; treat "committed + DB missing + recent backup" as resumable; roll sidecars back if the main rename fails.

### P2a-06 — Low — Corrupt-config repair has a rename window that leaves no `config.json`
- **Status**: Statically confirmed.
- **Evidence**: `electron/data-epoch/corruptConfigRecovery.ts` (`replaceConfigPreservingOriginal`): temp → rename original to backup → digest verify → rename temp into place. A crash between the last two renames leaves no config.
- **Impact**: The next start may create an empty config; the five standard credentials appear lost although the backup exists and the user is not pointed to it.
- **Repair direction**: Detect the missing-config + pending-temp/backup state and resume.

### P2a-07 — Low — Linux `0600` on `config.json` is reset by every electron-store write
- **Status**: Statically confirmed from library source; runtime verification recommended.
- **Evidence**: `node_modules/conf/dist/source/index.js` writes with `configFileMode` (default `0o666`) through `atomically`, which creates a new file with that mode and renames it over the old one. Enforcement runs only at bootstrap and around credential operations (`epoch2CommittedBootstrap.ts:84-87, 125-128`).
- **Safeguard**: `productRoot` is `0700`, so other local users cannot traverse to the file.
- **Repair direction**: Pass `configFileMode: 0o600` when constructing the store in `electron/bootstrap/epoch2ApplicationRuntime.ts`.

### P2a-08 — Low — Linux permission enforcement is an unconditional startup gate and rejects symlinks
- **Status**: Suspected; requires runtime verification.
- **Evidence**: `epoch2CommittedBootstrap.ts:84` runs it on every Linux start; `electron/credentials/linuxCredentialStoragePermissions.ts:27-40` rejects symlinked targets and non-owned files; failure throws `LINUX_CREDENTIAL_STORAGE_PERMISSION_INVALID` and the app quits.
- **Impact**: Symlinked config directories (dotfile managers), filesystems without chmod support, or root-owned leftovers prevent startup even for users with no plaintext credentials.
- **Repair direction**: Hard-fail only when plaintext records exist; resolve real paths for directories; otherwise report a diagnostic.

### P2a-09 — Low — Credential redaction helpers are not wired into any production path
- **Status**: Statically confirmed.
- **Evidence**: `electron/credentials/providerCredentialRedaction.ts` and `epoch2SafeStorageCredentialValidator.ts` have no production importers. `electron/ipc/logSanitizer.ts` has no `sk-` / `Bearer` / `x-api-key` patterns. `RawGenerationRequestStore.tryPersistProviderError` stores raw provider error bodies (up to 8 MiB) without redaction.
- **Counterevidence**: Credential code does not log; IPC returns only masked status; keys travel in headers and the debug store captures bodies, not headers. Exposure needs a provider that echoes key material in an error body.
- **Repair direction**: Apply redaction at the debug-store and IPC-error boundaries, or delete the dead modules and correct the docs that claim coverage. Phase 7 will revisit logging.

### P2a-10 — Low — Startup cleanup silently deletes unknown top-level config keys
- **Status**: Statically confirmed.
- **Evidence**: `electron/mainV2.ts:72-73` deletes every key `validateAndCleanConfig` rejects; `electron/config/configSchema.ts:133-137` allows only `ALLOWED_CONFIG_KEYS` and credential paths. A newer build's keys are removed by an older build (downgrade), with no backup. Unknown `providerCredentials.v1.<provider>` entries pass the filter but are never read or clearable. `checkConfigIntegrity` failure (`mainV2.ts:86-87`) is terminal with no recovery path (practically unreachable after cleanup).
- **Counterevidence**: Every key main currently writes is allowlisted; no present data loss was found.
- **Repair direction**: One-time `0600` backup before destructive cleanup; give integrity failure the same recovery as corrupt config.

### P2a-11 — Low — Legacy reset fails closed on large or unusual legacy directories
- **Status**: Suspected; requires runtime verification.
- **Evidence**: `native/epoch-win32/src/addon.cc` (~1533-1873; caps near 1597, 1619) aborts enumeration/delete on >100,000 entries, depth >256, >4M name characters, any reparse point, reserved names, trailing dot/space names, or case-duplicate names.
- **Impact**: The journal never reaches `legacy_files_deleted`; the app cannot start, with no remediation guidance. The fail-closed posture is correct.
- **Repair direction**: User-facing error naming the offending entry; documented manual cleanup.

### P2a-12 — Low — Re-encrypt write is coupled to credential use; keyring calls have no timeout
- **Status**: Suspected; requires runtime verification.
- **Evidence**: `electron/credentials/epoch2RuntimeCredentialService.ts:437-465` — when `decryptStringAsync` returns `shouldReEncrypt`, persisting the re-wrapped record runs under the mutation, and concurrent first uses can fail with `EPOCH2_RUNTIME_CREDENTIAL_DRIFT`; a `config.json` write failure makes a decryptable key unusable. `encryptStringAsync` (`:605`) runs inside the per-provider queue without a timeout; `credentialMutationQueue.close()` waits on it at shutdown (relates to P1-04).
- **Repair direction**: Best-effort re-wrap with retry on the latest slot; bounded keyring timeouts.

### P2a-13 — Low — POSIX lease is weaker than the Windows lease
- **Status**: Suspected; requires runtime verification.
- **Evidence**: `electron/data-epoch/posixEpochFilesystemBackend.ts` — directory + `owner.json` (pid, boot_id, start time) instead of a held lock; stale takeover is check-then-rename (racy); path identity checked at call time only.
- **Counterevidence**: Windows is the shipping platform; the pid/boot_id/start-time triple makes stale detection fairly robust.

### P2a-14 — Low — Very large blobs can terminate the process in the native addon
- **Status**: Requires runtime verification.
- **Evidence**: `native/epoch-win32/binding.gyp` sets `"ExceptionHandling": "0"`; blob put/read in `addon.cc` (~928-1242) sizes `std::vector` from the file size. No TS-side size cap was found.
- **Repair direction**: Enforce a size cap before calling native blob functions (Phase 5b will check upstream attachment limits).

### Informational and owner decisions
- **I2a-01 (owner decision)** — First start of the epoch-2 build deletes legacy `chat.db*`, `assets`, `engine-plugins`, `managed-runtimes`, `debug`, `logs`, `temp`, `workspace`, and legacy config backups without a prompt or backup, preserving only allowlisted preferences and five standard encrypted credentials. This is documented in `docs/architecture/generation-compiler-v2/tp2-data-epoch-reset-credentials.md` ("No migration, dual-read, backup, compatibility, or old-path fallback survives"). Not a defect; listed so the product owner can reconfirm it before any public release.
- **I2a-02 (design risk, Phase 2b)** — Schema mismatch has no migration path: any future `DB_SCHEMA_VERSION` change forces every upgrading user through backup-and-recreate (loss of all conversations from the live app). Phase 2b will examine versioning.
- **I2a-03** — Missing/corrupt journal with an existing epoch root fails closed safely but has no user-facing recovery.
- **I2a-04** — Orphan blobs and stale `.svtmp-*` temp files in blob buckets are never garbage-collected; there is no blob delete API.
- **I2a-05** — Cleared credentials leave residue: no `PRAGMA secure_delete`, so cleared OpenAI-compatible payloads may persist in free pages/WAL; recovery backups keep original config/DB copies that `clearCredential` cannot remove.
- **I2a-06** — `tools/provider-key-vault` is dev-only and not shipped (not in `build.files`, no app imports).

---

## 4. Reviewed with no actionable finding

- **Reset gating**: A lost/corrupt journal or manifest never triggers the destructive legacy reset — TS `lstat` gate (`dataEpochCoordinatorCore.ts:85-91`), native `reject_epoch_2_child`/`protected_epoch` checks, and a transition fence all fail closed.
- **Journal**: monotonic, adjacent-phase transitions (`resetJournalStore.ts:46-68`); the only regression path is the schema-recovery writer with strict preconditions (`:89-107`); strict decoders with size caps and fatal UTF-8.
- **Atomic writes**: journal via temp + flush + rename-replace; manifest no-replace; blobs temp + flush + re-hash + no-replace rename.
- **Windows lease**: exclusive lock file plus `Local\` mutex; OS releases on crash; runtime loss detected by `assertCurrent` → `verifyPathIdentity`.
- **Fresh DB**: single `BEGIN IMMEDIATE`; empty DB re-initializes; `databaseFileId` identity check (`epoch2CommittedBootstrap.ts:115-118`). The SIGKILL test hook (`freshEpochDatabaseInitializer.ts:151-164`) is guarded by `!app.isPackaged`.
- **Blob store**: blob-then-row ordering (orphans only); size and hash re-verified on read; closed `sha256/xx/<64hex>` namespace (no traversal).
- **Native addon**: handle-relative `NtCreateFile` with `FILE_OPEN_REPARSE_POINT`; any reparse point aborts; identity re-verified before delete; RAII handles; no memory-safety defect found at the N-API boundary.
- **safeStorage**: no automatic plaintext fallback; Linux requires `gnome_libsecret`/`kwallet*`; plaintext only via explicit user choice on Linux with a warning; decrypt failure never deletes ciphertext.
- **Mutation queue**: same-provider mutations serialized; `expectedRevision` yields `STALE_REVISION`, not lost updates; `close()` drains queued work.
- **OpenAI-compatible credentials**: encrypted by default; credential and provider rows written in one transaction; provider delete removes credentials.
- **Credential exposure over IPC**: status only (`maskedApiKey: '***'`); store IPC blocks credential paths; `crashReporter` not started.
- **Corrupt-config repair**: original preserved and digest-verified; fresh config is consent-gated and states credentials are not loaded.

## 5. Uncertainties and rejected false positives

- Rejected: SIGKILL smoke hook reachable in production; missing journal triggering destructive reset; owned delete following junctions; stale Windows lease after crash; blob ID traversal; schema recovery without consent; revision reuse after clear/restart (scope IDs are random); OpenAI-compatible create/update non-atomic across stores; `close()` dropping queued mutations; silent plaintext fallback.
- Uncertain: whether any main-process startup path throws on a renderer-written `catalogPolicyV2` (not exhaustively traced); exact Electron/`atomically` behaviour for P2a-07; addon limit behaviour on real legacy profiles (P2a-11).

---

## 6. Next phase

Phase 2b — DB and repositories (`infra/db/v2/*.sql`, schema composer and versioning, `infra/db/repo/*`, transactions, deletion, memory/durable consistency, raw-request debug store, legacy `src/next/persistence`). Not started.
