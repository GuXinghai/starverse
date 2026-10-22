# Static Review — Phase 6b: Frontend (Rendering, Console, Composer, i18n)

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

This is a read-only static review of branch `codex/basic-operation-exploration-8q02ix` at `4cae76a`. The application source matches baseline `aec217cd`.

- No application code was modified.
- No tests, builds or rebuilds were run.
- The app was not launched, and no network or provider requests were made.
- One subagent ran a read-only script that compares the `t()` keys used in source with the locale key sets. It wrote nothing to the repository.

This completes Phase 6 (frontend) together with [Phase 6a](phase-6a.md).

## 1. Scope and coverage

| Area | Files | Depth |
|---|---|---|
| Rich text | `src/ui-kit/chat/richtext/{sanitizer,streamRenderer,finalRenderer,blockTokenizer,shikiLoader}.ts`, `RichTextContent.vue`, `RichTextFinal.vue` | Full |
| Message UI | `ChatMessageBubble.vue`, `ChatTranscript.vue`, `ChatReasoningPanel.vue`, `ReasoningRichText.vue`, `ChatErrorPanel.vue`, `ChatStatusBar.vue`, `googleSearchSuggestionsSanitizer.ts`, `useVirtualWindow.ts`, `useChatScrollAnchor.ts`; `ProviderFailureDetailsV2.vue`, `ReasoningArtifactDiagnostics.vue`, `ChatInlineReasoning.vue`, `userMessageRenderPolicy.ts` | Full |
| Link handling | `electron/windows/mainWindow.ts` (`will-navigate`, `setWindowOpenHandler`), `electron/ipc/shellIpc.ts`, `electron/security/externalUrlPolicy.ts`, `config/appCsp.ts` | Targeted |
| Console and composer | `ChatSessionConsole.vue` (2778 lines), `ChatAppComposer.vue` (1623 lines), `ComposerCapabilityChip.vue`, `ChatTopSummaryBar.vue`, `WebSearchSettingsEditor.vue` (as used from the console), `AppChatApp.vue`; send, draft, abort and session-config handlers in `appChatApp.logic.ts`; `sendButtonMode.ts`, `generationV2*Projection.ts`, `networkErrorDisplay.ts` | Script logic and key templates |
| i18n | `src/shared/i18n/{index,formatters,localeMatcher,localeRegistry}.ts`, `locales/{en-US,zh-CN}/*.json` | Full, including key and placeholder parity |

**Not covered (open):**
- `ChatAppReasoningPanel.vue` internals.
- `richtext.css`.
- Tests and stories.
- DOMPurify and Shiki internals beyond their documented behaviour.
- The producers of `googleSearchSuggestions` and citation annotations (Phase 7).
- `inappBrowser.ts` and the agent windows (Phase 7).
- zh-CN translation quality.
- Main-side quit and draft flush timing.
- Performance was not measured.

**Dead code:**
- `src/ui-kit/chat/ChatComposer.vue` has no importer. Its Enter handler has no IME or `canSend` guard, so it should not be revived as is.
- `RichTextContent.vue` has a `streaming=false` finalize path that `ChatMessageBubble` never uses.

## 2. Subagent configuration and contributions

Two read-only `Explore` subagents ran concurrently, configured as `model: sonnet` and `effort: high`. The exact "Sonnet 5.5" version cannot be confirmed. Neither spawned agents nor wrote files.

- **6B-A** (rendering and rich text) returned 7 candidates.
- **6B-B** (console, composer, shell, i18n) returned 12 candidates.

The coordinator verified these from source:
- `finalRenderer.ts`:
  - `:25-30`: KaTeX options with no `maxSize`.
  - `:33-42`: the fence placeholder rule.
  - `:62-76`: `html.replace(placeholder, highlighted)` with a string replacement.
  - `:94-100`: `renderBlockSync` uses the same `md`, so fences become placeholders that are never filled.
  - `:163-170`: the math `replace` calls.
  - `:301`: the inline-math regex `[^$\\]` with no whitespace or digit guard.
- `sanitizer.ts:67-84, 104-115`: any `href` outside http, https, mailto, tel or relative sets `removed = true`.
- `RichTextFinal.vue:61-70`: `removed` shows the whole message as plaintext.
- `streamRenderer.ts:42, 199-206, 300-309`: the sticky `fallbackMode`.
- `useVirtualWindow` is used only by `ModelPickerDialog.vue`.
- `shared/i18n/index.ts:255-257`: `tf` uses a string replacement.
- `SearchModal.vue:394`: Enter has no `isComposing` guard; only Escape has one, at `:135`.
- `ChatSessionConsole.vue:1056-1058` and `en-US/chat.json:346-350`: the effort labels are low, medium and high only.
- `common.add` and `errors.modelCatalog.providerFiltersRemoved` are absent from en-US.
- `WebSearchSettingsEditor.vue:318-337`: the watch keeps `lastValidCustomMaxResults` when the layer has no `maxResults`.

## 3. Findings by severity

There are no High findings and no XSS or link-navigation defect. Final IDs are P6b-NN, with subagent IDs in brackets.

### Medium

#### P6b-01 — Code blocks and math are corrupted by `String.replace` special replacement patterns [6B-A-1; same defect class as 6B-B-7]
- **Severity:** Medium. Code output is the primary artifact users copy from an LLM chat, and the corruption is silent.
- **Status:** Statically confirmed. The exact Shiki tokenisation of `$$` is from reference knowledge.
- **Where:** `src/ui-kit/chat/richtext/finalRenderer.ts:70, 74`. Both call `html.replace(block.placeholder, highlighted | renderCodeFallback(...))` with a string replacement. The math restore at `:168-169` has the same pattern.
- **Trigger:** A fenced block containing `$&`, `` $` ``, `$'` or `$$`. Examples: bash `$$` (PID), JS `replace` demos, Perl, LaTeX in a code fence. Shiki and the fallback escape `&` to `&amp;`, so `$&` becomes `$&amp;` and still starts with `$&`.
- **Impact:**
  - `$$` collapses to `$`.
  - `$&` inserts the placeholder comment, which the sanitizer then strips.
  - `` $` `` and `$'` splice the whole preceding or following message HTML into the code block.
  - The rendered code differs from the model output, and the copy action copies the displayed text.
- **Counterevidence:** None found. The tests do not cover `$` in code.
- **Repair direction:** Use a function replacer (`() => highlighted`) at all three sites.
- **Verify:** Unit tests rendering ```` ```bash\necho $$ $& $`\n``` ```` in final mode.

#### P6b-02 — Inline `$…$` math swallows currency and shell variables, and can span paragraphs [6B-A-2]
- **Severity:** Medium. Prose such as "costs $5 and $10" or "set $HOME and $PATH" is common and is visibly mangled.
- **Status:** Statically confirmed.
- **Where:** `finalRenderer.ts:301`. The pattern `(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)` has no whitespace or digit guard, and `[^$\\]` matches newlines. `:294` (`\[…\]`) has the same multi-line shape.
- **Impact:**
  - `5 and ` renders as italic KaTeX with spaces collapsed.
  - A stray `$` pairs with a later one across paragraphs, folding the text between them into one math span.
  - Streaming works per block, so the stream and final output disagree.
- **Repair direction:** Use pandoc-style delimiters: no space after the opening `$`, none before the closing `$`, the closing `$` not followed by a digit, and a single line only.

### Low-Medium

| ID | Finding | Status | Where | Repair direction |
|---|---|---|---|---|
| P6b-03 [6B-A-3] | A single link with a scheme markdown-it accepts but the sanitizer does not (for example `ssh:`, `vscode:`, `obsidian:`, or a linkified `ftp://`) sets `removed`. The **entire** message then renders as raw markdown under a "sanitized for security" banner. While streaming, `fallbackMode` is sticky, so `feed()` returns early and the display stalls until completion. | Confirmed (fail-closed, not a vulnerability) | `sanitizer.ts:67-84, 113-116`; `streamRenderer.ts:42, 202-206, 300-309`; `RichTextFinal.vue:61-70` | Drop only the bad `href` without flagging; reserve `removed` for forbidden tags and attributes; do not make the fallback sticky |
| P6b-04 [6B-A-4] | During streaming, a fenced code block nested in a list or blockquote is invisible. The tokenizer keeps indented lines in the list block, and `renderBlockSync` emits the Shiki placeholder comment, which nothing fills and the sanitizer strips. The code appears only at the switch to the final render, with a layout jump. | Confirmed | `blockTokenizer.ts:168-192`; `finalRenderer.ts:33-42, 94-100`; `streamRenderer.ts:199` | Render fences as escaped `<pre><code>` in the sync path |
| P6b-05 [6B-A-5, 6B-A-6] | Rendering cost has no bounds and runs on the main thread: <ul><li>Each animation frame re-tokenizes the full text and re-renders the whole open tail block (markdown-it, KaTeX and DOMPurify over the entire block), which is O(n²) for long lists, tables and fences.</li><li>KaTeX has no `maxSize`, so `\rule{1e9em}…` breaks layout.</li><li>Shiki `codeToHtml` is synchronous, with no size or line cap.</li><li>`ChatTranscript` is not windowed and there is no render cache, so opening a long conversation renders every message synchronously.</li></ul> Tokenizer inconsistencies also cause cosmetic stream-versus-final differences: paragraphs before a fence or heading never close, early fence close on "```js", and fence matching that differs from markdown-it. | Config absence confirmed; perf impact not measured | `streamRenderer.ts:91-133, 179-210`; `blockTokenizer.ts:52-250`; `finalRenderer.ts:25-30, 204-243`; `shikiLoader.ts:144-160` | Memoise per item, throttle large tail blocks, set `maxSize` and lower `maxExpand`, skip Shiki above a size limit, cache by text hash, use `content-visibility` or window the transcript |
| P6b-06 [6B-B-1, 6B-B-2] | Raw i18n keys shown to users: <ul><li>Console reasoning efforts `xhigh` and `max` (Anthropic) or `minimal` render as `chat.console.reasoning.effort.xhigh` because the locale defines only low, medium and high.</li><li>`common.add` (compatible-provider add-model button) is missing from both locales.</li><li>`errors.modelCatalog.providerFiltersRemoved` (picker notice) is missing from both locales.</li></ul> | Confirmed | `ChatSessionConsole.vue:1056-1058, 2387-2396`; `locales/*/chat.json:346-350`; `CompatibleProviderSettingsPanel.vue:850`; `ModelPickerDialog.vue:1379` | Add the keys; fall back to the raw value for effort; add a source-key scan test |
| P6b-07 [6B-B-3] | Search Enter ignores IME composition. Confirming a pinyin or kana candidate fires `runSearch` with a stale `v-model` value. zh-CN is the default locale, so this is a routine trigger. The composer and conversation-list inputs do guard against it. | Confirmed (`v-model` lag inferred) | `SearchModal.vue:394` | Reuse the composer's `isComposing` / `keyCode 229` guard |
| P6b-08 [6B-B-4] | Web-search "custom max results" carries over between conversations. The editor is not keyed by conversation, and its watch keeps `lastValidCustomMaxResults` when the new layer has no `maxResults`, so choosing "custom" in conversation B applies A's value. | Confirmed | `WebSearchSettingsEditor.vue:55-58, 210-235, 318-337`; `ChatSessionConsole.vue:2579` | Key the editor by conversation id, or reset local state when the model value changes |

### Low

| ID | Finding | Status | Where |
|---|---|---|---|
| P6b-09 [6B-B-7] | `tf()` substitutes with a string replacement (`$&`, `` $` ``, `$'`) and sequentially, so a project named `Q$&A` is corrupted in interpolated messages, and a value containing `{other}` is expanded again. | Confirmed | `shared/i18n/index.ts:255-257`; e.g. `ConversationList.vue:783` |
| P6b-10 [6B-B-5] | The composer reasoning chip ignores Anthropic required-thinking locks, and the web-search chip ignores the capability gate the console applies. The display and toggles disagree with the console, and an unsupported web-search request fails later with a raw code. Request harm is limited by rule adaptation. | Gating gap confirmed; request effect suspected | `ChatAppComposer.vue:1276-1290, 1391-1402`; `ChatSessionConsole.vue:2327-2328, 2553` |
| P6b-11 [6B-B-6] | Raw `GENERATION_V2_*` codes reach banners and the top bar, because `t()` falls back to the code itself. The file-detection reason concatenates `errorDetail`, which may carry server detail or paths. | Codes confirmed; leakage suspected | `appChatApp.logic.ts:742-771, 3853, 8372`; `ChatAppComposer.vue:1457-1464`; `ChatTopSummaryBar.vue:40` |
| P6b-12 [6B-B-10] | The chip menu stays open after the chip becomes disabled (for example after sending with Enter), and its options remain selectable. The session-config handlers check the draft lock but not `isRunning`. `onAbort` has no re-entry guard or catch. | Confirmed | `ComposerCapabilityChip.vue:93-115`; `appChatApp.logic.ts:3383, 3858-3951` |
| P6b-13 [6B-B-11; same root as P6a-13] | Local endpoint URLs (LM Studio, Ollama, generic) are persisted on every keystroke and displayed verbatim, including any `user:pass@`. Probe results are not reset on conversation or endpoint change. | Confirmed | `ChatSessionConsole.vue:1716, 1837, 1957, 2146, 2268-2276`; `useExperimentalProviderChatSettings.ts:488-495, 740-743, 815, 910-913` |
| P6b-14 [6B-A-7] | Renderer edge cases: <ul><li>Sanitizer hooks are added without `try/finally`.</li><li>The `SANITIZE_NAMED_PROPS` comment does not match the config, and `id` is allowed (latent only, since `html:false` and KaTeX `trust:false`).</li><li>`isKaTeXErrorHtml` misfires on valid `\color{#cc0000}`.</li><li>Math placeholder tokens can collide with literal text.</li><li>A fence info string with attributes disables highlighting.</li><li>Google suggestion `plainText` shows `&amp;amp;`.</li><li>Relative and `mailto:` links are dead clicks.</li><li>The citation `href` is unvalidated (safe today via the window-open handler and CSP).</li></ul> | Confirmed | `sanitizer.ts:8, 37, 98-139`; `finalRenderer.ts:180-182, 283-314`; `ChatMessageBubble.vue:368-369`; `mainWindow.ts:153-166` |
| P6b-15 [6B-B-8, 6B-B-9, 6B-B-12] | i18n and display: <ul><li>Hard-coded English in the composer and web-search editor.</li><li>Duplicate `'—'` v-for keys in image chip options.</li><li>No plural forms ("1 models").</li><li>Every system language other than en or zh resolves to zh-CN while `FALLBACK_LOCALE` is en-US, `zh-TW` maps to Simplified, and `fallbackLocale` is ignored by `t()`.</li><li>`searchContextSize: 'medium'` is displayed as high.</li><li>`replaceNetworkCodeInMessage` can rewrite digits inside URLs.</li><li>`formatDate` throws on an invalid date (no production caller).</li></ul> | Confirmed | `ChatAppComposer.vue:580-584, 829, 1470-1517`; `localeMatcher.ts:27-103`; `localeRegistry.ts:14-17`; `generationV2SessionConfigProjection.ts:113`; `networkErrorDisplay.ts:67-74`; `formatters.ts:17-20` |

## 4. Uncertainties and excluded false positives

**Uncertainties:**
- How often `$$` survives as one Shiki token (P6b-01). `$&` and the fallback path are certain.
- Rendering cost on real long conversations (P6b-05), which was not measured.
- Whether the locale policy in P6b-15 is intentional.

**Held up:**
- **`v-html` sinks:** there are only two, and both receive sanitized output: `RichTextFinal.vue:72` (the result of `renderFinal`'s final `sanitizeHtml`) and `ChatMessageBubble.vue:327` (`sanitizeGoogleSearchSuggestions`). Every `innerHTML` write in the stream renderer follows `sanitizeHtml` or uses escaped text.
- **Ordering:** sanitization runs after markdown-it, KaTeX and Shiki in both the stream and final paths.
- **markdown-it:** `html: false`. `validateLink` rejects `javascript:`, `vbscript:`, `file:` and non-image `data:`. `link_open` adds `rel="noopener noreferrer"`.
- **KaTeX:** `trust: false`, so `\href`, `\url`, `\includegraphics` and `\html*` are disabled.
- **Sanitizer:** forbids script, iframe, object, embed and form-control tags, and DOMPurify's own URI check backs up the custom `href` hook.
- **CSP:** `img-src 'self' data: asset: blob:` blocks remote markdown images, so there is no tracking-pixel exfiltration. `script-src` has no `unsafe-inline`.
- **Google suggestions:** tight allowlist with no `style`, `class`, `id` or `name`, absolute http(s) only, and forced `_blank` with `noopener`.
- **Error and diagnostics panels:** text interpolation or `<pre>` only. User messages default to plain text.
- **Navigation:** `will-navigate` pins the app origin and opens only http(s) externally. `setWindowOpenHandler` denies and routes through the http(s) policy. `shell:open-external` validates the scheme. The main window is sandboxed.
- **Composer:**
  - The IME guard (`isComposing` / `229`) and Shift+Enter work.
  - Send is gated on `enabled_arrow`.
  - `sendOrchestrationLocked` plus the per-conversation submit set prevent Enter-plus-click double sends.
- **Draft persistence:**
  - The outgoing draft is captured before a switch.
  - Writes are scope-checked and sequence-numbered.
  - Drafts flush on send, `pagehide`, `beforeunload`, visibility change and unmount.
  - No path writes conversation A's draft into B.
- **Resource lifecycle:** the Shiki singleton, render-version guards, and the observers, listeners and timers in the composer, shell and transcript are released.
- **Locale parity:** all 11 namespaces have identical key sets and `{param}` placeholders in en-US and zh-CN.

**Rejected or downgraded:**
- "XSS through markdown, KaTeX, Shiki or Google suggestions": sanitized after rendering, with tight allowlists.
- "Link click navigates the main window": blocked by `will-navigate`.
- "Draft text lost or cross-written on conversation switch": not found.
- "Enter-plus-click double send": locked.
- `id` attribute clobbering: latent only, with no current source.

**Cross-references:**
- P6b-13 shares a root cause with P6a-13.
- P6b-09 is the same defect class as P6b-01.
- P6b-10 relates to P6a-10 (composer patch snapshots).
- P6b-11 adds a frontend surface to the provider-error coverage in Phases 3b and 4a.
- The cross-cutting sanitization, provider-HTML and URL-source review remains in Phase 7.

## 5. Next phase

**Phase 7 — Cross-cutting:** logging and redaction, markdown/KaTeX/Shiki sanitization as a system property (building on this phase's held-up list), proxy and network policy, CSP, unbounded caches, blocking synchronous work, and tracked-artifact privacy (including `artifacts/`).

This phase is complete. I have stopped and am waiting for your instruction to continue.
