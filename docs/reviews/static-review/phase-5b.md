# Static Review — Phase 5b: Files and Attachments

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

This is a read-only static review of branch `codex/basic-operation-exploration-8q02ix` at `eb00786`. The application source matches baseline `aec217cd`.

- No application code was modified.
- No tests, builds or rebuilds were run.
- The app was not launched, and no network or provider requests were made.

## 1. Scope and coverage

| Area | Files | Depth |
|---|---|---|
| Ingest | `electron/ipc/generationV2ComposerIpc.ts` (import-local, import-url-file, read-preview), `fileSelectionGrants.ts`, `dialogIpc.ts`, `infra/files/urlProbe.ts`, `electron/net/electronManualRedirectFetch.ts`, `src/shared/files/{fileRules,fileTypes}.ts` | Full |
| Storage | `epoch2AttachmentBlobStoreV2.ts`, `attachmentAssetV2Repo.ts`, `composerDraftV2Repo.ts`, `dfcAttachmentBinding.ts`, `fileTypeDetectionV2Repo.ts`, related `infra/db/v2/*.sql` | Lifecycle, conflict and integrity paths |
| Detection | `epoch2FileTypeDetectionService.ts` (non-Magika), `basicFileTypeDetectionV2.ts`, `fileTypeStaticPolicy.ts`, `evidenceMerge.ts` | Full |
| Rendering | `DraftAttachment{Strip,Card}.vue`, `MessageAttachment{List,Card}.vue` | Full; `DraftAttachmentDetailsDialog.vue` grepped only |
| Conversion | `generationV2DfcService.ts` (text, HTML and DOCX option paths), `electronConversionService.ts`, `electronHtmlPdfConversionAdapter.ts`, `infra/files/{electronConversionBridge,dfcConversionSandbox}.ts` | Full; the worker-bridge path was not traced to a production caller |
| Provider upload and replay | Anthropic and OpenAI preflight and V2 upload services, file descriptor repos, `historicalTurnAttachmentReplayV2.ts`, `regenerateSourceAttachmentsV2.ts`, Anthropic compiler file-id paths, OpenAI native-history file resolution | Full for the live V2 path |
| Import/export | Repository-wide grep | No conversation or project import/export feature exists. Only capability-rule packs (out of scope) and LibreOffice `.svpkg` import (Phase 5a). |

**Not covered (open):**
- Blob put/read atomicity and symlink handling in `native/epoch-win32/src/addon.cc`.
- `DraftAttachmentDetailsDialog.vue`.
- `composerDraftV2Repo.setDfcSelection`, and whether DFC selection is revalidated at send.
- `appChatApp.logic.ts` `ingestLocalFiles`.
- `containerProbe.ts` and `taxonomyMap.ts` internals.
- CSP `img-src` for `data:` URLs (Phase 7).
- Tests.

**Dead or legacy code with no production importer:**
- `src/next/files/{previewClient,messageAttachmentClient,conversationDraftClient,fileIngestionClient,sendPlanClient}.ts`, which call an unregistered `dbBridge`.
- `MessageAttachmentRepo`, `conversationDraftRepo`, `infra/files/fileStoragePaths.ts`, `src/shared/files/localStorageResolver.ts`.
- `openRouterSendPlanSerializer.ts`, `providerFileUploadService.ts`, `providerFileUploadInvalidation.ts`.
- `probeUrl`; only `fetchPublicHttpUrl` is used.
- `fileTypeStaticPolicy` send/convert flags and `sendRouteMapping.ts`.
- There is no V2 Gemini file upload; Gemini attachments are inline only.

## 2. Subagent configuration and contributions

Two read-only `Explore` subagents ran concurrently, configured as `model: sonnet` and `effort: high`. The exact "Sonnet 5.5" version cannot be confirmed. Neither spawned agents nor wrote files.

- **5B-A** (ingest, storage, detection, rendering, import/export) returned 10 candidates.
- **5B-B** (conversion, send plans, upload) returned 11 candidates.

Both agents found the DFC text-option conflict independently (5B-A-1 and 5B-B-1). The coordinator verified it from source:
- `TEXT_TARGETS = ['plain_text','markdown','code','table_markdown']` (`generationV2DfcService.ts:30`).
- `contentFor` returns the source unchanged except for `code` (`:67-69`).
- The output is persisted as `'text/markdown'` (`:202-203`).
- A blob with the same sha256 but a different mime throws `GENERATION_V2_ASSET_CONFLICT` (`attachmentAssetV2Repo.ts:487-491`).
- There is no per-option catch (`:85`).

The coordinator also verified:
- URL import buffers with `arrayBuffer()` before the 50 MiB check, with no signal (`generationV2ComposerIpc.ts:180-186`).
- Conversation delete removes only the `conversation_v2` row (`conversationWorkspaceV2Repo.ts:65-73`).
- History replay checks only `providerId` (`historicalTurnAttachmentReplayV2.ts:37-39`), and the Anthropic compiler reads `providerFileId` from snapshot bindings (`anthropicMessagesPreparedRequestCompilerV2.ts:93-98`).
- Preflight does find, then upload, with no in-flight guard (`anthropicMessagesAttachmentPreflightV2.ts:45-50`).
- HTML→PDF builds an `encodeURIComponent` data URL from a UTF-8 read (`electronHtmlPdfConversionAdapter.ts:96-97`).

## 3. Findings by severity

There are no High findings. Final IDs are P5b-NN, with subagent IDs in brackets.

### Medium

#### P5b-01 — Text conversion options throw for every non-markdown text attachment [5B-A-1, 5B-B-1]
- **Severity:** Medium. A core attachment feature fails deterministically for common files (`.txt`, `.csv`, `.json`, `.html`) on OpenRouter chat. The whole options call rejects, so even the "original file" option is hidden.
- **Status:** Statically confirmed. Whether the UI requires a conversion selection before sending was not confirmed.
- **Where:** `electron/services/generationV2DfcService.ts:30, 67-69, 85, 196-206` → `persistDerivedOutput` → `infra/db/repo/attachmentAssetV2Repo.ts:487-491`.
- **Trigger path:**
  1. A text source is attached and `composer:dfc-options` runs for `openrouter` + `chat_completions`.
  2. The `plain_text` output has the same bytes, and so the same blob id, as the source.
  3. The source blob is labelled `text/plain` (for example), but the derived blob is labelled `text/markdown`.
  4. The mismatch throws `GENERATION_V2_ASSET_CONFLICT`.
- **Counterevidence:** `.md` sources work. The integration test (`tests/integration/generationV2DfcService.test.ts:171, 196, 261`) uses only markdown, which is why the failure is not caught. A source with a BOM changes the bytes and avoids it.
- **Repair direction:**
  - Reuse the source mime for identity conversions, or move mime from the blob to the revision (see P5b-05).
  - Catch per-option failures into `blocked(...)`.
- **Verify:** Add an integration test with `.txt` and `.json` sources.

#### P5b-02 — Conversion options are all-or-nothing; HTML→PDF failures hide every option and retry each time [5B-B-2, 5B-B-3]
- **Severity:** Medium. One converter failure makes the attachment unconfigurable, and the retry cost is up to 3×15 s per call.
- **Status:** Confirmed for the control flow. The data-URL length limit is suspected: Chromium's URL cap of about 2 MiB is from memory.
- **Where:**
  - `generationV2DfcService.ts:86, 150-153, 207-249`. `pdfOption` has no catch, and `OPTION_UNAVAILABLE` is thrown at `:241, :244`. There is no negative cache.
  - The DOCX path returns `null` and becomes a blocked option (`:154-157`), which is inconsistent with the HTML path.
  - `electronHtmlPdfConversionAdapter.ts:96-97` reads the source as UTF-8, so `<meta charset>` for GBK or Shift-JIS is ignored and the PDF shows mojibake. `encodeURIComponent` expands the source about 3–9×, so HTML of roughly 0.25–2 MB likely fails `loadURL`. No source size cap exists.
- **Repair direction:**
  - Catch per option, and add a short negative cache.
  - Serve HTML through a one-shot protocol handler or a file in the sandbox, not a data URL.
  - Detect the charset, and cap the source size.

#### P5b-03 — URL import: unbounded buffering, no timeout, and DNS-rebinding SSRF [5B-A-5, 5B-A-6; extends P3b-05]
- **Severity:** Medium. A user-pasted URL can exhaust main-process memory or hang import indefinitely. The SSRF guard can be bypassed by rebinding.
- **Status:**
  - Statically confirmed: buffering and the missing timeout.
  - Confirmed at design level: rebinding. The check resolves DNS separately from the connection.
  - Partially confirmed: the range gaps.
- **Where:**
  - **Buffering and timeout:** `generationV2ComposerIpc.ts:180-186`. `fetchPublicHttpUrl` gets no `signal`; `arrayBuffer()` runs before the `MAX_URL_IMPORT_BYTES_V2` check; `content-length` is ignored. The bytes are then copied and hashed in `persist` and `recordBlob` (about 3–4× the size).
  - **Empty response:** an empty 2xx imports a zero-byte attachment.
  - **Local import:** `:144` reads the whole local file with no cap.
  - **SSRF check:** `infra/files/urlProbe.ts:206-236` resolves with `dns.lookup`, then Chromium resolves again inside `electronManualRedirectFetch.ts:25-26`. When a proxy is configured, the proxy resolves the name instead.
  - **Range gaps:** IPv4 225–239 multicast, `198.18/15`, `192.0.0/24`; IPv6 IPv4-compatible `::7f00:1`, NAT64 `64:ff9b::/96`, `fec0::/10`.
  - **Cookies:** the import does not pass `credentials: 'omit'`, unlike the proxy probe.
- **Trigger:** Import from a hostile or very large URL, or a rebinding host that answers with a public address for the check and `127.0.0.1` / `169.254.169.254` for the fetch.
- **Impact:**
  - Main-process OOM or a stuck import.
  - A loopback or metadata response saved as an attachment, previewable and sendable to a provider.
- **Counterevidence:**
  - Numeric IPv4 forms (`127.1`, `2130706433`) and IPv4-mapped IPv6 are normalised and blocked.
  - Redirects are re-validated hop by hop.
  - The URL is pasted by the user, not by a remote party.
- **Repair direction:**
  - Stream with a byte counter, reject early on `content-length`, and use an `AbortSignal` timeout.
  - Pin the resolved address to the connection (custom lookup / host-resolver rule), or bypass the proxy for the check.
  - Use `credentials: 'omit'`, and fill the range gaps.

#### P5b-04 — Uploaded provider files are never validated, refreshed or deleted, and history replays file ids from an old credential scope [5B-B-4, 5B-B-5; extends I3b-03]
- **Severity:** Medium. The privacy cost is that user documents stay in provider storage indefinitely. The availability cost is that a missing remote file permanently breaks every later send of that conversation.
- **Status:** Statically confirmed. Immutability is intentional per the schema comment; the consequences are not handled.
- **Where:**
  - Preflight returns any existing descriptor without remote validation (`anthropicMessagesAttachmentPreflightV2.ts:46-47`; `openAIResponsesAttachmentPreflightV2.ts:67-75`).
  - Descriptor rows cannot be updated or deleted (`infra/db/v2/attachmentAssetSchema.sql:91-101, 134-144`).
  - The contracts declare `delete_file` (`anthropicDeveloperApiContractV2.ts:56, 153`; OpenAI contract), but nothing calls it.
  - History replay checks only `providerId` (`historicalTurnAttachmentReplayV2.ts:37-39`). The Anthropic compiler reads `providerFileId` from the old snapshot's bindings (`anthropicMessagesPreparedRequestCompilerV2.ts:93-98`) without comparing with the current `credentialScopeId`. OpenAI history validates against the old snapshot's own scope (`openAIResponsesNativeHistoryV2Repo.ts:222-225`).
  - Each credential save mints a new scope (`epoch2RuntimeCredentialService.ts:592`).
- **Triggers:**
  - The user switches to a key in a different workspace or account.
  - The remote file is deleted (by the user in the provider console, or by provider retention).
- **Repair direction:**
  - Add tombstone/supersede rows for descriptors.
  - Map provider "file not found" errors to invalidation and re-upload.
  - Compare scopes at replay, and re-upload or degrade explicitly on mismatch.
  - Offer a "delete uploaded files" action, and call it on conversation delete.

### Low-Medium

| ID | Finding | Status | Where | Repair direction |
|---|---|---|---|---|
| P5b-05 [5B-A-2, 5B-B-9; extends P4a-20] | Blob identity is sha256 with a single `mime`, so identical bytes imported under a different mime fail with an opaque `ASSET_CONFLICT`. The first writer fixes the mime; for example, a URL import's `Content-Type` decides it for later local imports of the same bytes. Root cause of P5b-01. | Confirmed | `attachmentAssetSchema.sql:3-15`; `attachmentAssetV2Repo.ts:487-491`; `generationV2ComposerIpc.ts:146, 187` | Store mime on the asset revision; the blob is bytes only |
| P5b-06 [5B-A-3; extends P3b-05] | Every failure after `persist()` orphans the blob, and nothing can delete blobs: a delete guard trigger blocks it and there is no sweeper. Specific causes: names with leading/trailing whitespace or control characters are rejected only after persist; `safeDeclaredMime` accepts `*/*`, `-/-` and `a/b/c`, which `safeMime` later rejects; a draft revision conflict during a slow URL download. A crash during the POSIX write can also leave `.svtmp-*` plaintext files under `assets/sha256/`. | Confirmed | `generationV2ComposerIpc.ts:146, 188`; `attachmentAssetV2Repo.ts:82-85, 266-280`; `posixEpochFilesystemBackend.ts:76-99` | Validate name and mime before persist; reachability sweep at startup |
| P5b-07 [5B-B-6] | Concurrent preflights for the same asset revision and scope both upload. The second `insertOrGet` throws `DESCRIPTOR_CONFLICT`, which fails that generation and orphans its remote file. The legacy service had an in-flight map; V2 lost it. | Confirmed | `anthropicMessagesAttachmentPreflightV2.ts:45-50`; `anthropicMessagesFileDescriptorV2Repo.ts:85`; `openAIResponsesFileDescriptorV2Repo.ts:168` | Per-key in-flight promise; on conflict, re-read the winner and delete the loser's remote file |
| P5b-08 [5B-A-7] | Detection is advisory. Only `policy.blocked` is enforced, and only for included attachments. Asset kind and send mode come from the extension or the server header. Extension/mime-only evidence has "medium" confidence and produces no warning. Archives, sqlite, wasm and OLE files are not flagged. Bytes disguised as `.png` or `.pdf` are sent labelled as that type. Harm is mostly a provider rejection or a misleading safety signal. | Confirmed | `generationV2ComposerIpc.ts:146-157`; `attachmentAssetV2Repo.ts:829, 1092-1132`; `fileTypeStaticPolicy.ts:31-61`; `evidenceMerge.ts:86-139` | Bind send mode to detected type; warn on any conflict |
| P5b-09 [5B-A-9; extends P3b-05] | `read-preview` reads, SHA-verifies and base64-encodes every visible image at full size on the main thread, on every branch refresh, with no cache or cap. A 50 MiB image becomes a ~67 MB IPC string. | Confirmed | `generationV2ComposerIpc.ts:220-227`; `appChatApp.logic.ts:4391-4396` | Thumbnails or cache; size cap |

### Low

| ID | Finding | Status | Where |
|---|---|---|---|
| P5b-10 [5B-A-8] | The grant check normalises the path with `path.resolve`, but the read uses the renderer's raw string, so `dir/link/../file` can differ after symlink resolution. Needs a compromised renderer plus a symlink inside a user-picked directory. | Confirmed (hardening) | `generationV2ComposerIpc.ts:141-144`; `fileSelectionGrants.ts:88` |
| P5b-11 [5B-B-7, 5B-B-8] | Listing options eagerly converts and persists derived assets that are never retired. DOCX has no in-flight de-duplication (cf. P5a-06). `derivedForWithContract` breaks ties nondeterministically on `created_at_ms`. Each HTML conversion creates a non-persistent session that is never released. There is no abort path for conversions at shutdown (up to a 45 s wait). | Confirmed | `generationV2DfcService.ts:215-230, 281`; `electronHtmlPdfConversionAdapter.ts:110, 203-206`; `electronConversionService.ts:49-53` |
| P5b-12 [5B-B-10] | Upload hardening. The Anthropic upload response `text()` is unbounded and parsed before the `!ok` check, unlike OpenAI's 256 KiB bound. There is no client-side size cap before upload, and the bytes are held as three copies. `provider_file` is admitted for Anthropic with any mime (extends P3b-13). `nativeShape` and the inline-size logic are duplicated across two compiler files (cf. P3b-18). | Confirmed | `anthropicMessagesFileUploadV2Service.ts:52-56`; `requestAttachmentTransportV2.ts`; `compatibleGenerationIntentV2.ts` |
| P5b-13 [5B-A-10] | One corrupt draft attachment row makes `read()` throw `GENERATION_V2_DRAFT_STATE_INVALID`, so the whole composer for that conversation becomes unusable. | Confirmed | `composerDraftV2Repo.ts:172-218, 563-631` |

### Cross-references (not re-counted)
- **[5B-A-4] → P2b-04.** Deleting a conversation or draft attachment never removes blob bytes, filenames or `original_url`. A URL can carry signed tokens, so this also widens the privacy impact of P2b-04. The delete path was reconfirmed: `conversationWorkspaceV2Repo.ts:65-73`.
- **[5B-B-11] Info.** The dead legacy upload service and send-plan serializer have defects that would matter if revived: an unescaped `Content-Type` part header, an unvalidated Gemini `x-goog-upload-url`, and retained URLs sent as `file_data`. Do not revive them as-is.

## 4. Uncertainties and excluded false positives

**Uncertainties:**
- Whether a DFC selection is required before sending (P5b-01 user impact).
- The Chromium data-URL limit (P5b-02).
- Whether `preconnect` / `dns-prefetch` hints escape the conversion window's request filter.
- Whether Chromium's HTTP cache retains URL-import bodies after removal.
- Windows native blob write atomicity.
- No startup sweep of stale `temp/dfc-*` directories was found (also covered by P5a-05).

**Held up:**
- **Blob store:** a closed sha256 namespace. Storage refs are validated twice, and bytes are re-hashed on write and read. Windows uses handle-relative native I/O, and dedupe by sha256 is safe.
- **File-selection grants:** sender-bound, random token, single use, TTL. Opaque grants add main-frame and frame-URL checks. Smoke-fixture IPCs are env-gated (packaged ones also need a marker, nonce and hash).
- **Attachment rendering:** filenames and URLs render as text. Images render as `<img>` `data:` URLs, which leaves SVG scripts inert. Mime charsets are constrained by SQL and JS checks, so they cannot inject into the `data:` URL. There is no `v-html`, `href`, `openExternal`, `createObjectURL` or iframe in these components.
- **Conversation scoping:** DFC and detection retry resolve assets through the conversation's own draft, and answer-snapshot edits are scoped by conversation. No cross-conversation access by id was found.
- **Immutability:** triggers guard assets, revisions and blobs, and draft-attachment insert re-verifies the sha256, conversion kind and retirement.
- **Provider file descriptors:** keyed by `(credentialScopeId, endpointProfileId, assetRevisionId)` with sha256 verified. There is no cross-key reuse for the current turn, and the commit step re-checks scope and endpoint.
- **Upload bytes:** they come from `verifySnapshotAttachmentSendBytes` (size and sha256 against the revision). A derived PDF uploads the derived bytes.
- **Upload requests:** the credential lease asserts revision and scope before and after the network call. Hosts are fixed, with `redirect: 'error'`, `credentials: 'omit'` and `cache: 'no-store'`. Multipart uses `FormData`. Errors are coded, with no key or body leakage.
- **HTML→PDF window:** sandboxed, context-isolated, no node integration, no preload, `webSecurity` on, `javascript: false`, in-memory partition. Window-open is denied, navigation is pinned, non-`data:` requests are cancelled, downloads are denied, each phase has a timeout, the window is destroyed and the temp directory removed, and the output must start with `%PDF-`.
- **Conversion cache keys:** immutable source revision + contract + revision + settings digest, so there is no stale-serve path.
- **Regenerate:** reads frozen requested attachments tied to the question, answer and operation.

**Rejected or downgraded:**
- "Cross-key provider file reuse for the current turn": the scope is in the key.
- "XSS through attachment filenames or SVG previews": rendered as text or as `<img>`.
- "`__proto__` DFC default keys": no exploitable effect.
- "The `!metadata` bypass in `nativeShape`": unreachable in production.
- "A conversation/project export leaks data": no such feature exists.

## 5. Next phase

**Phase 6 — Frontend:** `src/ui-app` (model picker, settings, session console, search, project sidebar), the `src/ui-kit` rich text renderer, and i18n. It may be split into 6a (settings, model picker, sidebar/search) and 6b (message rendering, rich text, session console).

This phase is complete. I have stopped and am waiting for your instruction to continue.
