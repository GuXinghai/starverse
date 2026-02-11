# Error Semantics (OpenRouter)

## Scope

This document defines Starverse error fidelity rules for OpenRouter streaming in the app orchestration layer.

Goals:
- Preserve request-time and generation-time error semantics.
- Normalize local transport/protocol failures into typed `AppError`.
- Keep existing error envelope shape stable for current UI/state consumers.

Out of scope:
- DB schema changes.
- IPC protocol changes.
- Cross-layer streaming architecture rewrite.

## AppError Model

`AppError` is classified on three axes:

- `phase`
  - `pre_stream_request_error`
  - `mid_stream_error`
  - `local_transport_error`
  - `local_protocol_error`
  - `user_cancelled`
  - `internal_bug`
- `category`
  - `invalid_request`
  - `auth`
  - `payment_credit`
  - `moderation_blocked`
  - `timeout`
  - `rate_limited`
  - `provider_bad_gateway`
  - `no_provider_available`
  - `provider_error_unknown`
  - `network_unreachable`
  - `protocol_invalid`
  - `cancelled`
  - `internal`
- `grade`
  - `1`: auto-recoverable (retry/backoff/switch model/provider)
  - `2`: user action needed (key/credits/prompt fix)
  - `3`: engineering action needed (protocol/internal)

Derived fields:
- `retryable`
- `userActionHint`

## OpenRouter Mapping Rules

### Pre-stream HTTP errors (non-2xx)

| HTTP status | category | grade | retryable |
| --- | --- | --- | --- |
| 400 | `invalid_request` | 2 | false |
| 401 | `auth` | 2 | false |
| 402 | `payment_credit` | 2 | false |
| 403 | `moderation_blocked` | 2 | false |
| 408 | `timeout` | 1 | true |
| 429 | `rate_limited` | 1 | true |
| 502 | `provider_bad_gateway` | 1 | true |
| 503 | `no_provider_available` | 1 | true |

Metadata fidelity:
- Preserve OpenRouter `error.metadata` when present.
- Keep moderation/provider fields such as `reasons`, `flagged_input`, `provider_name`, `raw`.

### Mid-stream SSE errors

For SSE events with top-level `error` and `choices[].finish_reason = "error"`:
- Normalize as `phase = mid_stream_error`.
- Infer category from code/status-like code/metadata.
- Preserve provider and metadata when available.

### Local transport/protocol errors

- Transport failures (`fetch`/network/timeout/connection closed) normalize to:
  - `local_transport_error + timeout` or
  - `local_transport_error + network_unreachable` or
  - `local_transport_error + provider_error_unknown`
- Protocol failures (SSE/JSON parse or unexpected shape) normalize to:
  - `local_protocol_error + protocol_invalid`
  - include sanitized `rawChunk` in debug fields.

## completionClass and endReason Rules

At stream finalization:
- `finish_reason = "error"` is treated as error termination.
- `finish_reason = "length"` is not treated as error (success/truncated semantics).
- `completionClass` and `endReason` are derived from normalized error phase (and finish reason for error chunks), not from fallback internal defaults.

Typical mapping:
- `pre_stream_request_error` -> `completionClass=error`, `endReason=pre_stream_error`
- `mid_stream_error` -> `completionClass=error`, `endReason=mid_stream_error`
- `local_transport_error` / `local_protocol_error` / `internal_bug` -> `completionClass=error`, `endReason=transport_error`
- `user_cancelled` -> `completionClass=aborted`, `endReason=user_abort`

## OpenRouter Streaming Semantics (Cited)

Official references:
- OpenRouter API Guides - Overview (Finish Reason): https://openrouter.ai/docs/api-reference/overview
- OpenRouter API Guides - Streaming (Handling Errors During Streaming): https://openrouter.ai/docs/api/reference/streaming

Source-backed semantic points:
- `finish_reason` normalization includes `stop`, `length`, `content_filter`, `tool_calls`, `error`.  
  Quote: "values are normalized for consistency".  
  Source: https://openrouter.ai/docs/api-reference/overview
- `native_finish_reason` preserves provider-native reason strings when providers expose additional values.  
  Quote: "raw finish_reason string ... native_finish_reason".  
  Source: https://openrouter.ai/docs/api-reference/overview
- Streaming may start with HTTP 200 and still fail mid-stream via SSE error event.  
  Quote: "errors are passed down the SSE stream".  
  Source: https://openrouter.ai/docs/api/reference/streaming
- Mid-stream SSE error event includes `finish_reason: "error"` and then terminates the stream.  
  Quote: "finish_reason: \"error\" ... terminate the stream".  
  Source: https://openrouter.ai/docs/api/reference/streaming
- OpenAI Responses compatibility note: some errors may be transformed to successful `finish_reason: "length"` results.  
  Quote: "transform certain error codes ... finish_reason: \"length\"".  
  Source: https://openrouter.ai/docs/api/reference/streaming

How this maps to our two-layer contract:
- Classification layer (`appPhase/category/grade`) captures error taxonomy and triage.
- Terminal layer (`endReason`) captures stream lifecycle closure semantics.
- Therefore, protocol malformed cases are intentionally represented as:
  - classification: `local_protocol_error / protocol_invalid / grade=3`
  - terminal reason: `transport_error`
- This matches OpenRouter's streaming model where transport/session lifecycle and in-band semantic error signaling are separable concerns.

### finish_reason Handling Table (Current Starverse Contract)

| OpenRouter finish_reason | Terminal mapping (current) | Classification mapping (current) | Notes |
| --- | --- | --- | --- |
| `stop` | `normal_complete` | n/a (non-error path) | Normal completion. |
| `length` | `normal_complete` (semantic `truncated_complete`) | n/a (non-error path) | Non-error completion in current implementation; preserve `native_finish_reason`. |
| `content_filter` | `normal_complete` | n/a by itself | Current implementation treats finish reason alone as non-terminal-error unless an explicit error payload is present. |
| `tool_calls` | `normal_complete` | n/a by itself | Current implementation forwards this reason and tool events; no error reclassification by reason alone. |
| `error` | `mid_stream_error` | `mid_stream_error` + normalized category | Matches OpenRouter mid-stream SSE error termination model. |

Additive outcome field (does not change `completionClass` / `endReason`):
- `completionOutcome` is written only on `StreamDone` with no error terminal.
- Mapping: `stop -> complete`, `length -> truncated`, `content_filter -> filtered`, `tool_calls -> tool_calls`, other/`unknown -> unknown`.
- Any `StreamError` / `StreamAbort` path must not mark success outcome (`truncated`/`complete`).

Compatibility evolution guardrail:
- If we later add `endReason=protocol_error`, rollout must be backward-compatible (additive value and/or temporary dual-write/read compatibility window), with no breaking reinterpretation of existing `transport_error`.

### Classification vs Terminal Reason (Explicit Contract)

`AppError` fields (`appPhase/category/grade`) and stream `endReason` are different dimensions:

- `appPhase/category/grade`: error classification for diagnosis/triage/retry policy.
- `endReason`: stream lifecycle termination reason used by timing/terminal event consumers.

For protocol malformed cases (wire decode failure or SSE `protocol_error`), the current contract is intentional:

- Classification: `appPhase=local_protocol_error`, `category=protocol_invalid`, `grade=3`
- Terminal reason: `endReason=transport_error`

This is a compatibility decision and must not be interpreted as semantic conflict.

Future evolution:
- If a finer-grained `endReason` (for example `protocol_error`) is introduced, migration must be backward-compatible.
- Preferred strategy: additive rollout (introduce new value without removing existing ones), or temporary dual-write/read compatibility before deprecating old interpretation.

## Envelope Compatibility

External envelope structure is unchanged:
- `phase`
- `completionClass`
- `openrouter.code/message/metadata/provider`
- optional `http`, `stream`, `context`, `normalized`, `kind`

Additional normalized fields (`appPhase`, `category`, `grade`, `userActionHint`, `retryable`, etc.) are attached inside `normalized.normalized` for richer consumers while preserving old readers.
