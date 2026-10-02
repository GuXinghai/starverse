# Dependency discovered during the second wave

Date: 2026-10-03. Plan only; no implementation authorized within this wave.

## OpenRouter attachment discriminant and frozen encoder compatibility

Current managed-file projection includes `attachments[].kind`, but OpenRouter encoding coverage omits it although the prepared compiler already handles the managed-file discriminant. Shared capability validation therefore rejects the field before encoding. The attachment ledger also omits discriminant consumption evidence. This is separate from the DOCX option-selection producer mismatch.

Adding the coverage path changes the registry-derived encoder revision for both text and tool continuation. Persisted runtime capability decoding compares against the current registry and rejects older encoder revisions; a small coverage edit would invalidate existing frozen snapshots, even without attachments. Do not rewrite frozen snapshots or weaken capability integrity to hide this consequence.

Before implementation, choose and review an explicit immutable encoder compatibility policy for already persisted executions. Then add only the existing managed-file discriminant coverage/evidence, preserving unsupported/conflict/missing model facts and existing URL-reference rejection. No URL/media-kind widening, model-support claims or provider calls are implied.

Acceptance must include actual OpenRouter prepared requests with DOCX/HTML selected output revision/hash/bytes, included/excluded discriminant ledger entries and tool continuation, plus pre-change persisted snapshots, current snapshots, retry behavior, tamper rejection and stale initial-send rejection. Cover the declared compatibility policy through actual snapshot decode/repository/retry coordinator paths. Keep this work bounded and independent of provider-data acquisition.

SV-PGA-007 uses actual OpenAI Responses preparation to validate exact derived-output transfer. OpenRouter options and selection provenance are covered, but successful OpenRouter prepared attachment submission is not claimed by that closure.
