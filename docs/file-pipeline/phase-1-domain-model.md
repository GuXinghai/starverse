# Phase 1 Domain Model

Phase 1 establishes the shared file vocabulary and deterministic classification rules for Starverse. These definitions live in `src/shared/files` so later database, import, message, provider, conversion, transcription, and embeddings layers can reuse the same source of truth.

## Frozen Types

| Concept | Type | Values |
| --- | --- | --- |
| Original asset type | `AssetKind` | `image`, `document`, `text`, `audio`, `video`, `archive`, `binary` |
| Derivative type | `DerivedKind` | `thumbnail`, `extracted_text`, `ocr_text`, `transcript`, `converted_pdf`, `send_optimized`, `preview_optimized`, `embedding_vector` |
| Task family | `TaskFamily` | `chat_context`, `transcription`, `embeddings` |
| Model capability | `ModelCapability` | `text_in`, `image_in`, `file_in`, `audio_in`, `video_in`, `text_out`, `audio_out`, `embeddings` |
| AI send payload | `AiPayloadKind` | `image`, `pdf`, `text`, `audio`, `video`, `binary` |
| Processing status | `ProcessingStatus` | `native_supported`, `convertible`, `local_only`, `unsupported` |
| Source type | `SourceKind` | `local_upload`, `url_import`, `generated`, `derived` |
| Send mode | `SendMode` | `url_ref`, `inline_base64`, `provider_file_ref` |

## Support Matrix

| Format | Asset kind | AI payload kind | Processing status | MVP native |
| --- | --- | --- | --- | --- |
| `png`, `jpg`, `jpeg` | `image` | `image` | `native_supported` | yes |
| `pdf` | `document` | `pdf` | `native_supported` | yes |
| `txt`, `md` | `text` | `text` | `native_supported` | yes |
| `mp3`, `wav`, `m4a`, `flac` | `audio` | `audio` | `local_only` | no |
| `mp4`, `mov`, `webm` | `video` | `video` | `local_only` | no |
| `doc`, `docx`, `wps`, `odt`, `rtf` | `document` | `pdf` | `convertible` | no |
| `xls`, `xlsx` | `document` | `pdf` | `convertible` | no |
| `csv` | `text` | `text` | `convertible` | no |
| `ppt`, `pptx` | `document` | `pdf` | `convertible` | no |
| `zip`, `rar`, `7z` | `archive` | `binary` | `unsupported` | no |
| unknown | `binary` | `binary` | `unsupported` | no |

The matrix is centralized in `FILE_EXTENSION_RULES` and `FILE_MIME_RULES`. Rule consumers must not duplicate or fork these decisions in UI, database, or provider-specific code.

## Rule Functions

`src/shared/files/fileRules.ts` exposes pure functions with no filesystem, network, database, or provider dependencies:

- `normalizeExtension`
- `classifyAssetKind`
- `classifyAiPayloadKind`
- `classifyProcessingStatus`
- `isNativeSupportedForMvp`
- `isConvertibleCandidate`
- `isPotentiallyPreviewable`
- `inferFileProfile`

Classification combines MIME type and extension. If both signals are known but conflict on asset kind or AI payload kind, the result is conservatively downgraded to `binary` + `local_only` and marked as conflicting. This prevents treating a successful import as model-readable content when metadata is inconsistent.

## Invariants

1. Embedding and transcription are task families, not file types.
2. Original assets and derivatives are separate records and concepts; derivatives must never overwrite originals.
3. Upload success does not mean model readability.
4. Asset kind, AI payload kind, and model capability are different layers and must not be mixed.
5. The rule layer must remain in shared or domain code, not UI components or provider adapters.
6. Phase 1 freezes concepts and pure rules only; it does not implement runtime file flows.

## Why Freeze First

The file pipeline crosses persistence, import, message assembly, model capability checks, provider send modes, and derivative jobs. Freezing the vocabulary and rule matrix first prevents later phases from encoding incompatible assumptions about what a file is, what can be sent to AI, what needs conversion, and what belongs to a task workflow.

## Reuse Contract

Later phases should import the shared types and rules directly when deciding:

- database enum values and migration constraints;
- local upload and URL import classification;
- whether a message attachment is eligible for chat context;
- whether a model has the required input capability;
- whether a file needs conversion, transcription, preview generation, or embeddings;
- which provider send adapter path may be selected.

