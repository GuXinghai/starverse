# Static Review — Phase 0: Repository Baseline and Review Map

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22
**Review type**: Phased static review (read-only). No code changed, nothing built, run, tested, or rebuilt.
**Evidence rule**: Docs, historical reports, and tests are supporting evidence only; claims below were verified against source unless marked otherwise.

---

## 1. Scope and coverage

### Baseline

| Item | Value |
|---|---|
| Repository root | `D:/Starverse` |
| Branch | `codex/basic-operation-exploration` |
| HEAD | `aec217cd20045ce6af164eb9d49ade0d6d894b5b` — "chore: checkpoint existing application and UI changes" (482 files, +33,344 / −5,636) |
| vs `main` | 114 ahead, 0 behind; most of the ~1.1M inserted lines since `main` are research JSON under `artifacts/` |
| Working tree | Only untracked `world_map_experiment/__pycache__/` (preserved, untouched) |
| Stashes | 3 pre-existing stashes (untouched) |
| Tracked files | ~3,000 |

Documents read: `AGENTS.md`, `docs/AGENT_INDEX.md`, `docs/architecture/CURRENT_SYSTEM_ARCHITECTURE.md`, `docs/maintenance/maintainer-entry.md`, `docs/maintenance/local-runtime-workdirs.md`. No `CLAUDE.md` exists.

### Architecture (source-verified)

**Main-process entry and startup**
- `package.json:202` `"main": "dist-electron/epoch2MainEntry.js"`; Vite builds a single main entry `electron/epoch2MainEntry.ts` and preload `electron/preload.ts` (`vite.config.ts` via `vite-plugin-electron/simple`; `better-sqlite3` externalized).
- `electron/epoch2MainEntry.ts`: `initializeAgentAutomation` (disabled when packaged, `electron/bootstrap/agentAutomationRuntime.ts:37`) → isolated smoke appData root → identity → `requestSingleInstanceLock` → `whenReady` → `bootstrapEpoch2ApplicationRuntime()` → dynamic `import('./mainV2')` → `startMainV2()`. Startup recovery branches: schema mismatch (backup + recreate after prompt), corrupt config (repair, then fresh config after consent), otherwise error box with code only.
- `electron/bootstrap/epoch2ApplicationRuntime.ts` → `electron/data-epoch/epoch2CommittedBootstrap.ts`: root lease, reset-journal resume, DB creation, electron-store `config.json` open, credential service, journal `committed`, DB file authority, `better-sqlite3` open (`foreign_keys=ON`), attachment blob store.
- `electron/mainV2.ts:startMainV2` (~68–323): i18n, config validate/migrate, raw generation debug store (`debugRoot/generation-raw.sqlite`), shutdown coordinator, file-selection grants, proxy controller (sessions: default, `persist:intra-links`, `starverse-local-direct-v2`, probe), models.dev / cloud-rules background refresh, engine-plugin lifecycle, Magika utility process, `recoverGenerationOrphansV2`, IPC registration (~238–286), main window (~300), single `before-quit` hook (~322) → `electron/services/appShutdownCoordinatorV2.ts` (5 s drain, `closeResources`).

**Windows, preload, navigation**
- `electron/windows/mainWindow.ts` (`createMainWindow`): `webPreferences: { preload, sandbox: true }`; `contextIsolation` / `nodeIntegration` rely on Electron 42 defaults. Trusted-URL check for `will-navigate`; `setWindowOpenHandler` denies and opens http/https externally. Renderer-crash / load-failure recovery in `electron/windows/rendererRecovery.ts`.
- In-app browser (`electron/services/inappBrowser.ts`): sandboxed `WebContentsView`/`BrowserWindow`, partition `persist:intra-links`, separate preload `electron/preload/inapp-preload.ts` exposing `window.inapp` only.
- CSP: `config/appCsp.ts`, injected into `index.html` by a Vite plugin; `connect-src` narrow because provider traffic runs in main.
- `electron/preload.ts` (436 lines): namespaces `electronStore`, `rawGenerationDebug`, `networkProxy`, `generationV2` (~24 sub-namespaces), `packagedTestDocxFixtureV1` (gated), `electronAPI`.

**IPC**
- All handlers go through `registerInvoke` (`electron/mainV2.ts:92`), a bare `ipcMain.handle`. ~172 `registerInvoke(` call sites across `electron/` (exact channel count uncertain due to constant-array channels).
- `electron/ipc/`: 67 files (42 non-test, ~9.3k lines), grouped by provider generation, model data/capability rules, credentials/workspace/composer/search, local runtimes, infrastructure (store, dialog, shell, proxy, in-app browser, engine plugins, raw debug), and test-only fixtures.
- Validation is hand-written decoders and allowlists (e.g. `electron/config/configSchema.ts` `ALLOWED_CONFIG_KEYS`, renderer-blocked credential keys); zod is mostly renderer-side (`src/next/ipc/contracts`).

**Renderer**
- `src/main.ts` → `src/App.vue` → `src/ui-app/AppChatApp.vue` + `src/ui-app/app/appChatApp.logic.ts` (~8,950 lines; send/retry/regenerate/edit-resend orchestration).
- No router, no Pinia in app code (Pinia only in `tests/setup-ui.ts`). State: composables + custom reducer (`src/next/state/*`, `useLiveStreamController.ts`, `branchRuntimeCacheV2.ts`).
- Durable conversation state is owned by the main-process DB; the renderer holds projections/caches.
- Layers: `src/next` (domain clients/services), `src/core` (shared domain logic, imported by renderer, `src/next`, and `electron/` — not legacy), `src/shared` (cross-process contracts), `src/ui-kit` (chat primitives).

**Storage**
- SQLite (better-sqlite3), main process only: `workspace/epoch-2/starverse.db` (`electron/data-epoch/rootManifest.ts`). Schema from 29 `infra/db/v2/*.sql` composed by `infra/db/v2/schemaComposerV2.ts`; `infra/db/schemaVersion.ts` `DB_SCHEMA_VERSION = 13`; mismatch → backup + recreate, not in-place migration. ~80 repos in `infra/db/repo/`; ~60 `db.transaction(` sites.
- Epoch layout and reset journal (`electron/data-epoch/resetJournal.ts` phases: prepared → legacy_files_deleted → config_replaced → epoch_root_created → database_created → committed).
- Windows native addon `native/epoch-win32/src/addon.cc` (~2.9k lines): root lease, DB file identity, owned delete, attachment blob I/O. POSIX backend in `electron/data-epoch/posixEpochFilesystemBackend.ts`.
- electron-store `config.json`; provider credentials encrypted via `safeStorage` (`electron/credentials/epoch2RuntimeCredentialService.ts`); OpenAI-compatible credentials via DB service.
- Legacy `src/next/persistence/*` appears test-only (unverified).

**Generation pipeline**
- Renderer `submitGenerationV2*` (`src/next/generation-v2/renderer/generationV2CommandClient.ts`) → `window.generationV2.<provider>.<op>` → `electron/ipc/<provider>GenerationV2Ipc.ts` (decode, record sender per operation, capability-revision check) → `electron/services/<provider>GenerationV2Runtime.ts` (initial / retry / regenerate / edit-resend / tool-continuation coordinators, request compiler, stream runner, snapshot commit) → `electron/net/providerHttpTransport.ts` → `infra/db` repos → projection events via `webContents.send` → renderer reducer.
- Providers: OpenRouter (chat, images), OpenAI Responses, Anthropic Messages (incl. file upload), Gemini (GenerateContent, Interactions image), DeepSeek, generic OpenAI-compatible, Ollama, LM Studio, generic local OpenAI chat. Each has its own IPC file, runtime, and native-history repo.

**External integrations and processes**
- Network: `electron/net/*` (proxy compiler/controller, session request policy, manual redirects, bounded bodies, local endpoint transport).
- Engine plugins: `infra/files/enginePluginLifecycleService.ts` (~3.7k lines), `electron/services/epoch2EnginePluginLifecycleService.ts`, signed catalogs, official package download.
- LibreOffice DOCX→PDF: `infra/files/dfcManagedLibreOfficeRuntime.ts`, `dfcLibreOfficePdfAdapter.ts`, installer.
- Magika: Electron `utilityProcess` (`electron/services/magikaUtilityProcessRunner.ts`).
- Only `child_process` user: `src/next/file-type/externalProcessRunner.ts` (runs in main; Windows `taskkill /T /F`, POSIX group kill).
- HTML→PDF: `electron/services/electronHtmlPdfConversionAdapter.ts` (temporary sandboxed partition).
- No `worker_threads` / `new Worker` in production code.

**Tests**
- Vitest partitions: unit (node), ui (jsdom), integration (node, forks; Windows in CI). Partition logic in `vitest.shared.ts` + `scripts/resolve-test-ci-scope.mjs` (duplicated owner rules) + `tests/test-partition-overrides.json`.
- `fetch` globally stubbed to throw; Electron mocked per-file (~30 files); better-sqlite3 never mocked (~104 files use the real binding → ABI-dependent).
- No real Electron e2e in Vitest; Electron/packaged/LibreOffice coverage is via `scripts/smoke/*` and `scripts/dfc/*`, not in CI.
- CI (`.github/workflows/ci.yml`): `lint:changed`, `typecheck`, `verify:ssot` (unit + gates) on Ubuntu; UI on Ubuntu; integration on Windows; optional live smoke with secret.

### Size by area (git-tracked, lines include tests)

| Area | Files (tests) | Lines |
|---|---|---|
| `electron/services` | 185 (50) | 37k |
| `electron/ipc` | 67 (25) | 9.3k |
| `electron/data-epoch` | 42 (21) | 8.5k |
| `electron/credentials` | 18 (8) | 3.2k |
| `electron/net` | 18 (9) | 2k |
| `infra/db` | 172 (53) | 48k |
| `infra/files` | 35 (19) | 20k |
| `src/next` | 728 (305) | 96k |
| `src/ui-app` | 153 (83) | 58k |
| `src/core` | 205 (0) | 38k |
| `src/shared` | 201 (56) | 20k |
| `src/ui-kit` | 43 (13) | 5.8k |
| `native/epoch-win32` | 1 source | 2.9k |

Largest non-test files: `appChatApp.logic.ts` (~8,950), `enginePluginLifecycleService.ts` (3,667), `ModelPickerDialog.vue` (3,445), `SettingsPanel.vue` (3,270), `addon.cc` (2,866), `ChatSessionConsole.vue` (2,778).

---

## 2. Coverage map (adjusted phases)

| Phase | Scope |
|---|---|
| **1 — Startup / Electron / IPC** | `electron/epoch2MainEntry.ts`, `electron/bootstrap/`, `electron/mainV2.ts`, `electron/windows/`, `electron/preload.ts`, `electron/preload/inapp-preload.ts`, `electron/security/`, `config/appCsp.ts`, all `electron/ipc/*` (sender + payload validation), shell/dialog/file-selection grants, in-app browser IPC, shutdown coordinator, renderer recovery. May split into 1a (bootstrap/windows/preload/shutdown) and 1b (IPC handlers). |
| **2a — Epoch and credentials** | `electron/data-epoch/*`, `native/epoch-win32`, `electron/credentials/*`, electron-store schema and `storeIpc`, corrupt-config and schema-mismatch recovery |
| **2b — DB and repositories** | `infra/db/v2/*.sql`, schema composer, `infra/db/repo/*` (transactions, deletion, consistency), attachment blob store, raw-request debug store, legacy `src/next/persistence` (confirm dead) |
| **3a — Model identity and capability** | `src/core/generation-v2` (capability rules, model facts, contracts), `src/shared/modelCatalog`, `src/next/modelCatalog`, `src/next/modelPrefs`, `src/next/provider`, cloud rules, models.dev refresh, source priority |
| **3b — Request compilation** | `src/core/generation-v2/providers`, send-plan serializer, per-provider compilers/adapters, native-history repos, error mapping, `electron/net` transport |
| **4a — Main-process generation runtime** | Operation registry, runtime starters, stream runners, timeouts, cancellation, checkpoint/commit, orphan recovery; cross-provider drift comparison |
| **4b — Renderer conversation state** | `appChatApp.logic.ts` send/retry/edit, projection subscriptions, `src/next/state` reducer/scheduler, `useLiveStreamController`, branch cache |
| **5a — Plugins, engines, processes** | Engine plugin lifecycle and signing, LibreOffice runtime/installer, Magika utility process, `externalProcessRunner`, official package download |
| **5b — Files and attachments** | `src/shared/files`, `infra/files` send plan / DFC, conversion services, HTML→PDF, attachment preflight/upload (Anthropic, Gemini), import/export |
| **6 — Frontend** | `src/ui-app` (model picker, settings, session console, search, project sidebar), `src/ui-kit` rich text, i18n |
| **7 — Cross-cutting** | Logging/redaction, markdown/KaTeX/Shiki sanitization, proxy/network policy, CSP, unbounded caches, blocking sync work, tracked artifact privacy |
| **8 — Build / release / tests** | `package.json` build, `vite.config.ts`, native build scripts, NSIS, CI workflows, test partitions, gates, Magika release workflow |
| **9 — Consolidation** | Cross-phase reconciliation and omission check |

**Out of scope**: `world_map_experiment/`, `archived-components/`, `storybook-static/`, `docs/archive/`, `artifacts/` (except Phase 7 privacy check), `electron.vite.config.ts` (dead; see P0-02).

---

## 3. Subagent configuration and contributions

- Two concurrent read-only Explore subagents, model `sonnet`, effort `high`. The tool accepts only a model family, so the exact "Sonnet 5.5" version could not be confirmed.
- Agent A: architecture, entry points, IPC, storage, generation pipeline.
- Agent B: tests, build/release, failure-path hotspots, repository hygiene.
- Both were paused on user request and resumed with context intact. Neither spawned agents, edited files, or ran builds/tests.
- The coordinating agent verified: entry point, dead Vite config, `webPreferences`, `registerInvoke` wrapper, watch-ignore list, absence of process-level error handlers, tracked ignored artifacts.

---

## 4. Findings (Phase 0 is scoping; low severity only)

### P0-01 — Low — Git-ignored folders not excluded from the Vite watcher
- **Status**: statically confirmed (list mismatch); runtime impact requires verification.
- **Evidence**: `config/generatedRuntimeWatchIgnores.ts` does not cover `.opencode/` (~56 MB, excluded via `.git/info/exclude`), `storybook-static/` (`.gitignore:137`), `.tmp-file-pipeline-worker-tests/`, `.tmp/` (matched only by `*.tmp` in `.gitignore:97`; `**/tmp/**` does not match `.tmp`).
- **Expected**: Per `AGENTS.md` and `docs/maintenance/local-runtime-workdirs.md`, large/local work dirs under the repo must be ignored by both Git and Vite.
- **Impact**: Dev-server watcher load; same class as the 2026-06 white-screen incident.
- **Repair direction**: Add these paths to `generatedRuntimeWatchIgnores`. **Verify**: Profile watcher activity during `npm run dev`.

### P0-02 — Low (maintainability) — `electron.vite.config.ts` is dead
- **Status**: statically confirmed.
- **Evidence**: References `electron/main.ts` and `electron/db/worker.ts`, neither exists; no script or workflow uses it.
- **Impact**: Misleads readers about the real entry point.
- **Repair direction**: Remove or mark as archived. **Verify**: grep scripts/workflows after removal.

### P0-03 — Low, deferred to Phase 7 — Tracked request/response captures in an ignored folder
- **Status**: suspected (content not inspected).
- **Evidence**: 47 tracked files under `artifacts/openrouter/web-plugin-boundary/` despite a `.gitignore` entry (tracked files stay tracked). `scripts/gates/privacy-scan.mjs` scans `artifacts`.
- **Repair direction**: Review contents for sensitive data in Phase 7; decide whether to untrack.

### Leads for later phases (not findings)
- **Phase 1**: No shared IPC sender validation; only proxy, file-grant, and fixture handlers check the sender.
- **Phase 1**: No main-process `uncaughtException` / `unhandledRejection` handlers; no renderer global error handler (`app.config.errorHandler`, `unhandledrejection`).
- **Phase 1**: CSP lacks `base-uri` and `form-action` (these do not fall back to `default-src`).
- **Phase 4a**: Nine per-provider runtimes with parallel coordinators; compare for drift.
- **Phase 8**: Electron and packaged smokes not in CI; unit tests in CI run only on Linux (native Windows addon untested there).
- **Phase 8**: Unverified that the better-sqlite3 `.node` binary is unpacked from asar in packaged builds (`build.asarUnpack` lists only `dist-native/win32-x64/*.node`).

---

## 5. Uncertainties and excluded false positives

- `src/core` is **not** legacy: it is the shared domain layer imported by the renderer, `src/next`, and `electron/`; its tests live in `src/next` and `electron/services`.
- Pinia is a dependency but used only in UI test setup — not a defect.
- IPC channel count (~172 registrations) is approximate.
- Gate script descriptions were inferred from names and targeted greps, not full reads.
- `src/next/persistence/*` and `src/next/ipc/contracts/dbBridgeContracts.ts` status (legacy vs. active) not yet confirmed.

---

## 6. Next phase

Phase 1 — Startup, Electron, and IPC (possibly split into 1a/1b). Not started.
