# Static Review — Phase 9: Consolidation

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

This is the consolidation of the read-only static review of branch `codex/basic-operation-exploration-8q02ix` at `2ed61f1` in the local checkout `D:\Starverse`. The application source matches baseline `aec217cd` throughout.

- No application code was modified. No tests, builds, gates or rebuilds were run. The app was not launched, and no network or provider requests were made.
- This phase introduces **no new findings**. It reconciles the 14 saved reports (Phases 0–8), records duplicates and corrections by cross-reference, and recommends a repair and verification order.
- Earlier reports are **not** edited. Where this document assigns a different final severity or merges an ID, the original report keeps its wording and this register is the reconciled view.

## 1. Scope and coverage

**Inputs:** [phase-0.md](phase-0.md), [phase-1.md](phase-1.md), [phase-2a.md](phase-2a.md), [phase-2b.md](phase-2b.md), [phase-3a.md](phase-3a.md), [phase-3b.md](phase-3b.md), [phase-4a.md](phase-4a.md), [phase-4b.md](phase-4b.md), [phase-5a.md](phase-5a.md), [phase-5b.md](phase-5b.md), [phase-6a.md](phase-6a.md), [phase-6b.md](phase-6b.md), [phase-7.md](phase-7.md), [phase-8.md](phase-8.md), and [CLOUD_HANDOFF.md](CLOUD_HANDOFF.md).

**Method:** the coordinator extracted every `P*`, `I*` and `U*` item from each report, compared titles, evidence locations and symbols across phases, and re-read the original text of every suspected overlap (P4a-13, P2b-10, P1-12, P2b-02/P4a-02, P4b-14). No source re-verification was needed for this phase beyond what each report already records.

**Provenance:**
- Phases 0–3b were reviewed in the original local session.
- Phases 4a–6b were reviewed in the cloud session `session_01JdFPGEfmvEhpDYNY81PSK3` and transferred by Git.
- Phases 7–9 were reviewed in the local checkout after the cloud handoff.
- No phase report was independently revalidated by a later phase except where a later finding explicitly re-checked the same code (recorded in section 4).

## 2. Subagent configuration and contributions

No subagents were used in this phase. Consolidation, deduplication, severity reconciliation and repair ordering are coordinator decisions (AGENTS.md: final synthesis is not delegated).

## 3. Consolidated findings

### 3.1 Totals

| | Medium | Low-Medium | Low | Total |
|---|---|---|---|---|
| As reported across Phases 0–8 | 41 | 64 | 109 | 214 |
| After merging duplicates and re-grading (section 4) | **38** | **64** | **104** | **206** |

No phase produced a High finding, and consolidation does not raise any finding to High. Info (`I*`) items and the uncertain item U5a-01 are listed in section 3.4 and not counted above.

### 3.2 Medium register (final)

Ordered by the root-cause group in section 3.3, then by ID.

| ID | Final | Title | Evidence status | Group |
|---|---|---|---|---|
| P2b-01 (+P8-01) | Medium | Schema digest is computed over raw bytes; no `.gitattributes`, and the local checkout already has CRLF and mixed SQL, so the shipped digest depends on the build checkout and a mismatch can trigger the backup-and-reset path | Confirmed (repository state); reset effect needs runtime | RC-01 |
| P2a-01 | Medium | A crash between epoch-root creation and the journal write leaves the app permanently unable to start | Confirmed | RC-02 |
| P2b-02 (+P4a-02) | Medium | A pending native-completion receipt that can never materialize has no terminal state; the operation stays `streaming` and the branch is locked across restarts | Mechanism confirmed (P4a-02); trigger rare | RC-02 |
| P4a-01 | Medium | A failed receipt insert leaves the operation `streaming` with no Stop and no in-process recovery | Confirmed | RC-02 |
| P4b-03 | Medium | "Generating" can stick in the renderer with no reconciliation against the DB | Confirmed | RC-02 |
| P4b-04 | Medium | `awaiting_tool` operations are unstoppable, block deletion, and have no renderer continuation path | Confirmed | RC-02 |
| P3b-01 | Medium | Switching a conversation to an Anthropic model fails: portable history emits string assistant content that the Anthropic decoder rejects | Confirmed | RC-03 |
| P4a-03 | Medium | The Anthropic interrupted-replay fallback emits the same string content, so a crash-recovered Anthropic turn breaks later requests | Confirmed | RC-03 |
| P4a-04 | Medium | Generic local OpenAI chat fails streams that end with the standard usage chunk | Confirmed | RC-04 |
| P4a-05 | Medium | SSE decoders corrupt framing when a CRLF straddles a read boundary | Confirmed | RC-04 |
| P4a-06 | Medium | Anthropic `citations_delta` is rejected, so a cited web-search answer can fail mid-stream | Confirmed | RC-04 |
| P4a-13 (+P7-01) | **Medium** (was Low in 4a) | The main-process runtime registry never evicts operations, and every subscribe re-hydrates all of them with main-thread SQL and a full structured clone | Confirmed; cost needs measurement | RC-05 |
| P4b-02 | Medium | The renderer runtime subscription can wedge for the page lifetime and buffer events without bound | Confirmed | RC-05 |
| P4b-05 | Medium | Retained runtime snapshots make reload and remount cost quadratic; per-delta work is heavy | Confirmed | RC-05 |
| P2b-07 | Medium | The raw generation debug store grows without limit and outlives conversation deletion | Confirmed | RC-06 |
| P2b-03 | Medium | FTS maintenance triggers scan the whole index on every message write | Confirmed | — |
| P3a-12 / P3b-02 | Medium (P3b-02); P3a-12 Low-Medium | Fabricated catalog limits (1,000,000 output) plus disabled numeric invariants let out-of-range values reach providers | Confirmed / suspected | RC-07 |
| P3b-04 | Medium | No context-window budgeting; capacity is checked in bytes only | Confirmed | RC-07 |
| P3b-03 | Medium | Unencodable attachments and unsupported parameters are dropped silently | Confirmed | — |
| P5b-03 | Medium | URL import buffers without bound, has no timeout, and is open to DNS rebinding | Confirmed | RC-08 |
| P5b-04 | Medium | Uploaded provider files are never validated, refreshed or deleted; history replays file ids from an old credential scope | Confirmed | RC-09 |
| P5b-01 | Medium | Text conversion options throw `ASSET_CONFLICT` for every non-markdown text attachment | Confirmed | RC-09 |
| P5b-02 | Medium | Conversion options are all-or-nothing; HTML→PDF failures hide every option and retry each time | Confirmed | — |
| P5a-01 | Medium | LibreOffice converts user DOCX without enforced macro, link or network hardening | Confirmed | RC-10 |
| P5a-02 | Medium | Installed plugin code is trusted on load without re-verification; a manifest-controlled health check spawns arbitrary commands | Confirmed | RC-10 |
| P8-02 | Medium | The packaged app keeps every Electron fuse at its default (`RunAsNode` on, no ASAR integrity) | Confirmed | RC-10 |
| P3a-01 | Medium | Cloud capability rules have no authenticity check, and the first candidate auto-applies | Confirmed | RC-10 |
| P1-01 (+P3a-03) | Medium | Per-provider catalog policy is silently never saved or read | Confirmed | RC-15 |
| P3a-02 | Medium | The catalog snapshot digest includes fetch timestamps, so every sync is a "change" | Confirmed | RC-15 |
| P2a-02 | Medium | Schema-recovery consent text is wrong about credentials, and the user is not told where the data went | Confirmed | RC-14 |
| P2a-03 | Medium | Legacy config projection aborts the upgrade on recoverable settings (legacy upgrade only) | Confirmed | RC-14 |
| P6a-02 | Medium | A failed proxy load lets a global Save overwrite the stored proxy configuration with defaults | Confirmed | RC-14 |
| P6a-01 | Medium | Bulk delete and move include conversations that are no longer visible | Confirmed | — |
| P4b-01 | Medium | Regenerate and retry-as-new have no in-flight guard; a double-click creates two branches and two provider generations | Confirmed | — |
| P6b-01 | Medium | `String.replace` special patterns (`$&`, `` $` ``, `$'`, `$$`) corrupt code blocks and math | Confirmed (`$$` tokenization uncertain) | RC-13 |
| P6b-02 | Medium | Inline `$…$` math swallows currency and shell variables and can span paragraphs | Confirmed | — |
| P8-03 | Medium | PR test scope is path-prefix only; shared-core changes skip the DB and Windows tests | Confirmed | RC-16 |
| P8-04 | Medium | The native-boundary guard test (`epochNativeBoundary.test.ts`) runs in no partition | Confirmed from config; confirm with `vitest list` | RC-16 |

That is 38 Medium findings after merges (P3a-12 is listed beside P3b-02 for context but stays Low-Medium).

### 3.3 Root-cause groups

Each group names the findings that one design change would address together. A finding can appear in only one group; related but separately-fixable items are listed under "related".

| Group | Root cause | Findings | Related |
|---|---|---|---|
| RC-01 | Hash over raw bytes with no line-ending policy | P2b-01, P8-01 | I2a-02 (no migration path makes a mismatch costly) |
| RC-02 | Operations and receipts lack a reachable terminal state; startup and renderer cannot reconcile | P2a-01, P2b-02, P4a-02, P4a-01, P2b-06, P2b-05, P4b-03, P4b-04, P4a-19 | I4a-07 (startup blocking is intentional), P4a-12, P4a-08 |
| RC-03 | Anthropic history content shape and turn-state mismatch | P3b-01, P4a-03, P4a-07 | P3b-08 |
| RC-04 | Per-provider SSE decoders and finish handling have drifted | P4a-04, P4a-05, P4a-06, P4a-09, P4a-15, P4a-16 | P4a-14, P4a-11, P4a-10 |
| RC-05 | Full-state retention and full-body republishing during streaming | P4a-13 (+P7-01), P2b-10 (+P7-02), P4b-02, P4b-05, P4b-14 (+P7-10), P4b-13, P6b-05 | P3b-19, I2b-03, P5b-09 |
| RC-06 | Raw request and error capture without redaction, gating or retention | P2a-09, P2b-07, P7-03, P7-07 | P4a-14, I3a-03, P4b-17, P6b-11, I2a-05 |
| RC-07 | No single numeric/limit authority between catalog, validator and UI | P3a-12, P3b-02, P3b-04, P3b-16, P3a-15, P6a-11, P3a-26 | P3b-07 |
| RC-08 | Network reads without size, time or per-hop host bounds | P3b-05, P5b-03, P1-12 (+I7-06), P3a-10, P3a-11, P5a-10, P5b-12, P7-06, P3a-19 | P3a-23, P5a-11 |
| RC-09 | Blob and provider-file lifecycle: identity by bytes+single mime, no GC, no remote cleanup | P2b-04, P5b-05, P5b-06, P5b-01, P4a-20, P5b-04, P5b-07, P5b-11 | I2a-04, I4a-04, I3b-03 |
| RC-10 | Trust boundary for code and rules that the app executes or applies | P5a-01, P5a-02, P5a-03 (+P1-10), P3a-01, P8-02, P8-09, P8-13, P5a-09, P5a-07, P5a-08 | U5a-01, P3a-20, I3a-02, P8-08, P8-10 |
| RC-11 | IPC handlers trust the sender and some renderer-supplied paths | P1-11, P5a-13, P1-09, P4b-06, P5b-10, P7-09 | Phase 0 lead, I3a-01, I7-03 |
| RC-12 | In-app browser and CSP defence in depth | P1-02, P1-03, P1-07, P1-08, P7-04, P7-05, P8-14, P0-02 | I7-01, I7-02 |
| RC-13 | String replacement with interpreted `$` patterns | P6b-01, P6b-09 | — |
| RC-14 | Settings and config writes are not atomic or validated end to end | P2a-02, P2a-03, P2a-06, P2a-10, P3a-16, P6a-02, P6a-03, P7-08, P2a-04 | P2a-07 |
| RC-15 | Catalog policy persistence and sync state | P1-01 (+P3a-03), P3a-02, P3a-05, P3a-09, P3a-14, P6a-07 | P3a-17 |
| RC-16 | Test and CI safety net does not cover what it claims | P8-03, P8-04, P8-05, P8-06, P8-07, P8-11, P8-12, P8-18 | I1-03, P7-11 |
| RC-17 | No process-level error handling | P4a-18, P1-06, P1-04 | I1-01 |
| RC-18 | Endpoint URLs stored and shown with embedded credentials | P6a-13 (+P6b-13) | — |

### 3.4 Low-Medium, Low and Info register

Severity as reported unless marked. "→" marks a merged duplicate; the canonical ID carries the finding.

**Phase 0:** P0-01 Low (Vite watcher ignores), P0-02 Low (dead `electron.vite.config.ts`; see I7-02), P0-03 Low → resolved by P7-11.

**Phase 1:** P1-02 Low (no permission handlers; RC-12), P1-03 Low (in-app browser not built; RC-12), P1-04 Low (unbounded `closeResources`), P1-05 Low (work invisible to shutdown), P1-06 Low (startup failure never closes runtime), P1-07 Low (`asset://` has no handler), P1-08 Low (CSP gaps; corrected by I7-01), P1-09 Low (`store-set` value validation), P1-10 → P5a-03, P1-11 Low (sender map retention), P1-12 Low (URL probe DNS TOCTOU; I7-06 merged), P1-13 Low (crash restart cancellable). Info: I1-01 – I1-07.

**Phase 2a:** P2a-04 Low (latent `safeClearConfig`), P2a-05 Low, P2a-06 Low, P2a-07 Low, P2a-08 Low, P2a-09 Low (redaction unwired; RC-06), P2a-10 Low, P2a-11 Low, P2a-12 Low, P2a-13 Low, P2a-14 Low. Info: I2a-01 – I2a-06.

**Phase 2b:** P2b-04 Low-Medium (attachment bytes never reclaimed), P2b-05 Low-Medium (orphan recovery can block every launch), P2b-06 Low-Medium (unrecoverable operations keep a branch lock), P2b-08 Low-Medium (missing FK/hot-filter indexes), P2b-09 Low, **P2b-10 Low → Low-Medium** (full-body checkpoint rewrites; P7-02 merged), P2b-11 Low, P2b-12 Low, P2b-13 Low, P2b-14 Low. Info: I2b-01 – I2b-06.

**Phase 3a:** P3a-03 → P1-01. Low-Medium: P3a-04 – P3a-12. Low: P3a-13 – P3a-26. Info: I3a-01 – I3a-05.

**Phase 3b:** Low-Medium: P3b-05 – P3b-11. Low: P3b-12 – P3b-20. Info: I3b-01 – I3b-06.

**Phase 4a:** P4a-02 → P2b-02. Low-Medium: P4a-07 – P4a-11. Low: P4a-12, P4a-14 – P4a-20 (**P4a-13 re-graded to Medium**). Info: I4a-01 – I4a-09 (I4a-09 resolved by P4b-06).

**Phase 4b:** Low-Medium: P4b-06 – P4b-11. Low: P4b-12 – P4b-17 (P4b-14 absorbs P7-10). Info: I4b-01 – I4b-04.

**Phase 5a:** Low-Medium: P5a-03 (absorbs P1-10) – P5a-07. Low: P5a-08 – P5a-13. Uncertain: U5a-01.

**Phase 5b:** Low-Medium: P5b-05 – P5b-09. Low: P5b-10 – P5b-13.

**Phase 6a:** Low-Medium: P6a-03 – P6a-09. Low: P6a-10 – P6a-17 (P6a-13 absorbs P6b-13).

**Phase 6b:** Low-Medium: P6b-03 – P6b-08. Low: P6b-09 – P6b-12, P6b-13 → P6a-13, P6b-14, P6b-15.

**Phase 7:** P7-01 → P4a-13, P7-02 → P2b-10. Low-Medium: P7-03. Low: P7-04 – P7-09, P7-10 → P4b-14, P7-11. Info: I7-01 – I7-05, I7-06 → P1-12.

**Phase 8:** P8-01 → P2b-01. Low-Medium: P8-05 – P8-12. Low: P8-13 – P8-18. Info: I8-01 – I8-03.

## 4. Reconciliation, corrections and uncertainties

### 4.1 Duplicates merged

| Later ID | Canonical | Reason |
|---|---|---|
| P7-01 | P4a-13 | Same code (`generationOperationRuntimeRegistryV2.ts:95, 127-137`). **Correction:** phase-7.md describes P4a-13 as renderer-side and calls P7-01 a shared root cause; P4a-13 is in fact the same main-process registry finding. The Phase 7 subagent brief mislabelled P4a-13, and the coordinator did not re-read P4a-13 before saving. Phase 7 added the IPC-path and cost analysis that justifies re-grading P4a-13 to Medium. |
| P7-02 | P2b-10 | Same `generationBodyCheckpointV2.ts` full-body flush; P4a-13 also mentions it. Phase 7 added the read-back and republish cost, so P2b-10 is re-graded Low → Low-Medium. |
| P7-10 | P4b-14 | Same `src/next/state/selectors.ts` module-global cache. |
| I7-06 | P1-12 | Same `urlProbe.ts` DNS check separate from the fetch's resolution (also cited by P5b-03). |
| P8-01 | P2b-01 | Same digest mechanism; P8-01 contributes the repository evidence (no `.gitattributes`, CRLF/mixed SQL in this checkout, three pinned predecessor variants). |
| P4a-02 | P2b-02 | Same pending-receipt dead end; P4a-02 upgrades the status from suspected to statically confirmed. |
| P3a-03 | P1-01 | P3a-03 is stated in its own title as the consequence of P1-01. |
| P1-10 | P5a-03 | Same `plugins:register-local-package` arbitrary `packageDir`; P5a-03 traced the consequence (unsigned package registered as enabled). |
| P6b-13 | P6a-13 | Recorded in phase-6b.md as the same root cause. |

Already recorded in earlier reports and not re-counted here: 5B-A-4 duplicates P2b-04; 7B-06 duplicates P6b-01; 7B-05 duplicates P6b-14.

### 4.2 Corrections and resolutions by later phases

- **I7-01 corrects P1-08:** `object-src`, `worker-src` and `frame-src` fall back to `default-src 'self'`; only `base-uri` and `form-action` are missing. The renderer's `connect-src` hosts are unused in production.
- **P7-11 resolves P0-03:** the tracked captures contain no keys, emails or user paths; residual identifiers and scanner gaps remain as P7-11.
- **P4b-06 resolves I4a-09:** the per-provider `operationSenders` relay events no renderer subscribes to.
- **P4a-02 confirms P2b-02** (status upgrade).
- **P8-01 corroborates P2b-01** with repository evidence.
- **I4a-08 confirms P3b-14** and corroborates P3b-02 (OpenRouter `skipPolicyRanges`).
- **P4a-13 / P2b-10 re-grades** are justified by Phase 7's analysis; the original reports keep their original grades.

### 4.3 Owner decisions (design questions, not defects)

- **I2a-01:** the first epoch-2 start deletes legacy data directories without a prompt or backup.
- **I2a-02:** there is no schema migration path; any schema change forces backup-and-recreate. This raises the stakes of RC-01.
- **I4a-01:** no connect, idle or first-byte timeouts for generation, by design.
- **I4a-07:** orphan recovery intentionally blocks startup on unclassified errors (compare P2b-05).
- **P2b-07 / P7-03:** whether raw request capture is a product feature or a debug aid; the repair differs.
- **I3a-05 / I3b-05:** capability-revision expectation fails open without context, by design.

### 4.4 Carried questions (unresolved)

- P6b-01: whether `$$` survives Shiki tokenization as a single token.
- P6a-02: how often `getProxyConfiguration()` rejects in practice.
- P6a-07: main-side catalog `sync`, `applyPending` and `status` timing.
- P6a-08: FTS5 keyword parse behaviour (reference knowledge, not executed).
- P5b-01: whether a DFC selection is required before sending.
- P5b-02: Chromium's `data:` URL length limit for HTML→PDF.
- P3b-09, P3b-10, P3b-11: provider tolerance for DeepSeek reasoning replay, LM Studio defaults, Gemini/DeepSeek raw tool schemas.
- P8-04 / P8-05: Vitest exclude-over-include behaviour, to confirm with `vitest list`.
- P8-09: GitHub environment protection rules.
- I8-03: Electron 42's bundled Node version.
- P4a-13 / P2b-10 / P4b-05: real latency and memory cost (measure before and after repair).

### 4.5 Open coverage (union of every report's "Not covered" list)

**Main process and data:**
- Plain-text and tool-continuation coordinators and snapshot-commit files for every provider (4a, 4b).
- `interruptedReplayStorageV2`; `electron/net/electronManualRedirectFetch.ts`; about 70% of `openRouterChatGenerationAuthorityV2Service.ts` (4a).
- LM Studio `nativeItemsV1`, `continuationArtifactV1`; OpenAI-compatible `nativeMessages*`; the generic and LM Studio history repos (3b, 4a).
- Gemini interactions-image compiler; OpenRouter image descriptor authority; several authority services (3b).
- How startup orphan recovery treats `awaiting_tool` (4b, re-trace).
- Main-side `readBranch` validation (4b); main-side attachments-only send validation (I4b-04).
- Native blob write atomicity and symlink handling in `native/epoch-win32/src/addon.cc` (5b).
- `composerDraftV2Repo.setDfcSelection` and whether DFC selection is revalidated at send (5b).
- `src/next/plugin-distribution` modules: `catalogMetadata`, `catalogCompatibility`, `packageVerification`, `localPackageRegistration`, `atomicInstaller`, `installRecovery`, `rollbackPolicy`, `quarantinePolicy` (5a); the Magika runtime script; the official 0.2.0 Magika zip contents; LibreOffice 26.2.4 real Windows behaviour.
- Anthropic citation and Gemini `groundingChunks` mapping into persisted annotations (7).
- Whether `bridge.fetchPackageToFile` calls `assertGovernedRequestAvailable` (7).
- Proxy credential handling inside `electronSessionProxyController.ts` and `productNetworkProxyV2.ts` (7).
- Size bounds of every `JSON.parse` in the `src/core` SSE parsers (7).
- Model catalog: `providerModelObservationV2.ts`, `modelTagger.ts`, `scripts/maintenance/resetModelCatalogV2.ts` (3a).

**Renderer:**
- `appChatApp.logic.ts`: attachment import/DFC (about lines 4220–6400), model-picker and catalog code, `onSelectConvo`/`onSelectBranch` bodies, delete-question, fork and truncate flows (4b).
- `projectReasoningPresentationV2` (4b); `ChatAppReasoningPanel.vue`, `richtext.css` (6b).
- `ModelPickerDialog.vue` template after line 2420; about 1,500 template lines of `SettingsPanel.vue`; the lower half of `EndpointDetailPanel.vue`; `ModelDetailPanel.vue`, `modelFactControlExplanations.ts`, `modelIndicatorName.ts`, `WorkspaceIcon.vue`; the `AppChatApp.vue` wiring of `mutationDisabled` (6a).
- `DraftAttachmentDetailsDialog.vue`; `ingestLocalFiles`; `containerProbe.ts` and `taxonomyMap.ts` internals (5b).
- zh-CN translation quality; DOMPurify 3.4.x mXSS behaviour for MathML/SVG (6b, 7).

**Build, release, runtime:**
- Built installer contents and unpacked-file list; GitHub environment settings; signature `expiresAt` enforcement; Magika zip determinism; macOS DMG path; internals of `privacy-scan`, tc14, tc16, tc18, tc19 and `scripts/dev/smoke-*` (8).
- Runtime CSP behaviour under `file://` (7).
- **Tests were treated as supporting evidence only in every phase.** No finding has been runtime-verified.

## 5. Recommended repair and verification order

Each wave lists the findings to address together; verification uses the tests named in each finding. Waves are ordered by data-loss and availability risk first, then correctness, then security hardening, then resources and UX. Wave 0 is a prerequisite because P8-03, P8-04 and P8-06 show that the current CI would not catch regressions in the areas being repaired.

**Wave 0 — safety net (before any repair):**
1. Make `push` to `main` run every Vitest partition; widen the PR scope triggers (P8-03).
2. Fix the partition ownership of `epochNativeBoundary.test.ts` and add a glob-resolution test for every config (P8-04, P8-05).
3. Add the failing regression tests named in P8-06 (P3b-01, P4a-05, P6b-01, P2b-01, P4a-13) so each later fix is proven.
4. Wire the gates listed in P8-11 into `verify:ssot`.

**Wave 1 — data integrity and startup availability:**
1. RC-01: add `.gitattributes` (`*.sql text eol=lf`) and normalise line endings before hashing. **Caution:** changing the hash input changes the digest of databases already stamped from CRLF or mixed checkouts; keep the existing pinned variants accepted (`schemaComposerV2.ts:22-26, 461-465`) and add a test that LF, CRLF and mixed produce one digest.
2. P2a-01: make epoch-root creation and the journal write crash-safe.
3. RC-02: give receipts and operations a reachable terminal state (P2b-02, P4a-01, P2b-06), make orphan recovery tolerate one corrupt artifact (P2b-05), and reconcile renderer "generating" and `awaiting_tool` with the DB (P4b-03, P4b-04).

**Wave 2 — conversation correctness:**
1. RC-03: emit block-array assistant content for Anthropic in portable history and in the interrupted-replay fallback (P3b-01, P4a-03); handle `pause_turn` (P4a-07).
2. RC-04: one shared SSE line splitter with CR/LF carry-over (P4a-05), accept the trailing usage chunk (P4a-04) and `citations_delta` (P4a-06), and align finish-reason handling (P4a-15).
3. P4b-01 double-submit guard; P6a-01 bulk-action visibility; P6a-02 proxy save guard.
4. RC-13 function replacers (P6b-01, P6b-09); P6b-02 inline-math delimiter rules.

**Wave 3 — security hardening:**
1. P8-02 Electron fuses.
2. RC-10: LibreOffice macro/link/network hardening (P5a-01), plugin load-time verification and removing the manifest-controlled health-check command (P5a-02), restricting `register-local-package` (P5a-03), cloud-rule authenticity (P3a-01), release workflow permissions and branch restriction (P8-08, P8-09).
3. RC-08: bounded, time-limited network reads with per-hop host checks and connection-level private-address enforcement (P5b-03, P1-12, P3b-05).
4. RC-12: CSP `base-uri`/`form-action`, `connect-src 'self'`, an `img[src]` sanitizer hook, and the in-app browser permission handlers if the feature is kept (P1-08, I7-01, P7-04, P7-05).

**Wave 4 — privacy and resource growth:**
1. RC-06: gate raw capture behind a debug setting with retention and conversation-delete purge, and route errors through one sanitizer (P2b-07, P7-03, P2a-09, P7-07).
2. RC-05: evict terminal registry entries, publish deltas, bound renderer buffers and caches (P4a-13, P2b-10, P4b-02, P4b-05, P4b-14).
3. RC-09: blob and provider-file lifecycle (P2b-04, P5b-04, P5b-05, P5b-06).
4. P2b-03 FTS trigger scans; P2b-08 indexes.

**Wave 5 — behaviour and UX consistency:**
RC-07 numeric authority (P3b-02, P3a-12, P3b-04), P3b-03 visible drop reporting, RC-14 settings atomicity, RC-15 catalog policy persistence (P1-01, P3a-02), P5b-01/P5b-02 conversion options, then the remaining Low-Medium and Low items by group.

**After each wave:** rerun the targeted tests named in the findings; for Wave 1 and Wave 3 also a packaged Electron smoke (`npm run rebuild:electron` first, per AGENTS.md) and `npx @electron/fuses read` on the built executable.

## 6. Review status

All planned phases (0–9) are complete. The review produced 206 unique findings (38 Medium, 64 Low-Medium, 104 Low) plus Info items, none High, all from static evidence. Nothing has been repaired, tested or run. The open coverage in section 4.5 and the carried questions in section 4.4 remain open until explicitly reviewed or verified at runtime.

This phase is complete. I have stopped and am waiting for your instruction to continue.
