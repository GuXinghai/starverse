# Static Review — Phase 1: Startup, Electron, and IPC

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22
**Review type**: Phased static review (read-only). No application code changed; nothing built, run, tested, or rebuilt.
**Baseline**: branch `codex/basic-operation-exploration`, HEAD `aec217cd`. See [phase-0.md](phase-0.md) for the coverage map.

---

## 1. Scope and coverage

**Reviewed**
- Startup: `electron/epoch2MainEntry.ts`, `electron/bootstrap/*`, `electron/data-epoch/epoch2CommittedBootstrap.ts` (failure cleanup only), `electron/mainV2.ts` (read in full).
- Windows and lifecycle: `electron/windows/*` (main window, lifecycle, renderer recovery, activation).
- Preloads: `electron/preload.ts`, `electron/preload/inapp-preload.ts`.
- Navigation and links: `electron/security/externalUrlPolicy.ts`, `electron/ipc/shellIpc.ts`, in-app browser (`electron/services/inappBrowser.ts`, `electron/ipc/inappBrowserIpc.ts`).
- CSP: `config/appCsp.ts` and its Vite injection.
- Shutdown: `electron/services/appShutdownCoordinatorV2.ts` (read in full).
- HTML→PDF window hardening: `electron/services/electronHtmlPdfConversionAdapter.ts`.
- IPC boundary: sender reachability, `storeIpc`, `dialogIpc` + `fileSelectionGrants`, `enginePluginLifecycleV2Ipc`, credential/local-endpoint IPC (decoder shape only), `rawGenerationDebugIpc`, `networkProxyIpc`, `generationV2WorkspaceIpc` (lighter), `generationV2SearchIpc`, `openRouterGenerationV2Ipc`, `generationOperationRuntimeV2Ipc`, `electron/preloadHandlerParity.test.ts`.

**Traced across process boundaries**
1. Config write: `electronStore.set` → `store-set` (`electron/ipc/storeIpc.ts:103`).
2. OpenRouter chat initial submit: `generationV2CommandClient` → `generation-v2:openrouter:chat:initial` → decode → `runWithExpectedCapabilityRevisionV2` → runtime registry → projection events to the originating sender.
3. Workspace delete/rename: closed-object decoding confirmed; not traced end to end at equal depth.

**Not covered in this phase (deferred)**: DB internals (Phase 2), provider request compilation (Phase 3), streaming state (Phase 4), plugin trust/signature verification (Phase 5a), full per-provider IPC files beyond decoder shape.

---

## 2. Subagent configuration and contributions

- Two concurrent read-only Explore subagents, model `sonnet`, effort `high` (exact "Sonnet 5.5" version not confirmable through the tool).
- **1A** — startup, lifecycle, windows, preload exposure, navigation, CSP, shutdown.
- **1B** — IPC sender trust, payload validation, contract consistency, error contracts.
- Process note: 1B briefly wrote a scratch file (`/tmp/pre.txt`) outside the repo during a channel diff and deleted it immediately. No repo files were touched.
- The coordinating agent read `mainV2.ts`, `appShutdownCoordinatorV2.ts`, `epoch2MainEntry.ts`, and `epoch2CommittedBootstrap.ts` directly, and re-verified P1-01, P1-02, P1-03, P1-07, P1-10, and the macOS lease branch against source.

---

## 3. Findings (ordered by severity)

### P1-01 — Medium — Per-provider catalog policy is silently never saved or read
- **Rationale**: User-visible settings loss on a supported Settings flow; no security impact.
- **Status**: Statically confirmed (UI symptom not observed at runtime).
- **Evidence**:
  - `src/shared/modelCatalog/catalogPolicyResolverV2.ts:12-14` — `providerCatalogPolicyV2StoreKey()` returns `providerCatalog.<key>.policyV2`.
  - `electron/config/configSchema.ts:104` — only bare `'providerCatalog'` is in `ALLOWED_CONFIG_KEYS`.
  - `electron/ipc/storeIpc.ts:77-79` — `isRendererAccessibleConfigKey` uses exact `ALLOWED_CONFIG_KEYS.has(key)`; `store-get` returns `undefined` (:99), `store-set` returns `false` (:120), `store-delete` returns `false`.
  - `src/ui-app/components/SettingsPanel.vue:1116` (read) and `:1352-1357` (`await store.set(storeKey, …)` / `store.delete`) ignore the boolean result.
- **Path**: User enables a provider catalog override → save loop → `store.set('providerCatalog.openrouter.policyV2', …)` → rejected → no error shown → on reload the override reads `undefined`.
- **Counterevidence considered**: Main-side readers expect the key (`electron/data-epoch/configProjection.ts:134`, `src/shared/modelCatalog/providerCatalogSettings.ts:52`), confirming the data model intends it. No other writer found. `electron/ipc/storeIpc.test.ts` and SettingsPanel tests do not reference `providerCatalog`.
- **Repair direction**: Allow `providerCatalog.<registeredProviderKey>.policyV2` explicitly (validated against the provider registry, not a prefix pass-through) and have the renderer surface a `false` result.
- **Verification**: Unit test asserting `store-set`/`store-get` accept `providerCatalogPolicyV2StoreKey(descriptor.providerKey)` for every descriptor; manual Settings round trip in Electron.

### P1-02 — Low (latent; Medium if the in-app browser is enabled) — No permission handlers on any session
- **Status**: Absence statically confirmed; effect relies on Electron's default (grant) and requires runtime verification.
- **Evidence**: No `setPermissionRequestHandler`, `setPermissionCheckHandler`, `setDevicePermissionHandler`, or `app.on('web-contents-created')` anywhere in `electron/`, `src/`, `infra/`. Sessions: `defaultSession`, `persist:intra-links` (`electron/mainV2.ts:149`), `starverse-local-direct-v2` (`:178`).
- **Path**: `window.electronAPI.openInAppLink(url)` → `inapp:open-link` → tab `WebContentsView` loading arbitrary http(s) in a persistent partition; that page's geolocation/notification/media/clipboard requests are granted by default.
- **Counterevidence**: `openInAppLink` has no caller in `src/` (only `electron/preload.ts`, tests, helpers), and the in-app browser is mis-built (P1-03). `applySessionRequestPolicy` filters network only. The main window renders sanitized content only.
- **Repair direction**: Default-deny permission request/check handlers on all three sessions; a `web-contents-created` guard denying `will-attach-webview` and unexpected navigation.
- **Verification**: Unit test that handlers are installed per session; runtime check of `Notification.requestPermission()` in an in-app tab.

### P1-03 — Low — In-app browser is not built or loaded correctly, but its IPC is exposed
- **Status**: Build/path statically confirmed; runtime failure mode requires verification.
- **Evidence**:
  - `electron/services/inappBrowser.ts:407` — preload path `path.join(__dirname, '..', 'inappPreload.mjs')`; `vite.config.ts:66` builds only `electron/preload.ts`; `dist-electron/` has no `inappPreload.mjs`. Only the dead `electron.vite.config.ts` builds it.
  - `inappBrowser.ts:402-405` — packaged `shellUrl` is a filesystem path passed to `loadURL` (:211), not a `file://` URL.
  - Shell window lacks `will-navigate` / `setWindowOpenHandler`; tab `window.open` → `openLink` has no tab cap (`:310-315`).
  - With an in-app window still open, closing the main window on Windows/Linux does not trigger `window-all-closed`; `focusWindow()` returns false for second-instance activation (`electron/windows/mainWindowLifecycle.ts:27-35`). (Suspected.)
- **Impact**: Feature is non-functional/dormant while `inapp:*` handlers and `openInAppLink` remain reachable from the main window.
- **Repair direction**: Remove the feature, or add the preload to the active Vite build, use `loadFile`/`pathToFileURL`, add navigation guards, a tab cap, and P1-02.
- **Verification**: Build output contains the preload; Electron smoke opening a link.

### P1-04 — Low — Shutdown `closeResources` is unbounded and one failure skips the DB close
- **Status**: Code structure statically confirmed; a real hang requires runtime verification.
- **Evidence**: `electron/services/appShutdownCoordinatorV2.ts:78` awaits `closeResources()` without a timeout (only `boundedQuiesce` is bounded, :61-70). `electron/mainV2.ts:121-127` runs `rawGenerationRequestStore.close()` (unguarded), fixture dispose, two refresher `dispose()` calls, then `runtime.epoch2.close()` sequentially. `handleBeforeQuit` ignores later quits while `shutting_down` (:100-102), and `onShutdownStarted` has already detached window listeners and the activator (`mainV2.ts:129-132`).
- **Impact**: A hung step leaves a windowless process that ignores further quit requests; an early throw skips `epoch2.close()` (exit code 1).
- **Counterevidence**: Refreshers abort their controllers before awaiting; SQLite WAL recovers on next start.
- **Repair direction**: Per-step try/catch with `epoch2.close()` in `finally`, plus an overall watchdog that forces `exit`.
- **Verification**: Coordinator unit test with a never-resolving and a throwing `closeResources` step.

### P1-05 — Low — Some long-running work is invisible to the shutdown coordinator
- **Status**: Suspected; requires runtime verification.
- **Evidence**: Registered sources are electron-conversion, file-type detection (`electron/mainV2.ts:229`, `:252`), and the generation sources in `electron/ipc/generationV2IpcRegistration.ts`. The engine plugin lifecycle service (`mainV2.ts:231-240`; multi-step renames around `infra/files/enginePluginLifecycleService.ts:3412-3444`) and DFC LibreOffice child processes via `src/next/file-type/externalProcessRunner.ts` are not registered.
- **Impact**: `app.exit(0)` can land mid-install or leave a LibreOffice child running; the quit warning does not count this work.
- **Counterevidence**: Official package downloads go through the registered conversion bridge. Plugin lifecycle restart recovery is plausible (Phase 2/5a).
- **Repair direction**: Register plugin-lifecycle and DFC process sources whose `quiesce` aborts and kills process trees.
- **Verification**: Quit during a LibreOffice conversion; confirm no orphan `soffice` process.

### P1-06 — Low — A startup failure after bootstrap never closes the runtime
- **Status**: Statically confirmed.
- **Evidence**: `electron/epoch2MainEntry.ts:48-53` (`startup`) and `:140-165` (catch → `showErrorBox` → `app.quit()`). `startMainV2` can throw after the DB is open (`electron/mainV2.ts:87`, `:222`, IPC registration) and before `before-quit` is registered (`:322`). The raw-request store (`:89`) and the two background refreshers (`:196`, `:223`) are also left open.
- **Counterevidence**: `bootstrapEpoch2ToCommitted` cleans up its own failures (`epoch2CommittedBootstrap.ts:180-191`); the process is exiting, and OS handle release plus WAL replay cover most cases.
- **Repair direction**: Close `runtime.epoch2` on `startMainV2` failure, or register the shutdown coordinator before fallible steps.
- **Verification**: Unit test of `startup` with `startMainV2` throwing; assert `epoch2.close` is called.

### P1-07 — Low — `asset://` image URLs have no protocol handler
- **Status**: Absence statically confirmed; whether V2 actually emits these URLs requires runtime verification.
- **Evidence**: No `protocol.handle` / `registerSchemesAsPrivileged` anywhere. URLs are produced at `src/next/message/messageClient.ts:319` and accepted by `src/next/generation-v2/reasoning/reasoningPresentationProjectorV2.ts:83` (`url.startsWith('asset://')`); rendered via `<img :src>` in `src/ui-kit/chat/ChatReasoningPanel.vue` and `src/ui-app/components/ChatInlineReasoning.vue`. CSP `img-src` allows `asset:`.
- **Impact**: Asset-backed reasoning images will not load. No path traversal exists today because there is no handler.
- **Repair direction**: Register a handler that resolves by asset ID through the blob store (never by path), or convert to `blob:`/`data:` in the renderer.

### P1-08 — Low — CSP gaps (defence in depth)
- **Status**: Statically confirmed (`config/appCsp.ts`).
- **Evidence**: No `object-src`, `base-uri`, or `form-action` (the last two do not fall back to `default-src`). `connect-src` allows `generativelanguage.googleapis.com` and `openrouter.ai` although provider traffic runs in main; any remaining renderer use would bypass main-process proxy governance (renderer usage not yet checked). `img-src asset:` with no handler (P1-07). Delivered via `<meta>`, so `frame-ancestors` is unavailable.
- **Repair direction**: Add `object-src 'none'; base-uri 'none'; form-action 'none'`; remove unused `connect-src` hosts after confirming no renderer fetches.

### P1-09 — Low — `store-set` validates keys but not values outside the generation-v2 UI namespace
- **Status**: Statically confirmed.
- **Evidence**: `electron/ipc/storeIpc.ts:103-136` — allowlisted keys accept any structured-clone value subject only to `checkFieldSize`; leaf validators exist only for three preference keys (:109-111).
- **Safeguards**: Credential, proxy, and main-authority keys are blocked with path-overlap logic (:63-75); `store-clear-safe` always keeps blocked keys (:81-92); main re-validates some keys at projection time.
- **Repair direction**: Per-key schema for keys that main consumes.

### P1-10 — Low — `plugins:register-local-package` accepts an arbitrary `packageDir`
- **Status**: Suspected; trust and signature checks deferred to Phase 5a.
- **Evidence**: `electron/ipc/enginePluginLifecycleV2Ipc.ts:34-37` requires only a non-empty string; `infra/files/enginePluginLifecycleService.ts:1889-1904` checks install-root kind against the trusted root source, then calls `discoverMagikaManagedPlugin({ pluginDirs: [packageDir, resolvedPluginDir] })`. Exposed at `electron/preload.ts:264`; renderer callers exist (`src/next/files/enginePluginLifecycleClient.ts:91`).
- **Impact**: Only reachable from the main window; a compromised renderer could point registration at arbitrary content. Execution consequences not yet traced.
- **Repair direction**: Require `packageDir` under a managed root, or restrict the channel to dev/test.

### P1-11 — Low — OpenRouter operation sender map retains destroyed senders; abort has no ownership check
- **Status**: Code shape statically confirmed; leak magnitude requires runtime verification.
- **Evidence**: `electron/ipc/openRouterGenerationV2Ipc.ts` — `senders.set(id, target)` before dispatch; deleted only on a terminal event or dispatch throw; `awaiting_tool` keeps the entry; sends are try/caught; abort handlers accept any id. Contrast `electron/ipc/generationOperationRuntimeV2Ipc.ts:30-37`, which prunes destroyed subscribers.
- **Impact**: Bounded retention of destroyed `WebContents` references; cross-window abort is possible only with multiple main windows (not currently the case).
- **Repair direction**: Prune on `isDestroyed()`; optionally bind abort to the originating sender. Phase 4a should check whether other provider IPC files share this pattern.

### P1-12 — Low — URL probe SSRF guard has a DNS time-of-check/time-of-use gap
- **Status**: Code shape statically confirmed; exploitability requires runtime verification.
- **Evidence**: `infra/files/urlProbe.ts:183-200, 234` — `assertPublicHttpUrl` resolves via `lookup`, then the fetch resolves independently; redirects are re-checked per hop; the post-fetch assertion (:190) cannot prevent the request. Callers: `electron/ipc/generationV2ComposerIpc.ts:180`, `electron/net/networkProxyDraftProbe.ts:61`.
- **Impact**: A rebinding hostname could reach a private address. Behind a proxy, DNS happens at the proxy and the local check is advisory.
- **Repair direction**: Pin the resolved address to the connection, or reject private ranges at connect time.

### P1-13 — Low — Renderer-crash "restart" can be cancelled after `app.relaunch()`
- **Status**: Suspected; depends on Electron 42 relaunch timing, requires runtime verification.
- **Evidence**: `electron/windows/mainWindow.ts:76-79` (`app.relaunch(); app.quit()`); the quit can be cancelled in `appShutdownCoordinatorV2.ts:90-93` when active work exists.
- **Impact**: A later normal quit may unexpectedly start a new instance.
- **Repair direction**: Relaunch only after shutdown is confirmed, or bypass the confirm on restart.

### Informational
- **I1-01** — No `uncaughtException` / `unhandledRejection` handlers; module-level calls in `electron/epoch2MainEntry.ts:26-30` can throw before `ready` and surface Electron's raw error dialog. Unawaited `shell.openExternal` and uncaught `loadURL`/`loadFile` in `electron/windows/mainWindow.ts`.
- **I1-02** — macOS: `electron/data-epoch/win32EpochRootLease.ts:501` throws `EPOCH2_WIN32_NATIVE_REQUIRED` on darwin, yet `package.json` builds a dmg. Darwin lifecycle branches are unreachable (Phase 8).
- **I1-03** — `electron/preloadHandlerParity.test.ts:14-22` checks only the `electronAPI` block, single-quoted literals, and substring presence; most channels (including the store path in P1-01) are unguarded.
- **I1-04** — `electron/ipc/providerNetworkError.ts` has no importers (dead or never wired; Phase 3).
- **I1-05** — Mixed error contracts: generation handlers return `{ ok:false, code }` via `publicErrorCode`; plugin handlers throw free-text (benign content).
- **I1-06** — Broadcasts go to all `BrowserWindow`s (`electron/mainV2.ts:96-101`, `:247-249`); the in-app shell has no listener for them, so there is no exposure.
- **I1-07** — HTML→PDF creates a per-request partition that is cleared but not destroyed (slow growth); large HTML in a `data:` URL may exceed URL limits and fail closed.

---

## 4. Reviewed with no actionable finding

- **Preload**: no generic `invoke`/`send`/`on` passthrough; every `on*` returns an unsubscribe; event objects are not leaked; smoke/test exposure gated (main-side stricter).
- **Main window**: `sandbox: true`; `setWindowOpenHandler` denies, opens http(s) externally; `will-navigate` restricted to the exact packaged file or dev origin.
- **External URLs**: http/https only, parsed via `URL`, sanitized errors.
- **Renderer crash recovery**: user-driven, 30 s reload throttle, de-duplicated prompts.
- **before-quit state machine**: always `preventDefault`; `app.exit` avoids re-entry; cancel returns to `running`; drain timeout continues to seal and close.
- **Bootstrap failure cleanup**: `bootstrapEpoch2ToCommitted` and recovery branches release leases and handles in `finally`.
- **Sender reachability**: only the main window carries the privileged preload; in-app tab views and PDF windows have no preload; the shell preload exposes only fixed `inapp:*` calls; no `webviewTag`, `setPreloads`, or `nodeIntegrationInSubFrames`.
- **Credentials over IPC**: renderer cannot read secrets; blocked keys survive `store-clear-safe`.
- **File selection**: sender-bound, single-use, 5-minute grants.
- **Local endpoints**: loopback-only, `redirect: 'error'`.
- **Generation error contract**: `publicErrorCode` passes only `^[A-Z][A-Z0-9_]{2,255}$` codes.
- **Agent automation**: disabled when packaged (`electron/bootstrap/agentAutomationRuntime.ts:37`).

## 5. Uncertainties and rejected false positives

- Rejected: untrusted in-app pages reaching privileged IPC (no preload in tab views).
- Rejected: double IPC registration on recovery retry (recovery codes are thrown only inside bootstrap, which cleans up).
- Rejected: dev CSP in packaged builds (production policy is the default).
- Rejected: `logSanitizer` unused (five non-test importers).
- Uncertain: whether renderer code still fetches the CSP `connect-src` hosts (Phase 3/7); preload/handler parity was sampled, not exhaustive; workspace delete flow traced at lower depth.

---

## 6. Next phase

Phase 2a — Epoch and credentials (`electron/data-epoch/*`, `native/epoch-win32`, `electron/credentials/*`, config store schema and recovery). Not started.
