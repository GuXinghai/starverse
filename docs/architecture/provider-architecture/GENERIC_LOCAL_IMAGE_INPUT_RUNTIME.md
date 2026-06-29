# Generic / Local Image Input Runtime

This slice adds PNG/JPEG image input planning and runtime wiring for the remaining OpenAI-compatible and local providers:

- Generic OpenAI-compatible Chat Completions contract.
- LM Studio Local through OpenAI-compatible `/v1/chat/completions`.
- Ollama Local through native `/api/chat`, native `/api/generate`, and OpenAI-compatible `/v1/chat/completions`.

It does not add PDF, non-PDF documents, audio, video, Provider File API upload/cache, OCR, automatic model download, or DFC routing.

## File Source

File Asset Store remains the only source of file bytes. Provider adapters do not read local paths. The renderer does not receive `originalPath`, `storagePath`, `storageUri`, or `blobId`.

`link_and_file` URL assets use the managed snapshot bytes and are serialized as inline image data. The original URL is not sent to the provider.

`link_only` URL assets are only passed where the selected protocol supports image URLs. For local native Ollama REST, link-only URLs are blocked because native `/api/chat` and `/api/generate` require base64 image data.

## Generic OpenAI-Compatible

Generic remains fail-closed by default. Image input is controlled by an explicit profile:

- `text_only`: default; image blocks are rejected before fetch.
- `chat_completions_image_data_url`: allows `image_url.url` data URLs only.
- `chat_completions_image_url`: allows data URLs and safe `http`/`https` image URLs.
- `unknown_unsupported`: blocks image input.

The request shape is Chat Completions content parts:

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Describe it." },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    }
  ]
}
```

Generic does not support PDF, Responses `input_file`, Files API, provider file cache, audio, or video in this slice.

## LM Studio

The first runtime path is OpenAI-compatible `/v1/chat/completions` with `image_url` content parts. Local files and `link_and_file` snapshots use data URLs. Safe `link_only` image URLs can use the same OpenAI-compatible shape.

LM Studio native `/api/v1/chat` image input is deferred. If image blocks reach native REST or OpenAI-compatible Responses mode, Starverse returns a safe unsupported error before provider generation.

Before sending an image, Starverse checks `/api/v1/models`; the selected model must be known and report `capabilities.vision === true`. Unknown capability is blocked rather than blindly sent.

## Ollama

Ollama supports three image request paths.

Native `/api/chat`:

```json
{
  "model": "vision-model",
  "messages": [
    { "role": "user", "content": "Describe it.", "images": ["<base64-without-data-url-prefix>"] }
  ],
  "stream": true
}
```

Native `/api/generate`:

```json
{
  "model": "vision-model",
  "prompt": "user: Describe it.",
  "images": ["<base64-without-data-url-prefix>"],
  "stream": true
}
```

OpenAI-compatible `/v1/chat/completions`:

```json
{
  "model": "vision-model",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Describe it." },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    }
  ],
  "stream": true
}
```

For native REST, only managed bytes/data URLs are accepted. `link_only` image URLs are blocked. For OpenAI-compatible Chat Completions, safe image URLs are allowed.

Before sending an image, Starverse probes `/api/show` for the selected model and requires `capabilities` to include `vision`. It does not pull or download models.

## Live Smoke

`scripts/smoke/local-image-live-smoke.cjs` generates a deterministic 64x64 PNG and tries:

1. Ollama native `/api/chat`, if an installed model reports `vision` from `/api/show`.
2. LM Studio OpenAI-compatible chat completions, if a loaded model reports `capabilities.vision === true`.

The script does not print request bodies, raw base64 payloads, API keys, Authorization headers, or raw provider responses. If no local vision model is available, it reports a safe skip.
