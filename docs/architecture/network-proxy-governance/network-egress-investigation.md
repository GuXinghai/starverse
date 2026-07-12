# NET-P0 Network Egress Investigation

Date: 2026-07-01

Scope: read-only investigation of Starverse external and local network exits. No proxy-setting implementation and no live network request was executed for this investigation.

## Summary

Current egress governance is split across several stacks:

- OpenRouter active chat has two paths: main-process `electron.net.request` for IPC/legacy-store flows, and direct `fetch` in `src/next/transport/openrouterFetch.ts` for the fetch transport branch.
- OpenAI Responses, Anthropic, DeepSeek, Gemini, and Generic adapters are mostly transport-injected at adapter level, but Electron IPC defaults differ. Google AI Studio already defaults to Electron `session.fetch`; OpenAI/Anthropic/DeepSeek default to `globalThis.fetch`.
- OpenRouter catalog startup sync calls `syncOpenRouterModelCatalog()` without a custom `fetchImpl`, so the catalog client falls back to default `fetch`.
- DFC/plugin downloads already have `PackageDownloadTransport` and Node/undici proxy dispatchers, plus a separate Electron `net.request` system-proxy probe/download path. Those are useful seams but not yet one unified transport policy.
- LocalEndpoint, LM Studio, and Ollama are intentionally loopback-only. They should be governed by an explicit local-direct policy, not by remote provider proxy policy.
- In-app browser and `shell.openExternal` are navigation/external-open exits, not fetch clients. They need browser/external-open governance rather than provider `NetworkTransport`.

Highest priority gaps:

1. Direct `fetch` still exists in active or semi-active remote paths: OpenRouter fetch transport, OpenRouter generation info, OpenRouter catalog/category, OpenRouter derivative jobs, image export/resolve, and several Node/script diagnostics.
2. OpenAI/Anthropic/DeepSeek main IPC wrappers use injectable fetch but default to `globalThis.fetch`, creating probable system-proxy bypass in Electron app paths.
3. Provider file upload inherits the provider IPC fetch choice. Google upload is session-backed; OpenAI/Anthropic upload currently inherit global fetch unless caller injects otherwise.
4. User/remote URL import has strong public-URL SSRF policy, but still uses `globalThis.fetch` by default and has no central proxy policy.
5. Scripts and smoke tools mix Node fetch, Electron `session.fetch`, `curl.exe`, and local `node:http` servers. They should be marked test/diagnostic-only and use explicit transport labels.

## Existing Transport Seams

These should be reused or formalized instead of adding new ad-hoc clients:

- `electron/net/providerHttpTransport.ts`: `createElectronSessionProviderFetch()` wraps Electron `session.defaultSession.fetch`.
- `src/next/provider/runtimeProviderAdapter.ts`: `ProviderStreamTransport` is the adapter-level fetch/baseUrl/apiKey contract for non-OpenRouter provider adapters.
- `src/next/transport/streamingTransportStrategy.ts`: OpenRouter has separate IPC and fetch stream strategies.
- `src/next/plugin-distribution/packageDownloader.ts`: `PackageDownloadTransport` already abstracts official package body transfer.
- `src/next/plugin-distribution/networkProxy.ts`: Node/undici proxy dispatcher support for plugin downloads: `direct`, `environment`, `manual`; `system` is explicitly unavailable for Node downloader transport.
- `electron/services/electronOfficialPackageDownloadService.ts`: Electron `net.request` file transport for official package downloads.
- `infra/files/urlProbe.ts`: public HTTP URL policy and fetch injection for URL probe/import.

## Network Egress Map

| Exit name | File path | Current network stack | May bypass system proxy | Existing fetch injection | Suggested NetworkTransport migration | Needs local direct policy | Risk |
|---|---|---|---|---|---|---|---|
| OpenRouter chat stream, main IPC | `src/next/live/openRouterLiveStream.ts`; `electron/ipc/openRouterStreamBridge.ts` | Renderer selects IPC strategy for legacy-store or `netExp.streamInMainProcess`; main process sends `POST /chat/completions` via `electron.net.request`. | Low to medium. Electron net normally follows Chromium/session proxy semantics, but this path has no explicit policy record. | No fetch injection; `net.request` is direct in bridge. | Wrap as `NetworkTransport.providerStream({ provider: "openrouter", stack: "electron-net" })`, with proxy diagnostics and audit metadata. | No. | High |
| OpenRouter chat stream, fetch branch | `src/next/live/openRouterLiveStream.ts`; `src/next/transport/openrouterFetch.ts` | Direct `fetch(url, { method: "POST" })` to `${baseUrl}/chat/completions`. | Yes, probable. It does not use Electron session/net policy. | No. | Replace branch with injected provider transport, preferably session-backed in Electron app; keep pure fetch only for test fixture injection. | No. | High |
| OpenRouter generation info | `src/next/transport/fetchGeneration.ts`; `scripts/gates/tc14-ui-live-smoke.mjs` | Direct `fetch` to `/generation?id=...`; gate script also uses direct fetch. | Yes, probable for app/runtime direct fetch and scripts. | No in production function. | Add `NetworkTransport.providerMetadata("openrouter")`; share the same transport as stream/catalog. | No. | Medium |
| OpenRouter catalog startup sync | `electron/jobs/catalogSyncStartup.ts`; `src/shared/modelCatalog/catalogSyncJob.ts`; `src/shared/modelCatalog/openRouterCatalogClient.ts` | Startup job calls `syncOpenRouterModelCatalog()` without `fetchImpl`; client defaults to `fetch`. Endpoints: `/models/user`, fallback `/models`, `/providers`, `/models/count`, `/models/:author/:slug/endpoints`. | Yes, probable. | Client and job accept `fetchImpl`, but startup caller does not inject one. | Inject catalog `NetworkTransport.providerCatalog("openrouter")` from main process, backed by Electron session/net policy. | No. | High |
| OpenRouter category membership | `src/next/modelCatalog/openRouterCategoryCache.ts` | `fetchImpl ?? fetch` to `/models?category=...`. | Yes when default fetch is used. | Yes, optional `fetchImpl`. | Route through catalog transport; avoid renderer/browser direct fetch for category refresh. | No. | Medium |
| Model endpoint detail view | `src/next/modelCatalog/modelEndpointDetailService.ts` | No network fetch; reads scoped catalog rows via `electronAPI.modelCatalogQueryScopedCurrent`. | No. | Not applicable. | Keep as local catalog query; do not add network refresh here without transport policy. | No. | Low |
| OpenAI Responses text chat | `electron/ipc/openAIResponsesTextChatIpc.ts`; `src/next/provider/openai-responses/openaiResponsesAdapter.ts` | IPC default `input.fetchImpl ?? globalThis.fetch`; adapter uses `transport.fetch` to `POST ${baseUrl}/responses`. | Yes, probable when default is used. | Yes at IPC/adapter level. | Default IPC to `createElectronSessionProviderFetch()` or a provider `NetworkTransport`; preserve explicit test injection. | No. | High |
| OpenAI Responses model availability | `electron/ipc/openAIResponsesModelAvailabilityIpc.ts`; `src/next/provider/openai-responses/openAIResponsesModelSource.ts` | IPC default `globalThis.fetch`; source calls `GET ${baseUrl}/models`. | Yes, probable. | Yes. | Same provider metadata transport as OpenAI chat. | No. | High |
| OpenAI provider file upload | `electron/services/providerFileUploadService.ts`; `electron/ipc/openAIResponsesTextChatIpc.ts` | Upload service uses caller `fetchImpl`; OpenAI path posts multipart to `${baseUrl}/files`. | Yes when inherited from OpenAI IPC default global fetch. | Yes. | Make file upload use provider `NetworkTransport.fileUpload("openai_responses")` so upload and chat share policy. | No. | High |
| Anthropic text chat | `electron/ipc/anthropicTextChatIpc.ts`; `src/next/provider/anthropic/anthropicAdapter.ts` | IPC default `input.fetchImpl ?? globalThis.fetch`; adapter posts to `${baseUrl}/messages`. | Yes, probable. | Yes. | Default IPC to provider transport/session fetch. | No. | High |
| Anthropic model availability | `electron/ipc/anthropicModelAvailabilityIpc.ts`; `src/next/provider/anthropic/anthropicModelSource.ts` | IPC default global fetch; paged `GET ${baseUrl}/models?limit=100&after_id=...`. | Yes, probable. | Yes. | Same provider metadata transport as Anthropic chat. | No. | High |
| Anthropic provider file upload | `electron/services/providerFileUploadService.ts`; `electron/ipc/anthropicTextChatIpc.ts` | Upload service uses caller `fetchImpl`; Anthropic path posts multipart to `${baseUrl}/files`. | Yes when inherited from Anthropic IPC default global fetch. | Yes. | Route through provider file-upload transport and keep beta header policy there. | No. | High |
| Google AI Studio text chat | `electron/ipc/googleAIStudioTextChatIpc.ts`; `src/next/provider/gemini/geminiAdapter.ts`; `electron/net/providerHttpTransport.ts` | IPC default `createElectronSessionProviderFetch()`; adapter posts to `.../v1beta/models/${model}:streamGenerateContent?alt=sse`. | Lower. Uses Electron `session.fetch`, but no explicit governance record. | Yes. | Formalize current session-backed fetch as provider `NetworkTransport` with diagnostics. | No. | Medium |
| Google AI Studio model availability | `electron/ipc/googleAIStudioModelAvailabilityIpc.ts`; `src/next/provider/gemini/geminiModelSource.ts` | IPC default session-backed fetch; source calls `GET ${baseUrl}/v1beta/models?pageSize=100...`. | Lower. | Yes. | Same Google provider transport. | No. | Medium |
| Gemini file upload | `electron/services/providerFileUploadService.ts`; `electron/ipc/googleAIStudioTextChatIpc.ts` | Upload service uses caller `fetchImpl`; Google default is session-backed. Starts at `${baseUrl}/upload/v1beta/files`, then posts to provider-returned upload URL, then polls `${baseUrl}/v1beta/${name}`. | Lower for initial/poll; final upload URL policy is implicit. | Yes. | Add provider-upload transport with an allowed Google upload URL policy for the returned `x-goog-upload-url`. | No. | Medium |
| DeepSeek text chat | `electron/ipc/deepSeekTextChatIpc.ts`; `src/next/provider/deepseek/deepSeekAdapter.ts` | IPC default `globalThis.fetch`; adapter posts to `${baseUrl}/chat/completions`. | Yes, probable. | Yes. | Default IPC to provider transport/session fetch. | No. | High |
| DeepSeek model availability | `electron/ipc/deepSeekModelAvailabilityIpc.ts`; `src/next/provider/deepseek/deepSeekModelSource.ts` | IPC default global fetch; source calls `GET ${baseUrl}/models`. | Yes, probable. | Yes. | Same DeepSeek provider metadata transport. | No. | High |
| Generic OpenAI-compatible chat | `src/next/provider/generic/genericAdapter.ts`; `src/next/provider/generic/genericEndpointDescriptor.ts` | Adapter uses injected `fetchFn` or `transport.fetch`; endpoint can be remote HTTPS or localhost HTTP depending descriptor. | Depends on caller transport. | Yes. | Split into remote generic transport and local generic direct transport based on validated endpoint classification. | Yes, when endpoint is localhost. | Medium |
| URL probe and URL import | `infra/files/urlProbe.ts`; `infra/files/fileIngestionService.ts` | `options.fetch ?? globalThis.fetch`; does HEAD then Range GET / GET through public URL policy. Blocks credentials, localhost, private, link-local, multicast, and redirects to blocked hosts. | Yes, probable when default fetch is used. | Yes. | Add `NetworkTransport.publicUrlImport` that preserves `assertPublicHttpUrl` and redirect DNS re-checks. | No; local must remain rejected here. | High |
| OpenRouter derivative jobs | `infra/files/openRouterDerivativeClient.ts`; `infra/files/derivativeJobService.ts` | Direct `fetch` to OpenRouter `/chat/completions` for transcript and `/embeddings` for embeddings. | Yes, probable. | No. | Add derivative transport to the OpenRouter provider transport family. | No. | High |
| DFC/plugin official package Node fetch transport | `src/next/plugin-distribution/packageDownloader.ts`; `infra/files/enginePluginLifecycleService.ts`; `src/next/plugin-distribution/networkProxy.ts` | Direct `fetch` with optional undici dispatcher from `EnvHttpProxyAgent` or `ProxyAgent`; `system` returns explicit unavailable for Node downloader. | Yes for `direct` or default/no settings; environment/manual can be honored through undici dispatcher. | Transport abstraction exists as `PackageDownloadTransport`, but concrete fetch uses global fetch. | Convert concrete Node fetch transport to `NetworkTransport.packageDownload({ mode })`; keep manual/env dispatcher policy inside transport. | No. | High |
| DFC/plugin official package Electron net transport | `electron/services/electronOfficialPackageDownloadService.ts`; `electron/services/electronConversionService.ts` | `electron.net.request` streaming to file, with resume and range support. | Lower; should follow Electron/Chromium net proxy semantics. | No fetch injection; request function can be injected for tests. | Make this the `system` implementation of package download transport. | No. | Medium |
| LibreOffice system proxy diagnostic | `electron/ipc/libreOfficeSystemProxyProbeIpc.ts` | Fixed LibreOffice official asset probe via `electron.net.request`, HEAD plus 1 KB Range. Host allowlist: `github.com`, `release-assets.githubusercontent.com`. | Lower. | No fetch injection; request injection for tests. | Keep as package-download diagnostic transport, not a generic URL fetcher. | No. | Low |
| DFC official asset body intercept | `infra/files/dfcLibreOfficeOfficialAssetBodyIntercept.ts` | Direct `fetch(request.transportRef)` for a fixed official asset intercept transport. | Yes, probable. | No. | Route through package download transport or delete direct body fetch once Electron/Node package transports are unified. | No. | Medium |
| Image export/resolve in main process | `electron/ipc/imageIpc.ts` | For `http://` and `https://` image URLs, direct `fetch(imageUrl)` in main process. | Yes, probable. | No. | Add image/download transport with explicit public-URL policy, size limit, content-type allowlist, and proxy semantics. | Usually no; local/private should be rejected unless a specific local image policy is added. | High |
| Image export fallback in renderer | `src/ui-kit/chat/ChatMessageBubble.vue` | Browser/renderer `fetch(url)` fallback when Electron export IPC is unavailable. | Medium. Browser fetch follows renderer networking/CORS, but not app transport policy. | No. | Prefer Electron IPC image export transport; keep fallback only for web build with documented limits. | No. | Medium |
| In-app browser navigation | `electron/services/inappBrowser.ts`; `electron/ipc/inappBrowserIpc.ts` | Chromium `BrowserView.webContents.loadURL()`, tab navigation, popup deny/open new in-app tab. Protocol is effectively http/https after normalization; navigation blocks non-http(s) in handlers. | Lower for system proxy; not centrally auditable. | Not applicable. | Do not migrate to provider `NetworkTransport`; add BrowserNavigationPolicy telemetry and proxy diagnostics if needed. | No. | Medium |
| Main window external navigation | `electron/windows/mainWindow.ts` | External `http(s)` window-open/will-navigate is handed to `shell.openExternal`; Vite dev URL is exempt. | Not governed by app once opened. | Not applicable. | Track under ExternalOpenPolicy; sanitize and validate via shared policy if possible. | No. | Medium |
| Shell open external IPC | `electron/ipc/shellIpc.ts`; `electron/security/externalUrlPolicy.ts` | `shell.openExternal()` after `validateExternalUrl()` allows only `http:` and `https:`. | Not governed by app once opened. | Not applicable. | Keep separate from provider transport; add audit event and optional user confirmation for sensitive surfaces. | No. | Medium |
| Electron HTML to PDF conversion sandbox | `electron/services/electronHtmlPdfConversionAdapter.ts` | Loads only a generated `data:text/html` URL; blocks window open, navigation away, non-data resources, and downloads through session policies. | No usable network exit by design. | Not applicable. | Keep as blocked egress policy; no provider transport needed. | No. | Low |
| Renderer build-id check | `src/main.ts` | Same-origin renderer `fetch('/build-id.json', { cache: 'no-store' })`. | No external egress; dev server/local app asset only. | No. | Exclude from provider transport; document as app-local asset fetch. | No. | Low |
| LocalEndpoint diagnostics and chat | `electron/ipc/localEndpointDiagnosticsIpc.ts`; `electron/ipc/localEndpointTextChatIpc.ts` | `globalThis.fetch` default to loopback-only URLs; probes `/v1/models`, `/api/tags`; chat posts `/v1/chat/completions`. Rejects remote host and embedded credentials. | Yes, but this is desired direct local behavior. | Yes. | Add `NetworkTransport.localDirect("local_endpoint")`, never remote proxy by default. | Yes. | Medium |
| LM Studio probe/control/chat | `electron/ipc/lmStudioLocalProviderIpc.ts` | `globalThis.fetch` default; endpoint allowlist: `localhost`, `127.0.0.1`, `::1`; default `http://127.0.0.1:1234`. Uses OpenAI-compatible and native REST paths. | Yes, desired local direct. | Yes. | Add `NetworkTransport.localDirect("lm_studio")`; preserve loopback-only validation. | Yes. | Medium |
| Ollama probe/control/chat | `electron/ipc/ollamaLocalProviderIpc.ts` | `globalThis.fetch` default; endpoint allowlist: `localhost`, `127.0.0.1`, `::1`; default `http://127.0.0.1:11434`. Uses `/api/tags`, `/api/ps`, `/api/version`, `/api/chat`, `/api/generate`, `/v1/models`. | Yes, desired local direct. | Yes. | Add `NetworkTransport.localDirect("ollama")`; preserve loopback-only validation. | Yes. | Medium |
| Provider multimodal live smoke | `scripts/smoke/m1b-image-live-smoke.cjs`; `scripts/smoke/m1c-pdf-live-smoke.cjs`; `scripts/smoke/m1d-file-upload-cache-smoke.cjs` | Electron `session.defaultSession.fetch` to OpenRouter/OpenAI/Anthropic/Gemini and `https://example.com`; `m1b` also records `resolveProxy`. | Lower than Node fetch but test-only. | Script-local wrapper only. | Mark as smoke transport, preferably share `createElectronSessionProviderFetch` semantics. | No. | Medium |
| Provider/local UI smoke scripts | `scripts/smoke/provider-text-chat-smoke.mjs`; `scripts/smoke/local-endpoint-text-chat-smoke.mjs`; `scripts/smoke/electron-shell-smoke.mjs`; `scripts/smoke/playwright-multimodal-ui-smoke.cjs` | `node:http` local mock servers plus `fetch` to local Vite/readiness URLs; local endpoint smoke enforces loopback. | Yes, desired local direct for local readiness/mocks. | No central injection. | Mark as `NetworkTransport.localTestOnly` if formalized; no remote provider migration needed for mock server path. | Yes. | Low |
| OpenRouter debug scripts | `scripts/openrouter/openrouter_web_plugin_matrix.mjs`; `scripts/openrouter/debug-echo-dryrun.mjs`; `scripts/openrouter/openrouter_stream.ps1` | Node `fetch` or `curl.exe` to `https://openrouter.ai/api/v1/chat/completions`; PowerShell captures curl stdout/stderr logs. | Yes. `curl.exe` has independent proxy behavior. | No. | Add explicit script proxy flags/env reporting and redact log policy; do not silently inherit app transport. | No. | High |
| DFC diagnostic scripts | `scripts/dfc/libreoffice-network-proxy-diagnostic-probe.mjs`; `scripts/dfc/libreoffice-official-install-reliability-diagnosis.mjs`; `scripts/dfc/libreoffice-github-asset-resume-capability-probe.mjs`; `scripts/dfc/office-pdf-libreoffice-dev-smoke.mjs`; `scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs` | Node `fetch` to GitHub/release asset URLs, local Vite readiness, and explicit proxy-diagnostic routes. | Yes for Node fetch unless script config supplies proxy route. | Script-local wrappers only. | Align diagnostics names with package `NetworkTransport` modes; keep smoke blocked-by-env classifications. | No for GitHub; yes for local Vite checks. | Medium |
| Gate/diagnostic local browser tooling | `scripts/gates/vite-renderer-resolution-smoke.mjs`; `scripts/diagnostics/dev-white-screen-capture.mjs`; `scripts/dev/package-official-magika-v011.mjs` | `node:http` local server/probe and Node `fetch` to local CDP/Vite URLs. Magika dev script serves local model files from `127.0.0.1`. | Yes, desired local direct. | No. | Mark local diagnostic transport; keep outside app proxy settings. | Yes. | Low |

## API Usage Points

`globalThis.fetch` defaults:

- `infra/files/urlProbe.ts`
- `infra/files/fileIngestionService.ts`
- `electron/ipc/openAIResponsesTextChatIpc.ts`
- `electron/ipc/openAIResponsesModelAvailabilityIpc.ts`
- `electron/ipc/anthropicTextChatIpc.ts`
- `electron/ipc/anthropicModelAvailabilityIpc.ts`
- `electron/ipc/deepSeekTextChatIpc.ts`
- `electron/ipc/deepSeekModelAvailabilityIpc.ts`
- `electron/ipc/localEndpointTextChatIpc.ts`
- `electron/ipc/localEndpointDiagnosticsIpc.ts`
- `electron/ipc/lmStudioLocalProviderIpc.ts`
- `electron/ipc/ollamaLocalProviderIpc.ts`

Direct `fetch(...)` without a central injected transport:

- `src/next/transport/openrouterFetch.ts`
- `src/next/transport/fetchGeneration.ts`
- `src/shared/modelCatalog/openRouterCatalogClient.ts` when no `fetchImpl` is passed
- `src/next/modelCatalog/openRouterCategoryCache.ts` when no `fetchImpl` is passed
- `infra/files/openRouterDerivativeClient.ts`
- `infra/files/dfcLibreOfficeOfficialAssetBodyIntercept.ts`
- `infra/files/enginePluginLifecycleService.ts`
- `src/next/plugin-distribution/packageDownloader.ts`
- `electron/ipc/imageIpc.ts`
- `src/ui-kit/chat/ChatMessageBubble.vue`
- scripts listed in the egress map above

Adapter-level `transport.fetch`:

- `src/next/provider/openai-responses/openaiResponsesAdapter.ts`
- `src/next/provider/anthropic/anthropicAdapter.ts`
- `src/next/provider/deepseek/deepSeekAdapter.ts`
- `src/next/provider/gemini/geminiAdapter.ts`
- `src/next/provider/generic/genericAdapter.ts`

Electron `net.request`:

- `electron/ipc/openRouterStreamBridge.ts`
- `electron/services/electronOfficialPackageDownloadService.ts`
- `electron/ipc/libreOfficeSystemProxyProbeIpc.ts`
- `electron/services/electronConversionService.ts` injects official package request capability

Electron `session.fetch`:

- `electron/net/providerHttpTransport.ts`
- `scripts/smoke/m1b-image-live-smoke.cjs`
- `scripts/smoke/m1c-pdf-live-smoke.cjs`
- `scripts/smoke/m1d-file-upload-cache-smoke.cjs`

`node:http`:

- `scripts/smoke/provider-text-chat-smoke.mjs`
- `scripts/smoke/local-endpoint-text-chat-smoke.mjs`
- `scripts/gates/vite-renderer-resolution-smoke.mjs`
- `scripts/dev/package-official-magika-v011.mjs`

`node:https`:

- No runtime call site found in the scoped scan.

`axios`:

- No runtime call site found in the scoped scan. `axios` appears in lockfile dependency data only.

`undici`:

- `src/next/plugin-distribution/networkProxy.ts` imports `EnvHttpProxyAgent` and `ProxyAgent`.
- `package.json` declares `undici`.

`curl.exe`:

- `scripts/openrouter/openrouter_stream.ps1`

`tests/infra`:

- Directory not present in this checkout during investigation.

## Migration Guidance

Proposed transport policy buckets:

1. `remoteProvider`: OpenRouter/OpenAI/Anthropic/Google/DeepSeek/Generic remote chat, file upload, generation metadata, model availability.
2. `remoteCatalog`: OpenRouter model catalog sync, category membership, endpoint enrichment if re-enabled later.
3. `publicUrlImport`: URL probe/import and image export from user-provided URLs; must preserve public-only DNS/redirect checks and should add size/content-type limits where missing.
4. `packageDownload`: DFC/plugin official package metadata, HEAD/Range probes, full body transfer, and resume.
5. `localDirect`: LocalEndpoint, LM Studio, Ollama, local Vite/CDP readiness, local mock servers.
6. `browserNavigation`: in-app BrowserView navigation, main window external handoff, and shell external open.

Immediate migration order:

1. Move OpenAI/Anthropic/DeepSeek IPC defaults from `globalThis.fetch` to the same session-backed provider fetch already used by Google, behind a named transport factory.
2. Move OpenRouter catalog startup sync to an injected main-process catalog transport; do not let `OpenRouterCatalogClient` default to global fetch in startup behavior.
3. Replace direct OpenRouter derivative and generation-info fetches with OpenRouter provider metadata/derivative transport.
4. Add an image/public URL transport for `electron/ipc/imageIpc.ts` and renderer export fallback, with public URL rejection of localhost/private targets.
5. Unify DFC Node fetch and Electron net package transports under a single package transport selector where `system` maps to Electron net and `manual/environment/direct` behavior is explicit.
6. Mark LocalEndpoint/LM Studio/Ollama as explicit local-direct exits in code and diagnostics so later proxy work does not accidentally route loopback traffic through a proxy.

## Notes

- This report intentionally does not change proxy settings or runtime behavior.
- Risk levels are governance risk, not proof of current user-visible failure.
- `globalThis.fetch` in Node/Electron main process is treated as probable system-proxy bypass unless a caller explicitly supplies an undici dispatcher or an Electron session/net-backed transport.
