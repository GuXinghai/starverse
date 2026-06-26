# Reasoning Artifact Service R6-B

Date: 2026-06-25

Scope: lifecycle polish for the R6-A in-memory reasoning artifact read model, plus AppChatApp stream fixture cleanup.

## Stream Fixture Cleanup

- Root cause: `AppChatApp.streamSession.parity.test.ts` and `AppChatApp.streamSession.terminalIdempotency.test.ts` still assumed the pre-R1 implicit OpenRouter fallback.
- R1 removed default providers, so these fixtures could render the conversation shell without entering a valid send-ready runtime selection.
- Fix: the fixtures now explicitly set `starverse.openRouterTextChat.enabled=1`, wait for the real composer via `composer-draft` / `composer-send`, and provide the Send Plan replay mocks needed by regenerate and retry.
- The tests now enter the stream assertions for send, regenerate, retry, abort, and terminal idempotency instead of failing at composer lookup.

## Lifecycle Rules

- A new send replaces artifacts for the target assistant message before collecting new stream details.
- Abort and stream error keep artifacts already received.
- Regenerate and retry use the new assistant message id, so old and new artifacts do not share a message bucket.
- Transcript hydrate retains only artifacts whose message id is still present in the rendered transcript.
- Deleting the active conversation clears current in-memory artifacts.
- Deleting a question clears artifacts for that question and answer group, then transcript hydrate removes any remaining stale buckets.
- `messageId`, `streamTurnId`, and `sequence` remain artifact identity inputs; sequence is stable within the active collector turn.

## Isolation

- Reasoning artifacts remain out of assistant visible text.
- `copyAssistantMessage` still reads only assistant visible text via `getAssistantVisibleText`; diagnostics do not add copy controls.
- Prompt/context construction continues to use persisted messages and does not read the artifact map.
- Send Plan does not read `ReasoningArtifact`, `ReasoningArtifactCollector`, or the lifecycle map.

## UI Polish

- Message-attached diagnostics remain collapsed by default.
- No artifacts means no diagnostics block.
- The diagnostics summary shows count; each item shows provider, kind, and sequence.
- Long text and summary previews are truncated.
- Signature and opaque artifacts are shown as not displayable metadata, not readable reasoning text.
- `providerSpecific` is not directly dumped in the UI.

## Boundaries

- No persistence, transcript schema migration, search, export, copy diagnostics, or global reasoning panel.
- No RuntimeProviderRegistry, ModelSourceRegistry, ReasoningRegistry, or placeholder manager.
- Generic live remains deferred.
- LocalEndpoint production split remains deferred.
- OpenRouter catalog, main ModelPickerDialog, and OpenRouter Send Plan capability semantics are unchanged.
- ProviderModelAvailability common envelope remains separate from Send Plan final capability.
- DFC and file-pipeline files are out of scope.

## R6-C Candidate

R6-C should not start with persistence by default. The next useful step is a short hardening review of whether message-local diagnostics are enough. If not, R6-C can evaluate a dedicated diagnostics panel; persistence/search/export should stay deferred until there is a concrete product requirement.
