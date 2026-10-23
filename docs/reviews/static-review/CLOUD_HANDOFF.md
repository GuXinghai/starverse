# Starverse static review: continuation handoff

**Status**: active
**Document Role**: handoff
**Last updated**: 2026-10-22 (repair Phase 1)

## Repository and baseline

- GitHub repository: `GuXinghai/starverse`.
- Review branch (cloud result branch): `codex/basic-operation-exploration-8q02ix`. All Phase 4a–6b reports are committed and pushed here.
- Original source branch: `codex/basic-operation-exploration`. Its tip is the base of the review branch, which adds only review documents.
- Application baseline reviewed by every report: `aec217cd20045ce6af164eb9d49ade0d6d894b5b`.
  - No application code changed after this baseline.
  - Commit `1a3fc3c` and later commits on the review branch touch only `docs/reviews/static-review/`.
- Cloud session: `session_01JdFPGEfmvEhpDYNY81PSK3` (title "Starverse static review").
- Local checkout for continuation: `D:\Starverse`.

## Saved review evidence

Read these reports and the applicable repository instructions (`AGENTS.md`) before continuing.

| # | Report | Finding IDs |
|---|---|---|
| 1 | [Phase 0: baseline and coverage map](phase-0.md) | P0-* |
| 2 | [Phase 1: startup, Electron, and IPC](phase-1.md) | P1-* |
| 3 | [Phase 2a: epoch and credentials](phase-2a.md) | P2a-* |
| 4 | [Phase 2b: database and repositories](phase-2b.md) | P2b-* |
| 5 | [Phase 3a: model identity and capabilities](phase-3a.md) | P3a-* |
| 6 | [Phase 3b: request compilation](phase-3b.md) | P3b-* |
| 7 | [Phase 4a: generation runtime](phase-4a.md) | P4a-01..20, I4a-01..09 |
| 8 | [Phase 4b: renderer conversation state](phase-4b.md) | P4b-01..17, I4b-01..04 |
| 9 | [Phase 5a: plugins, engines, processes](phase-5a.md) | P5a-01..13, U5a-01 |
| 10 | [Phase 5b: files and attachments](phase-5b.md) | P5b-01..13 |
| 11 | [Phase 6a: settings, model picker, sidebar, search, startup](phase-6a.md) | P6a-01..17 |
| 12 | [Phase 6b: rendering, console, composer, i18n](phase-6b.md) | P6b-01..15 |
| 13 | [Phase 7: cross-cutting](phase-7.md) | P7-01..11, I7-01..06 |
| 14 | [Phase 8: build, release and tests](phase-8.md) | P8-01..18, I8-01..03 |
| 15 | [Phase 9: consolidation](phase-9.md) | No new IDs; reconciled register, root-cause groups RC-01..18; section 7 holds the post-review corrections |
| 16 | [Repair Phase 0: corrections and reclassification](repair-phase-0.md) | Corrections C-01..C-07; owner decisions D-1..D-6 applied |
| 17 | [Repair plan](repair-plan.md) | Repair phases 1–8, items R1-01..R7-08, owner questions OQ-1..OQ-4 |
| 18 | [Repair Phase 1: verification foundations](repair-phase-1.md) | R1-01..R1-04; fixes P8-03, P8-04, P8-05; P8-11 in part; failing regression tests for P2a-01, P2b-01, P3b-01, P4a-01, P4a-03, P4a-04, P4a-05 |
| 19 | [Repair Phase 2: data integrity, startup and failure isolation](repair-phase-2.md) | R2-01, R2-02, R2-04..R2-07; fixes P2b-01, P8-01, P2a-02, P2a-01, P4a-01, P2b-02, P4a-02, P2b-06, P2b-05 (isolation only), P4a-18, P1-06, P1-04; I4a-07 open |
| 20 | [Repair Phase 3: generation and protocol correctness](repair-phase-3.md) | R3-01..R3-08; fixes P3b-01, P4a-03, P4a-07, P4a-05, P4a-09 (part), P4a-16 (part), P4a-04, P4a-06, P4a-15, P4a-08, P4a-12, P4a-17, P4b-01, P4b-03 (paths 2 and 3), P4b-04, P4a-19, P4b-12 |
| 21 | [Repair Phase 4a: effective-rule refresh and its consequences](repair-phase-4a.md) | R4-01..R4-07; fixes P3a-09, P3a-06, P3a-22, P6a-11, P6b-10 (web-search chip); I3a-05/I3b-05 inventory; P3a-08 not reproduced; OQ-4 evidence (D-8) |

These are static-review reports and do not show runtime behaviour.
- Preserve their finding IDs, uncertainty labels, coverage gaps and rejected hypotheses.
- A saved report does not imply exhaustive coverage.
- Phases 0–3b were saved from the earlier local review and were not revalidated in the cloud session.

## Current stopping point

**Repair Phase 4a is complete; repair Phase 4b has not started.** Phase 4a ([repair-phase-4a.md](repair-phase-4a.md)) covers R4-01 to R4-07. It maps where rule sets become effective and records the OQ-4 bootstrap evidence without changing it (D-8). models.dev publications and scheduler activations now reach the renderer. A stale pending send, regenerate or edit-resend is re-prepared once with a fresh operation; nothing is resent after dispatch. An excluded image resolution is kept, flagged and blocks sending instead of being reset; the parameter editor keeps and explains rejected input; the composer web-search chip follows the projection. Provider-native facts become effective only with their catalog snapshot, a shrunken models.dev payload is rejected, a user's "off" override survives releases that drop the rule, and an inventory test proves every command IPC entry installs the revision context. Six test assertions that encoded a defect or the superseded no-re-prepare policy were changed (section 3 of that report). An offline Electron startup smoke passed.

**Repair Phase 3 is complete.** Phase 3 ([repair-phase-3.md](repair-phase-3.md)) fixed Anthropic block-content history and `pause_turn`, SSE CRLF splits and comment frames through one shared normaliser, the generic-local trailing usage chunk, Anthropic `citations_delta` (from the documented shape), incomplete or blocked finishes recorded as success, receipt-before-checkpoint ordering, masked runner errors, Stop on stalled local streams, double regenerate/retry, silent Stop failures, stale "generating" state, and unstoppable `awaiting_tool` operations. It ran an offline Electron smoke against a synthetic SSE endpoint on the renderer origin. One UI test that asserted the P4b-01 defect had its assertion changed (section 3 of that report).

**Repair Phase 2 is complete.** Phase 2 is on branch `codex/static-review-repairs`; see [repair-phase-2.md](repair-phase-2.md). It fixed the line-ending schema digest, the schema-recovery dialog, the `config_replaced` crash window, non-terminal operations, startup-aborting corrupt artifacts and the minimal main-process failure handlers, and ran an isolated offline Electron smoke. R2-06 was completed after the owner decision (section 10 of that report): a corrupt-artifact operation now ends as `failed` with `GENERATION_V2_RECOVERY_ARTIFACT_CORRUPT`, releasing its lock and keeping its rows; an operation that cannot be ended safely restricts only its branch, with a banner; the owner then removed global restricted mode from scope (section 11 of that report; D-4r in repair-plan.md). A database-wide integrity failure now stops startup with a localized dialog showing a stable code and the database location, keeps the database untouched, and classifies corruption separately from I/O, permission and busy failures. The R2-06 follow-ups R2-06a–e are tracked separately in repair-plan.md. Repair Phase 1 ([repair-phase-1.md](repair-phase-1.md)) found that every test partition and `verify:ssot` already fail at the baseline, so CI is red independently of the repairs. The owner asked for the repairs to run one phase at a time, each authorised by "continue".

**Owner answers (after Phase 0):** OQ-1 → D-5a (conversation deletion also deletes its request records and archive indexes); OQ-2 → D-2r (no development/release distinction this round; legacy data and incompatible databases may be reset by default; R2-03 release guard withdrawn and deferred to release preparation); OQ-3 → D-7 (keep and harden the in-app browser); OQ-4 → D-8 (investigate first-install rule activation in R4-01 without changing it). Repairs run on branch `codex/static-review-repairs`.

Phase 0 produced:
- [repair-phase-0.md](repair-phase-0.md): corrections C-01 to C-07 (P4a-06 back to Suspected, P4b-03/P4b-04 conditions restored, other overstated labels, the reviewed predecessor-upgrade boundary, counting rules, coverage reconciled by path, Phase 3b's mislabelled IDs) and the owner-policy reclassification.
- [repair-plan.md](repair-plan.md): the plan that supersedes phase-9.md section 5.
- A marked addendum (section 7) in phase-9.md and a marked note at the end of phase-3b.md. No other historical text was changed.

The static review itself (Phases 0–9) is complete: 214 reported, 206 unique, 205 active findings, none High. No application code has been changed, and nothing has been tested, built or run.

### Headline findings, Phases 4a–6b

No phase in 4a–6b produced a High finding. The Medium findings are:

- **4a, generation runtime:**
  - P4a-01: a failed receipt insert leaves the operation streaming and unstoppable.
  - P4a-02: no terminal state for an unmaterializable pending receipt.
  - P4a-03: Anthropic replay fallback emits string content (extends P3b-01).
  - P4a-04: generic-local streams fail on the trailing usage chunk.
  - P4a-05: SSE CRLF split corruption.
  - P4a-06: Anthropic `citations_delta` is rejected.
- **4b, renderer state:**
  - P4b-01: regenerate/retry double-click.
  - P4b-02: subscription wedge with unbounded buffering.
  - P4b-03: stuck "generating".
  - P4b-04: `awaiting_tool` is unstoppable.
  - P4b-05: retained snapshots make reload/remount cost quadratic.
- **5a, plugins:**
  - P5a-01: LibreOffice runs without macro, link or network hardening.
  - P5a-02: no load-time re-verification, and a manifest-controlled health-check command.
- **5b, attachments:**
  - P5b-01: DFC text options throw `ASSET_CONFLICT` for non-markdown text.
  - P5b-02: all-or-nothing conversion options and the HTML→PDF data URL.
  - P5b-03: URL import has unbounded buffering, no timeout, and is open to DNS rebinding.
  - P5b-04: provider files are never validated or deleted, and history replays old-scope file ids.
- **6a, settings and navigation:**
  - P6a-01: bulk delete/move includes conversations no longer visible.
  - P6a-02: a failed proxy load lets a global Save overwrite the stored proxy configuration with defaults.
- **6b, rendering:**
  - P6b-01: `String.replace` `$` patterns corrupt code blocks.
  - P6b-02: inline `$…$` math swallows currency and shell variables.

The cross-phase links are recorded in each report:
- P4b-02 and P4b-05 share a root cause with P4a-13.
- P5b-05 is the root cause of P5b-01 and extends P4a-20.
- P5b-04 extends I3b-03.
- 5B-A-4 is a duplicate of P2b-04.
- P6a-13 and P6b-13 share a root cause.
- P6b-01 and P6b-09 are the same defect class.

### Unresolved questions carried forward

- **P6b-01:** whether `$$` survives as a single Shiki token. The `$&` and fallback paths are certain.
- **P6a-02:** how often `getProxyConfiguration()` rejects in practice.
- **P6a-07:** main-side catalog authority timing (catalog `sync`, `applyPending` and `status` handlers not traced).
- **P6a-08:** FTS5 keyword parse behaviour, which comes from reference knowledge rather than execution.
- **P5b-01:** whether a DFC selection is required before sending.
- **P5b-02:** Chromium's `data:` URL limit.
- **Open coverage, Phase 5b:** native blob write atomicity (`native/epoch-win32/src/addon.cc`) and whether `setDfcSelection` is revalidated at send.
- **Open coverage, Phase 4b:** the open coordinators and the `appChatApp.logic.ts` regions not yet reviewed (for Phase 9).
- **Open coverage, Phase 6:** the `ModelPickerDialog.vue` template after line 2420, about 1,500 template lines of `SettingsPanel.vue`, `ChatAppReasoningPanel.vue` and `richtext.css`.
- **Each report's "Not covered" list** remains open until it is explicitly reviewed.

## Exact next step

Wait for the owner's "continue", then run **repair Phase 4b** only: R4-08 (catalog policy persistence, unchanged content not bumping revisions, stuck `syncing` recovery, picker query sequencing) and R4-09 (settings saves that overwrite unloaded values, partial saves, panel races, one undecodable rule row blocking every save), as defined in [repair-plan.md](repair-plan.md) section 3, on `codex/static-review-repairs`. The R2-06 follow-ups R2-06a–e stay tracked separately. Open policy question from Phase 3: whether OpenAI Responses refusals and Gemini safety stops with no parts should be recorded as blocked (repair-phase-3.md section 6). The better-sqlite3 ABI target was left at `electron`; run `npm run rebuild:node` before database-heavy Node/Vitest tests.

## Review workflow to preserve

The rules below governed the static review. For the repair phases, [repair-plan.md](repair-plan.md) section 2 replaces the "static review only" and "Git" rules: code changes, scoped tests, rebuilds and isolated Electron smokes are allowed within the authorised phase, on the repair branch.


- **Static review only:**
  - Do not repair application code, install dependencies, rebuild native modules, run tests or builds, launch the app, or make real provider requests.
  - Read-only inspection and writing review reports are permitted.
  - Preserve existing application changes, and do not expose credentials or private application data.
- **Instructions and ownership:** follow `AGENTS.md`. The coordinating agent owns the final diagnosis and checks important findings against source.
- **Subagents:**
  - Preferred configuration is Sonnet 5.5 with High reasoning, at most **2 concurrent subagents**, excluding the coordinator.
  - The cloud session used read-only `Explore` agents with `model: sonnet` and `effort: high`. The exact version could not be confirmed and each report discloses this.
  - No nested subagents.
- **Phase discipline:**
  - Review only the current phase, and finish or stop background work before reporting.
  - Stop after each phase or subphase and wait. "continue" authorizes only the next phase.
  - Report serious issues promptly, and do not fix them.
- **Report contents:**
  - Scope and omissions, stable IDs, severity with rationale, and evidence status.
  - `file:line` references, trigger, impact, counterevidence, and repair/validation.
  - Separate defects from design suggestions.
- **Report ending:** each report ends with: "This phase is complete. I have stopped and am waiting for your instruction to continue."
- **Editing earlier reports:** do not edit old reports to make them agree with new evidence. Cross-reference earlier findings instead.
- **Git:**
  - Commit only review documents to `codex/basic-operation-exploration-8q02ix`.
  - Do not merge or force-push.
  - Do not commit `world_map_experiment/__pycache__/` (untracked, deliberately preserved), `public/build-id.json`, or native rebuild artifacts.

## Transfer limitations

- **Teleport** (`claude --teleport session_01JdFPGEfmvEhpDYNY81PSK3`) brings the cloud conversation and the review branch into a local checkout. It does not transfer:
  - live subagents or background tasks (none are running at this checkpoint);
  - cloud-container state, such as the scratchpad, the local-only `.git/info/exclude` entry for `world_map_experiment/__pycache__/`, and tool permissions;
  - local credentials, application databases or installed dependencies.
- **Desktop-to-cloud WIP commit:**
  - The cloud session started from `4058291`, a WIP commit the original desktop-to-cloud transfer created to carry `world_map_experiment/__pycache__/world_map.cpython-314.pyc`.
  - That commit was reset out of the review branch and never pushed.
  - The local untracked file, if it still exists, is unaffected.
- **Compacted history:** the cloud conversation was compacted once, so the earliest turns survive only as a summary. These reports and this file are the authoritative record.
- **Windows paths:** line references in the reports were taken on Linux and are repo-relative. Paths such as `D:\Starverse` apply only locally.
- **No runtime validation:** no tests, builds, native rebuilds or application launches were performed at any point in Phases 4a–6b, or while preparing this handoff.
