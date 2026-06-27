# LM Studio Local Provider v1

Date: 2026-06-27

Scope: LM Studio Local as a first-class local provider for loopback-only text chat and native REST control-plane operations.

## Official Docs Checked

Checked LM Studio Developer Docs before implementation:

- REST API overview: `https://lmstudio.ai/docs/developer/rest`
- Native REST model list: `https://lmstudio.ai/docs/developer/rest/list`
- Native REST model load: `https://lmstudio.ai/docs/developer/rest/load`
- Native REST model unload: `https://lmstudio.ai/docs/developer/rest/unload`
- Native REST chat: `https://lmstudio.ai/docs/developer/rest/chat`
- Native REST streaming events: `https://lmstudio.ai/docs/developer/rest/streaming-events`
- OpenAI compatibility overview: `https://lmstudio.ai/docs/developer/openai-compat`
- OpenAI-compatible models: `https://lmstudio.ai/docs/developer/openai-compat/models`
- OpenAI-compatible chat completions: `https://lmstudio.ai/docs/developer/openai-compat/chat-completions`
- OpenAI-compatible responses: `https://lmstudio.ai/docs/developer/openai-compat/responses`

Key implementation notes from docs:

- Native REST uses `/api/v1/*`.
- Native REST model inventory is `GET /api/v1/models`.
- Native REST model lifecycle uses `POST /api/v1/models/load` and `POST /api/v1/models/unload`.
- Native REST chat uses `POST /api/v1/chat`.
- OpenAI-compatible model inventory uses `GET /v1/models`.
- OpenAI-compatible chat can use `/v1/chat/completions` or `/v1/responses`.
- Native REST SSE carries event names such as `chat.start`, `message.delta`, `chat.end`, and `error`; v1 maps only visible `message.delta.content` text and terminal/error state.

## Provider Config

The v1 renderer config is explicit LM Studio config, not Generic live and not the older LocalEndpoint config:

```ts
type LMStudioLocalProviderConfig = {
  providerKey: 'lm_studio'
  endpointUrl: string
  nativeRestControls: {
    diagnosticsEnabled: boolean
    manualLoadUnloadEnabled: boolean
    autoLoadBeforeSendEnabled: boolean
    autoUnloadAfterSendEnabled: boolean
    autoUnloadAfterIdleEnabled?: boolean
  }
  chatMode: 'openai_compatible' | 'native_rest'
  openAICompatible: {
    basePath: '/v1'
    preferredEndpoint: 'chat_completions' | 'responses'
  }
  nativeRest: {
    basePath: '/api/v1'
  }
}
```

Default endpoint: `http://127.0.0.1:1234`.

The default is only a default. The UI can change host and port, but validation only allows `localhost`, `127.0.0.1`, and `[::1]` / `::1`. Embedded credentials, public hosts, LAN hosts, `file://`, sockets, and arbitrary auth/header inputs are rejected or absent.

## Implemented Surface

- Current-session LM Studio config UI in `ChatSessionConsole`.
- Main-process IPC:
  - `lm-studio:probe`
  - `lm-studio:load-model`
  - `lm-studio:unload-model`
  - `lm-studio-chat:stream-text`
  - `lm-studio-chat:abort`
- Preload bridges:
  - `window.lmStudioProvider`
  - `window.lmStudioChat`
- Runtime selection key: `lm_studio`.
- Runtime capability source: `lm_studio_local`.
- Send route: experimental text-only route.

## Native REST Control Plane

Probe:

- Calls `GET /api/v1/models`.
- Calls `GET /v1/models`.
- Reports whether native REST and OpenAI-compatible model APIs are available independently.
- Parses native model metadata conservatively: key, display name, type, publisher, architecture, quantization, size, params string, context length, format, capabilities, loaded state, and loaded instance ids.

Manual load/unload:

- Load calls `POST /api/v1/models/load`.
- Unload calls `POST /api/v1/models/unload`.
- Both are gated by `manualLoadUnloadEnabled`.
- Failures are sanitized; raw response bodies are not shown in UI.

Auto-load before send:

- Before LM Studio chat sends, Starverse probes the selected model via native REST.
- If the selected model is known and unloaded, and `autoLoadBeforeSendEnabled` is false, send is blocked with a safe `model_not_loaded` transport error before chat.
- If `autoLoadBeforeSendEnabled` is true, Starverse loads the selected model, then sends through the selected chat mode.
- It does not download a model, start LM Studio, switch to another model, or use non-loopback endpoints.

Auto-unload after send:

- Implemented for models auto-loaded by Starverse in the current send.
- Runs only after a normal completed stream.
- Does not unload on abort or stream error.
- Unload failures are swallowed as non-visible warnings for v1 and do not pollute assistant text.

Auto-unload after idle:

- Exposed as a v1 config flag and UI toggle.
- Deferred for timer/concurrency implementation. It is not treated as a prohibited feature.

## Chat Modes

OpenAI-compatible mode:

- Default endpoint: `POST /v1/chat/completions` with `stream: true`.
- Optional endpoint: `POST /v1/responses` with `stream: true`.
- Text-only messages are forwarded.
- No credentials, custom headers, tools, files, image payloads, reasoning controls, or Generic live routing.

Native REST mode:

- Endpoint: `POST /api/v1/chat`.
- Sends a minimal text input and `stream: true`.
- Maps only visible `message.delta.content` to OpenAI-compatible text delta frames for the existing streaming core.
- Ignores native metadata events such as prompt-processing progress.
- Emits a terminal synthetic `[DONE]` frame on `chat.end` or stream close.

## Live Environment Matrix

Endpoint used: `http://127.0.0.1:1234`

Selected smoke model: `qwen2.5-0.5b-instruct`

No secrets were used or logged. No process launch/stop and no model download were attempted.

| Case | Result |
| --- | --- |
| LM Studio running | Passed. `GET /api/v1/models` returned HTTP 200. |
| OpenAI-compatible profile | Passed. `GET /v1/models` returned HTTP 200. |
| Model inventory | Passed. Native REST returned 20 local models. |
| Initial selected model state | Passed. `qwen2.5-0.5b-instruct` started with `loaded_instances=0`. |
| Manual load | Passed. `POST /api/v1/models/load` returned `status=loaded`, `instance_id=qwen2.5-0.5b-instruct`, load time about 10.24s. |
| Post-load model state | Passed. Native REST model list reported the selected model loaded. |
| OpenAI-compatible chat completions | Passed. `POST /v1/chat/completions` streaming returned HTTP 200 and SSE chat chunks. |
| Native REST chat | Passed. `POST /api/v1/chat` streaming returned HTTP 200 and native SSE events including `chat.start` and prompt-processing events. The implementation maps only visible text events. |
| Manual unload | Passed. `POST /api/v1/models/unload` returned the selected instance id. |
| Post-unload model state | Passed. Native REST model list reported `loaded_instances=0`. |
| Auto-load before send sequence | Passed in live REST sequence. Load succeeded, OpenAI-compatible chat returned HTTP 200, and unload after send succeeded. Product auto-load ordering is covered by unit tests. |
| Auto-unload after send | Passed in live REST sequence for the auto-loaded instance. Product behavior unloads only after normal stream completion and is covered by unit tests. |
| Auto-unload after idle | Deferred. Timer/concurrency implementation not included in v1. |
| Invalid model id | Passed safe error behavior. Native load for an invalid model id returned HTTP 404. |
| Endpoint unavailable | Passed safe unavailable behavior. Probe against `127.0.0.1:9` failed as a connection failure without crash. |
| Final selected model state | Confirmed unloaded after cleanup: `loaded_instances=0`. |

The separate "LM Studio not running" condition was not produced by stopping LM Studio because v1 must not start or close the LM Studio process. It was represented by the loopback unavailable endpoint check above.

## Boundary Checks

- No model download endpoint, UI, switch, or flow was added.
- No LM Studio process launch/close was added.
- LAN and public hosts are rejected by validator.
- Embedded URL credentials are rejected.
- Renderer cannot provide Authorization, Bearer, API keys, or arbitrary headers for LM Studio v1.
- No RuntimeProviderRegistry, EndpointRegistry, ProviderRegistry, or ModelSourceRegistry was introduced.
- Generic OpenAI-compatible live routing remains deferred.
- OpenRouter catalog was not modified.
- Main ModelPickerDialog was not modified.
- Send Plan capability was not modified.
- DFC/file-pipeline paths were not modified.

## V1 Status

LM Studio Local Provider v1 is suitable for hardening after targeted automated validation. Remaining hardening candidates:

- Dedicated UI warning channel for non-visible auto-unload failures.
- Optional idle auto-unload timer with concurrency protection.
- Broader native REST event-shape fixtures if LM Studio expands streaming event variants.
