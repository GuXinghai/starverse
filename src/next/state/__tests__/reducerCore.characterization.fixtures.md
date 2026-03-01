# reducerCore Characterization Fixtures

This document describes the user-behavior mapping for `reducerCore.characterization.test.ts`.

## Scope

- Goal: freeze reducer input/output behavior before refactor.
- Non-goal: change runtime logic.
- Replay unit: `startGenerationCore + applyEventCore` with deterministic clock and deterministic id generator.

## Domain Event Surface (from `DomainEvent`)

- `StreamComment`
- `StreamError`
- `StreamDone`
- `StreamAbort`
- `TimingSnapshot`
- `MessageDeltaText`
- `MessageAppendContentBlock`
- `MessageDeltaToolCall`
- `MessageDeltaAnnotationBatch`
- `MessageDeltaReasoningDetail`
- `MessageDeltaReasoningDetailBatch`
- `UsageDelta`
- `MetaDelta`

All event types above are covered at least once in this characterization suite.

## Invariants Asserted Per Case

- `state.entities.messagesById === state.messages`
- `state.views.transcriptsByRunId === state.runMessageIds`
- Each run transcript id list has no duplicates
- Every transcript message id points to an existing message
- `targetAssistantMessageId` must exist and be present in transcript ids
- If `timingFinalized === true`, then `tEnd` must be a number
- If `run.error` exists, run status must be `error`
- Terminal run status (`done/error/aborted`) implies target assistant `streaming.isComplete === true`

## Fixture Cases -> User Behavior

1. `send_message_initializes_run_and_transcript`
- User sends a message; reducer creates run + user message + assistant placeholder.

2. `first_text_delta_transitions_requesting_to_streaming`
- First token arrives; run transitions `requesting -> streaming`, start timing is frozen.

3. `stream_done_with_finish_reason_length_sets_truncated`
- Streaming ends with `finish_reason=length`; run outcome becomes `truncated`.

4. `text_plus_image_blocks_merge_and_dedupe`
- Mixed text/image stream; text order is preserved and duplicate image URL is deduped.

5. `tool_call_append_then_replace_merge_behavior`
- Tool call arguments stream with append semantics, then final replace semantics.

6. `annotation_append_dedupe_and_replace`
- Citation annotations append incrementally, dedupe by merge key, then replace on final.

7. `reasoning_detail_and_batch_merge_summary_and_encrypted`
- Reasoning details merge summary/text and preserve encrypted marker.

8. `stream_error_mid_stream_marks_error_and_finalizes_timing`
- Mid-stream error keeps partial output and finalizes run/message as error.

9. `stream_abort_user_abort_and_ignores_late_error_and_done`
- User abort is terminal; late error/done events cannot override abort semantics.

10. `retry_start_generation_clears_run_error_and_rebinds_target`
- Retry after error resets run fields and binds a new target assistant.

11. `regenerate_reuses_existing_ids_without_duplicates`
- Regenerate on preloaded transcript does not duplicate message ids.

12. `branch_switch_like_multi_run_isolation`
- Two runIds behave as branch contexts; events stay isolated per run.

13. `meta_and_usage_delta_update_run_fields`
- Model/provider metadata and usage deltas update run-level fields.

14. `unknown_message_text_delta_can_flip_status_without_message_mutation`
- Out-of-order delta targets missing message id; captures current reducer behavior.

15. `generated_ids_are_masked_in_snapshot`
- Generated ids are masked in snapshots to keep deterministic diffs.

## Boundary Note: Delete/Hide Node Behavior

`DomainEvent` currently has no delete/hide message event type in reducer core.
This suite freezes the nearest reducer-level safety behavior via case 14 (out-of-order/missing message id event handling).
