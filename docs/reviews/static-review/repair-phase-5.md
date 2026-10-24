# Repair Phase 5: files, conversation actions and content correctness

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-24

This is repair Phase 5 from [repair-plan.md](repair-plan.md) section 3. It covers R5-01 to R5-05, following [repair-phase-4b.md](repair-phase-4b.md).

- **R5-01:** bulk conversation actions apply only to visible, selected conversations; selecting a missing conversation rolls back.
- **R5-02:** text conversion options work for non-markdown text; one failed option does not hide the others.
- **R5-03:** history never replays a provider file id from another credential scope (found already guarded; now pinned by a test); one corrupt draft attachment row does not block the draft (D-4).
- **R5-04:** code and math render byte-exact, including `$&`, `` $` ``, `$'` and `$$`.
- **R5-05:** inline math does not capture currency or shell variables or cross paragraphs; unsupported link schemes and nested fences render safely.

Each fix has a test that names its finding or item ID, and each was checked against the reverted source (section 3).

- No provider or network requests were made. Tests used in-memory databases, synthetic fixtures and the rendering libraries in-process.
- D-4 holds: one corrupt draft attachment row is reported and skipped; nothing was deleted or rewritten.
- D-4r, D-6 and D-8 are untouched in this phase.

## 1. Scope and repository state

| Item | Value |
|---|---|
| Branch | `codex/static-review-repairs`, on top of `a9112e82` (Phase 4b) |
| Untouched working-tree content | `world_map_experiment/__pycache__/` (untracked, preserved, not committed) |
| Subagents | None were run in this phase. All mapping, conclusions and edits are the coordinator's |

## 2. Changes by item

### R5-01: bulk actions and selection (P6a-01, P6a-09, P6a-16)

**P6a-01.** `ConversationList.vue` kept a selection set that survived list changes (project switch, refresh, a delete elsewhere), so a bulk delete or move could name rows the user could no longer see. Selection counts, select-all state and both confirm dialogs now go through the rows that are visible at that moment, and the selection is pruned when `items` changes. A dialog opened before a change emits only for ids that are still visible; for none it emits nothing.

**P6a-09.** `onSelectConvo` moved the active ids before the transcript loaded. When the load failed, the old transcript stayed on screen under the dead id. It now remembers the previous ids, shows the error, restores them and reloads the previous transcript (best effort).

**P6a-16 (part).** A stale search hit naming a project that no longer exists no longer selects it. `onSelectProject` reports a refresh failure instead of dropping it. `loadMoreConvos` skips ids in the local deleted set, so a page requested before a delete finished does not bring the row back.

### R5-02: text conversion options (P5b-01, P5b-05, P5b-02)

**P5b-01 / P5b-05.** Converting a text file recorded the derived blob with the strict method. If identical bytes already existed under another mime label (`notes.txt` content that was first imported as `text/markdown`), the strict method threw `GENERATION_V2_ASSET_CONFLICT` and the option vanished. A new `recordBlobKeepingStoredMimeInAuthorityTransaction` resolves identical bytes to the stored blob and keeps its label (a blob is identified by its sha256). The strict method and its conflict test are unchanged. Derived-output persistence and both import handlers (file and URL) use the new method; `assetKind` follows the stored blob's mime.

**P5b-02 (part).** In `generationV2DfcService.ts` a failed conversion now produces one blocked option (`GENERATION_V2_DFC_CONVERSION_FAILED`) instead of failing the whole options call. The text options, the HTML PDF and the DOCX PDF are each isolated. A failed HTML PDF conversion is remembered for 60 s per revision, so every options call does not pay the converter's timeout again.

### R5-03: provider file scope and corrupt draft rows (P5b-04, P5b-13)

**P5b-04: not reproduced.** The finding says history can replay a provider file id issued under another credential. The code path does not: `portableGenerationHistoryV2.ts` takes over whenever any included earlier turn has a different `scope()`, `scope()` includes `credentialScopeId`, and that path re-encodes attachment bytes and never sends file ids. A fix was written and then reverted as unnecessary. A characterization test stays in `historicalAttachmentReplayV2.test.ts` ("does not send a provider file id issued under another credential scope"); its fixture gained a per-scope capability row. It passes at HEAD.

**P5b-13 (D-4).** `ComposerDraftV2Repo.read()` decoded every attachment row and threw `GENERATION_V2_DRAFT_STATE_INVALID` for the whole draft if one failed. Each row is now decoded on its own; a row that fails is left out of `attachments`, counted in the new `unreadableAttachmentCount` field, and stays stored untouched. Anything that is not a repository error still throws. The check of a selected conversion output (retired output, bad producer) is not part of this: it still fails the read closed, because it decides what would be sent, and the existing tests that pin that behaviour are unchanged. The renderer's strict system-template draft schema (`systemChatTemplateClient.ts`) accepts the new field as optional; without that, every template read failed.

### R5-04: byte-exact code and math (P6b-01, P6b-09)

**P6b-01.** `finalRenderer.ts` replaced the Shiki placeholder, the fallback `<pre>` and the restored math with string replacements, so `$&`, `` $` ``, `$'` and `$$` inside the code or math were expanded. The three sites now use function replacers.

**P6b-09 / RC-13.** `tf()` (renderer, `src/shared/i18n/index.ts`, and main, `electron/i18n/mainI18n.ts`) had the same defect and also expanded a placeholder that appeared inside a value. Both now substitute in one pass with a function replacer.

### R5-05: math delimiters, links, nested fences (P6b-02, P6b-03, P6b-04)

**P6b-02.** Inline math now uses pandoc-style delimiters: one line, no space just inside either `$`, an escaped `\$` does not open, and the closing `$` is not followed by a digit. "costs $5 and $10" and "set $HOME and $PATH" stay prose; `$x$` is still math. Display math (`$$…$$`, `\[…\]`) is unchanged, since multi-line display math is valid.

**P6b-03.** A link with a scheme the sanitizer does not allow (`ssh:`, `vscode:`, `obsidian:`, `ftp:`) now loses only its own `href`. The whole-message fallback is kept for `javascript:`, `vbscript:`, `data:` and `file:`, so no existing security assertion changed. The scheme check also ignores tabs and control characters inside the scheme.

**P6b-04.** `renderBlockSync` now replaces the code placeholder with the escaped fallback `<pre>` for a fence nested in a list or blockquote. Before, the sanitizer stripped the placeholder and the code was invisible until the final render.

## 3. Tests added or changed

No existing assertion was changed. Every edit to an existing test file adds tests, or extends a fixture helper.

| Item | File | Added | Fails without the fix |
|---|---|---|---|
| R5-01 | `ConversationList.mutations.test.ts` | 4 | 4 of 4 |
| R5-01 | `AppChatApp.searchNavigation.test.ts` | 2 | 2 of 2 |
| R5-02 | `tests/integration/generationV2DfcService.test.ts` | 5 (3 file types, HTML PDF failure, invalid UTF-8) | 5 of 5 |
| R5-02 | `attachmentAssetV2Repo.test.ts` | 1 | 1 of 1 |
| R5-03 | `historicalAttachmentReplayV2.test.ts` | 1 characterization (P5b-04) | passes at HEAD by design |
| R5-03 | `composerDraftV2Repo.test.ts` | 1 | 1 of 1 |
| R5-03 | `systemChatTemplateClient.test.ts` | 1 | 1 of 1 |
| R5-04 | `finalRenderer.test.ts` | 12 (4 patterns for fallback code, highlighted code, display math) | 10 of 12 (see below) |
| R5-04 | `src/shared/i18n/index.test.ts`, `electron/i18n/mainI18n.test.ts` | 5 + 5 | 10 of 10 |
| R5-05 | `finalRenderer.test.ts` | 14 | 12 of 14 |
| R5-05 | `sanitizer.test.ts` | 9 | 5 of 9 |

Two code-block and two math cases pass under the defect as well: Shiki happens to split the highlighted `` $` `` token, and the display-math `$$` case is cut by the display regex before the replacer. They stay as guards. The nine other cases of those groups fail without the fix.

## 4. Checks run

| Check | Result |
|---|---|
| Touched and new tests, scoped runs | pass |
| Mutation checks | every new test fails without its fix, except the guards named in section 3 |
| `npx vue-tsc --noEmit` | exit 0 |
| `node scripts/check-test-partitions.mjs` | PASS (unit 364, ui 91, integration 221) |
| ESLint on changed files | 0 errors, 68 warnings (function length and complexity) |
| Unit partition | 9 failing, baseline 10; no new failure |
| UI partition | 6 failing, baseline 14; no new failure |
| Integration partition | 24 failing, baseline 36; no new failure |
| Offline isolated Electron smoke (profile outside the repository, deleted afterwards) | starts cleanly after `npm run rebuild:electron`, renderer snapshot taken, no error in the session log. It did not exercise HTML to PDF, so the `data:` URL length limit (P5b-02) was not checked |

The first full UI run showed 103 new failures and the integration run 2: the strict system-template draft schema rejected the new draft field, and the first draft fix also swallowed the DFC provenance failure that two existing tests pin. Both were fixed in source (section 2, R5-03); no assertion was changed. The baseline failures are the pre-existing red CI in files this phase did not touch (mostly 5 s timeouts); names that failed in the baseline and passed here are timing flakes, not fixes made by this phase. No real provider request was made.

## 5. Limitations

- **P5b-04 not reproduced.** Recorded as a characterization test only. No code changed for it.
- **A broken DFC selection still blocks the draft.** Only rows that fail to decode are isolated. A selected conversion whose output was retired or has a bad producer keeps failing the read (`GENERATION_V2_DRAFT_DFC_PROVENANCE_INVALID`), as before.
- **Unreadable draft rows are reported, not surfaced.** `unreadableAttachmentCount` is on the draft but no UI shows it yet, and nothing offers to repair or remove such a row. Callers that rebuild an attachment list from `read()` would not carry the unreadable row forward.
- **P5b-02 only partly done.** Not changed: HTML charset detection, serving HTML without a `data:` URL (so the URL length limit was not exercised), and a source size cap.
- **IPC import not covered by an IPC test.** The keep-stored-mime change in the two import handlers is covered by the repository-level test.
- **P6a-16 only partly done.** Not changed: the "No project" move option still shows a raw `GENERATION_V2_PROJECT_REQUIRED`, search `timeTo` exclusivity, the `SearchResultSession.pump` overlap, and move bypassing `composerMutationQueue`.
- **P6b-04 is a plain fallback.** Streaming shows nested code unhighlighted; highlighting arrives with the final render.
- **P6b-02 heuristic.** A real formula such as `$ x $` (spaces inside) is now prose, like in pandoc. `\[…\]` multi-line display math was left as is.

## 6. Deferred work

- Phase 6: security and integration boundaries (R6-01 to R6-05 and the rest of that table).
- The P5b-02, P6a-16 and draft-row display items in section 5.
- R6-04: signature checking for cloud rule releases (P3a-01), referenced by OQ-4.
- The R2-06 follow-ups R2-06a–e stay tracked separately.
