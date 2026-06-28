# Provider Multimodal File Input Research v1

Retrieval date: 2026-06-27.

This document is research input for a future provider multimodal input mapping milestone. It is not an implementation plan for provider runtime changes. File Asset Store v1 remains the Starverse-owned source of truth for managed bytes, revisions, bindings, and send preflight.

## Executive Summary

The providers split into three practical groups:

- OpenAI, Anthropic, and Gemini have first-party file upload APIs and can reference uploaded files from model requests. They should get the first provider-specific prepared-asset cache design.
- OpenRouter accepts multimodal content through its Chat Completions-compatible request body. It supports images, PDFs, audio, and video through content parts, but does not document a persistent provider File API. PDF processing may be native or routed through OpenRouter's parser plugin.
- DeepSeek's official APIs should be treated as text-only for Starverse multimodal file input. Its OpenAI-format chat completion schema documents user content as text, and its Anthropic-compatible guide explicitly marks image and document content blocks as unsupported.

Starverse M1 should start with small-to-medium images and PDFs/documents. Local files and URL snapshots should be read by the main process from File Asset Store revisions and mapped to inline base64 or provider upload references. Explicit `link_only` URLs should only be passed through when the target provider documents direct URL input and the UI has preserved the user's link-only intent. Failed or pending URL snapshots must keep blocking `link_and_file` sends.

Audio/video should be deferred except for narrow Gemini/OpenRouter experiments, because provider support is less uniform, files are larger, upload state can be asynchronous, and smoke tests need longer fixtures. DeepSeek should stay text-only until official docs document file or multimodal message parts.

## Provider Comparison Table

| Provider | Image base64 | Image URL | Image file upload | PDF base64 | PDF URL | PDF file upload | Audio | Video | File retention | Max file size | Recommended Starverse mapping | Implementation priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OpenRouter | Yes, `image_url` data URL | Yes, public URL in `image_url` | No persistent File API documented | Yes, `file.file_data` data URL | Yes, public URL in `file.fileData` / `file_data` | No persistent File API documented | Yes, base64 `input_audio`; URL not supported | Yes, `video_url` URL or data URL for compatible models | No provider file retention documented; PDF annotations can be reused to avoid parsing | Not clearly documented on file pages; provider/model limits apply | Inline managed bytes for local/snapshot; pass explicit public `link_only` only for documented URL-capable image/PDF/video; avoid audio URL | P1 after direct providers, or M1 if OpenRouter is Starverse's first router surface |
| OpenAI Responses / Chat Completions | Yes, image data URL | Yes, image URL | Images may use Files API for supported flows, but M1 should use URL/data URL unless a model/file flow is explicitly selected | Yes, Responses `input_file.file_data`; Chat Completions docs also show `type: "file"` with base64 `file_data` | Yes, Responses `input_file` external URL; Chat Completions does not support file URLs | Yes, Files API `file_id`, including Chat Completions `type: "file"` examples and Responses `input_file.file_id` | Audio transcription is supported by Audio API, not the same chat file mapping | Video API exists separately; model-request video input should be treated as out of M1 unless docs for target endpoint are explicit | Files persist until manually deleted except documented expiration policies such as batch defaults; optional `expires_after` | 512 MB per file, 2.5 TB per project | Prefer Responses for document/PDF M1 as the Starverse native OpenAI route; inline small files, upload/cache larger or reused files, delete provider files when cache policy says so | P0 for images/PDF/docs |
| Anthropic Messages | Yes, `image.source.type=base64` | Yes, `image.source.type=url` | Yes, Files API `file_id` with beta header | Yes, `document.source.type=base64` | Yes, `document.source.type=url` | Yes, Files API `file_id` with beta header | Not documented for Messages file input | Not documented for Messages file input | Files persist until deleted; Files API is not ZDR-eligible | 500 MB per file, 500 GB org storage; PDF request limit 32 MB and 600 pages, with 100 pages on 200k-context models | Inline small images/PDFs; upload/cache repeated or larger files; never assume Bedrock/Google Cloud parity beyond base64 | P0 for images/PDF |
| Gemini / Google AI Studio | Yes, inline image data | Yes, documented URL/external URL paths | Yes, Files API `uri` | Yes, inline `document.data` with `application/pdf` | Yes via URL fetch / external URL paths; large URL PDFs can be uploaded to Files API first | Yes, Files API `uri` | Yes, inline or Files API; documented formats and token rates | Yes, inline, Files API, Cloud Storage registration, and public YouTube URLs | Files API files auto-delete after 48 hours; no download; manual delete available | General Files API: 2 GB/file and 20 GB/project; video guide: 20 GB paid / 2 GB free; PDF: 50 MB or 1000 pages | Use Files API for larger/reused media; inline small images/docs; treat external URLs as public provider fetch only with explicit link intent | P0 for images/PDF; P2 for audio/video |
| DeepSeek official API | Not documented | Not documented | Not documented | Not documented | Not documented | Not documented | Not documented | Not documented | No File API documented for chat files | Not documented for files | Do not map file assets; block with text-only unsupported message or convert selected DFC text into normal prompt text when user explicitly chose that path | P0 negative support guard |

## OpenRouter

Official sources:

- [Image understanding](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding)
- [PDF inputs](https://openrouter.ai/docs/guides/overview/multimodal/pdfs)
- [Audio](https://openrouter.ai/docs/guides/overview/multimodal/audio)
- [Video inputs](https://openrouter.ai/docs/guides/overview/multimodal/videos)

### Supported Input Ways

OpenRouter uses `/api/v1/chat/completions` with multipart message content arrays. Images use `type: "image_url"` and the URL field may be either a remote URL or a base64 data URL. PDFs use `type: "file"` with a filename and `file_data`/`fileData`, where the value may be a public PDF URL or a `data:application/pdf;base64,...` URL. Audio uses `type: "input_audio"` with base64 data and a format field. Video uses `type: "video_url"` with either a remote URL or a base64 data URL.

No persistent OpenRouter File API upload, `file_id`, retention, or deletion lifecycle is documented in these multimodal pages. PDF annotations can be sent back in later requests to avoid repeat parsing costs, but that is a parsed-result reuse mechanism, not an uploaded-file lifecycle.

### File Types

Documented support covers:

- Images: `image/png`, `image/jpeg`, `image/webp`, and `image/gif`.
- PDFs: direct URLs or base64 data URLs through the file content type; OpenRouter either passes native file input to a supporting model or parses the PDF for models without native file input.
- Audio: compatible models only; audio must be base64 encoded with a format.
- Video: compatible models only; remote URL and base64 data URL are documented, but URL support varies by downstream provider.

### URL Handling

OpenRouter directly fetches public image and PDF URLs. For PDFs, the docs state that PDF URLs work with all processing engines; some engines pass the URL downstream and others fetch/process internally. Audio URLs are explicitly unsupported. Video URL support is provider-specific; the docs call out Gemini on AI Studio as only supporting YouTube links through OpenRouter's video path.

Starverse should therefore:

- pass explicit `link_only` image/PDF URLs only if they are public and credential-free;
- avoid passing `link_and_file` original URLs when the local snapshot is the user's chosen file source;
- never pass audio URLs;
- treat video URL pass-through as provider/model gated, not a generic OpenRouter feature.

### Starverse Mapping

Local assets and URL snapshots should map to base64/data URL content parts read by the main process from the selected asset revision. OpenRouter is a good early target for images and PDFs because it uses a familiar Chat Completions content array, but the parser plugin and per-provider video/audio differences mean mapper tests must assert exact content block shapes and plugin configuration.

For PDFs, Starverse should choose one explicit parser policy for M1, likely the default parser first. Native-only mode should be postponed until model capability selection can prove native file support.

## OpenAI

Official sources:

- [File inputs guide](https://platform.openai.com/docs/guides/file-inputs)
- [Images and vision guide](https://platform.openai.com/docs/guides/images-vision)
- [Files API upload reference](https://developers.openai.com/api/reference/resources/files/methods/create)
- [Files API delete reference](https://developers.openai.com/api/reference/resources/files/methods/delete)
- [Speech to text guide](https://platform.openai.com/docs/guides/speech-to-text)

The OpenAI docs MCP was not available in this Codex session; `codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp` failed locally with Windows access denied. The research therefore uses official OpenAI web documentation only.

### Supported Input Ways

For Responses file inputs, OpenAI documents `input_file` items with three source forms:

- base64-encoded file data, including data URL examples such as `data:application/pdf;base64,...`;
- a `file_id` returned by the Files API;
- an external URL.

The same guide states that Chat Completions does not support file URLs and directs URL file input use to Responses. Current OpenAI docs also show Chat Completions file content blocks with `type: "file"` using either Files API `file_id` or base64 `file_data`. For Starverse M1, document/PDF mapping should still target Responses first as the native OpenAI route in Starverse architecture, not because Chat Completions is incapable of carrying file bytes.

For images, the vision guide documents both Responses `input_image` and Chat Completions `image_url`. Images can be supplied through fully qualified image URLs or base64 data URLs, and multiple images can be included in one request. Images are billed as tokens.

OpenAI's Speech to Text guide documents audio file uploads to the Audio API with a 25 MB upload limit and formats such as `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, and `webm`. That is not the same as chat/document file input and should be deferred from Starverse multimodal chat M1.

### File Types

Responses `input_file` processing is documented for:

- PDFs: models with vision capabilities extract both text and page images.
- Non-PDF documents and text files such as `.docx`, `.pptx`, `.txt`, and code files: text extraction only.
- Spreadsheets such as `.xlsx`, `.csv`, and `.tsv`: a spreadsheet-specific augmentation flow.

The file inputs guide warns that non-PDF document input does not extract embedded images or charts into model context; converting such documents to PDF preserves chart and diagram fidelity.

### Files API

The Files API upload reference documents `POST /files`, a 512 MB individual file limit, 2.5 TB project storage, and purpose values including `assistants`, `batch`, `fine-tune`, `vision`, `user_data`, and `evals`. `purpose=user_data` is the documented flexible purpose used by the file input guide examples. The same reference documents `expires_after`; by default batch files expire after 30 days, while other uploaded files persist until manually deleted. The delete reference documents `DELETE /files/{file_id}` and a deleted boolean response.

### URL Handling

Responses supports external URLs for file inputs, and image inputs support fully qualified remote URLs. Starverse should still prefer URL snapshots for default chat attachments because provider URL fetch moves network access and signed URL exposure to the provider. Explicit `link_only` can be passed only when the selected endpoint supports URL input and the URL has no embedded credentials.

### Starverse Mapping

OpenAI M1 should use Responses for PDFs and document files. Small images and small PDFs can be inlined as data URLs. Larger or reused assets should be uploaded through Files API and cached by provider, workspace/account, asset id, revision id, sha256, MIME, size, and source endpoint. The cache must be provider-prepared metadata, not a new File Asset Store asset. Deletion/expiration policy should be explicit and separate from Starverse asset deletion.

## Anthropic

Official sources:

- [Images and vision](https://docs.anthropic.com/en/docs/build-with-claude/vision)
- [PDF support](https://docs.anthropic.com/en/docs/build-with-claude/pdf-support)
- [Files API](https://docs.anthropic.com/en/docs/build-with-claude/files)

### Supported Input Ways

Anthropic Messages supports images as `image` content blocks with three source types:

- base64 embedded in the request;
- URL references to online images;
- `file_id` returned by the Files API.

PDFs use `document` content blocks with the same three source styles: URL, base64 with `media_type: "application/pdf"`, or Files API `file_id`. Files API usage requires the `anthropic-beta: files-api-2025-04-14` beta header in the current docs.

The Anthropic docs note that Amazon Bedrock and Google Cloud currently expose only base64 sources for these features, so Starverse should not assume Anthropic first-party API behavior applies unchanged to Anthropic-on-cloud integrations.

### File Types

Documented file content block support covers:

- Images: `image/jpeg`, `image/png`, `image/gif`, and `image/webp`.
- PDF: `application/pdf` document content blocks.
- Plain text through document content blocks according to the Files API guide.
- Dataset-like files for tool workflows, but those are not Starverse chat multimodal M1 targets.

Audio and video are not documented as Messages file input types in the official pages reviewed here and should be treated as unsupported for M1.

### Limits And Lifecycle

PDF support has a maximum request size of 32 MB, a maximum of 600 pages per request, and a reduced 100-page limit for models with a 200k-token context window. PDFs must be standard non-password-protected PDFs. Large dense PDFs may hit the context window or fail even before page limits.

The Files API guide documents a 500 MB per-file limit and 500 GB total organization storage. Uploaded files persist until deleted, deleted files are not recoverable, and Files API is not eligible for Zero Data Retention. Files uploaded by users cannot be downloaded through the API; downloadable files are limited to files created by skills or the code execution tool.

### URL Handling

Anthropic first-party Messages supports URL sources for images and PDFs. Starverse should still treat provider URL fetch as distinct from a Starverse URL snapshot. Default `link_and_file` attachments should use local snapshots or uploaded files; explicit `link_only` can pass the URL if the provider/endpoint supports it and the URL is safe to disclose.

### Starverse Mapping

Anthropic M1 should inline small images and PDFs where request size allows, then introduce a Files API upload cache for repeated or larger files. Because Files API is beta and not ZDR-eligible, the Starverse UI/diagnostics should make provider-upload behavior explicit before using it for sensitive assets.

## Gemini / Google AI Studio

Official sources:

- [File input methods](https://ai.google.dev/gemini-api/docs/file-input-methods)
- [Files API](https://ai.google.dev/gemini-api/docs/files)
- [Document understanding](https://ai.google.dev/gemini-api/docs/document-processing)
- [Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Audio understanding](https://ai.google.dev/gemini-api/docs/audio)
- [Video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)

The Gemini pages reviewed here currently emphasize the Interactions API and note that the page can be toggled to a `generateContent` version. Starverse implementation must explicitly choose whether M1 targets the Interactions API or translates the same asset mapping to the current Google AI Studio `generateContent` path before writing provider code; request shapes from these pages should not be copied into an existing `generateContent` adapter without that decision.

### Supported Input Ways

Gemini documents four file input methods:

- inline data in the request payload;
- Files API upload;
- Google Cloud Storage URI registration;
- external URLs for public data or cloud buckets.

The file input methods guide gives general limits: inline data up to 100 MB per request or payload, with 50 MB for PDFs; File API upload at 2 GB per file and 20 GB per project with 48-hour persistence; GCS URI registration at 2 GB per file with no overall storage limit; external URLs at 100 MB per request/payload. Media-specific pages can override those general limits: the image understanding page currently limits inline image data to a 20 MB total request size, the document page limits PDFs to 50 MB or 1000 pages, and the video guide has media-specific limits for video: File API 20 GB paid or 2 GB free, Cloud Storage registration 2 GB per file, inline data under 100 MB, and public YouTube URLs.

### File Types

Documented support covers:

- Images: URL, inline image data, or Files API upload.
- PDFs/documents: inline `document.data` with `mime_type: "application/pdf"` or Files API `uri`.
- Audio: inline or Files API; formats include WAV, MP3, AIFF, AAC, OGG Vorbis, and FLAC.
- Video: Files API, Cloud Storage registration, inline data, and public YouTube URLs; formats include MP4, MPEG, MOV, AVI, FLV, MPG, WebM, WMV, and 3GPP.

Gemini can also pass non-PDF documents, but the document guide says Gemini sees non-PDF documents as normal text, losing visual context such as charts or formatting.

### Limits And Lifecycle

The Files API docs state that uploaded files are automatically deleted after 48 hours, can also be manually deleted, are not downloadable through the API, can be used for metadata during their lifetime, and are available at no cost where Gemini API is available.

PDF support is documented up to 50 MB or 1000 pages, applying to both inline data and Files API uploads. Each PDF page is equivalent to 258 tokens. Larger pages are downscaled to 3072 x 3072 and smaller pages are upscaled to 768 x 768.

Audio is documented at 32 tokens per second, with a maximum length of 9.5 hours per prompt. Video tokenization is documented as sampled frames plus audio and metadata; the video guide says File API processing stores video at 1 FPS and audio at 1 Kbps single channel, with timestamps every second.

### URL Handling

Gemini supports external URLs in the file input methods guide and public YouTube URLs for video. For large PDF URLs, the document guide demonstrates fetching the URL and uploading bytes through Files API. Starverse should interpret this as two distinct choices:

- provider direct URL/external URL input for explicit public `link_only` cases;
- Starverse URL snapshot bytes uploaded or inlined for default `link_and_file`.

Signed/private URLs should not be sent unless the user explicitly chose link-only/provider URL behavior and the URL is known safe to disclose. The safer default is to snapshot in Starverse and send bytes or a provider file upload.

### Starverse Mapping

Gemini is a strong M1 provider for images and PDFs because it has clear inline and Files API paths, but M1 must first decide the exact Google API surface: Interactions API as documented on the current pages, or a `generateContent` translation if that remains Starverse's active Google AI Studio chat path. For larger/reused assets, use Files API and wait for any processing state required by the media type before sending. GCS URI registration should be postponed; Starverse does not currently model cloud object registration as part of File Asset Store v1. Audio and video should be P2 because they require longer fixtures, file-state polling, and provider-specific cost/limit UI.

## DeepSeek

Official sources:

- [Create chat completion](https://api-docs.deepseek.com/api/create-chat-completion)
- [Models and pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Anthropic API compatibility guide](https://api-docs.deepseek.com/guides/anthropic_api)

### Supported Input Ways

DeepSeek's OpenAI-format chat completion schema documents system and user message `content` as text strings. The official schema did not document `image_url`, `input_file`, `file_id`, base64 content parts, multipart upload, or URL file fetch for chat completions.

DeepSeek's Anthropic-format compatibility guide gives even stronger negative evidence: `content` string and text array parts are supported, while `array, type="image"` and `array, type="document"` are marked not supported. The same guide uses `deepseek-v4-pro` examples with text content blocks only.

### File Types

No official DeepSeek file, image, PDF, audio, or video input protocol was confirmed. Treat all file types as unsupported or undocumented for Starverse provider multimodal input.

### Starverse Mapping

Do not map File Asset Store assets into DeepSeek requests. The send plan/provider preflight should surface a text-only unsupported message. If a user has a DFC-derived text asset and explicitly chooses a text-in-prompt route, that is normal prompt text handling, not DeepSeek file input support.

## Starverse File Asset Store Mapping

Starverse should keep four concepts separate:

- File Asset Store asset/revision: Starverse-owned identity, storage, provenance, and history.
- Provider direct URL input: provider fetches a URL supplied in a request.
- Provider File API upload: provider stores a copy and returns `file_id`, `uri`, or equivalent.
- Inline bytes/base64: Starverse reads managed bytes in the main process and embeds them in the request payload.

Recommended internal prepared input part shape for future implementation:

```ts
type ProviderPreparedFilePart = Readonly<{
  provider: 'openrouter' | 'openai' | 'anthropic' | 'gemini' | 'deepseek'
  assetId: string
  revisionId: string | null
  blobSha256: string | null
  filename: string
  mime: string
  sizeBytes: number
  kind: 'image' | 'pdf' | 'document' | 'audio' | 'video' | 'text'
  source:
    | { kind: 'inline_base64'; dataUrl: string }
    | { kind: 'provider_file'; fileId?: string; uri?: string; expiresAt?: number | null }
    | { kind: 'provider_url'; url: string }
    | { kind: 'text_prompt'; text: string }
  cacheKey: string
}>
```

This shape is illustrative only. It should not be added to production code in this research task.

Rules for mapping:

- Local file asset: resolve the current revision in main, read managed bytes, then inline or upload according to provider limits.
- URL snapshot asset: use the stored local snapshot for `link_and_file`; do not leak original URL unless the user selected `link_only`.
- `link_only` URL: pass provider URL only for documented URL-capable endpoint/media combinations; otherwise block with a clear unsupported message.
- Derived asset: map the selected derived revision/output, not the original asset, when the user selected the derived representation.
- Large asset: prefer provider upload where documented; otherwise block with a retryable "too large for inline" message and do not silently downgrade to a URL.
- Failed asset: preserve send preflight blocking for failed/pending `link_and_file`, import failure, and missing derived output.

Provider upload caches should be separate from File Asset Store. Cache keys should include provider/account scope, endpoint family, asset id, revision id, blob hash, MIME, size, and upload purpose. Provider file cache entries may expire or be deleted without deleting Starverse assets.

## Recommended Implementation Order

1. M1a: mapper-only contract tests for images and PDFs using mocked main-process byte reads. Cover OpenAI Responses, Anthropic Messages, the explicitly selected Gemini surface (Interactions API or `generateContent` translation), and OpenRouter Chat Completions. DeepSeek should assert unsupported.
2. M1b: small image inline base64/data URL for all supported providers. Use one tiny PNG/JPEG fixture and verify exact request part shapes.
3. M1c: small PDF inline/file-data for OpenAI Responses, Anthropic Messages, the selected Gemini surface, and OpenRouter PDFs. Include a non-PDF document case only where docs prove the endpoint behavior.
4. M1d: provider upload cache for OpenAI Files API, Anthropic Files API, and Gemini Files API. Include cleanup/delete smoke for uploaded files where live tests are later authorized.
5. P2: audio/video for Gemini and OpenRouter. Require fixture-size limits, async processing state handling, provider/model gating, and cost/latency UX first.
6. P2: OpenRouter parser engine controls, PDF annotation reuse, and native-file model routing.
7. Not scheduled: DeepSeek multimodal file input until official support exists.

Real smoke matrix for the implementation milestone:

| Case | Fixture | Providers | Expected |
| --- | --- | --- | --- |
| Inline image | tiny PNG and JPEG | OpenAI, Anthropic, Gemini, OpenRouter | Request accepted; no renderer path/secret leak |
| Image URL | public non-secret URL | OpenAI, Anthropic, Gemini, OpenRouter | Only explicit `link_only` passes URL |
| Inline PDF | 1-page PDF under 1 MB | OpenAI, Anthropic, Gemini, OpenRouter | Model can summarize; exact content block shape verified |
| Provider file upload | same PDF | OpenAI, Anthropic, Gemini | Upload ref is reused within cache policy; delete path works where applicable |
| Failed URL snapshot | mocked failed download | all | `link_and_file` send blocked; no provider request |
| Unsupported provider | any file | DeepSeek | clear unsupported error; no hidden text/file downgrade |

## Open Questions / Risks

- OpenAI Chat Completions file URL support should not be assumed. Current OpenAI docs show Chat Completions `type: "file"` blocks for `file_id` and base64 `file_data`, while file URL usage is explicitly routed to Responses.
- Gemini general file input limits and media-specific limits differ by page. Treat media-specific docs as authoritative for that media and re-check before implementation; current docs mention 20 MB total request size for inline images, 50 MB or 1000 pages for PDFs, and 2 GB/file plus 20 GB/project with 48-hour retention for the general Files API.
- Gemini request-shape examples are currently Interactions API-oriented. Starverse must choose Interactions vs existing Google AI Studio `generateContent` mapping before provider code starts.
- Anthropic Files API is beta and not ZDR-eligible. Starverse needs explicit policy before using it for sensitive assets.
- OpenRouter PDF parser engines have different cost and behavior. M1 should choose a default and expose no extra parser UI until the provider mapping is stable.
- Provider direct URL input can leak signed URLs, query secrets, or private network locations. Starverse should prefer managed snapshots unless the user explicitly chooses link-only behavior.
- Provider upload caches can drift from Starverse asset state. They must be invalidated by revision/blob hash, not display filename.
- Large-file quotas are not part of File Asset Store v1. M1 should block or route to documented provider upload paths, not implement a quota system.

## Source Links And Retrieval Date

Retrieved on 2026-06-27:

- OpenRouter image understanding: https://openrouter.ai/docs/guides/overview/multimodal/image-understanding
- OpenRouter PDF inputs: https://openrouter.ai/docs/guides/overview/multimodal/pdfs
- OpenRouter audio: https://openrouter.ai/docs/guides/overview/multimodal/audio
- OpenRouter video inputs: https://openrouter.ai/docs/guides/overview/multimodal/videos
- OpenAI file inputs: https://platform.openai.com/docs/guides/file-inputs
- OpenAI images and vision: https://platform.openai.com/docs/guides/images-vision
- OpenAI Files API upload: https://developers.openai.com/api/reference/resources/files/methods/create
- OpenAI Files API delete: https://developers.openai.com/api/reference/resources/files/methods/delete
- OpenAI speech to text: https://platform.openai.com/docs/guides/speech-to-text
- Anthropic images and vision: https://docs.anthropic.com/en/docs/build-with-claude/vision
- Anthropic PDF support: https://docs.anthropic.com/en/docs/build-with-claude/pdf-support
- Anthropic Files API: https://docs.anthropic.com/en/docs/build-with-claude/files
- Gemini file input methods: https://ai.google.dev/gemini-api/docs/file-input-methods
- Gemini Files API: https://ai.google.dev/gemini-api/docs/files
- Gemini document understanding: https://ai.google.dev/gemini-api/docs/document-processing
- Gemini image understanding: https://ai.google.dev/gemini-api/docs/image-understanding
- Gemini audio understanding: https://ai.google.dev/gemini-api/docs/audio
- Gemini video understanding: https://ai.google.dev/gemini-api/docs/video-understanding
- DeepSeek create chat completion: https://api-docs.deepseek.com/api/create-chat-completion
- DeepSeek models and pricing: https://api-docs.deepseek.com/quick_start/pricing
- DeepSeek Anthropic API compatibility: https://api-docs.deepseek.com/guides/anthropic_api
