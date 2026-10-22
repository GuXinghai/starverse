# Static Review — Phase 7: Cross-Cutting (Logging, Privacy, Caches, Sanitization, Network, CSP)

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

This is a read-only static review of branch `codex/basic-operation-exploration-8q02ix` at `44a9866`. The application source matches baseline `aec217cd`.

- The review continued in the local checkout `D:\Starverse` after the cloud handoff. The local branch tracks `origin/codex/basic-operation-exploration-8q02ix`.
- No application code was modified.
- No tests, builds or rebuilds were run.
- The app was not launched, and no network or provider requests were made. The only network operation was `git fetch` of the review branch.

## 1. Scope and coverage

| Area | Files | Depth |
|---|---|---|
| Logging and redaction | `electron/ipc/logSanitizer.ts`, `electron/ipc/dialogIpc.ts`, `electron/ipc/*V2Ipc.ts` error paths, `electron/services/generationRuntimeStarterV2.ts`, `geminiGenerateContentStreamRunnerV2.ts`, `src/shared/provider/providerFailureV2.ts`, `infra/db/repo/usageRepo.ts`; every `console.*` sink in production `electron/` and `src/` (grep) | Targeted, all sinks enumerated |
| Debug capture | `electron/debug/rawGenerationRequestStore.ts`, `electron/ipc/rawGenerationDebugIpc.ts`, all eleven stream runners' `tryPersistPreparedV2` calls | Full |
| Tracked-artifact privacy | `git ls-files artifacts/`, `artifacts/openrouter/web-plugin-boundary/*`, `artifacts/ts/*`, `scripts/gates/privacy-scan.mjs`, `.github/workflows/ci.yml` | Full for `artifacts/` |
| Caches and memory growth | Module-level and class-level `Map`/`Set`/array stores in `electron/`, `infra/`, `src/next/`; `generationOperationRuntimeRegistryV2.ts`, `generationBodyCheckpointV2.ts`, `src/next/state/selectors.ts`, `fileSelectionGrants.ts` | Targeted |
| Blocking synchronous work | `fs.*Sync`, `*Sync` child processes, large hashing/serialization and SQL on IPC paths (startup and data-epoch excluded) | Targeted |
| Sanitization as a system property | `src/ui-kit/chat/richtext/sanitizer.ts`, `googleSearchSuggestionsSanitizer.ts`, `streamRenderer.ts`, `finalRenderer.ts`, `ChatMessageBubble.vue`, `reasoningPresentationProjectorV2.ts`; repo-wide search for `v-html`, `innerHTML`, `insertAdjacentHTML`, `srcdoc`, `document.write`, `eval`, `new Function` | Full for sinks |
| Network and proxy policy | `electron/net/*`, `productNetworkProxyV2.ts`, `electronSessionProxyController.ts`, `mainV2.ts:149-191`, `localEndpointDiagnosticsIpc.ts`, `electronOfficialPackageDownloadService.ts`, `infra/files/electronOfficialPackageTransport.ts`, legacy `packageDownloader.ts` / `networkProxy.ts`, `urlProbe.ts`; renderer `fetch`/XHR/WebSocket search | Targeted |
| CSP | `config/appCsp.ts`, `index.html`, `vite.config.ts`, `electron.vite.config.ts`, `public/inapp-shell.html` | Full |
| In-app browser and auxiliary windows | `electron/**/inappBrowser.ts`, `electron/preload/inapp-preload.ts`, `electron/windows/mainWindow.ts`, the HTML→PDF render window, agent-mode windows | Full for window creation and handlers |

**Not covered (open):**
- Runtime CSP behaviour under `file://` (`'self'` matching, wasm load, `<meta>` timing).
- Electron fuses, ASAR integrity and `electron-builder` hardening (Phase 8).
- How Anthropic citations and Gemini `groundingChunks` are mapped into persisted annotations. The renderer consumes only `url_citation` annotations and validates nothing beyond the window-open path (see P6b-14).
- Whether the main-process `bridge.fetchPackageToFile` path calls `assertGovernedRequestAvailable`.
- DOMPurify 3.4.x mXSS behaviour for MathML and SVG (only version and configuration were checked).
- A size-bound audit of every `JSON.parse` of provider payloads in the `src/core` SSE parsers.
- Real latency and memory cost of P7-01 and P7-02; P3b-19 hashing cost was not re-examined.
- Logging in `scripts/`, vendored code, and `.storybook` / `storybook-static`.
- Proxy credential handling inside `electronSessionProxyController.ts` and `productNetworkProxyV2.ts` beyond the redaction points listed under "Held up".

## 2. Subagent configuration and contributions

- Two concurrent read-only `Explore` subagents, model `sonnet`, effort `high`. The tool accepts only a model family, so the exact "Sonnet 5.5" version could not be confirmed.
- **7-A:** logging and redaction, tracked-artifact privacy, unbounded caches, blocking synchronous work.
- **7-B:** sanitization as a system property including provider-supplied HTML and URLs, proxy and network policy, CSP, in-app browser and auxiliary windows.
- Neither subagent edited files, created temporary files, ran commands in the background, or spawned agents.
- The coordinator verified against source:
  - P7-01: `#entries` in `generationOperationRuntimeRegistryV2.ts:95` has no `delete`; `listSnapshots()` (`:127-137`) re-hydrates every entry; both IPC entry points call it (`generationOperationRuntimeV2Ipc.ts:46, 49`).
  - P7-03: the store is always constructed (`mainV2.ts:89`) and called from all eleven stream runners.
  - P7-04: `img` and `src` are allowed by the sanitizer (`sanitizer.ts:28, 37`) and no hook restricts `src`; the CSP `img-src` (`appCsp.ts:36`) is the only barrier.
  - P7-06: production uses `createElectronSystemAwareOfficialPackageTransport` (`epoch2EnginePluginLifecycleService.ts:58`).
  - P7-08: `backupConfig` (`configSchema.ts:416-425`) uses `writeFileSync` with no mode or rotation.
  - P7-11: `artifacts/ts/type_errors.txt` is UTF-16 LE; the other two snapshots are ASCII.
  - I7-01: `ModelPickerDialog.vue:24` imports only constants from `openRouterCategoryCache.ts`.
- Two subagent candidates were duplicates and were merged into earlier IDs (section 4).

## 3. Findings by severity

No High findings. One Medium, two Low-Medium, eight Low, six Info.

### Medium

#### P7-01 [7A-1] — Medium — The main-process runtime registry never evicts operations, and every subscribe re-hydrates all of them synchronously
- **Severity rationale:** unbounded main-process memory plus main-thread SQL and a full structured-clone of every answer ever generated in the process lifetime, on a path the renderer hits during normal use. Grows with session length, not with abuse.
- **Status:** statically confirmed. Size and latency require runtime measurement.
- **Evidence:** `electron/services/generationOperationRuntimeRegistryV2.ts`:
  - `#entries = new Map` at `:95`; written at `:151`, `:181`, `:455`; no `#entries.delete` anywhere in the file.
  - `#hydrate` (`:471-503`) stores a frozen snapshot holding the full `body`, reasoning list and image rows.
  - `listSnapshots()` (`:127-137`) calls `findOperation`, a `message_body_v2` SELECT, a `generation_image_output_v2` SELECT and `#reasoning.list` for **every** entry.
  - `electron/ipc/generationOperationRuntimeV2Ipc.ts:46` (subscribe) and `:49` (`snapshot(null)`) return `listSnapshots()`.
- **Trigger:** each generation adds an entry; each renderer subscribe or global snapshot re-reads all of them.
- **Impact:** main-process memory grows with every answer; subscribe latency and IPC payload grow linearly with session history, blocking the main thread. Shares a root cause with P4a-13 (renderer side: P4b-02, P4b-05).
- **Safeguards:** the renderer `BranchRuntimeCacheV2` evicts terminal branches; operations deleted from the DB are skipped (but their entries stay).
- **Repair direction:** remove terminal entries after a grace period or cap them with an LRU; have subscribe and `snapshot(null)` return only active operations; hydrate lazily.
- **Verify:** unit test that a terminal operation leaves `#entries` after the grace period; measure subscribe payload size after N generations.

### Low-Medium

#### P7-02 [7A-2] — Low-Medium — Body checkpointing copies and re-reads the whole answer on every flush
- **Status:** statically confirmed; real cost requires runtime.
- **Evidence:** `electron/services/generationBodyCheckpointV2.ts` `update` / `#flushCurrent` flush every 50 ms or 4 KiB. Each flush runs `compareAndSetStreamingAssistantBody(expected, next)` with full strings, publishes the full `content` to the registry, and `#persistedPayload` (`generationOperationRuntimeRegistryV2.ts:509-517`) `SELECT`s `body_text` and compares the whole string, followed by `#reduce` and an IPC send.
- **Impact:** roughly O(n²) main-thread work over a long streamed answer (several full-body copies per flush, up to ~20 flushes/s).
- **Repair direction:** publish deltas, throttle as the body grows, compare length or a running hash instead of reading the body back.
- **Verify:** profile a 200 KB streamed answer before and after.

#### P7-03 [7A-3] — Low-Medium — Raw request capture is always on, synchronous, plaintext, and readable over ungated IPC (extends P2b-07, P2a-09)
- **Status:** statically confirmed.
- **Evidence:**
  - `electron/mainV2.ts:89` always constructs `RawGenerationRequestStore`.
  - All eleven stream runners call `tryPersistPreparedV2` unconditionally (for example `anthropicMessagesStreamRunnerV2.ts:364`, `openAIResponsesStreamRunnerV2.ts:489`, `openRouterChatStreamRunnerV2.ts:389`).
  - `rawGenerationRequestStore.ts:76-98` (`tryPersist`) converts the body to UTF-8, computes `Buffer.byteLength` and SHA-256, then SELECTs and INSERTs the full serialized body on the main thread.
  - `electron/ipc/rawGenerationDebugIpc.ts` exposes `raw-generation:list-by-answer` and `list-provider-errors-by-answer` with no debug gate.
- **New relative to P2b-07 / P2a-09:** the capture is not a debug option at all (no flag), its cost is paid synchronously per send including inlined base64 attachments, and the data is readable back through production IPC.
- **Safeguards:** credentials travel in headers (for example `x-goog-api-key`), so keys are not in captured bodies; writes are non-fatal.
- **Repair direction:** gate capture and its IPC behind an explicit debug setting; add size and age retention; delete rows with the conversation.

### Low

#### P7-04 [7B-01] — Low (defence in depth) — Remote markdown images are blocked only by the CSP
- **Status:** statically confirmed.
- **Evidence:** `src/ui-kit/chat/richtext/sanitizer.ts:28` allows `img`, `:37` allows `src`, and the `uponSanitizeAttribute` hook (`:109-117`) checks only `href`. No `validateLink` override exists in `src/`, so markdown-it's default lets `![](https://…)` through. The only barrier is `img-src 'self' data: asset: blob:` in `config/appCsp.ts:36`, injected as a `<meta>` (`index.html`, `vite.config.ts`).
- **Impact:** if the CSP were ever lost (see I7-02 for one dormant build path that ships a placeholder CSP), model output could exfiltrate conversation data through a zero-click image request.
- **Repair direction:** add a sanitizer hook limiting `img[src]` to `data:image/…` and `asset://`; add a test that asserts the CSP in the built `dist/index.html`.

#### P7-05 [7B-03, 7B-04] — Low (Medium if enabled) — In-app browser lacks remote-content hardening (extends P1-02, P1-03)
- **Status:** statically confirmed; the feature is dormant in the current build.
- **Evidence:**
  - Tabs use the persistent `persist:intra-links` partition (`inappBrowser.ts:253-261`, `mainV2.ts:149`) with default permission behaviour and no `will-download` handler.
  - Only `will-navigate` and `setWindowOpenHandler` are hooked on tabs (`:310-321`); no `will-redirect` / `will-frame-navigate`. The shell window has no navigation or window-open handlers (`:195-206`).
  - `normalizeUrl` (`:388-393`) prefixes `https://` to any input rather than rejecting non-http input; `openLink` does not call `validateExternalUrl` or reject userinfo.
  - Dormancy (P1-03 detail): the shell preload path `:407` points at `inappPreload.mjs`, which the production Vite config never builds; `:403-405` builds a filesystem path that `:211` passes to `loadURL`; nothing in `src/` calls `openInAppLink` (`preload.ts:434`).
- **Safeguards:** tab views have no preload, so remote pages cannot reach IPC; sandbox and contextIsolation are on; the partition's request policy fails closed when the browser proxy scope is not ready (`mainV2.ts:156-162`).
- **Repair direction:** deny-by-default permission request and check handlers, a `will-download` handler, reject non-http input, and fix or remove the dead build paths.

#### P7-06 [7B-08] — Low — A legacy network stack bypasses proxy governance
- **Status:** statically confirmed; dormant in production wiring.
- **Evidence:** Node global `fetch` with an undici `ProxyAgent` in `infra/files/enginePluginLifecycleService.ts:3301-3329`, `src/next/plugin-distribution/packageDownloader.ts:320-340, 470-490` and `infra/files/dfcLibreOfficeOfficialAssetBodyIntercept.ts:267`. `src/shared/plugin-distribution/networkProxy.ts:56-62` hard-fails `system` proxy mode. None of these is offline-gated or `assertGovernedRequestAvailable`-gated.
- **Production path:** `epoch2EnginePluginLifecycleService.ts:58` injects `createElectronSystemAwareOfficialPackageTransport`, which fails closed when the bridge is absent. Its download (`electronOfficialPackageDownloadService.ts:322-326`) uses `net.request` with `redirect:'follow'` and checks the host only on the final URL; SHA-256 integrity downstream limits the impact.
- **Repair direction:** delete or test-confine the `fetch`/`ProxyAgent` fallbacks; check each redirect hop's host in the official download.

#### P7-07 [7A-5, 7A-6] — Low — Raw error messages reach logs, persisted records and IPC; sanitizers are duplicated (extends P2a-09)
- **Status:** statically confirmed.
- **Evidence:**
  - `generationRuntimeStarterV2.ts:32` logs a runner failure's raw message, bypassing `summarizeErrorForLog`.
  - `geminiGenerateContentStreamRunnerV2.ts:337` logs the whole `error.diagnostic`, which can include `rawChunk` (model output) in the console.
  - `generationOperationRuntimeRegistryV2.ts:240` persists a raw `error.message` (up to 8,192 chars) into the operation record.
  - IPC handlers return `error.message` as `code` / `safeMessage`: `openAICompatibleV2Ipc.ts:234-250`, `generationV2ComposerIpc.ts:111`, `generationV2SearchIpc.ts:75`, `generationV2WorkspaceIpc.ts:101`, `localEndpointProfileV2Ipc.ts:24, 29`.
  - `dialogIpc.ts:174-183` `sanitizeDialogErrorMessage` is a partial copy of `redactSensitiveString` without URL, query, `Bearer` or `sk-` handling. `summarizeIpcParamsForLog` (`logSanitizer.ts:60`) has no production caller. `logSanitizer` is applied in about five production files.
- **Safeguards:** all production sinks are console (no log file); the renderer-facing `providerFailureV2.ts:305-362` sanitizer covers API-key, `?key=` and header patterns; most IPC handlers emit allow-listed codes.
- **Repair direction:** route these messages through one shared sanitizer, or coerce to allow-listed codes at the IPC boundary.

#### P7-08 [7A-4] — Low — `store-clear-safe` writes an unrotated, unrestricted full-config backup each call
- **Status:** statically confirmed; whether the backup holds sensitive values requires runtime.
- **Evidence:** `electron/config/configSchema.ts:416-425` `backupConfig` `writeFileSync`s the whole `store.store` to `config.backup.<ts>.json` with default mode and no rotation; reached from `electron/ipc/storeIpc.ts:151`; the path is returned to the renderer.
- **Counterevidence:** provider credentials are in safeStorage; proxy settings and other preferences are not secrets in the same sense. Related: P2a-04, P2a-07.
- **Repair direction:** mode `0o600`, keep the last N backups, strip proxy and legacy credential fields.

#### P7-09 [7A-7] — Low — Legacy `dialog:select-file` reads any file whole into a data URL
- **Status:** statically confirmed.
- **Evidence:** `electron/ipc/dialogIpc.ts:36-80` reads the full file, base64-encodes it and returns a data URL; renderer-supplied filters accept `extensions: ['*']`. Exposed at `preload.ts:419`; no caller in `src/`.
- **Impact:** a large file causes a large transient allocation or a V8 string-length throw. The user must pick the file, so this is not a confidentiality issue.
- **Repair direction:** remove the channel or cap the size.

#### P7-10 [7A-8] — Low — Renderer selector caches never evict (related to P4b-02, P4b-05)
- **Status:** statically confirmed.
- **Evidence:** `src/next/state/selectors.ts:7, 14` caches set at `:160, :207`, never deleted. Each entry holds the source `MessageState` and a derived `MessageVM`, keyed by message and run id.
- **Repair direction:** LRU, or scope the cache to the store's lifetime.

#### P7-11 [7A-10] — Low — Tracked artifacts and privacy-scan gaps (resolves P0-03)
- **Status:** statically confirmed.
- **P0-03 resolution:** 50 tracked files under `artifacts/`. The `web-plugin-boundary` captures contain no `sk-`, `Bearer` or `Authorization`, no `C:\Users` path or user name; the only email is the allow-listed synthetic `privacy-placeholder@example.invalid`.
- **Residual:** 20 files carry OpenRouter generation ids (`gen-…`); `summary.json` and `README.md` carry a 10-hex `keyHash` digest of the real key; the captured third-party web content carries copyright exposure.
- **Scanner gaps:** `scripts/gates/privacy-scan.mjs` reads files as UTF-8, so `artifacts/ts/type_errors.txt` (UTF-16 LE) is effectively unscanned (it currently holds no paths or credentials). `.jsonl`, `.har`, `.sqlite` and `.png` are outside its extension list, and it has no gen-id or `keyHash` pattern. It does run in CI via `gate:privacy` in `verify:ssot` (`.github/workflows/ci.yml:59`).
- **Repair direction:** untrack the captures (keep a redacted fixture if needed); add BOM/UTF-16 decoding and the missing extensions and patterns to the scanner.

### Info

| ID | Item |
|---|---|
| I7-01 [7B-07] | **Correction to P1-08 (not an edit of it):** `object-src`, `worker-src` and `frame-src` fall back to `default-src 'self'`, so only `base-uri` and `form-action` are truly missing. The renderer makes no live remote request (only the dev `/build-id.json` in `src/main.ts:11`). The single renderer fetch to `openrouter.ai`, with a Bearer key through global `fetch`, is dead code in `src/next/modelCatalog/openRouterCategoryCache.ts:76-87` (`ModelPickerDialog.vue:24` imports constants only). Production `connect-src` can therefore be `'self'`. |
| I7-02 [7B-02] | Extends P0-02: the dead `electron.vite.config.ts` has no CSP injection, and its ignored output `out/renderer/index.html:9` contains the literal placeholder `__APP_CSP__`. Not packaged (`package.json:16-21`). It is also the only config that builds `inapp-preload.ts`. |
| I7-03 [7B-09] | Dev-only and hygiene: `vite.config.ts:52` adds `--no-sandbox` when `SV_NETLOG_PATH` is set; `vite --host` (`package.json:64`) listens on the LAN; `mainWindow.ts:120-130` relies on Electron defaults for `contextIsolation`, `nodeIntegration` and `webSecurity`; `public/inapp-shell.html` has an inline script and no CSP (local, uses `textContent`). Missing IPC sender validation is the Phase 0/1 lead and P5a-13. |
| I7-04 [7A-9] | `electron/ipc/fileSelectionGrants.ts` removes expired grants only on consume or sender invalidation; bounded by user action and the 5-minute TTL. |
| I7-05 [7A-11] | `infra/db/repo/usageRepo.ts:97-132` logs full params including `meta` per insert; no production caller found, so likely dead. |
| I7-06 | Extends P5b-03: `urlProbe.ts:206-236` resolves with `node:dns` `lookup` separately from the fetch's own resolution (TOCTOU for the private-address check) and is not proxy-aware. |

## 4. Uncertainties and excluded false positives

**Duplicates merged into earlier findings (no new ID):**
- 7B-06 (`String.replace` `$` patterns in `finalRenderer.ts:70, 74, 168-169`) is P6b-01.
- 7B-05 (global DOMPurify hooks without `try/finally`, `SANITIZE_NAMED_PROPS` comment mismatch, `id` allowed) is P6b-14. One addition: if the rich-text `sanitize` throws, its hooks stay registered and also run inside `googleSearchSuggestionsSanitizer.ts`, which additionally runs a redundant second `sanitize` pass for `plainText` (`:52-53`).

**Rejected hypotheses:**
- Missing `object-src` leaves plugins unrestricted: `default-src 'self'` covers it (I7-01).
- The Google sanitizer's `removeAllHooks` clobbers the rich-text hooks mid-call: both run synchronously and re-register on each call.
- Citation `javascript:` hrefs are exploitable: `target=_blank`, the deny-all window-open handler and http(s)-only external routing block them.
- The renderer talks directly to providers: provider traffic is main-side; the one renderer fetch is dead code.
- TLS overrides: no `rejectUnauthorized:false`, `NODE_TLS_REJECT_UNAUTHORIZED`, certificate-error handler or `setCertificateVerifyProc` in production code (one SPKI switch exists in a smoke script).
- Keys in URL query strings: none are built; Gemini uses `x-goog-api-key`.
- Hidden persistent log files or `crashReporter`: none.
- Tracked artifacts with real keys or emails: none found.
- Proxy URL userinfo reaching logs: credential-bearing proxy URLs are rejected and redacted (`productNetworkProxyV2.ts:375, 412-413`); deeper tracing is listed as not covered.

**Uncertainties:**
- P7-01 and P7-02 cost is inferred from code shape, not measured.
- P7-08 contents depend on what the user's store holds at runtime.

**Held up:**
- **HTML sinks:** only the two known `v-html` sinks (`RichTextFinal.vue:72`, `ChatMessageBubble.vue:327`); `innerHTML` writes in `streamRenderer.ts` and `RichTextContent.vue` take sanitized or escaped input; no `srcdoc`, `document.write`, `eval`, `new Function`, iframe, object or embed outside tests; `archived-components` is not imported.
- **Provider data:** Gemini search suggestions are sanitized at render time; reasoning image URLs are limited to `data:image` and `asset://` (`reasoningPresentationProjectorV2.ts:83`); tool-call arguments render as text; attachment previews are `<img>` data URLs only.
- **Logging:** console only; no file logger, `electron-log` or `crashReporter`; renderer `console-message` forwarding is metadata-only and opt-in (`SV_DEBUG_RENDERER_CONSOLE=1`); main logs mostly use ids, codes, `urlOriginForLog` and `basenameForLog`.
- **Network:** credentialed provider calls use `redirect:'error'`; catalog and Cloud Rules refreshes pin hosts and revalidate redirect hops; cloud traffic goes through `session.defaultSession.fetch` (`cloudFetch`); local providers use a dedicated direct session with loopback-only validation (`localEndpointDiagnosticsIpc.ts:163-203`); compatible base URLs reject embedded credentials; no `app.on('login')`; no CDN assets or updater.
- **HTML→PDF window:** in-memory partition, `javascript:false`, `onBeforeRequest` allow-list, navigation and window-open denied, downloads cancelled, sandboxed (minor: `preconnect` / `dns-prefetch` hints are not mediated).
- **Agent mode:** blocked in packaged builds; external profile; loopback renderer origin; `shell.openExternal` suppressed; no CDP port.
- **Bounded caches:** catalog snapshot cache (FIFO with a max), `modelPrefsService` LRU, `catalogScopeCoordinator`, `inFlightUploads`, runtime-starter controllers, IPC sender maps, in-app browser tabs, and credential maps all evict or are small.
- **Sync I/O:** outside startup, data-epoch and credentials code, production `electron/` sync fs is limited to `backupConfig` (P7-08); no `execSync`/`spawnSync`.

## 5. Next phase

**Phase 8 — Build, release and tests:** `package.json` build, `vite.config.ts`, native build scripts, NSIS, CI workflows, test partitions, gates (including the privacy gate from P7-11), the Magika release workflow, Electron fuses and ASAR integrity, whether the better-sqlite3 binary is unpacked from asar, and the dead `electron.vite.config.ts` (P0-02, I7-02).

This phase is complete. I have stopped and am waiting for your instruction to continue.
