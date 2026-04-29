# Phase 5 Send Eligibility And Planning

Phase 5 adds the provider-neutral send gate and request-planning layer. It does not build provider payloads. It evaluates whether the current request can proceed, which attachments are eligible, which historical attachments must be excluded, and which transport mode is preferred for each included attachment.

## Scope

Phase 5 adds:

- current send-input collection from draft text, draft attachments, and historical candidate snapshots;
- parsing-gate evaluation for non-terminal ingest states;
- model compatibility checks driven by provider model modalities;
- provider-neutral send-mode selection;
- stable final send statuses;
- Send Plan output for later provider serialization.

This phase still does not implement provider content parts, HTTP request bodies, provider Files API wiring, UI, OCR, transcription, embeddings, Office conversion, compression, or URL local-copy refresh.

## Three Gates

Phase 5 uses three gates in order.

### Parsing Gate

The parsing gate blocks sending when an attachment is still in a real intermediate ingest state:

- `pending`
- `probing`
- `materializing`

Terminal failures are not treated as parsing blockers:

- `probe_failed`
- `materialization_failed`
- `failed`

To avoid permanent disablement, Phase 5 also applies a timeout fallback. If an attachment remains in an intermediate state past the planner timeout window, the planner treats it as a failed terminal attachment for send-gate purposes. It becomes droppable or warnable, not permanently blocking.

### Compatibility Gate

The compatibility gate compares attachment payload intent against current model input modalities:

- text attachments require text input support;
- image attachments require image input support;
- audio attachments require audio input support;
- video attachments require video input support;
- PDF attachments are planned through provider support plus model modality compatibility, without assuming that model `file` modality is the only valid path.

Model modality support comes from provider model metadata. Attachment-specific planning rules remain in Starverse.

Compatibility must be recomputed when:

- an attachment finishes parsing;
- the selected model changes;
- provider fallback or routing changes the effective model;
- conversation restore changes the effective default model;
- branch switching changes the effective request configuration.

### Send Plan Gate

Only after parsing and compatibility checks does Phase 5 build the Send Plan. This gate decides:

- whether the request is sendable;
- which current draft attachments are included;
- which historical attachments are included;
- which attachments are excluded;
- which send mode is preferred for each included attachment;
- which warnings and blocking reasons must be surfaced.

## Final Send Statuses

Phase 5 freezes four final statuses.

### `sendable`

Used when:

- no attachment is still parsing;
- current draft inputs are compatible;
- no warning-worthy degradation is present.

### `sendable_with_warnings`

Used when the request can proceed as-is, but the planner must surface non-blocking degradation, such as:

- retained URL assets whose local probe failed;
- retained URL assets whose local materialization failed;
- excluded historical attachments that cannot be carried into current context;
- included attachments that remain usable but carry degraded-state notes.

### `partially_sendable`

Used when the original request cannot be sent unchanged, but dropping some current draft attachments still leaves a valid request. Typical examples:

- current draft text remains valid after removing incompatible attachments;
- at least one current draft attachment remains included while another current attachment is dropped;
- timed-out or failed current attachments can be removed without invalidating the request.

### `blocked`

Used when:

- a non-terminal parsing attachment is still pending;
- no valid current-draft input remains after exclusions;
- the only meaningful current input is incompatible with the selected model.

## Current Draft Versus History

Current draft attachments and historical attachments are intentionally not equal.

- Current draft attachments are first-class request inputs.
- Historical attachments are secondary candidate context.
- Historical attachment incompatibility usually warns and excludes, but does not directly block a valid current request.
- If the same asset appears both in the current draft and in history, Phase 5 keeps only one attachment plan entry for sending and treats the asset as draft-owned for this request.

## Send-Mode Selection

Phase 5 keeps send-mode selection provider-neutral and does not serialize payloads.

Current defaults:

- Image: prefer `url_ref`, then `inline_base64`.
- PDF: prefer `url_ref`, then `inline_base64`, gated by provider PDF support.
- Text: prefer inline transport when a local copy exists, otherwise fall back to retained URL when allowed.
- Audio: only `inline_base64`; URL reference is not planned.
- Video: `url_ref` only when provider context allows it; otherwise fall back to `inline_base64` if a local copy exists.
- `provider_file_ref`: reserved for later providers and not actively chosen in the current OpenRouter-oriented default path.

Conversion-required assets, such as Office files still marked `convertible`, do not receive direct send modes in Phase 5. They are excluded and annotated as requiring conversion before send.

## Historical Attachment Warnings

Historical attachments must not be silently ignored. If a historical attachment cannot be included because of incompatibility, unsupported processing state, missing send mode, or other planning exclusions, the planner emits an explicit warning unless the exclusion is a benign dedupe or a pre-existing manual exclusion.

## Output Contract

Phase 5 outputs a provider-neutral Send Plan. The plan includes:

- final status;
- warnings;
- blocking reasons;
- included attachment references;
- excluded attachment references;
- per-attachment plans with selected send mode, fallback modes, display status, exclusion reason, attention flag, and notes;
- `requiresModelChange`;
- `canProceedAfterDroppingExcluded`;
- `requiresUserConfirmation`;
- `plannerVersion`.

This output is the boundary. Later provider serializers should consume it directly and should not re-implement attachment ownership, history visibility, parsing semantics, or compatibility rules.

## Phase Boundary

Phase 5 does not:

- build OpenRouter or provider content parts;
- build final HTTP request bodies;
- push attachment logic into UI;
- perform OCR, transcription, embeddings, conversion, or compression;
- refresh URL local copies automatically;
- rewrite file ingest records during planning;
- delete any local files.
