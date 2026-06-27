# Ollama Local Provider v1

Date: 2026-06-27

Scope: Ollama Local as a first-class local provider for loopback-only text chat, native REST diagnostics, and native load/unload control-plane operations.

## Official Docs Checked

Checked Ollama official API docs before implementation:

- API introduction: `https://docs.ollama.com/api/introduction`
- Native chat: `https://docs.ollama.com/api/chat`
- Native generate: `https://docs.ollama.com/api/generate`
- Local model list: `https://docs.ollama.com/api/tags`
- Running model list: `https://docs.ollama.com/api/ps`
- Model metadata: `https://docs.ollama.com/api/show`
- Version: `https://docs.ollama.com/api/version`
- OpenAI compatibility: `https://docs.ollama.com/api/openai-compatibility`

Key implementation notes from docs:

- The default local endpoint is `localhost:11434`.
- Native REST uses `/api/*`.
- Native chat uses `POST /api/chat`; native generate uses `POST /api/generate`.
- Native chat/generate stream by default and accept `stream: false`.
- `GET /api/tags` lists local models.
- `GET /api/ps` lists running models.
- `GET /api/version` returns the Ollama version.
- Empty native chat messages can load a model.
- Empty native chat messages plus `keep_alive: 0` can unload a model.
- OpenAI-compatible model inventory uses `GET /v1/models`.
- OpenAI-compatible chat uses `POST /v1/chat/completions`.
- OpenAI-compatible Responses is available at `POST /v1/responses`.

## Provider Config

The v1 renderer config is explicit Ollama config, not Generic live and not the older LocalEndpoint config:

```ts
type OllamaLocalProviderConfig = {
  providerKey: 'ollama_local'
  endpointUrl: string
  nativeControls: {
    diagnosticsEnabled: boolean
    manualLoadUnloadEnabled: boolean
    autoLoadBeforeSendEnabled: boolean
    autoUnloadAfterSendEnabled: boolean
    autoUnloadAfterIdleEnabled?: boolean
  }
  chatMode: 'native_rest' | 'openai_compatible'
  nativeRest: {
    basePath: '/api'
    preferredEndpoint: 'chat' | 'generate'
  }
  openAICompatible: {
    basePath: '/v1'
    preferredEndpoint: 'chat_completions' | 'responses'
  }
}
```

Default endpoint: `http://127.0.0.1:11434`.

The default is only a default. The UI can change host and port, but validation only allows `localhost`, `127.0.0.1`, and `[::1]` / `::1`. Embedded credentials, public hosts, LAN hosts, `file://`, sockets, credentials, and arbitrary auth/header inputs are rejected or absent.

## Implemented Surface

- Current-session Ollama config UI in `ChatSessionConsole`.
- Main-process IPC:
  - `ollama:probe`
  - `ollama:load-model`
  - `ollama:unload-model`
  - `ollama-chat:stream-text`
  - `ollama-chat:abort`
- Preload bridges:
  - `window.ollamaProvider`
  - `window.ollamaChat`
- Runtime selection key: `ollama_local`.
- Runtime capability source: `ollama_local`.
- Send route: experimental text-only route.

## Native REST Control Plane

Probe:

- Calls `GET /api/tags`.
- Calls `GET /api/ps`.
- Calls `GET /api/version`.
- Calls `GET /v1/models`.
- Reports native REST availability and OpenAI-compatible availability independently.
- Parses model metadata conservatively: name/model id, digest, size, VRAM size, expiration, family, families, parameter size, and quantization level.

Manual load/unload:

- Load calls `POST /api/chat` with empty `messages`, `stream: false`.
- Unload calls `POST /api/chat` with empty `messages`, `stream: false`, and `keep_alive: 0`.
- Both are gated by `manualLoadUnloadEnabled`.
- Failures are sanitized; raw response bodies are not shown in UI.

Auto-load before send:

- Before Ollama chat sends, Starverse probes the selected model through `/api/ps` and `/api/tags`.
- If the selected model is known and not running, and `autoLoadBeforeSendEnabled` is false, send is blocked with a safe `model_not_loaded` transport error before chat.
- If `autoLoadBeforeSendEnabled` is true, Starverse loads the selected model with the native control plane, then sends through the selected chat mode.
- It does not pull a model, download a model, start Ollama, switch to another model, or use non-loopback endpoints.

Auto-unload after send:

- Implemented for models auto-loaded by Starverse in the current send.
- Runs only after a normal completed stream.
- Does not unload on abort or stream error.
- Unload failures are swallowed as non-visible warnings for v1 and do not pollute assistant text.

Auto-unload after idle:

- Exposed as a v1 config flag and UI toggle.
- Deferred for timer/concurrency implementation. It is not treated as an implemented runtime behavior.

## Chat Modes

Native REST mode:

- Endpoint: `POST /api/chat` with `stream: true`.
- Optional endpoint: `POST /api/generate` with `stream: true`.
- Sends text-only messages.
- Maps only visible `message.content` or `response` text to OpenAI-compatible text delta frames for the existing streaming core.
- Filters native `message.thinking` and metadata from visible text.
- Emits a terminal synthetic `[DONE]` frame when native `done: true` is observed or the stream closes.

OpenAI-compatible mode:

- Default endpoint: `POST /v1/chat/completions` with `stream: true`.
- Optional endpoint: `POST /v1/responses` with `stream: true`.
- Text-only messages are forwarded.
- No credentials, custom headers, tools, files, image payloads, reasoning controls, or Generic live routing.

## Live Environment Matrix

Endpoint used: `http://127.0.0.1:11434`

Selected smoke model: `hf.co/bartowski/google_gemma-4-E4B-it-GGUF:Q5_K_M`

No secrets were used or logged. No process launch/stop and no model pull/download/delete/push was attempted.

| Case | Result |
| --- | --- |
| Ollama running | Passed. `GET /api/tags` returned HTTP 200. |
| Version probe | Passed. `GET /api/version` returned `0.30.11`. |
| Native local model inventory | Passed. `GET /api/tags` returned 2 local models. |
| Running model inventory before smoke | Passed. `GET /api/ps` returned 0 running models. |
| OpenAI-compatible model inventory | Passed. `GET /v1/models` returned 2 models. |
| Manual load | Passed. `POST /api/chat` with empty `messages` returned HTTP 200. |
| Post-load running state | Passed. `GET /api/ps` showed the selected model running. |
| Native REST non-stream chat | Passed. `POST /api/chat` returned visible `OK`. |
| OpenAI-compatible non-stream chat completions | Passed. `POST /v1/chat/completions` returned visible `OK`. |
| Native REST streaming chat | Passed. `POST /api/chat` with `stream: true` returned visible `OK` and native `done: true`. |
| OpenAI-compatible streaming chat completions | Passed. `POST /v1/chat/completions` with `stream: true` returned visible `OK`. The observed stream did not include a `[DONE]` frame before response close in this environment. |
| Manual unload | Passed. `POST /api/chat` with empty `messages` and `keep_alive: 0` returned HTTP 200. |
| Post-unload running state | Passed after a short delay. `GET /api/ps` returned 0 running models. |
| Auto-load before send sequence | Covered by unit tests. Live manual load plus send used the same native load endpoint/body. |
| Auto-unload after send sequence | Covered by unit tests. Live manual unload verified the same native unload endpoint/body and final `/api/ps` cleanup. |
| Auto-unload after idle | Deferred. Timer/concurrency implementation not included in v1. |
| Endpoint unavailable | Passed safe unavailable behavior. Probe against `127.0.0.1:9` failed as a timeout/connection failure without crash. |

The separate "Ollama not running" condition was not produced by stopping Ollama because v1 must not start or stop the Ollama process. It was represented by the loopback unavailable endpoint check above.

## Boundary Checks

- No model pull/download/create/copy/delete/push endpoint, UI, switch, or flow was added.
- No Ollama process launch/stop was added.
- LAN and public hosts are rejected by validator.
- Embedded URL credentials are rejected.
- Renderer cannot provide Authorization, Bearer, API keys, or arbitrary headers for Ollama v1.
- No RuntimeProviderRegistry, EndpointRegistry, ProviderRegistry, or ModelSourceRegistry was introduced.
- Generic OpenAI-compatible live routing remains deferred.
- OpenRouter catalog was not modified.
- Main ModelPickerDialog was not modified.
- Send Plan capability was not modified.
- DFC/file-pipeline paths were not modified.

## V1 Status

Ollama Local Provider v1 is suitable for hardening after targeted automated validation. Remaining hardening candidates:

- Dedicated UI warning channel for non-visible auto-unload failures.
- Optional idle auto-unload timer with concurrency protection.
- Broader native REST event-shape fixtures if Ollama expands streaming event variants.
- Environment note for OpenAI-compatible streams that close without an explicit `[DONE]` frame.
