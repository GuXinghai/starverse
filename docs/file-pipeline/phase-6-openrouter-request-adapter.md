# Phase 6 OpenRouter Request Adapter

Phase 6 consumes the provider-neutral Send Plan from Phase 5 and converts it into OpenRouter request content parts. It maps included attachments into OpenRouter multimodal message blocks, injects the minimal PDF file-parser plugin configuration when requested, and connects the serialized result to the existing OpenRouter live request path.

This phase does not re-run send eligibility checks, model compatibility checks, history inclusion rules, OCR, transcription, embeddings, Office conversion, compression, UI, or provider Files API integration.

## Scope

Phase 6 adds:

- Send Plan to OpenRouter content-part serialization;
- deterministic mapping for `text`, `image`, `pdf`, `audio`, and `video` payloads;
- actual `url_ref` and `inline_base64` serialization;
- minimal PDF `file-parser` plugin injection;
- attachment serialization error mapping;
- sanitized attachment diagnostics;
- live-stream request-path wiring for pre-serialized multimodal user content.
- production send preflight wiring that builds a fresh Send Plan, serializes it, and passes the resulting content parts into the existing OpenRouter stream path.

## Send Plan Consumption Boundary

Phase 6 treats the Send Plan as the single source of truth for send-time attachment inclusion.

- Only `included` and `warning` attachment plans are serialized.
- Excluded attachments remain excluded and never re-enter the request.
- `selectedSendMode` is consumed as-is.
- `fallbackSendModes` are used only when the plan explicitly provides them and the fallback does not change the included/excluded decision.
- If the Send Plan status is `blocked`, serialization stops with `send_plan_blocked`.

The request builder does not reopen:

- attachment ownership;
- history visibility;
- compatibility with the current model;
- attachment exclusion decisions;
- send-mode selection.

## OpenRouter Content-Part Mapping

### Text

Text is emitted as `type: "text"`.

- The main user prompt remains the first content part.
- Text attachments are also emitted as text parts.
- Inline text attachments are decoded from the stored local file.
- URL-retained text attachments are represented as a text note containing the retained URL and filename marker.

### Image

Images are emitted as `type: "image_url"`.

- `url_ref` uses `image_url.url = <retained URL>`.
- `inline_base64` reads the local file and emits a MIME-tagged data URL.

### PDF

PDF files are emitted as `type: "file"`.

- `url_ref` uses `file.file_data = <retained URL>`.
- `inline_base64` reads the local PDF and emits a PDF data URL in `file.file_data`.
- PDF is never downgraded to `image_url`.
- PDF is never reclassified into plain text at this phase unless an earlier phase already planned it as text.

### Audio

Audio is emitted as `type: "input_audio"`.

- Only `inline_base64` is allowed.
- The serializer reads the local file, base64-encodes it, and includes a `format` field derived from extension or MIME.
- Audio URL send mode is rejected with `audio_url_not_supported`.

### Video

Video is emitted as `type: "video_url"`.

- `url_ref` uses `video_url.url = <retained URL>`.
- `inline_base64` emits a data URL in `video_url.url`.
- Video URL use is not enabled optimistically inside the request builder. The adapter follows the Send Plan and may additionally fail fast when the caller explicitly marks video URL transport as disallowed in the current provider context.

## URL And Local-Copy Rules

Phase 6 keeps the URL rules frozen by Phases 3 to 5.

- URL local copies remain manual-update only.
- The adapter does not refresh remote URLs.
- The adapter does not overwrite stored local files.
- `url_ref` reads only already-retained URL metadata.
- `inline_base64` reads only already-stored local files.
- The adapter does not auto-download a URL when URL send mode fails.
- The adapter does not auto-switch from local file to URL unless the Send Plan explicitly includes such fallback.

Local file reads are constrained to the configured storage root:

- `storageUri` must be a relative URI under `assets/original/` or `assets/derived/`;
- empty values, absolute paths, Windows drive paths, UNC paths, backslashes, `.` segments, and `..` segments are rejected;
- the resolved path must remain inside the storage root after normalization;
- invalid paths fail with a structured storage URI error and never fall back to direct filesystem reads.

## Fallback Rules

Fallback is deliberately narrow.

Allowed:

- the Send Plan already contains `fallbackSendModes`;
- the primary send mode fails during serialization;
- required retained URL or local file data already exists;
- the fallback still obeys OpenRouter transport rules.

Not allowed:

- re-including excluded attachments;
- auto-downloading remote files;
- refreshing retained URLs;
- converting audio URL input into a local audio upload on the fly;
- silently dropping a failed included attachment.

## PDF File-Parser Plugin Entry

Phase 6 exposes a minimal request-level PDF plugin entry:

- plugin id: `file-parser`;
- supported engines: `native`, `cloudflare-ai`, `mistral-ocr`;
- injected only when at least one included PDF attachment exists and the caller enables the plugin config.

This phase does not implement automatic engine selection. Engine choice remains an explicit configuration concern.

## Error Mapping

Phase 6 maps attachment serialization failures into structured error codes, including:

- `send_plan_blocked`
- `attachment_not_included`
- `attachment_asset_missing`
- `attachment_local_file_missing`
- `attachment_local_file_read_failed`
- `attachment_base64_encode_failed`
- `attachment_storage_uri_invalid`
- `attachment_local_path_outside_storage_root`
- `attachment_url_missing`
- `attachment_url_not_allowed_by_plan`
- `attachment_send_mode_unsupported`
- `audio_url_not_supported`
- `video_url_provider_not_allowed`
- `pdf_file_parser_config_invalid`
- `attachment_serialization_failed`
- `openrouter_multimodal_request_failed`
- `openrouter_modality_rejected`

Errors carry asset and attachment identity, selected send mode, and payload kind so upper layers can record or surface them without parsing free-form strings.

## Diagnostics

Phase 6 emits a sanitized diagnostics summary alongside the serialized content parts.

It records:

- Send Plan status;
- included and excluded attachment counts;
- included attachments with `assetId`, payload kind, source, selected mode, final mode, fallback usage, and resulting content-part type;
- excluded attachments with exclusion reason;
- injected plugin ids;
- attachment serialization errors;
- whether the final user message contains multimodal content parts.

It does not record:

- raw base64 payloads;
- raw data URLs;
- local absolute file paths;
- full file contents.
- Authorization header values or full API keys;
- complete request bodies.

Verbose OpenRouter transport logs use request summaries only. They may include provider, model, message count, content part types, whether multimodal parts exist, and data URL media type plus length. They must not include raw base64, PDF data URL bodies, text attachment contents, Authorization values, or full request JSON.

## Request-Path Wiring

The OpenRouter live-stream entry now accepts pre-serialized current-user content blocks and additional request plugins.

The production send path performs the minimum orchestration before opening the stream:

1. build a fresh provider-neutral Send Plan from the current draft text, draft attachments, historical candidate snapshot, model descriptor, and provider context;
2. stop before user-message creation when the plan is `blocked`;
3. serialize the approved plan through the Phase 6 adapter;
4. create the user message and migrate draft attachments in the same message transaction;
5. pass serialized current-user content blocks and additional plugins into the existing OpenRouter live-stream request.

This preserves the phase boundary:

- Phase 5 decides whether an attachment is includable and which send mode to use.
- Phase 6 serializes the already-approved attachment plan.
- The live request path sends the provided multimodal content as-is and does not reopen eligibility logic.

The send preflight always rebuilds the Send Plan immediately before sending, so stale compatibility state from earlier draft or model changes cannot be the only source used at the send boundary.

## Phase Boundary

Phase 6 does not:

- build provider-neutral Send Plans;
- re-check model compatibility;
- re-open history inclusion logic;
- perform OCR, transcription, embeddings, conversion, or compression;
- implement provider Files API upload flows;
- add UI for attachment inspection or warnings.
