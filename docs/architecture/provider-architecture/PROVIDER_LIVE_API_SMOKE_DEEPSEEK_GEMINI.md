# Provider Live API Smoke: DeepSeek and Google AI Studio

## Result

Recommendation: do not mark the full DeepSeek + Gemini live E2E as passed.

DeepSeek completed one real model availability refresh and one real text stream send. Google AI Studio / Gemini was blocked at the model availability step after the single allowed retry.

This report contains only redacted credential status and safe provider status. It does not contain raw API keys, Authorization headers, Bearer tokens, provider request payloads, or provider error bodies.

## Test Metadata

- Tested at: 2026-06-26T22:13:55.4376295+08:00
- Commit: 18cdebc0e6f048919603201eb2151a7d24450e12
- Environment: Windows development workspace at `D:\Starverse`
- UI route: Electron + Playwright against a temporary `--user-data-dir`.
- Temporary profile cleanup: completed.
- Providers intentionally skipped: OpenAI Responses, Anthropic, OpenRouter.
- Existing dirty worktree before this live smoke: Provider Runtime Route Consolidation v1 files were already dirty / untracked.

## DeepSeek Official

- Credential configured through Settings UI: yes.
- Credential source/backend observed in the first live run: `legacy_store` / not reported by that stale built artifact.
- Availability refresh: completed.
- Availability result: 4 DeepSeek model availability records.
- Availability sources shown by UI:
  - `deepseek_list_models_api_docs`
  - `deepseek_models_pricing_docs`
  - `deepseek_api_intro_docs`
- Provider-reported models observed:
  - `deepseek-v4-flash`
  - `deepseek-v4-pro`
- Curated/deprecated aliases shown with warnings:
  - `deepseek-chat`
  - `deepseek-reasoner`
- Selected model for send: `deepseek-reasoner`.
- Text stream send: completed.
- Visible answer: non-empty; visible text included `OK`.
- Reasoning artifact diagnostics: none observed in this short live run.
- Visible text leak check: no `reasoning_content` / thought marker observed in visible text.
- Abnormal behavior: no answer abnormality observed. Reasoning details were not produced by the live response, so artifact rendering was not validated by this call.

Important limitation: this DeepSeek run happened before rebuilding stale `dist-electron` artifacts that were missing the Gemini model availability preload bridge. DeepSeek was not repeated after rebuild to respect the one-call budget for provider live sends.

## Google AI Studio / Gemini

- Credential configured through Settings UI: yes.
- Credential source/backend observed after rebuild: `secure_store` / `electron_safe_storage`.
- First availability attempt: blocked before provider request by stale built artifact missing the `googleAIStudioModels` preload bridge.
- Corrective action: rebuilt development Electron/Vite artifacts from current source.
- Retry availability attempt: reached the service-backed credential path, then failed safely as `network_error`.
- Follow-up network定位: DNS resolved `generativelanguage.googleapis.com`, but TCP/TLS to `generativelanguage.googleapis.com:443` timed out. Node fetch without credentials also failed before HTTP response with `ConnectTimeoutError` / `UND_ERR_CONNECT_TIMEOUT`.
- Follow-up service-backed availability retry: failed safely as `network_error`, `httpStatus: null`, elapsed about 10.7s.
- Follow-up proxy diagnostics:
  - Electron main process `process.versions.node`: `22.21.1`.
  - `HTTP_PROXY` configured: no.
  - `HTTPS_PROXY` configured: no.
  - `NO_PROXY` configured: no.
  - `session.defaultSession.resolveProxy('https://generativelanguage.googleapis.com/v1beta/models')`: `PROXY configured`.
  - Current Google AI Studio model availability HTTP client: Node fetch / undici via `globalThis.fetch`.
  - Current Google AI Studio text chat HTTP client: Node fetch / undici via `globalThis.fetch`.
- Selected model: not selected.
- Text stream send: not run.
- Thought artifact diagnostics: not run.
- Abnormal behavior: Gemini live E2E is blocked at model source availability. This was not advanced to send because the task budget allowed only one retry and the provider availability step did not pass.

## Security Checks

- Raw API key in report: no.
- Raw API key in source, `.env`, fixtures, or git diff: no.
- Renderer visible text leak scan: passed for the completed DeepSeek run.
- Authorization / Bearer visible text leak scan: passed for the completed DeepSeek run.
- Credential configuration path: Settings UI -> preload credential bridge -> main process credential service.
- Temporary profile: deleted after each run.
- Provider errors shown to renderer: redacted safe messages only.

## Boundary Checks

- OpenAI Responses live request count: zero intentional live calls.
- Anthropic live request count: zero intentional live calls.
- OpenRouter live request count: zero intentional live calls.
- Generic live: not triggered.
- LocalEndpoint: not triggered.
- Main ModelPickerDialog: not used as a multi-provider picker.
- OpenRouter catalog namespace: not exercised or modified.
- RuntimeProviderRegistry / EndpointRegistry / ProviderRegistry / ModelSourceRegistry: not introduced by this live smoke.
- Send Plan capability semantics: not modified.

## Harness Notes

The first Google availability attempt exposed a stale local build issue: source `electron/preload.ts` already exposed `googleAIStudioModels`, but the built preload artifact did not. The development build was refreshed with:

```text
node scripts/build-db-worker.cjs
npx vite build --mode development --config vite.config.ts
```

After rebuild, the Gemini availability bridge was available and the retry reached the model source request path, but the request failed safely as `network_error`.

## Gemini Network Error Follow-Up

The Gemini availability failure is currently classified as network reachability, not credential rejection and not provider HTTP response redaction:

- Endpoint implementation reviewed: `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100`.
- Credential transport reviewed: main-process service-backed API key is sent as `x-goog-api-key`; renderer payload credentials are rejected.
- HTTP mapping reviewed: non-2xx responses return `http_error` with sanitized `httpStatus`; 401/403 and 429 have safe specialized messages.
- Observed failure mode: Node fetch did not receive an HTTP response, so there was no HTTP status to remap.
- Proxy-chain conclusion: Chromium/session proxy resolution reports a proxy for the Gemini target, but the current provider request path uses Node fetch / undici and does not use Electron `session.fetch` or `net.request`. In this environment the provider request path therefore does not reach Google API through the configured Chromium/session proxy.

Recommended code direction: add a minimal provider live HTTP transport seam that can use Electron session-backed networking for Google AI Studio model availability and text chat, or switch only the Google AI Studio official model/text paths to `session.fetch` / `net.request`. Do not describe environment proxy support as equivalent to Chromium/system proxy unless the implementation actually uses that chain. A future diagnostic enhancement could add an opt-in redacted transport detail for maintainers, but it should not expose provider headers, raw error bodies, or raw API keys.

## Recommendation

- DeepSeek official live availability + send can be treated as a partial live pass for the text path, with the limitation that reasoning artifact rendering was not exercised.
- Gemini / Google AI Studio should not be treated as live-passed; it is blocked at model availability with safe `network_error` after one allowed retry and follow-up connectivity checks.
- Do not enter a Gemini live-send hardening claim until Gemini model availability succeeds in the same current built artifact.
