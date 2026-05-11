# 56. Post-v1 Future Phase Roadmap — File Identification System

**Status**: Planning only — no implementation, no production code changes
**Date**: 2026-05-12 (revised)
**Phase**: Post-Phase 7 future planning (docs-only)
**Parent docs**: `55-final-spec-coverage-audit.md`, `54-file-content-identification-v1-roadmap.md`, `50-post-p5-user-level-roadmap.md`, `starverse_file_type_detection_engineering_final.markdown`

本 roadmap 仅覆盖文件识别体系。不代表文件处理平台完成。不代表转换引擎或分发平台已规划。
Real Magika local smoke remains gated. Production signing keys remain future.
Document conversion, provider_file_ref, downloader, marketplace, and auto-update are outside this roadmap (see §10).

---

## 1. Baseline

### 1.1 What Is Complete

File Content Identification v1.0 (`bc70785`, `ad49fbc`, `8cca912`, `bd7e250`):

- Full taxonomy system (67 FileFormatIds, 16 FileKinds)
- Core detection pipeline (magic, text probe, container probe, evidence merge, static policy)
- Send route mapping (16 routes, model capability gating)
- FileTypeVerdict persistence with 8-field version-keyed cache invalidation
- External process safety layer (shell:false, timeout/kill/sanitization)
- Magika managed plugin lifecycle (register/enable/disable/uninstall, health check, diagnostics DTO)
- Log sanitization across all layers (contentToken, fullHash, paths)
- 31-fixture regression matrix, ~510 tests across 35 test files
- UI integration (DraftAttachmentCard, MessageAttachmentCard)

### 1.2 What Is Scafolded But Not Production-Ready

- Trust contracts (VerificationBinding, TrustVerificationStatus, canonicalization, verification gate) — no production keys, no `setVerificationStatus` wired, no `revoked_roots.json` loader
- Plugin upgrade/rollback — not implemented
- Conversion engine scaffolds (Pandoc, Tika, LibreOffice, ffprobe) — fake runners only, outside identification roadmap

### 1.3 What Remains Gated

- Real Magika plugin end-to-end smoke (`STARVERSE_ENABLE_REAL_MAGIKA_TESTS=1` — no local plugin at closeout time)
- Settings UI for identification plugin management (diagnostics DTO exists; no renderer panel)
- 23 tests fail due to Node.js/better-sqlite3 version mismatch (environment-only, not code regression)

---

## 2. Roadmap Boundary

This roadmap covers post-v1 file **identification** work only. Identification means detecting what a file *is* — its format, kind, encoding, container structure, macro risk, polyglot status, and preview/send compatibility. It does not cover transforming file content (conversion), managing remote file references (provider_file_ref), or distributing plugins (marketplace/downloader).

### 2.1 In Scope for Identification Roadmap

- Real Magika operational smoke (validates the identification runtime)
- Identification plugin registration, status, enable/disable, health UI
- Trust and signing gates for identification runtimes
- Detection plugin package verification
- GBK / GB2312 / Big5 text detection (encoding probe enhancement)
- FileAccessRef / FileReadAdapter abstraction cleanup (identification boundary hardening)
- userOverride persistence (send route preference without verdict pollution)
- Parser validation seam documentation (no conversion engine implementation)
- Advanced polyglot detection
- Fixture expansion for detection coverage
- Developer diagnostic mode
- better-sqlite3 environment hygiene

### 2.2 Not In Scope for Identification Roadmap

These are separated future routes, not identification work (see §10):

- Pandoc, Tika, LibreOffice, ffprobe conversion/execution
- Provider-managed file references (provider_file_ref)
- Downloader, installer, catalog distribution, marketplace UI, auto-update
- Full plugin ecosystem / third-party plugin platform
- Document preview conversion

---

## 3. Proposed Phase List

| Phase | Name | Category | Priority |
|-------|------|----------|----------|
| Phase 8 | Local Real Magika Plugin Operational Smoke | Validation | P1 |
| Phase 9 | Identification Plugin Settings Minimal UI | User-facing | P1 |
| Phase 10 | Identification Runtime Trust and Signing Gate | Security/Infrastructure | P2 |
| Phase 11 | Identification Hardening Backlog | Hardening | P2 |

---

## 4. Phase Details

### 4.1 Phase 8 — Local Real Magika Plugin Operational Smoke

**Category**: Validation (operational smoke, not architecture work)
**Priority**: P1
**Goal**: Validate real Magika managed plugin end-to-end — classify a real file through the full identification chain using a locally placed plugin package.

**In-scope work**:
- **P8-A** (environment prerequisite): Rebuild `better-sqlite3` for current Node.js version (unblocks 23 SQLite-dependent tests; not a file-processing feature — environment hygiene only)
- **P8-B**: Place a real Magika pure JS plugin package in the expected local directory; document the local package placement contract (directory layout, manifest expectations, required files)
- **P8-C**: Set `STARVERSE_ENABLE_REAL_MAGIKA_TESTS=1` and run the 5 gated real-runtime tests; verify `detectFull` produces valid `FileTypeEvidence` with real `modelVersion`; verify cache/freshness/fallback/privacy under real runtime; verify no log leaks
- **P8-D**: Smoke closeout — document results, failures, taxonomyMap label drift observations, and failure matrix

**Out-of-scope work**:
- No downloader — plugin placed manually
- No UI changes — diagnostics DTO already exists in Phase 7
- No settings panel — Phase 9 concern
- No signing workflow — Phase 10 concern
- No new detection features — smoke validates existing wire only

**Dependencies**: None (standalone). Requires local Magika plugin package placement only.
**Accepts blocked on**: Missing local Magika plugin package (records gated-skip).

**Main risks**: Magika runtime model version mismatch against taxonomy map; platform-specific native dependency issues.

**Test / scan expectations**:
- 5 gated real-runtime tests pass
- 23 SQLite-dependent tests pass (no longer failing)
- Full file-type test suite at 127/127 pass (0 failures)
- Forbidden scans: 0 `shell:true`, 0 `exec(`, 0 path/token/hash leaks

**Agent strategy**: Safe Lane. 1 agent round per task package.
**Commit strategy**: One commit per P8 subtask. `chore: rebuild better-sqlite3`, `docs: local Magika plugin placement contract`, `test: gated real Magika smoke`, `docs: Phase 8 closeout`.
**Stop condition**: After P8-D closeout written OR gated-skip recorded with clear reason.

---

### 4.2 Phase 9 — Identification Plugin Settings Minimal UI, Local/Manual Only

**Category**: User-facing (UI only)
**Priority**: P1
**Goal**: Give the user visibility into identification plugin state through a minimal settings panel. All plugin operations remain local/manual — this is an identification plugin management panel, not a marketplace or distribution surface.

**In-scope work**:
- **P9-A**: Review existing diagnostics DTO and IPC surface (`getDiagnosticsSummary`, `registerLocalPackage`); confirm the wire is sufficient for UI display and user actions
- **P9-B**: Create renderer-side settings panel with read-only engine status list — engine name, id, kind, enabled/disabled, health, verification, version, modelVersion
- **P9-C**: Enable/disable toggle, manual `registerLocalPackage` with local directory picker, remove/uninstall with confirmation; developer diagnostic mode toggle (extra engine metadata, timing, evidence counts)
- **P9-D**: Sanitized failure display (no raw paths, no hashes, no tokens); closeout

**Out-of-scope work**:
- No downloader / installer from remote — manual placement only
- No marketplace gallery / catalog browsing UI
- No auto-update
- No conversion engine UI
- No raw path or fullHash display
- No multi-engine lifecycle beyond identification plugins (Magika)

**Dependencies**: Phase 8 (need working plugin lifecycle to display useful data)
**Main risks**: Vue component conventions may need adaptation; IPC surface may need new methods for enable/disable from renderer.

**Test / scan expectations**:
- Vue component tests for settings panel
- IPC contract tests for any new methods
- Forbidden scans: 0 path/hash/token leaks in UI display
- Manual smoke: settings panel shows Magika plugin state correctly

**Agent strategy**: Safe Lane. P9-B and P9-C may need 2 rounds each.
**Commit strategy**: `feat: add identification plugin settings status display`, `feat: add plugin enable/disable and manual register UX`, `docs: Phase 9 closeout`.
**Stop condition**: After P9-D closeout OR blocked on missing Phase 8 smoke data.

---

### 4.3 Phase 10 — Identification Runtime Trust and Signing Gate

**Category**: Security/Infrastructure (identification runtimes only)
**Priority**: P2
**Goal**: Implement production signing workflow for identification runtimes — generate real keys, embed trust root, wire verification at registration time, implement revocation.

**In-scope work**:
- **P10-A**: Formalize signing policy and package contract for identification runtime packages (Magika model/JS bundles, not conversion engines)
- **P10-B**: Generate production Ed25519 key pair (offline, Owner action); embed production public key in build (backed by P5-A dev-mode guard); implement `revoked_roots.json` file loading and revocation check
- **P10-C**: Wire `setVerificationStatus` into identification plugin registration flow; signed package verification end-to-end (catalog signature → manifest hash → file integrity)
- **P10-D**: Root rotation semantics (multiple active roots, version/epoch binding); revocation semantics (block revoked roots, quarantine state for revoked identification engines); safe fallback on verification failure (fail-closed, no downgrade to unsigned)
- **P10-E**: Signing audit trail (sanitized keyId/artifact hash/timestamp); closeout and risk review

**Out-of-scope work**:
- No offline signing CLI tool (Owner signs manually)
- No certificate authority / PKI — direct Ed25519 key trust
- No CRL/OCSP — offline revocation list only
- No marketplace distribution or auto-update — trust gate applies to local/manual identification packages only
- No signing for conversion engines — outside identification scope

**Dependencies**: Phase 9 (settings UI shows verification status)
**Main risks**: Private key mismanagement; embedded public key mismatch; dev/test root leaking into production. P5-A guard must be preserved.

**Test / scan expectations**:
- Trust gate tests (fail-closed when unsigned, fail-closed when revoked)
- Root rotation tests (overlapping root epochs)
- Revocation tests (blocked engine after root revoked)
- Forbidden scans: 0 private key leaks in source/logs/diagnostics
- External audit required (Release Lane — `flash-risk-review`)

**Agent strategy**: Release Lane. P10-C and P10-D may need 2 rounds.
**Commit strategy**: `feat: embed production trust root for identification runtimes`, `feat: wire verification status into identification plugin registration`, `feat: implement revocation list loading`, `docs: Phase 10 closeout`. Key material: public key ONLY in commits.
**Stop condition**: After P10-E closeout and external risk review pass.

---

### 4.4 Phase 11 — Identification Hardening Backlog

**Category**: Hardening (incremental improvements to identification only)
**Priority**: P2
**Goal**: Close remaining identification-layer gaps identified in the spec coverage audit — encoding probes, abstraction cleanup, override persistence, parser seam, polyglot, fixtures, diagnostics. Each subtask is independent and can be executed separately.

**In-scope work**:

| Subtask | Description | Priority | Agent rounds |
|---------|-------------|----------|--------------|
| **P11-A** | GBK / GB2312 / Big5 text probe enhancement — extend `textProbe.ts` to detect CJK legacy encodings (currently handles UTF-8/UTF-16 only). This is a detection-layer text encoding probe enhancement, not a Tika conversion or text extraction task. | P2 | 1–2 |
| **P11-B** | FileAccessRef / FileReadAdapter abstraction — create standalone modules matching spec §4 if separation is warranted, OR document intentional simplification (current direct `fs.readFile` in detection service is sufficient for single-main-process architecture). Decision required before implementation. | P1 | 1 |
| **P11-C** | userOverride persistence — create standalone `userOverride.ts` module with persistence layer. Users can override send route, preview mode, and target format preference per file/extension/conversation scope. Override must NOT pollute verdict cache or evidence. All 4 scope levels (`this_file`, `this_conversation`, `this_extension`, `global_default`). | P2 | 2 |
| **P11-D** | Parser validation seam documentation — document Step 8 of the detection pipeline as a reserved seam for future conversion engine integration. Define trigger conditions, expected interface contracts, and no-op behavior. No conversion engine implementation is performed. This is a spec-level alignment task. | P2 | 1 |
| **P11-E** | Advanced polyglot detection and adversarial fixture expansion — extend `evidenceMerge.ts` polyglot heuristic beyond the current minimum; add 7 deferred fixture types (gbk_chinese_text, mp4_minimal, polyglot_pdf_zip_minimal, image_with_executable_tail, zip64, xlsm_macro, pptm_macro). | P2 | 1–2 |
| **P11-F** | Developer diagnostic mode — toggle visibility for extra engine metadata, detection timing, raw evidence counts, internal state transitions. Sanitized output only (no paths, tokens, hashes). Useful for debugging identification behavior without modifying production code paths. | P3 | 1 |
| **P11-G** | Final hardening closeout — run full test suite, forbidden scans, cross-subtask integration review | — | 1 |

**Out-of-scope work**:
- No conversion engine implementation (P11-D documents the seam only)
- No text extraction via external engines (P11-A is a detection-layer encoding probe, not Tika integration)
- No provider_file_ref implementation
- No downloader, marketplace, or auto-update

**Dependencies**: Phase 8 (clean test baseline), Phase 10 (P11-C userOverride may interact with trusted engine preferences). Subtasks within Phase 11 are independent and can execute in parallel.

**Main risks**: P11-A encoding detection false positives for short text samples; P11-B abstraction may be unnecessary overhead if single-main-process holds; P11-E polyglot heuristic changes may regress existing verdicts.

**Test / scan expectations**:
- P11-A: Encoding detection tests for GBK, GB2312, Big5, GB18030 text fixtures
- P11-B: Either new abstraction tests OR documented decision record with rationale
- P11-C: userOverride persistence tests for all 4 scope levels; cache non-pollution tests
- P11-D: Doc-only — no test changes; verify seam documentation matches spec §8
- P11-E: Polyglot heuristic tests; 7 new fixture entries in expected.json
- P11-F: Diagnostic mode toggle tests; sanitization tests
- Forbidden scans: 0 path/token/hash leaks across all subtasks

**Agent strategy**: Safe Lane for all subtasks. Subtasks may run in parallel (independent code surfaces).
**Commit strategy**: `feat: add GBK/Big5 text probe`, `docs: FileAccessRef abstraction decision`, `feat: userOverride persistence module`, `docs: parser validation seam`, `feat: advanced polyglot detection`, `feat: developer diagnostic mode`, `docs: Phase 11 closeout`.
**Stop condition**: After P11-G closeout. Individual subtasks may be deferred if scope or risk warrants.

---

## 5. Analysis Sections

### 5.1 Why Phase 8 Should Start with Real Magika Smoke

Real Magika operational smoke is the highest-value, lowest-cost next step for the identification roadmap:

1. **Only untested real-runtime path in identification**. The entire detection pipeline has been tested exhaustively with mock/fake runtimes. The only gap between code-complete and truly-verified is real Magika execution. Closing this gap validates the identification architecture under real conditions.

2. **Prerequisites are minimal**. The wire exists (`2cf3bfc`), the gated test suite exists (5 tests behind `STARVERSE_ENABLE_REAL_MAGIKA_TESTS=1`), and the pure JS runtime smoke already passed manually (`52-phase6-magika-pure-js-runtime-smoke.md`). Only a local plugin package is needed.

3. **Unblocks test reliability**. The 23 SQLite-dependent test failures (Node.js version mismatch) are fixed as a byproduct. Clean test baseline is a prerequisite for all subsequent identification and hardening phases.

4. **Small scope, clear stop condition**. This is an operational validation phase, not an architecture phase. If the plugin is unavailable, the phase records a gated-skip. No new code architecture, no UI, no refactoring.

5. **No dependency on future phases**. Phase 8 can run independently. It validates the existing architecture without blocking or being blocked by UI/signing/hardening work.

### 5.2 Why Identification Plugin UI Should Remain Local/Manual

1. **Visibility before automation**. The user must see what identification plugins are installed, what state they're in, and whether they work before any automated download/install flow makes sense.

2. **Trust chain is incomplete until Phase 10**. Until production signing delivers real trust verification, automated download cannot verify plugin authenticity. Manual placement lets the user control trust decisions explicitly.

3. **This is an identification settings panel, not a marketplace**. The goal is to display and manage detection engine state — not to browse, download, or update from a remote catalog.

4. **Diagnostic DTO already exists**. `getDiagnosticsSummary()` (Phase 6-B) returns all data needed. UI work is presentation-only.

### 5.3 Why Identification Trust Must Gate All Plugin Distribution

1. **Trust chain is a prerequisite for any automated distribution**. Even though downloader/marketplace are outside the identification roadmap, the trust infrastructure built in Phase 10 serves as the security foundation if distribution is ever added.

2. **Scope isolated to identification runtimes**. Phase 10 signs Magika packages (model + JS runtime). Conversion engine signing is outside scope but can reuse the same trust primitives later.

3. **Scaffold exists but is incomplete**. P5-D delivered trust contracts and verification gates. What's missing is the production key material and runtime wiring. This is a bounded infrastructure task.

### 5.4 Audit Gap to Phase Mapping

Mapping from `55-final-spec-coverage-audit.md` gaps to the revised identification-only phases:

| Audit Item | Status | Identification Phase | Priority | Rationale |
|-----------|--------|---------------------|----------|-----------|
| Real Magika plugin operational smoke | completed_gated | **Phase 8** | P1 | Only untested identification runtime path; validates existing architecture |
| better-sqlite3 rebuild / Node.js compat | needs_verification | **Phase 8** (P8-A, environment prerequisite) | P1 | Environment hygiene; unblocks full identification test suite |
| Settings UI for identification plugin management | deferred | **Phase 9** | P1 | Diagnostics DTO exists; UI is identification-plugin-focused, not marketplace |
| Developer diagnostic mode | needs_verification | **Phase 9** (P9-C), **Phase 11** (P11-F) | P2/P3 | Basic toggle in settings; advanced diagnostics in hardening |
| Production signing workflow (identification runtimes) | deferred | **Phase 10** | P2 | Security prerequisite for verified identification plugins |
| setVerificationStatus wired at registration | not_started | **Phase 10** (P10-C) | P1 | Security hardening; API exists, needs wiring |
| revoked_roots.json file loading | not_started | **Phase 10** (P10-B) | P2 | Revocation infrastructure for identification runtimes |
| Plugin upgrade / rollback (identification metadata hooks) | partially_completed | **Phase 10** (P10-D) | P2 | Metadata-level hooks within identification trust boundary; full lifecycle with downloader is outside identification roadmap |
| GBK / GB2312 / Big5 text detection | deferred | **Phase 11** (P11-A) | P2 | Detection-layer encoding probe enhancement; not a conversion engine task |
| FileAccessRef / FileReadAdapter | partially_completed | **Phase 11** (P11-B) | P1 | Identification boundary hardening OR documented intentional simplification |
| userOverride persistence | partially_completed | **Phase 11** (P11-C) | P2 | Send route override without verdict pollution; identification-adjacent |
| parser validation on demand (Step 8) | partially_completed | **Phase 11** (P11-D) | P2 | Seam documentation only; no conversion engine implementation |
| Advanced polyglot detection | deferred | **Phase 11** (P11-E) | P2 | Detection heuristic enhancement; adversarial coverage |
| Fixture expansion (7 deferred types) | partially_completed | **Phase 11** (P11-E) | P2 | Detection fixture coverage; added with polyglot and macro fixture work |
| Consolidate log sanitization (5 files) | needs_verification | **Phase 11** (deferred, no numbered subtask) | P3 | Maintenance optimization; can be folded into any Phase 11 subtask |

### 5.5 Items Separated from the Identification Roadmap

These audit items are NOT identification-layer work. They are listed here for traceability:

| Audit Item | Status | Where It Belongs | Rationale |
|-----------|--------|-----------------|-----------|
| Pandoc conversion | out_of_scope_current | Document Conversion Roadmap (see §10.1) | File transformation, not file identification |
| Tika text extraction | out_of_scope_current | Document Conversion Roadmap (see §10.1) | Text extraction/conversion, not identification |
| LibreOffice conversion | out_of_scope_current | Document Conversion Roadmap (see §10.1) | Heavyweight rendering/conversion, not identification |
| ffprobe metadata probe | out_of_scope_current | Document Conversion Roadmap (see §10.1) | Media metadata extraction, not file identification |
| provider_file_ref lifecycle | not_started | Provider File Lifecycle Roadmap (see §10.2) | Remote file reference management |
| Downloader / installer | not_started | Plugin Distribution Platform Roadmap (see §10.3) | Plugin distribution infrastructure |
| Marketplace / plugin gallery | deferred | Plugin Distribution Platform Roadmap (see §10.3) | Plugin catalog and discovery |
| Auto-update | deferred | Plugin Distribution Platform Roadmap (see §10.3) | Plugin update automation |
| Full plugin ecosystem | not_started | Plugin Distribution Platform Roadmap (see §10.3) | Multi-engine production lifecycle |
| DROID / Siegfried archival detector | out_of_scope_current | Future deferred (P3) | Archival-grade detection; may be identification or conversion depending on use |
| Enterprise policy / multi-user config | deferred | Future deferred (P3) | Personal project scope |
| Calibre EPUB conversion | out_of_scope_current | Document Conversion Roadmap (P3, future) | EPUB rendering/conversion |
| ImageMagick image conversion | out_of_scope_current | Document Conversion Roadmap (P3, future) | Image processing beyond preview_optimized |

---

## 6. Recommended Model/Agent Strategy Per Phase

| Phase | Primary Agent | Recommended Subagents | Lane |
|-------|---------------|----------------------|------|
| Phase 8 | DeepSeek V4 Pro | flash-code-reader (code mapping), flash-test-runner (smoke) | Safe Lane |
| Phase 9 | DeepSeek V4 Pro | flash-code-reader (Vue conventions, IPC surface) | Safe Lane |
| Phase 10 | DeepSeek V4 Pro | flash-risk-review (P0 verification), flash-code-reader | Release Lane |
| Phase 11 | DeepSeek V4 Pro | flash-code-reader (per subtask), flash-test-runner | Safe Lane |

Lane definitions from `50-post-p5-user-level-roadmap.md §2.1`:
- **Safe Lane**: Scoped plan, internal scans only, targeted tests, one compact closeout doc
- **Release Lane**: External audit required (`flash-risk-review`), manual smoke, full targeted tests + scans

---

## 7. Commit Strategy Summary

| Phase | Estimated Commits | Key Messages |
|-------|-------------------|--------------|
| Phase 8 | 4 | `chore: rebuild better-sqlite3`, `docs: Magika plugin placement contract`, `test: gated real Magika smoke`, `docs: Phase 8 closeout` |
| Phase 9 | 3–4 | `feat: identification plugin settings status display`, `feat: plugin enable/disable and manual register UX`, `docs: Phase 9 closeout` |
| Phase 10 | 4–5 | `feat: embed production trust root`, `feat: wire verification status into identification plugin registration`, `feat: revocation list loading`, `docs: Phase 10 closeout` |
| Phase 11 | 7+ | One commit per subtask (P11-A through P11-G) plus closeout |

All commits must pass `git diff --check` + forbidden scans.

---

## 8. Risks and Stop Conditions

### 8.1 Cross-Cutting Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Real Magika plugin package unavailable | Blocks Phase 8 | Record gated-skip; proceed to Phase 9 |
| Production signing key material mismanaged | P0 security | Never commit private key; P5-A dev-mode guard |
| Scope creep into conversion/provider/marketplace | Misaligned roadmap | All items outside identification boundary are explicitly separated in §10 |

### 8.2 Per-Phase Stop Conditions

| Phase | Stop If |
|-------|---------|
| Phase 8 | Gated-skip recorded OR smoke passed + closeout written |
| Phase 9 | Settings panel renders identification plugin state correctly OR blocked on missing Phase 8 data |
| Phase 10 | Production keys generated, trust gate passes, external audit passes |
| Phase 11 | All accepted P11 subtasks closed out; individual subtasks may be deferred |

---

## 9. Recommended Immediate Next Phase

**Phase 8: Local Real Magika Plugin Operational Smoke**

Rationale:
- Only untested real-runtime identification path
- Lowest cost, highest value — wire and tests exist
- Unblocks 23 SQLite-dependent test failures (P8-A)
- Standalone — depends on no future phase
- Validates identification architecture before UI/signing/hardening investment

If Phase 8 is gated-skip, proceed to **Phase 9** (settings UI using existing diagnostics DTO data).

---

## 10. Separated Future Routes, Outside File Identification Roadmap

The following work is explicitly **not part of the file identification roadmap**. Each is a separate future project requiring its own planning, phase numbering, and Owner decision. They must not be executed under the identification phase sequence (Phase 8–11).

### 10.1 Document Conversion and Preview Roadmap

**Scope**: Transforming file content from one format to another — this is downstream of identification. Identification tells the system what a file *is*; conversion changes what it *becomes*.

**Candidate engines** (each requires its own planning phase):
- **Pandoc** — document-to-Markdown conversion (`.docx`, `.doc`, `.rtf`, `.html` → `.md`). Existing fake runner scaffold in `conversionRuntimePackage.ts`.
- **Tika** — text extraction and metadata probing. Java-based. Multi-encoding text extraction.
- **LibreOffice** — Office-to-PDF/HTML conversion. Heavyweight C++ sandboxing.
- **ffprobe** — audio/video metadata probe. Native binary dependency.
- **Calibre** — EPUB conversion (future, P3).
- **ImageMagick** — limited image conversion beyond preview_optimized (future, P3).

**Prerequisites from identification roadmap**: Phase 10 (trust gate for engine verification), Phase 11-A (encoding detection), Phase 11-B (FileAccessRef abstraction), Phase 11-D (parser validation seam).

**Relevant existing documents**:
- `docs/file-pipeline/format-conversion-preview-final.md` — conversion architecture and preview policies
- `docs/file-pipeline/file-type-detection-implementation/48-phase5-p5e3-first-runtime-pilot-closeout.md` — Pandoc scaffold
- `docs/file-pipeline/file-type-detection-implementation/34-p4c-external-conversion-engines-closeout.md` — conversion contract closeout

**Status**: Not started. No conversion roadmap document exists. Fake scaffolds only.

### 10.2 Provider File Lifecycle Roadmap

**Scope**: Managing remote file references through provider APIs — uploading local files to a provider, persisting the reference (URL/ID), tracking expiry, retrying failed uploads, and cleaning up stale references. This is a data-model and provider-integration concern.

**Candidate features**:
- Provider capability contract and upload API integration
- Reference persistence (provider file ID, URL, expiry timestamp)
- Expiry / retry / delete semantics
- Privacy and local cache interaction hardening
- SendPlan integration (prefer `provider_file_ref` over base64 for large files)
- OpenRouter serializer integration

**Prerequisites from identification roadmap**: Phase 11-C (userOverride persistence for send route preferences), stable SendPlan patterns.

**Relevant existing documents**:
- `docs/file-pipeline/file-type-detection-implementation/39-p4d4-provider-legacy-decision-package.md` — decision record
- `docs/file-pipeline/file-type-detection-implementation/41-phase4-owner-decision-record.md` — Owner decision (provider_file_ref not in MVP)

**Status**: Not started. Type definitions exist in `src/shared/files/fileTypes.ts`. No implementation. Explicitly deferred by Owner decision.

### 10.3 Plugin Distribution Platform Roadmap

**Scope**: Automated discovery, download, installation, and update of plugins — closing the plugin ecosystem loop beyond manual/local placement.

**Candidate features**:
- Official catalog distribution contract (metadata, signatures, platform matrix, versioning)
- Downloader (fetch package, verify catalog signature, verify manifest integrity, verify file hashes)
- Installer (extract to managed plugin directory, register in DB, set verification status)
- Auto-update (check catalog for newer versions, download, verify, replace)
- Rollback on update failure
- Marketplace settings UI (browse available plugins, see versions, install/update/uninstall)
- License/attribution display

**Prerequisites from identification roadmap**: Phase 10 (production signing — trust chain must be complete before distribution). Code-level trust primitives built in Phase 10 serve as the security foundation.

**Relevant existing documents**:
- `docs/file-pipeline/file-type-detection-implementation/20-p4a-official-plugin-marketplace-closeout.md` — early marketplace scaffold
- `docs/file-pipeline/file-type-detection-implementation/46-phase5-p5d-trust-signing-closeout.md` — trust contracts

**Status**: Not started. Plugin catalog types exist. No real catalog distribution. No downloader, installer, or auto-update.

---

## 11. Future Deferred Items (No Current Roadmap)

These items are intentionally deferred past all current roadmaps. Each requires a separate Owner decision:

| Item | Domain | Trigger Condition | Priority |
|------|--------|-------------------|----------|
| DROID / Siegfried archival-grade detector | Identification or Conversion | Archival/document-preservation use case emerges | P3 |
| Enterprise policy / multi-user config | Platform | Project scope expands beyond single-user desktop | P3 |
| Third-party plugin ecosystem | Distribution | Official marketplace is stable and plugin SDK is mature | P3 |
| Cross-platform symlink boundary tests | Infrastructure | macOS/Linux platform support is prioritized | P3 |
| Local LLM service plugin (ollama, llama.cpp) | Platform | User wants local AI model support | P3 |

---

## 12. Claim-Safety Verification

### 12.1 Forbidden Claims

The following claims are NOT made in this document:

- File processing platform completed
- Plugin ecosystem completed
- Conversion engine platform completed
- Conversion roadmap started
- Marketplace ready or planned under identification
- Production signing complete
- provider lifecycle complete or planned under identification
- Real Magika local smoke completed
- Any future identification phase has started

### 12.2 Allowed Language

This document uses:
- planned, proposed, future, deferred, prerequisite, gated
- local/manual only, code-level milestone
- not yet started, remains future, remains open
- outside this roadmap, separated future route
- not part of file identification phase sequence

---

## 13. README Index Update

Recommended addition to `docs/file-pipeline/file-type-detection-implementation/README.md`:

```markdown
| 56-post-v1-future-phase-roadmap.md | Post-v1 future phase roadmap — file identification system only |
```

Status line update:
```markdown
Current phase: Phase 7 closed (File Content Identification v1.0). Post-v1 identification roadmap planned (Phase 8–11). Document conversion, provider_file_ref, and plugin distribution are separate future routes outside the identification roadmap.
```

---

## 14. Final Report

### 14.1 Preflight Git Status and HEAD

- **HEAD**: `bd7e250` — `docs: plan post-v1 file processing phases`
- **Working tree**: `M public/build-id.json` (auto-generated, not in scope)
- **`git diff --check`**: Clean (1 CRLF warning in `build-id.json`)

### 14.2 Model Used

DeepSeek V4 Pro (primary agent, docs-only planning)

### 14.3 Subagents/Commands Used

None. Read-only document revision — all evidence from prior reads and audit context.

### 14.4 Files Read

| File | Purpose |
|------|---------|
| `56-post-v1-future-phase-roadmap.md` (prior revision) | Baseline for correction |
| `55-final-spec-coverage-audit.md` §6–§7 | Gap mapping reference |
| `54-file-content-identification-v1-roadmap.md` | Scope boundaries |
| `format-conversion-preview-final.md` | Conversion architecture reference |
| `progress-ledger.md` | File pipeline progress (separate domain) |

### 14.5 Files Changed

| File | Change |
|------|--------|
| `docs/file-pipeline/file-type-detection-implementation/56-post-v1-future-phase-roadmap.md` | Revised — narrowed to file identification only |

### 14.6 Revised Phase List and Task Package Counts

| Phase | Task Packages |
|-------|--------------|
| Phase 8 — Local Real Magika Plugin Operational Smoke | 4 (P8-A through P8-D) |
| Phase 9 — Identification Plugin Settings Minimal UI | 4 (P9-A through P9-D) |
| Phase 10 — Identification Runtime Trust and Signing Gate | 5 (P10-A through P10-E) |
| Phase 11 — Identification Hardening Backlog | 7 (P11-A through P11-G) |
| **Total** | **20 task packages across 4 identification phases** |

### 14.7 Removed or Separated Phases

| Removed Phase | Disposition |
|---------------|------------|
| Old Phase 11 — Pandoc Conversion MVP | → §10.1 Document Conversion Roadmap |
| Old Phase 12 — Tika Text Extraction | → §10.1 Document Conversion Roadmap |
| Old Phase 13 — LibreOffice Conversion | → §10.1 Document Conversion Roadmap |
| Old Phase 14 — provider_file_ref Lifecycle | → §10.2 Provider File Lifecycle Roadmap |
| Old Phase 15 — Downloader / Marketplace / Auto-update | → §10.3 Plugin Distribution Platform Roadmap |

### 14.8 Why Conversion/Provider/Marketplace Were Removed

1. **Different domain boundaries**. File identification answers "what is this file?" Conversion answers "what should this file become?" Provider references answer "where is this file stored remotely?" Distribution answers "how do users get plugins?" These are fundamentally different system concerns.

2. **Different security boundaries**. Identification runs in the hot detection path (main process, worker thread, or isolated child process with sandbox copy). Conversion runs heavyweight external binaries. Provider interaction runs network I/O. Distribution runs download/catalog verification. Bundling them creates ambiguous security review scope.

3. **Different phase sequencing**. Identification phases 8–11 form a coherent dependency chain (smoke → UI → trust → hardening). Conversion phases have their own dependency chain and should not be interleaved with identification numbers.

4. **Scope creep prevention**. Including conversion/provider/marketplace under identification phase numbers implies they are identification work. They are not. Separation makes this explicit and prevents accidental implementation under the wrong heading.

### 14.9 Gap-to-Phase Mapping Summary

15 audit gaps mapped to 4 identification phases. 9 conversion/provider/distribution items moved to separated future routes (§10). 2 items already fixed (fullHash redaction at `8cca912`, console.warn path check). 5 items deferred beyond all roadmaps (§11).

### 14.10 Claim-Safety Scan Results

See §12. All forbidden completion claims absent. Conversion/provider/marketplace terms appear only in explicit out-of-scope clauses (§2.2) and separated future routes (§10).

### 14.11 Confirmation

`public/build-id.json` was not committed. Working tree shows it as an uncommitted local modification only.

### 14.12 Explicit Confirmation

**No implementation was performed.** No production code, test files, package.json, or lockfiles modified. Documentation-only roadmap revision.

---

## 15. Signed Off

- [ ] Owner review of revised identification-only scope
- [ ] Owner decision on Phase 8 entry (proceed or gated-skip)
- [ ] README index update (upon Owner approval)
- [ ] Commit: `docs: narrow post-v1 roadmap to file identification`
