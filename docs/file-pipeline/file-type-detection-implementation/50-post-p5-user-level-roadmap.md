# 50. Post-P5 User-Level Roadmap

**Status**: Planning only — no implementation, no production code changes, no real runtimes
**Date**: 2026-05-10
**Phase**: Post-P5 roadmap (docs-only)
**Parent docs**: `49-phase5-p5e4-packaging-regression-smoke-closeout.md`, `45-phase5-batch2-trust-runtime-planning.md`

本 roadmap 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。

This is a user-level, personal-project roadmap. It is intentionally lean.
No implementation is performed here.

---

## 1. Current Handoff State

### 1.1 What P5 Delivered

| Item | Status | Reference |
|------|--------|-----------|
| P5-A: BL-06 production dev-mode guard | Completed | `43-phase5-batch1-security-closeout.md` |
| P5-B: BL-07 messageAsset IPC sanitization | Completed | `43-phase5-batch1-security-closeout.md` |
| P5-C: Batch 1 security closeout + audit | Completed | `44-phase5-batch1-external-audit-record.md` |
| P5-D: Trust contracts, production verification gate, root rotation/revocation scaffold | Completed | `46-phase5-p5d-trust-signing-closeout.md` |
| P5-E1: Runtime package inventory contract (path safety, validation, factories) | Completed | `47-phase5-p5e1-p5e2-runtime-package-scaffold-closeout.md` |
| P5-E2: Fake Magika pre-stage scaffold (50 tests) | Completed | Same doc as P5-E1 |
| P5-E3: First conversion runtime pilot scaffold — Pandoc (26 tests) | Completed | `48-phase5-p5e3-first-runtime-pilot-closeout.md` |
| P5-E4: Packaging regression / smoke scaffold (40 tests) | Completed | `49-phase5-p5e4-packaging-regression-smoke-closeout.md` |

P5 scaffold work through E4 completed.

### 1.2 What Remains Open

- P5-D verification gate exists and was hotfixed (`092811b`), but production signing workflow (key generation, offline signing tool) is not implemented.
- Real runtime distribution remains open.
- Real third-party binary packaging remains open.
- Real model file staging remains open.
- Downloader / installer remains open.
- Electron packaged manual smoke remains `not_run`.
- Full production plugin ecosystem is not completed.
- P5-F separate final closeout is optional and may be skipped.

### 1.3 Transition Point

P5 built the trust layer, package inventory contract, path safety, verification gate, and fake scaffold for two engines (Magika, Pandoc). The next practical stage is **P6**: turn the scaffold into a usable, user-visible local plugin/runtime feature.

Real runtime distribution and production plugin lifecycle move to P6.

---

## 2. User-Level Governance Rules

These rules replace the heavier Phase 4/Phase 5 governance for future work. The project is personal, not enterprise. Keep it lean.

### 2.1 Three Lanes

**Fast Lane** — no external audit
- UI polish, small layout/text/state fixes
- Small docs updates, README/index changes
- Small test additions for existing contracts
- Minor config/lint/deprecation cleanup

**Safe Lane** — scoped agent prompt, internal scans only
- IPC boundary changes
- DB migration or schema changes
- Trust gate / verification status logic changes
- Runtime execution path changes (process policy, runner)
- Path privacy, data sanitization changes
- New test files for existing contracts

Workflow:
1. Scoped plan in agent prompt (prefer inline in commit message or closeout doc)
2. Implementation
3. Targeted tests (relevant files, not full suite unless needed)
4. Targeted grep scans (private key, shell:true, console leaks, forbidden claims)
5. One compact closeout doc per major batch (not per tiny subphase)

**Release Lane** — external audit required
- Real runtime binary distribution (first Pandoc, first Magika model, etc.)
- Packaged Electron smoke (manual)
- Signing / root key changes
- License / attribution-sensitive changes
- Downloader / installer / auto-update

Workflow:
1. Scoped standalone plan (can be short, no separate planning doc needed)
2. Implementation
3. `/flash-risk-review` after implementation
4. Full targeted tests + targeted grep scans
5. Manual smoke if user-visible behavior changes
6. One compact closeout doc
7. External audit (Gemini CLI or equivalent)

### 2.2 What to Avoid

- No docs-only audit record unless there is a blocker or owner decision to record.
- No separate planning doc for every subtask — batch related work and plan inline.
- No repeated README churn unless status actually changes.
- No chained subagents for docs-only work.
- No enterprise-style acceptance matrix for small changes.
- No unnecessary `/flash-read-code` if you already know the surface.

### 2.3 What to Preserve

- Clean commits (atomic, well-described).
- `git diff --check` before every commit.
- Forbidden claim scans on any doc that touches phase status.
- Private key / shell:true / console leak scans on any src/ change.
- P5-D verification gate (`isEngineTrustVerified`) must not be weakened.

---

## 3. Proposed Phase 6

**Phase 6: User-level runtime plugin lifecycle and first real runtime pilot**

Core purpose: Turn P5 scaffold into a usable local plugin/runtime feature for a single-user desktop app. The user should be able to manually place a plugin package, see it in settings, and use one real runtime for a real file task.

### 3.1 P6-A: Status Transition and Plugin Lifecycle Minimum

**What**: Minimal state handling for plugin/runtime packages.

**Scope**:
- Implement or complete minimal state transitions: register, enable, disable, uninstall
- Use local/manual package placement only (no downloader)
- Preserve P5-D verification gate: `isEngineTrustVerified()` must still gate health/availability
- Store lifecycle state in existing engine registry or a simple sidecar
- Tests for state transitions (register→enable→health→disable→uninstall cycle)

**Non-goals**:
- No downloader
- No remote registry lookup
- No automatic update
- No marketplace UI
- No multi-user / enterprise policy

**Status wording**: Update from "P5 scaffold" to "P6 lifecycle" — no claim of completion.

### 3.2 P6-B: Settings / Diagnostics Minimum UI

**What**: A simple settings panel to see what engines are installed and what state they're in.

**Scope**:
- Show engine list (name, id, kind, platform)
- Show enabled/disabled/failed/unverified/verified status
- Show version / packageVersion / modelVersion where available
- Show sanitized failure reason (no raw paths, no hashes, no content tokens)
- Simple enable/disable toggle
- Simple remove/uninstall button with confirmation

**Non-goals**:
- No raw path display
- No full hash display
- No contentToken display
- No full marketplace UI
- No advanced diagnostics panels
- No install-from-file dialog (manual placement only for now)

**UI placement**: Renderer-side settings panel. Existing settings infrastructure in `src/renderer` should be examined for a natural slot.

### 3.3 P6-C: First Real Runtime Pilot

**What**: Package and execute one real runtime engine.

**Choose one engine only**. Recommended first candidates:

| Candidate | Type | Pros | Cons |
|-----------|------|------|------|
| Pandoc | Document conversion | Small self-contained binary (~50MB), widely licensed (GPLv2), existing scaffold, no model files needed, CLI-based | GPLv2 requires attribution compliance |
| Magika | File classification | Existing managed plugin scaffold, useful for classify path | requires model files (~10MB), model updates change behavior, ONNX runtime dependency |

**Recommendation**: Start with Pandoc. It's self-contained, has no model files, existing scaffold is already specific to Pandoc, and a conversion workflow (e.g. `.docx` → `.md`) is a clear user-visible win. Magika can follow in Phase 7.

**Rules**:
- Local/manual package placement first
- No downloader — user places the package directory manually
- No all-engine rollout — one engine only
- No automatic update
- No broad marketplace
- Real runtime smoke required before user-facing enabled-by-default

**Sub-scope**:
1. Identify Pandoc distribution constraints (GPLv2, static binary, platform support)
2. Create a real package layout using `createConversionRuntimeInventory()` as template
3. Place Pandoc binary in the package directory structure
4. Wire the existing `ExternalProcessRunner` to execute the real Pandoc binary
5. Run the conversion pipeline on a real `.docx` or `.md` file
6. Verify output is valid

### 3.4 P6-D: Manual Smoke and User-Facing Release Gate

**What**: Before considering any engine "done", run real packaged smoke.

**Manual smoke checklist** (execute in packaged Electron app when available):

| # | Check Item |
|---|-----------|
| 1 | Packaged app startup — no engines installed |
| 2 | Manual package placement — package directory placed in expected location |
| 3 | Engine appears in settings panel with correct metadata |
| 4 | Unverified package blocked from health check and availability |
| 5 | Verified package passes health check |
| 6 | Real conversion/classification happy path — convert one file end-to-end |
| 7 | Logs inspected for raw path / contentToken / fullHash leaks |
| 8 | Confirm no real runtime binary path leaked in UI |
| 9 | Disable / enable toggle works correctly |
| 10 | Remove / uninstall clears all traces |

Document results. No blocked-by-default engine is considered shipped until this smoke passes.

---

## 4. Proposed Phase 7

**Phase 7: Runtime expansion and conversion route integration**

Purpose: Only after P6 proves one runtime pilot works end-to-end, cautiously expand.

### 4.1 P7-A: Second Runtime Engine

Choose based on P6 experience. Likely Magika (classifier) if Pandoc was P6-C pilot, or vice versa.

### 4.2 P7-B: Conversion Route Integration

Wire one real conversion workflow into the existing `routeMapping` / `conversionCandidate` integration from P4-C. For example: select a `.docx` file → "Convert to Markdown" → Pandoc runs → result saved.

### 4.3 P7-C: Error Reporting and Fallback

Improve user-facing error messages:
- Engine not installed → show which engine is missing
- Conversion failed → show sanitized reason
- Timeout → show retry option
- Add `retry` / `fallback` behavior where appropriate

### 4.4 P7-D: License / Attribution UI

Show license and attribution for each engine in the settings panel. Required for compliance.

**Phase 7 non-goals**:
- No all engines at once
- No enterprise registry
- No third-party ecosystem
- No background auto-updater unless separately approved
- No provider_file_ref implementation

---

## 5. Future Optional Phases

These may or may not be pursued. They are listed here to avoid scope creep in P6/P7. Each is a separate decision.

| Phase | Description | Trigger Condition |
|-------|-------------|-------------------|
| P8 | Local LLM service plugin (ollama, llama.cpp) | Only if user wants local AI features |
| P9 | Downloader / update manager | Only after manual flow is polished |
| P10 | Enterprise policy / multi-user config | Only if project scope changes |
| P11 | provider\_file\_ref implementation | Only if legacy message_asset is fully retired |
| P12 | DROID / Siegfried archival-grade detector | Only if archival use case emerges |
| P13 | Advanced polyglot / nested format detection | Only if real-world files demand it |
| P14 | Full plugin marketplace | Only if third-party plugin ecosystem is desired |

None of these are required for current file-type/runtime plugin usability.

---

## 6. Scope Control Rules

These guard against accidental scope expansion during implementation:

1. **One real engine at a time.** Do not package Pandoc + Magika + Tika in one batch.
2. **One user-visible workflow at a time.** Conversion OR classification, not both in one batch.
3. **No downloader before manual package flow works.** The user must be able to place a package directory manually and have it recognized before any download/install automation.
4. **No second conversion engine before first pilot passes manual smoke.** Pandoc must work end-to-end before Tika/LibreOffice/ffprobe are attempted.
5. **No UI marketplace before settings page basics work.** The simple settings panel in P6-B must exist before any marketplace/gallery UI.
6. **No auto-update before signing/root/revocation flow is proven.** P5-D scaffold exists but real signing is not done. Auto-update requires a working trust chain.
7. **No real runtime enabled by default until smoke passes.** Engines start disabled; user enables after manual package placement and verification.
8. **No full Phase completion claims without actual user-visible smoke.** A phase is only done when the user can see and use the feature.
9. **No `export *` for untested production code.** Each new module must have at least minimal contract tests.

---

## 7. Lean Acceptance for Future Phases

### 7.1 Always Run

- `git diff --check`
- Relevant vitest only (not full suite every time unless context demands)
- Targeted grep scans: private key, `shell:true`, console path/token/hash leaks, forbidden completion claims

### 7.2 Run Conditionally

- Full vitest suite — before a release-lane commit
- `npx tsc --noEmit` — only if type surfaces changed; otherwise trust known baseline (17 pre-existing errors)
- External audit (`/flash-risk-review`) — only for release-lane changes
- Manual smoke — only when user-visible runtime behavior changes
- Full closeout doc — only for major batch completion (per phase, not per subphase)

### 7.3 Avoid

- Full typecheck every round if known baseline remains unchanged
- External audit for docs-only updates
- Huge closeout docs for small patches
- Repeated README churn unless status changes
- Multiple subagent calls for simple file reads

---

## 8. Recommended Next Action

Based on current P5 scaffold state:

**Start P6-A**: Minimal plugin lifecycle state / registration boundary.

Reasoning:
- P5 scaffold has full inventory validation, path safety, trust gate, and smoke tests.
- The lifecycle layer (register, enable, disable, uninstall) is the natural next code layer.
- P6-A doesn't require real runtimes — it exercises the P5 scaffold in a lifecycle context.
- After P6-A, P6-B (settings UI) gives the user visibility into lifecycle state.
- Only then does P6-C (real runtime pilot) have the full supporting infrastructure.

Alternative if current code already supports enough lifecycle: Jump to P6-B settings/diagnostics minimum UI to give the user visibility into existing engine state.

**Recommendation**: Start P6-A (lifecycle). The settings panel needs lifecycle state to display.

---

## 9. README Update

See README changes below:
- Add doc 50 to file index
- Update status line to reflect post-P5 roadmap
- Preserve that real runtime distribution remains open
- Preserve that full plugin ecosystem is not completed

---

## 10. Stop Confirmation

- Post-P5 roadmap documented at user level
- Phase 6 defined: lifecycle + settings UI + first real pilot + manual smoke
- Phase 7 defined: expansion + conversion integration (optional, after P6 smoke)
- Scope control rules provided (9 rules)
- Lean acceptance rules provided
- No implementation performed
- No production code changed
- No real runtimes added
- No model files added
- Full plugin ecosystem not claimed completed
- Real runtime distribution remains open
- Next recommended step: P6-A minimal lifecycle implementation

---

## 11. Commit

`docs: plan post phase 5 user-level runtime roadmap`
