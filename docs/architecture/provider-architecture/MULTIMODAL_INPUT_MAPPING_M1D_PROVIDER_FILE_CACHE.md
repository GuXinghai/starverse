# Multimodal Input Mapping M1d: Provider File API Upload Cache

M1d adds a provider-side upload cache for OpenAI Responses, Anthropic Messages, and Gemini / Google AI Studio. File Asset Store remains the Starverse source of truth; provider files are cached remote copies only and are never stored as File Assets.

## Runtime Policy

- Covered asset kinds: image and PDF.
- Covered providers: `openai_responses`, `anthropic_messages`, `google_ai_studio`.
- Excluded providers: OpenRouter has no M1d persistent File API cache; DeepSeek remains unsupported before file bytes are read.
- Covered providers are upload-first for managed local/snapshot bytes.
- `link_and_file` uses managed snapshot bytes and never sends `originalUrl`.
- `link_only` stays URL-only and does not enter the upload cache.
- M1b/M1c inline image/PDF paths remain as fallback/regression paths, but M1d live smoke must prove provider File API references.

## Cache Identity

The cache key is bound to:

- provider
- endpoint family
- normalized base URL
- credential fingerprint
- asset id
- revision id
- blob sha256
- MIME type
- size bytes
- asset kind
- upload purpose

The credential fingerprint is computed in the main process as:

```text
sha256(providerKey + endpointFamily + normalizedBaseUrl + normalizedApiKey)
```

`normalizedApiKey` is only `trim()`; it is not lowercased or otherwise rewritten. The raw API key is never stored in the cache and never sent to the renderer.

## Provider Mapping

- OpenAI uploads through Files API with `purpose=user_data`; Responses requests use `input_file.file_id`.
- Anthropic uploads through Anthropic Files API; Messages image/PDF blocks use `source: { type: "file", file_id }`. Anthropic Files API is not ZDR, and that is documented in diagnostics and live-smoke reporting.
- Gemini uploads through Gemini Files API using Electron session-aware transport; generation uses `fileData.fileUri`. Gemini expiration is recorded and expired cache entries are reuploaded.

## Safety

Provider request bodies and diagnostics must not include:

- `originalPath`
- `storagePath`
- `storageRootDir`
- `storageUri`
- `blobId`
- `originalUrl`
- `resolvedUrl`
- API keys
- Authorization headers
- raw local file paths

Upload failures create no reusable cache. Generation failures keep the cache unless the provider explicitly reports that the file is invalid, deleted, or expired; those errors trigger best-effort local cache invalidation. M1d does not implement a remote provider-file delete API or automatic cleanup sweep. Gemini remote files are scoped by provider expiry metadata; OpenAI/Anthropic smoke uploads are left as provider-managed files unless manually cleaned outside M1d.
