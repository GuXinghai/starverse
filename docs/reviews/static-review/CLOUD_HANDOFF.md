# Starverse static review: continuation handoff

**Status**: active
**Document Role**: handoff
**Last updated**: 2026-10-22

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
| 15 | [Phase 9: consolidation](phase-9.md) | No new IDs; reconciled register, root-cause groups RC-01..18 |

These are static-review reports and do not show runtime behaviour.
- Preserve their finding IDs, uncertainty labels, coverage gaps and rejected hypotheses.
- A saved report does not imply exhaustive coverage.
- Phases 0–3b were saved from the earlier local review and were not revalidated in the cloud session.

## Current stopping point

**All planned phases (0–9) are complete.** Phase 9 consolidated 214 reported findings into 206 unique ones (38 Medium, 64 Low-Medium, 104 Low, none High); see [phase-9.md](phase-9.md) for merges, corrections (including the P7-01/P4a-13 duplicate), owner decisions, open coverage and the recommended repair order. Phases 7 and 8 were reviewed in the local checkout `D:\Starverse` after the cloud handoff.

Phase 7 headline: no High; one Medium (P7-01, the main-process runtime registry never evicts and re-hydrates every operation on subscribe); Low-Medium P7-02 and P7-03. P0-03 is resolved by P7-11. I7-01 corrects P1-08 on `object-src`.

Phase 8 headline: no High; four Medium: P8-01 (no `.gitattributes`, so the shipped schema digest depends on the build checkout's line endings; extends P2b-01), P8-02 (no Electron fuses), P8-03 (path-prefix PR test scope skips DB/Windows tests for shared-core changes), P8-04 (`epochNativeBoundary.test.ts` runs in no partition).

No review report is partial. No subagents or background work are running.

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

The phased static review is finished. Do not start repairs, tests, builds or runtime verification without an explicit instruction from the user. Candidate follow-ups, each needing the user's go-ahead: Wave 0 of the repair order in phase-9.md section 5, runtime verification of the carried questions in section 4.4, or review of the open coverage in section 4.5.

## Review workflow to preserve

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
