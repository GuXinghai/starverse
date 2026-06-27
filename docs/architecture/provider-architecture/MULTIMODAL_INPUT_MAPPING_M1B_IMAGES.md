# Multimodal Input Mapping M1b Images

M1b connects the M1a File Asset / Revision mapper to the small-image runtime send path. This slice is image-only for PNG and JPEG inputs and does not introduce PDF/document runtime sending, provider File API upload, upload cache, compression, OCR, audio, or video.

## Runtime Flow

1. Renderer send preflight keeps unsupported providers blocked before a turn is created.
2. For OpenAI Responses, Anthropic Messages, and Google AI Studio / Gemini, the UI asks the DB worker to prepare draft image attachments with `providerFileInput.prepareDraftImages`.
3. The DB worker builds the current SendPlan, filters to included image attachments, and calls `prepareProviderFileInput`.
4. `prepareProviderFileInput` reads managed bytes from the current File Asset revision, or returns a provider URL for safe `link_only` URL assets.
5. Provider-native image parts are passed as `currentUserContentBlocks` into the existing streaming runtime.
6. Provider adapters assemble the final request body while preserving existing text streaming behavior.

OpenRouter continues to use the existing first-class Send Plan path. The M1b adapter tests verify the same `image_url` runtime request shape without changing catalog or Send Plan capability.

## Provider Image Shapes

OpenAI Responses:

```ts
{ type: 'input_image', image_url: 'data:image/png;base64,...' }
```

When images are present, the current user message content becomes a multipart array with `{ type: 'input_text', text }` followed by image parts.

Anthropic Messages:

```ts
{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '...' } }
```

URL images use `{ type: 'image', source: { type: 'url', url } }` when allowed.

Google AI Studio / Gemini:

```ts
{ inlineData: { mimeType: 'image/png', data: '...' } }
```

URL images use `{ fileData: { mimeType: 'image/png', fileUri: url } }` when allowed.

OpenRouter:

```ts
{ type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
```

## URL Retention Modes

`link_and_file` URL assets use the stored managed snapshot bytes. The original URL is not passed to provider request parts.

`link_only` URL assets can produce URL image parts only when the provider supports URL image input and the URL is a safe HTTP(S) URL. Otherwise the mapper returns unsupported/URL-not-allowed and send is blocked.

In the current Send Plan vocabulary, `sendMode: 'url_ref'` means the planner selected the URL-reference-capable route. It does not override the retention boundary: `link_and_file` still sends the managed snapshot bytes, while only `link_only` may pass a safe provider URL.

## Unsupported Providers

DeepSeek remains file-input unsupported. If an image block reaches the DeepSeek runtime adapter, the adapter emits a terminal `unsupported_provider` stream error before request construction and before fetch. It does not read bytes and does not convert file content into prompt text.

## Leakage Boundary

Provider runtime content blocks are whitelisted by shape in IPC and rebuilt in adapters. Request bodies must not include renderer paths, `originalPath`, `storagePath`, or `blobId`. API keys stay in provider transport headers and are not present in mapper request parts or tests.

## Non-goals

M1b does not implement PDF/document runtime integration, provider upload lifecycle/cache, ModelPicker changes, OpenRouter catalog changes, Generic live enablement, LocalEndpoint/LM Studio/Ollama file input, Send Plan capability redesign, or DFC conversion changes.
