# TP2 — Data epoch, destructive reset, and credentials

Primary code baseline: `main@6fb6ad59a9cb`; `[HEAD-only]` marks transition data introduced by `067171a4c4d5`. Verified 2026-07-13.

## Scope

Define a one-time, crash-safe V2 data epoch that deletes all legacy generation/workspace state and preserves only explicitly approved shell preferences and five standard encrypted provider credentials. No migration, dual-read, backup, compatibility, or old-path fallback survives.

## Current evidence and reset boundary

| Store/root | Code evidence | Required epoch action |
|---|---|---|
| `%APPDATA%\Starverse\workspace\epoch-2\starverse.db{,-wal,-shm}` | Owner decision; current DB path is still `electron/main.ts:789-798` | Create as the sole V2 primary DB family after reset commit; never alias it to current `userData/chat.db`. |
| `<userData>/chat.db{,-wal,-shm,-journal}` | `electron/main.ts:789-798`; `infra/db/schema.sql:17-919` | Delete entire legacy family; never open it as V2. |
| `<userData>/config.json` and backups | `electron/config/configSchema.ts:68-144,376-438` | Atomically filter strict leaf whitelist; delete `config.backup.*` and corruption backups. Do not call `safeClearConfig()`. |
| assets/blobs/original/derived | `infra/db/worker/runtime.ts:337-338`; `electron/main.ts:494-506`; `infra/files/fileStoragePaths.ts:5-68` | Delete epoch-owned roots. |
| DFC sandbox, engine plugins, managed runtimes | `infra/files/derivativeJobService.ts:531-595,688-728`; `infra/db/worker/runtime.ts:80-93,397-402`; managed runtime path files | Delete with old workspace because registry is in erased DB; preservation would require forbidden rehydration/migration. |
| Raw Request debug DB `[HEAD-only]` | `electron/debug/rawGenerationRequestStore.ts:108-126`; `electron/main.ts:1051` | Close and delete independently. |
| default Electron partition | main window/provider transport | Clear localStorage and HTTP cache; retain `persist:intra-links` browser partition (`electron/services/inappBrowser.ts:242-250`). |
| logs and app temp | `electron/main.ts:60`; `electron/ipc/imageIpc.ts:238-253`; derivative runners | Delete only proven app-owned roots; future temp must be epoch-owned. |

Current reset paths are insufficient and must be removed:

- dev DB rebuild: `electron/main.ts:681-748` deletes only SQLite family and production skips it.
- `DbWorkerManager.reset()`: `electron/db/workerManager.ts:261-330` is dev-only and DB-only.
- `store-clear-safe`: `electron/ipc/storeIpc.ts:52-59,112-121` preserves credential roots and `safeClearConfig()` creates a complete backup.
- standalone scripts `scripts/db-reset.cjs`, `scripts/clear-all-data.js`, `scripts/clear-all-data-standalone.cjs` hardcode incomplete paths and lack ownership/journal safety.

There is no current `data_epoch`, external marker, journal, lock, or app-root ownership marker. Production schema mismatch handling also cannot protect downgrade: `electron/main.ts:709-712` and `infra/db/worker/runtime.ts:260-310` allow an old binary to open the shared `chat.db` path.

## Credential contract

`safeStorage` encrypts/decrypts; ciphertext is stored under config leaf records. Canonical provider IDs, prefix, record shape, and exact leaf enumeration are defined by `electron/credentials/providerCredentialService.ts:6-30,83-101`. Main injects only `electron_safe_storage` and does not enable plaintext fallback (`electron/main.ts:639-646`).

Preserve only schema-valid records with backend `electron_safe_storage`:

```text
providerCredentials.v1.openrouter
providerCredentials.v1.openai_responses
providerCredentials.v1.google_ai_studio
providerCredentials.v1.anthropic
providerCredentials.v1.deepseek
```

Delete:

- legacy plaintext keys: `openRouterApiKey`, `openAIResponsesApiKey`, `googleAIStudioApiKey`, `anthropicApiKey`, `deepSeekApiKey`, `geminiApiKey`, `apiKey`;
- `openRouterBaseUrl`, catalog HMAC `openRouterCatalogLocalSecret`, custom headers/endpoints;
- every `[HEAD-only] compatibleCredentials.v1.*` record and descriptor;
- any plaintext fallback record under a canonical leaf;
- every backup containing old data.

This is consistent with `docs/architecture/provider-architecture/SECURE_CREDENTIAL_STORE_V1.md:5-8`; its legacy migration-readable language at `:42-60` is deletion material for V2.

## Normative decisions

1. V2 uses the Owner-frozen Windows workspace root `%APPDATA%\Starverse\workspace\epoch-2\`. The only primary SQLite family is `starverse.db`, `starverse.db-wal`, and `starverse.db-shm`; assets, runtimes, plugins, logs, Raw Debug, temp, marker, lock, and journal are children of this managed root or explicitly inventoried app-owned reset roots.
2. V2 never opens legacy `<userData>/chat.db`, any legacy `chat.db` family, or an old asset directory. Old binaries may recreate legacy data without touching epoch 2; V2 detects and safely clears proven legacy roots before opening epoch 2, and fails closed when ownership cannot be proved.
3. Reset executes before DB worker, raw store, IPC, renderer window, catalog jobs, or orphan recovery.
4. Journal contains only epoch, operation id, phases, and path digests—never config, ciphertext, or secret values.
5. Old config remains untouched until filesystem deletion succeeds. Final phase builds a filtered temp config, flushes it, atomically replaces `config.json`, deletes backups, and commits external marker.
6. Every delete target requires canonical path containment, app identity marker, root/home/repo rejection, and symlink/junction/reparse-point defense. Unknown ownership fails closed.
7. Fresh DB is created from V2 schema only; no legacy ensure/migration helpers run. Seed only system rows and `app_meta.data_epoch=2`.
8. Epoch failure prevents generation IPC/window startup. Restart resumes the journal idempotently.

## Startup and transaction flow

```text
single-instance + app identity
-> app.whenReady
-> EpochCoordinator.acquireLock
-> verify root marker / canonical paths
-> resume-or-create reset journal
-> close handles
-> delete legacy DB/assets/debug/config backups/default-partition data
-> atomic filtered config replace
-> create V2 root + marker
-> create fresh V2 DB and epoch row
-> commit external marker and journal
-> start DB worker
-> recover only V2 orphan operations
-> start Raw Debug, proxy, IPC, window, catalog jobs
```

## Files

Add:

- `electron/data-epoch/dataEpochCoordinator.ts`
- `electron/data-epoch/rootManifest.ts`
- `electron/data-epoch/resetJournal.ts`
- `electron/data-epoch/nativeOwnedDelete.ts`
- `electron/data-epoch/win32EpochRootLease.ts`
- `native/epoch-win32/*`
- crash-injection and packaged smoke fixtures.

Modify:

- `electron/main.ts`, config schema, credential service, raw debug close lifecycle;
- `infra/db/schema.sql`, `schemaVersion.ts`, worker runtime;
- `electron-builder.json5`; temp-root producers and default-session bootstrap.

Delete after cutover:

- three standalone reset scripts;
- `DbWorkerManager.reset()` and its old DB-only test;
- legacy config migrations/cleanup and schema ensure/migration helpers;
- targeted compatible reset service/IPC/handlers/tests;
- provider/model/generation config keys and renderer storage fallback.

## Exact preservation example

```json
{
  "language": "zh-CN",
  "languageManual": true,
  "theme": "dark",
  "fontSize": 15,
  "windowBounds": {"x": 100, "y": 80, "width": 1400, "height": 900},
  "windowMaximized": false,
  "sidebarWidth": 280,
  "sidebarCollapsed": false,
  "analyticsEnabled": false,
  "providerCredentials": {"v1": {
    "openrouter": {"backend":"electron_safe_storage","ciphertext":"<copied bytes>"},
    "openai_responses": {"backend":"electron_safe_storage","ciphertext":"<copied bytes>"},
    "anthropic": {"backend":"electron_safe_storage","ciphertext":"<copied bytes>"},
    "google_ai_studio": {"backend":"electron_safe_storage","ciphertext":"<copied bytes>"},
    "deepseek": {"backend":"electron_safe_storage","ciphertext":"<copied bytes>"}
  }}
}
```

No other ancestor key is copied wholesale.

## Tests

- Exact root/store census and dry-plan snapshot.
- Marker/appId/epoch/root-id mismatch, root/home/repo/UNC escape, symlink/junction/reparse escape.
- Lock contention, stale lock, crash at every phase, repeated recovery.
- Complete deletion of SQLite family/assets/debug/logs/sandboxes/config backups.
- Exact five encrypted leaves preserved; plaintext, custom endpoint, compatible credential and backup secrets absent.
- Default localStorage/cache cleared while `persist:intra-links` remains.
- External sentinel remains untouched under every failure.
- Fresh DB contains only V2 schema/epoch/system seed; old path never opened.
- Reset failure creates no window/generation IPC/catalog sync.
- Packaged first-start reset and second-start idempotency.

Database-heavy tests must run after `npm run rebuild:node`; packaged Electron smoke is last after `npm run rebuild:electron`.

## Acceptance

- One auditable reset entry, one epoch root, one journal, one lock.
- Every legacy owned store is deleted or explicitly outside scope; no unlisted generation/workspace persistence remains.
- Five standard credentials decrypt after reset; all legacy/custom credentials and generation defaults are gone.
- An old binary cannot open or modify V2 workspace.
- Any unsafe/ambiguous target or failed phase blocks startup and is resumable.

## Goal 2 prerequisites / Owner decisions

| Blocking decision | Required resolution |
|---|---|
| Stable application identity | Resolved by Owner: production is exactly `appId=io.github.guxinghai.starverse`, `productName=Starverse`, package name `starverse-client`. `.dev`/`.e2e` are the only Electron/OS application-ID variants; ordinary launches explicitly share `%APPDATA%\Starverse`, a non-empty explicit `--user-data-dir` remains a smoke/diagnostic override, and managed root marker/ownership/reset validation always use the production appId. `com.starverse.desktop` is not migrated or recognized. |
| Fixed epoch root | Implement exactly `%APPDATA%\Starverse\workspace\epoch-2\starverse.db`; same-path or renamed legacy `chat.db` reuse is forbidden. |
| Managed runtimes/plugins | Clear them with the legacy workspace. Their registry is erased, so preservation would require the forbidden rehydration/migration path. |
| Preserved preferences | Preserve only `language`, `languageManual`, `theme`, `fontSize`, `windowBounds`, `windowMaximized`, `sidebarWidth`, `sidebarCollapsed`, and privacy/telemetry preference `analyticsEnabled`. Delete `enableNotifications` and every non-whitelisted config key. |
| Legacy temp leftovers | Delete only canonically proven fixed app roots; unknown/unowned entries are reported and block destructive continuation rather than widening deletion. |
| Corrupt config | Fail closed before reset if the five whitelisted encrypted records cannot be parsed/copied; provide manual recovery instructions instead of silently losing credentials. |
| Legacy plaintext standard keys | Delete rather than migrate. Only the five schema-valid `electron_safe_storage` leaves survive. |

The data boundary and packaged identity are frozen. Goal 2 remains gated on implementing and verifying the coordinator safety machinery; no further Owner choice is required for the app identity, epoch root, deletion scope, preference whitelist, or credential policy.
