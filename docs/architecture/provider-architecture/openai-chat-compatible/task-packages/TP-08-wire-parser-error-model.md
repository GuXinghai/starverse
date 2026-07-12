# TP-08 — Provider-neutral SSE/JSON Wire Parser and Error Model

Status: `complete`

Completion evidence: 8 focused wire/network files / 94 tests passed, with `tsc`, `vue-tsc`, network-egress gate and `git diff --check` green. The parser remains pure and production-unreachable until TP-15.

## Goal

Implement provider-neutral Chat Completions framing and semantic parsing for SSE and non-stream JSON, preserving every choice, tool delta, usage, finish reason and eligible unknown extension without OpenRouter or Generic naming.

## Dependencies and prerequisite state

- TP-02 and TP-05 complete.
- Bounded byte streams/errors available from the network broker.
- Route/choice records may be mocked; no UI/send integration.

## Current evidence

- Existing robust framing is named `decodeOpenRouterSSE`: `src/next/openrouter/sse/decoder.ts`.
- Shared semantic core imports OpenRouter decoder/error types: `src/next/streaming/core/streamWireSemanticCore.ts:1-15`.
- Current Generic mapper handles only narrow string content and constructs an OpenRouter-shaped error.
- Existing terminal arbiter/timing machine are retain candidates after neutralization.

## Production files and deletion scope

Create under `src/shared/provider/openai-chat-compatible/wire/`:

- provider-neutral SSE framer;
- Chat Completions stream chunk decoder;
- non-stream response decoder;
- choice/message/tool/usage/finish semantic mapper;
- unknown-extension capture envelope;
- compatible error taxonomy mapper.

Extract verified generic framing/timing/terminal algorithms from OpenRouter-named modules or introduce neutral modules and keep native OpenRouter adapters wrapping them. The new compatible path must not import OpenRouter envelopes, response mappers or stream wire contracts.

## Schema, config and data impact

- No DB writes; emits typed provider-neutral wire/domain events with route/choice sequence.
- Raw unknown values remain bounded ephemeral records for TP-10.
- Errors contain safe raw summaries only.

## Core invariants

- Correct LF/CRLF, comments, keep-alive, multiline data, empty events, chunk/UTF-8 splits and terminal behavior.
- `[DONE]`, EOF-without-DONE, malformed JSON/SSE, network interruption and duplicate terminal are distinct.
- Streaming and non-streaming share the same choice/message/tool/reasoning extension input contracts.
- Every `choice.index` is parsed; duplicate/missing indexes fail explicitly.
- String/null/array content and role deltas are represented without silent loss.
- Unknown eligible fields are preserved for TP-10; they are not assigned semantics here.
- Exactly one terminal event is emitted.
- Errors use Section 22 compatible taxonomy only.

## Implementation steps

1. Extract/implement neutral incremental SSE framing with bounded buffers.
2. Implement strict Chat Completions chunk and final JSON decoders.
3. Normalize response metadata, choices, roles, content variants, finish reasons and usage.
4. Emit tool deltas without merging semantics; TP-09 owns merge.
5. Emit structured extension candidates with source path, choice and sequence.
6. Implement non-SSE HTTP JSON error parsing and safe HTTP/provider normalization.
7. Implement terminal arbiter, abort and EOF semantics.
8. Wrap the neutral framing core for native OpenRouter only if needed; do not make OpenRouter types canonical.

## Tests and gates

- LF/CRLF, multiline, comments, keep-alive, empty event, every chunk boundary and UTF-8 split.
- DONE/no-DONE, malformed JSON/SSE, duplicate terminal, late chunks, interruption and abort.
- content string/null/arrays, delta role, all finish reasons and usage.
- multiple choices with non-sequential/duplicate/missing indexes.
- non-stream choices/message/tools/reasoning inputs/empty choices/malformed shape.
- unknown extension preservation and size overflow.
- provider-neutral error snapshots with redaction assertions.
- `npx tsc --noEmit --pretty false`
- `npm run gate:network-egress`
- `git diff --check`

## Acceptance criteria

- Parser fixtures cover every Owner-required streaming/non-stream boundary.
- No choice or supported field is silently dropped.
- Compatible code contains no OpenRouter-shaped errors or imports.
- Unknown fields reach TP-10 input unchanged within limits.
- Parser remains pure/headless and production-unreachable until TP-15.

## Prohibitions

- No choice-0-only behavior.
- No reasoning/provider semantic guesses in the framer.
- No raw unbounded chunk retention.
- No direct UI/DB/network side effects.
- No Generic decoder restoration.

## Suggested commit

`feat(provider): parse compatible sse and json neutrally`

## Stable contract for the next package

TP-09–TP-13 receive ordered, bounded, provider-neutral choice/content/tool/extension/usage/terminal events with one error vocabulary.
