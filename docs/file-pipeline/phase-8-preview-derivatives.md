# Phase 8 Preview Derivatives

Phase 8 adds a minimal, task-driven image preview derivative workflow on top of the Phase 7 derivative job framework.

This phase focuses on `preview_optimized` only. It keeps conversion-related derivative kinds as reserved interfaces and does not implement Office conversion, send-time optimization, UI features, compression workflows, OCR, or RAG.

## Scope

Phase 8 adds:

- `preview_optimized` derivative generation for image assets;
- derived image output persisted under managed derived storage;
- explicit preview-specific error semantics for unsupported source, missing local file, generation failure, and output failure;
- convenience lookup and ensure helpers for latest ready preview reuse.

Phase 8 does not add:

- `converted_pdf` conversion implementation;
- `send_optimized` optimization implementation;
- automatic bulk backfill for all historical images;
- any change to Phase 5/6 send planning and send payload sourcing.

## Preview Responsibilities

`preview_optimized` is an internal preview artifact for future list thumbnails and lightweight visual previews.

It is not a model input source in this phase.

Rules:

- preview generation never overwrites the original file;
- preview generation failure never blocks message sending;
- preview generation failure affects preview experience only;
- send planning and OpenRouter payload adaptation still source from the original asset flow defined in Phases 5 and 6.

## Supported Inputs And Output

Phase 8 preview generation supports:

- `image/png`
- `image/jpeg`
- `image/jpg`

The generator:

- reads the retained local image copy;
- rescales while preserving aspect ratio;
- bounds max edge through job config (`maxEdge`, default 384);
- writes preview bytes under `assets/derived/...`;
- emits PNG previews for PNG source and JPEG previews for JPEG source.

Output metadata includes:

- `sourceAssetId`
- `sourceMime`
- `sourceWidth` / `sourceHeight`
- `previewWidth` / `previewHeight`
- `sourceBytes` / `previewBytes`
- `generator`
- `format`
- `createdAt`
- `sourceHash` and `previewHash` when available

## Job Framework Integration

Preview generation reuses the existing derivative job framework:

- create preview job: `derivativeKind = preview_optimized`
- run preview job through `runDerivativeJob`
- write/update `file_derivatives` on success
- mark job `failed` with structured error on failure
- query latest ready preview via `getLatestReadyPreviewDerivative`
- optional reuse-first helper via `ensurePreviewDerivative`

No additional queue runtime is introduced in this phase.

## Reserved Conversion Interfaces

Phase 8 keeps:

- `converted_pdf`
- `send_optimized`

as valid derivative kinds but explicitly not implemented.

Behavior:

- `converted_pdf` returns `conversion_not_implemented`
- `send_optimized` returns `derivative_kind_not_implemented`

This preserves expansion points for future phases without claiming conversion capability now.

## Error And Diagnostics Policy

Preview-related error codes in Phase 8 include:

- `preview_asset_missing`
- `preview_asset_not_image`
- `preview_source_not_supported`
- `preview_local_file_missing`
- `preview_local_file_read_failed`
- `preview_generation_failed`
- `preview_output_write_failed`
- `preview_output_invalid`

Reserved-interface error codes:

- `derivative_kind_not_implemented`
- `conversion_not_implemented`

Diagnostics remain summary-only and must not include:

- full image content
- base64 payloads
- API keys or authorization secrets
- unredacted absolute local paths in ordinary logs

Minimum preview diagnostic summary fields are:

- `jobId`
- `assetId`
- `derivativeKind`
- `status`
- `generator`
- `sourceMime`
- `sourceWidth` / `sourceHeight`
- `previewWidth` / `previewHeight`
- `sourceBytes` / `previewBytes`
- `errorCode`
- `outputDerivativeId`

## Phase Boundary

Phase 8 does not:

- change attachment ownership semantics from Phase 4;
- change Send Plan selection semantics from Phase 5;
- change OpenRouter request adaptation semantics from Phase 6;
- treat `preview_optimized` as a send source;
- implement conversion or compression pipelines.
