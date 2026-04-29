# Phase 7 Derived Tasks And Embeddings

Phase 7 turns `file_derivatives` from a passive record table into a task-driven derivative system. The phase adds derivative jobs, minimal derivative runners, PDF annotation capture, and the first reusable derivative outputs: `extracted_text`, `transcript`, and `embedding_vector`.

This phase does not add UI, full RAG retrieval, Office conversion, image/PDF compression workflows, automatic URL refresh, or large asynchronous queue infrastructure.

## Scope

Phase 7 adds:

- a derivative job framework with explicit status transitions;
- `derivative_jobs` persistence for task lifecycle tracking;
- `create`, `run`, `retry`, `cancel`, and query operations for derivative jobs;
- minimal `extracted_text` generation for text assets and captured PDF annotations;
- minimal `transcript` generation for local audio assets through OpenRouter chat completions plus `input_audio`;
- minimal `embedding_vector` generation for text-like derivative inputs through OpenRouter `/embeddings`;
- capture of reusable PDF file annotation metadata from OpenRouter responses.

## Core Boundary

The phase keeps three boundaries frozen:

- `embedding` and `transcription` remain task families, not file types;
- original assets are never overwritten by derivative output;
- derivative failure never changes the availability of the source asset or the send path built in Phases 5 and 6.

## Derivative Job Framework

Each derivative task is tracked independently from the derivative row it may eventually produce.

### Job Responsibilities

The job layer is responsible for:

- recording the requested derivative kind and task family;
- tracking generator, provider, model, attempt count, and config snapshot;
- moving through explicit task states;
- recording structured failure codes and messages;
- writing or updating a `file_derivatives` row only after a task produces output.

### Job Statuses

Phase 7 uses these statuses:

- `pending`
- `running`
- `ready`
- `failed`
- `cancelled`

All jobs must reach a terminal state. `failed` is terminal but retryable through a new attempt on the same job record.

### Recorded Inputs

Each job records enough information to explain the derivative result:

- source `assetId`
- `derivativeKind`
- `taskFamily`
- `generator`
- `provider`
- `modelId`
- input snapshot JSON
- config JSON
- output derivative id, when ready
- attempt count
- timestamps for create, start, finish, and updates

## File Derivative Write Strategy

Phase 7 continues to use `file_derivatives` as the durable derivative record.

- derivative output is written under derived storage, never into original asset paths;
- the job layer creates a new derivative row or updates an existing derivative row for the same logical output;
- later readers should use `getLatestReadyDerivative` to select a stable reusable output;
- multiple derivative versions may exist, but the latest ready row remains the default read path.

Embedding vectors are stored as derivative-managed JSON output rather than being emitted into ordinary logs or UI state.

## Extracted Text

Phase 7 adds minimal `extracted_text` support for:

- `txt`
- `md`
- PDF text recovered from OpenRouter file annotations

### Text Assets

For `txt` and `md` assets:

- the local managed file copy is read;
- content is treated as text input for derivative purposes;
- a derived text file is written to derived storage;
- derivative metadata records source filename, source mime, source extension, encoding hint, source hash, and character count.

### PDF Annotations

Phase 7 does not introduce a new heavyweight local PDF parser. Instead it captures OpenRouter file annotations that already contain reusable parsed content.

When a PDF response annotation includes text content:

- the text is normalized into an `extracted_text` derivative;
- annotation hash, source file name, and content summary metadata are stored in derivative meta;
- the annotation becomes reusable by later phases without forcing immediate reparsing.

This phase does not implement OCR and does not rely on deprecated `pdf-text`. New code should prefer current parser engines such as `cloudflare-ai`, `mistral-ocr`, or `native` when PDF parsing is explicitly configured upstream.

## PDF Annotation Capture

PDF annotation capture is intentionally narrow.

- capture runs after OpenRouter annotations are persisted for the assistant message;
- only PDF assets that were actually included in the send plan are considered;
- annotation metadata is matched back to file assets conservatively by known asset id, file hash, or filename;
- large annotation bodies are not written to normal logs;
- this phase stores reusable metadata but does not implement a complex dedupe or cache-hit planner.

If a PDF annotation is missing or cannot be parsed into usable text, the system records a structured derivative error instead of failing the message send flow.

Phase 7 distinguishes:

- `pdf_annotation_missing` for absent annotations or annotations that contain no reusable text parts;
- `pdf_annotation_parse_failed` for malformed annotation payloads, including invalid `file.content` shape or malformed content parts.

## Transcript

Phase 7 adds minimal `transcript` derivatives for local audio assets.

### OpenRouter Boundary

Transcript generation uses OpenRouter chat completions with `input_audio`.

- audio must be base64;
- audio URL transport is not allowed;
- the selected model must advertise audio input support;
- failure to meet those conditions returns a transcript-specific structured error.

### Output

Successful transcript jobs:

- read the local managed audio copy;
- base64-encode the audio file;
- submit a transcription-focused prompt plus `input_audio`;
- write transcript text into derived storage;
- record provider, model, audio format, usage, and other lightweight metadata.

This phase does not implement speaker diarization, subtitle export, high-fidelity timestamps, or live transcription UI.

## Embedding Vector

Phase 7 adds minimal `embedding_vector` derivatives for text-like inputs.

### Input Priority

Embedding jobs prefer:

1. latest ready `extracted_text`
2. latest ready `transcript`
3. original text-like asset content

Binary assets are not embedded directly.

### Chunking

Long input is chunked through a simple, explainable strategy:

- paragraph-first grouping;
- fixed maximum character limit fallback for oversized blocks;
- recorded `chunkIndex`, `start`, and `end` offsets.

This phase does not implement advanced semantic chunking or retrieval ranking.

### OpenRouter Boundary

Embeddings use OpenRouter `/api/v1/embeddings`.

- requests include `model` and `input`;
- input is text or a text array;
- returned vectors, usage, model id, and dimensions are recorded in derivative-managed output;
- complete vectors are not logged.

Derivative metadata records model id, provider, dimension, chunk count, input hash, encoding format, and usage when available.

This phase does not build a vector database, similarity search layer, or user-facing RAG workflow.

## Reserved Derivative Kinds

Phase 7 keeps these derivative kinds as reserved interfaces only:

- `converted_pdf`
- `send_optimized`
- `preview_optimized`

They may be represented as job kinds and can fail with an explicit unsupported result, but this phase does not implement Office conversion, image/PDF compression, or generalized preview optimization.

## Error And Diagnostics Policy

Derivative tasks emit structured errors, including:

- source asset missing or unsupported;
- input missing;
- local file missing or unreadable;
- output write failure;
- timeout or cancellation;
- timeout for provider-backed derivative requests is implemented through request timeout and maps to `derivative_task_timeout`;
- PDF annotation missing or parse failure;
- transcript model missing or not audio-capable;
- transcript request failure;
- embedding model missing;
- embedding input empty;
- embedding request failure or invalid response.

Transcript model checks are explicit:

- `transcript_model_missing` when configured model id is not present in model catalog;
- `transcript_model_not_audio_capable` when model input modalities do not include audio.

Embedding validation is explicit:

- `embedding_input_empty` when resolved source text is blank or chunking yields no usable input;
- `embedding_response_invalid` when embedding response shape is invalid, chunk counts do not match, or returned vectors are empty.

Diagnostics are summary-only. They may include:

- job id
- asset id
- derivative kind
- task family
- status
- generator
- provider
- model id
- attempt count
- output derivative id
- text length, chunk count, or embedding dimension summaries

Diagnostics must not include:

- raw base64
- full file bodies
- full transcript source audio
- full embedding vectors
- API keys or Authorization values
- unredacted absolute local paths in ordinary logs

## Phase Boundary

Phase 7 does not:

- alter attachment ownership semantics from Phase 4;
- alter Send Plan semantics from Phase 5;
- alter OpenRouter send serialization semantics from Phase 6;
- rebuild provider request builders around derivative jobs;
- guarantee asynchronous queue execution beyond the minimal runner interface;
- add UI or search experiences on top of derivative outputs.
