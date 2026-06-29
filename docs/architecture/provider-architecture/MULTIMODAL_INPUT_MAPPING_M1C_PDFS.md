# Multimodal Input Mapping M1c: Small PDF Inline Runtime Integration

Status: implementation slice for small PDF provider runtime inputs.

M1c extends the M1b runtime image path to `application/pdf` only. It does not add generic document support, provider File API upload/cache, PDF OCR, audio, video, ModelPicker changes, OpenRouter catalog changes, Send Plan capability rewrites, or DFC routing changes.

## Runtime Scope

- Local PDF assets are read through File Asset Store managed bytes for the selected current revision.
- URL snapshot assets with `link_and_file` use the managed snapshot bytes and never pass the original URL to a provider.
- `link_only` PDF URLs may be sent only as provider URL/file references when the URL is `http` or `https`, has no userinfo, no query, and no hash.
- Inline PDF runtime size is capped at 1 MB.
- Pending, failed, deleted, or otherwise non-ready assets block send with a safe error.

## Provider Request Shapes

- OpenAI Responses: text plus `input_file` with `filename` and `file_data` data URL, or `file_url` for safe link-only URL.
- Anthropic Messages: text plus `document` block with base64 `source`, or URL `source` for safe link-only URL.
- Google AI Studio / Gemini: text plus `inlineData` using `mimeType: application/pdf`, or `fileData` for safe link-only URL.
- OpenRouter: text plus `type: file` block with `file.filename` and `file.file_data`; M1c uses the default parser path and does not inject a native/plugin parser by default.
- DeepSeek: file/PDF attachments are unsupported and fail before provider fetch. File bytes are not read and file content is not converted into prompt text.

## Security Boundary

Provider request parts and runtime bodies must not contain raw local paths or asset internals such as `originalPath`, `storagePath`, `storageRootDir`, `storageUri`, `blobId`, `originalUrl`, or `resolvedUrl`. API keys and Authorization headers are never part of requestPart diagnostics or tests.

Filenames are sanitized before entering provider content blocks. If a future hardening pass treats filenames as sensitive, Starverse can replace them with fixed names such as `attachment.pdf` without changing provider body shape.

## Live Smoke

The M1c live smoke script generates a deterministic one-page English PDF locally, sends one prompt plus one PDF per provider, uses Electron `safeStorage` credentials from the Starverse secure store, and uses Electron session-aware transport. It prints only safe summaries: provider, model, pass/skip/fail, text length, expected phrase detection, generation count, and leak-check status.

The script does not save raw request logs, raw response logs, API keys, Authorization headers, or the generated PDF fixture.
