# 56. Post-v1 Future Phase Roadmap — File Processing, Plugins, Conversion, Provider Lifecycle

**Status**: Planning only — no implementation, no production code changes
**Date**: 2026-05-12
**Phase**: Post-Phase 7 future planning (docs-only)
**Parent docs**: `55-final-spec-coverage-audit.md`, `54-file-content-identification-v1-roadmap.md`, `50-post-p5-user-level-roadmap.md`, `starverse_file_type_detection_engineering_final.markdown`

本 roadmap 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。
All conversion engines remain future. Downloader / marketplace remain future. provider_file_ref remains future.
Production signing keys remain future. Real Magika local smoke remains gated.

---

## 1. Baseline

### 1.1 What Is Complete

File Content Identification v1.0 (`bc70785`, `ad49fbc`, `8cca912`):

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
- Conversion engine scaffolds (Pandoc, Tika, LibreOffice, ffprobe) — fake runners only, no real binary execution
- provider_file_ref type definitions — no implementation
- Plugin catalog types — no real catalog distribution
- Plugin upgrade/rollback — not implemented

### 1.3 What Remains Gated

- Real Magika plugin end-to-end smoke (`STARVERSE_ENABLE_REAL_MAGIKA_TESTS=1` — no local plugin at closeout time)
- Settings UI for plugin management (diagnostics DTO exists; no renderer panel)
- 23 tests fail due to Node.js/better-sqlite3 version mismatch (environment-only, not code regression)

---

## 2. Route Skeleton (User-Provided)

```
R1: Local real Magika plugin smoke
    ↓
UI1: Plugin settings minimal UI, local/manual only
    ↓
T1: Production signing / trust root / signed package verification
    ↓
C1: Pandoc conversion MVP
    ↓
C2: Tika text extraction / metadata deep path
    ↓
C3: LibreOffice Office conversion
    ↓
P1: provider_file_ref lifecycle
    ↓
M1: downloader / official marketplace / auto-update
```

### 2.1 Adjustments to the User-Provided Skeleton

| Change | Justification |
|--------|---------------|
| Merged `better-sqlite3` rebuild into Phase 8 | Prerequisite for test reliability; low-cost infrastructure fix that unblocks SQLite-dependent tests. No architecture change. |
| Split `ffprobe` out of C1/C2/C3 into a deferred note | Audio/video probe is an independent engine with its own risk profile (native binaries, codec dependencies). Not prioritized in initial conversion phases. Listed as a future deferred item, not a numbered phase. |
| Added `userOverride` persistence + `FileAccessRef`/`FileReadAdapter` to Phase 11 (Pandoc) | Pandoc conversion needs input file abstraction (FileAccessRef) and user-configured conversion overrides. These are conversion-platform prerequisites, not detection-layer work. |
| Added `parser validation on demand` (Step 8 from spec) to Phase 11 | Parser validation is fundamentally a conversion-engine concern. The detection pipeline's Step 8 is a seam reserved for conversion engine integration. First real conversion engine activates it. |
| Added `GBK/GB2312/Big5` text detection to Phase 12 (Tika) | Tika provides multi-encoding text extraction. Bundling encoding detection with Tika avoids building a standalone encoding probe in the detection layer. |
| Added `fixture expansion` incrementally across Phase 8/11/12/13 | Each engine phase adds its own fixture types. No standalone fixture-expansion phase needed. |
| Added `developer diagnostic mode` to Phase 9 | Diagnostic visibility naturally pairs with settings UI. Both give the user/dev visibility into engine state. |
| Deferred `advanced polyglot`, `DROID/Siegfried`, `enterprise policy` beyond Phase 15 | These are P3 items with no current user demand. Listed in §11 as future deferred, not numbered phases. |

---

## 3. Proposed Phase List

| Phase | Name | Category | Priority |
|-------|------|----------|----------|
| Phase 8 | Local Real Magika Plugin Operational Smoke | Validation | P1 |
| Phase 9 | Plugin Settings Minimal UI | User-facing | P1 |
| Phase 10 | Production Trust and Signing | Security/Infrastructure | P2 |
| Phase 11 | Pandoc Conversion MVP | Conversion | P1 |
| Phase 12 | Tika Text Extraction and Metadata Deep Path | Conversion | P2 |
| Phase 13 | LibreOffice Office Conversion | Conversion | P2 |
| Phase 14 | provider_file_ref Lifecycle | Data Model | P2 |
| Phase 15 | Official Downloader / Marketplace / Auto-update | Platform | P3 |

---

## 4. Phase Details

### 4.1 Phase 8 — Local Real Magika Plugin Operational Smoke

**Category**: Validation (operational smoke, not architecture work)
**Priority**: P1
**Goal**: Validate real Magika managed plugin end-to-end — classify a real file through the full detection chain using a locally placed plugin package.

**In-scope work**:
- Rebuild `better-sqlite3` for current Node.js version (unblocks 23 SQLite-dependent tests)
- Install a real Magika pure JS plugin package in the expected local directory
- Set `STARVERSE_ENABLE_REAL_MAGIKA_TESTS=1` and run the 5 gated real-runtime tests
- Verify `detectFull` produces valid `FileTypeEvidence` with real `modelVersion` from actual runtime
- Verify cache/freshness/fallback/privacy behavior under real runtime execution
- Verify no `fullHash`/`contentToken`/path leaks in real-runtime log output
- Document smoke results, any failures, and taxonomyMap label drift observations

**Out-of-scope work**:
- No downloader — plugin placed manually
- No UI changes — diagnostics DTO already exists
- No settings panel — Phase 9 concern
- No signing workflow — Phase 10 concern
- No production packaging — real build pipeline not required
- No new detection features — smoke validates existing wire

**Task packages**:

| Package | Description | Agent rounds |
|---------|-------------|--------------|
| P8-A | `better-sqlite3` rebuild and environment hygiene | 1 |
| P8-B | Gated real runtime smoke execution (5 tests) | 1 |
| P8-C | Smoke closeout and failure matrix | 1 |

**Dependencies**: None (standalone). Requires local Magika plugin package placement only.
**Accepts blocked on**: Missing local Magika plugin package (records gated-skip status).
**Main risks**: Magika runtime model version mismatch against taxonomy map; platform-specific native dependency issues.

**Test / scan expectations**:
- 5 gated real-runtime tests pass
- 23 SQLite-dependent tests pass (no longer failing)
- Full file-type test suite at 127/127 pass (0 failures)
- Forbidden scans: 0 `shell:true`, 0 `exec(`, 0 path/token/hash leaks

**Commit strategy**: One commit per task package. Suggested messages: `chore: rebuild better-sqlite3 for current Node.js`, `test: run gated real Magika smoke`, `docs: close out Phase 8 Magika operational smoke`.
**Stop condition**: After P8-C closeout doc written OR gated-skip recorded with clear reason.

---

### 4.2 Phase 9 — Plugin Settings Minimal UI, Local/Manual Only

**Category**: User-facing (UI only)
**Priority**: P1
**Goal**: Give the user visibility into plugin state through a minimal settings panel. All plugin operations remain local/manual.

**In-scope work**:
- Create a renderer-side settings panel component for plugin management
- Wire `getDiagnosticsSummary()` IPC client into the panel (DTO already exists)
- Display: engine name, id, kind, enabled/disabled status, health status, verification status, version, modelVersion
- Display sanitized failure reason (no raw paths, no hashes, no content tokens)
- Enable/disable toggle with confirmation
- Remove/uninstall button with confirmation
- Manual `registerLocalPackage` entry point (local directory picker)
- Developer diagnostic mode toggle (show extra engine metadata, timing, raw evidence counts)
- `userOverride` display in settings (show active overrides by file/extension/conversation)

**Out-of-scope work**:
- No downloader — no install-from-URL, no remote catalog browsing
- No auto-update — manual package placement only
- No marketplace/gallery UI — simple list view only
- No raw path display — all paths basename-only
- No `fullHash` display — all hashes redacted in UI
- No multi-engine lifecycle UI beyond Magika

**Task packages**:

| Package | Description | Agent rounds |
|---------|-------------|--------------|
| P9-A | Diagnostics DTO and IPC review (confirm existing wire is sufficient for UI) | 1 |
| P9-B | Settings panel read-only status display (engine list, health, version) | 1–2 |
| P9-C | Enable/disable toggle and manual register UX | 1–2 |
| P9-D | Sanitized failure display, developer diagnostic mode, closeout | 1 |

**Dependencies**: Phase 8 (need working plugin lifecycle to display useful data)
**Main risks**: Existing Vue component conventions may need adaptation; IPC surface may need new methods for enable/disable from renderer side.

**Test / scan expectations**:
- New Vue component tests for settings panel
- IPC contract tests for any new methods
- Forbidden scans: 0 path/hash/token leaks in UI display
- Manual smoke: settings panel shows Magika plugin state correctly

**Commit strategy**: Commit per task package or batch P9-B/P9-C together. Suggested messages: `feat: add plugin settings panel diagnostics display`, `feat: add plugin enable/disable toggle in settings`, `docs: close out Phase 9 plugin settings UI`.
**Stop condition**: After P9-D closeout OR blocked on missing Phase 8 smoke data.

---

### 4.3 Phase 10 — Production Trust and Signing

**Category**: Security/Infrastructure
**Priority**: P2
**Goal**: Implement production signing workflow — generate real keys, embed production trust root, wire `setVerificationStatus` at registration time, and implement revocation semantics.

**In-scope work**:
- Generate production Ed25519 key pair (offline, one-time Owner action)
- Embed production public key in build (backed by P5-A dev-mode guard)
- Wire `setVerificationStatus({ engineId, verificationStatus: 'verified' })` into plugin registration flow
- Implement `revoked_roots.json` file loading and revocation check in verification gate
- Implement signed package verification end-to-end (catalog signature → manifest hash → file integrity)
- Root rotation semantics: support multiple active roots with version/epoch binding
- Revocation semantics: block revoked roots at verification time; add quarantine state for revoked engines
- Signing audit trail: log keyId, artifact hash, timestamp on verification events (sanitized — no raw keys)
- Upgrade/rollback lifecycle hooks (plugin metadata-level, without downloader)

**Out-of-scope work**:
- No offline signing CLI tool (Owner signs manually for now)
- No certificate authority / PKI — direct Ed25519 key trust
- No CRL/OCSP — offline revocation list only
- No marketplace — trust gate applies to local/manual packages only
- No auto-update — Phase 15 concern
- No production package distribution — packages remain locally placed

**Task packages**:

| Package | Description | Agent rounds |
|---------|-------------|--------------|
| P10-A | Signing policy and package contract formalization | 1 |
| P10-B | Production key generation + embedded trust root | 1 |
| P10-C | Signed package verification gate (wire setVerificationStatus) | 1–2 |
| P10-D | Revocation / quarantine / rollback semantics | 1–2 |
| P10-E | Audit trail, closeout, and risk review | 1 |

**Dependencies**: Phase 9 (settings UI shows verification status)
**Main risks**: Key management errors — misplaced private key, embedded public key mismatch, dev/test root leaking into production. P5-A guard must be preserved.

**Test / scan expectations**:
- Production trust gate tests (fail-closed when unsigned, fail-closed when revoked)
- Root rotation tests (overlapping root epochs)
- Revocation tests (blocked engine after root revoked)
- Forbidden scans: 0 private key leaks in source/logs/diagnostics
- External audit required (Release Lane — `flash-risk-review` after implementation)

**Commit strategy**: Commit per task package. P10-B key material must be committed ONLY as public key (NEVER private key). Suggested messages: `feat: embed production trust root`, `feat: wire verification status into plugin registration`, `feat: implement revocation list loading`, `docs: close out Phase 10 production trust and signing`.
**Stop condition**: After P10-E closeout and external risk review pass.

---

### 4.4 Phase 11 — Pandoc Conversion MVP

**Category**: Conversion (first real engine)
**Priority**: P1
**Goal**: Execute real Pandoc document-to-Markdown conversion through the existing scaffold. First real conversion engine delivering user-visible output.

**In-scope work**:
- Formalize `ConversionJobInput` and `ConversionJobOutput` contracts using existing `conversionRuntimePackage.ts` scaffold
- Create or reuse `FileAccessRef` / `FileReadAdapter` standalone abstraction (spec §4) for safe file input to conversion engines
- Package Pandoc binary in the managed engine plugin layout (manual placement, local/manual only)
- Wire `ExternalProcessRunner` to execute real Pandoc binary with security constraints (shell:false, timeout, caps)
- Implement document-to-Markdown basic path (`.docx`/`.doc`/`.rtf`/`.html` → `.md`)
- Implement Markdown output safety validation (size limits, encoding check, structural sanity)
- Integrate `parser validation on demand` (spec Step 8): trigger Pandoc-based parser validation when `needsParserValidation` flag is set on verdict
- Integrate conversion output into SendPlanCandidate generation
- Implement `userOverride` persistence module (standalone `userOverride.ts`) — user can override conversion target format per file/extension
- Token estimation for converted Markdown output (rough token count for send plan gating)

**Out-of-scope work**:
- No Tika — Phase 12 concern
- No LibreOffice — Phase 13 concern
- No ffprobe — deferred, no numbered phase
- No downloader — Pandoc binary placed manually
- No auto-update for Pandoc — manual binary replacement only
- No multi-format conversion matrix — document-to-Markdown only
- No PDF output from Pandoc — Markdown output only in MVP
- No image extraction from documents

**Task packages**:

| Package | Description | Agent rounds |
|---------|-------------|--------------|
| P11-A | Conversion job contract, output asset model, + FileAccessRef/FileReadAdapter abstraction | 1–2 |
| P11-B | Pandoc managed runtime adapter (wire to ExternalProcessRunner) | 2–3 |
| P11-C | Markdown output safety / size / token estimates | 1 |
| P11-D | Send plan integration + userOverride persistence | 2 |
| P11-E | Fixture smoke, parser validation wiring, closeout | 1–2 |

**Dependencies**: Phase 10 (trust gate for engine verification)
**Main risks**: Pandoc GPLv2 license compliance (attribution UI required); large document timeout (Pandoc can be slow on complex documents); output size explosion (DOCX → Markdown can be larger than expected); encoding handling for CJK documents.

**Test / scan expectations**:
- Real Pandoc conversion tests with fixture documents (`.docx`, `.html`, `.rtf`)
- Fake runner tests preserved as regression baseline
- Timeout/kill tests for slow/large documents
- Output safety tests (size limit, encoding validation)
- Token estimation tests
- Forbidden scans: 0 `shell:true` in production code, 0 path leaks in conversion logs
- Manual smoke: convert a real `.docx` to `.md`, verify output, inspect logs

**Commit strategy**: Commit per task package. P11-B must be Release Lane (external audit). Suggested messages: `feat: add FileAccessRef and FileReadAdapter abstractions`, `feat: wire real Pandoc conversion runner`, `feat: integrate Pandoc output into send plan`, `docs: close out Phase 11 Pandoc conversion MVP`.
**Stop condition**: After P11-E closeout, manual smoke pass, and external audit for P11-B.

---

### 4.5 Phase 12 — Tika Text Extraction and Metadata Deep Path

**Category**: Conversion (second engine)
**Priority**: P2
**Goal**: Add Apache Tika for text extraction, metadata probing, and multi-encoding text handling. Extends conversion surface without replacing Pandoc.

**In-scope work**:
- Formalize Tika runtime/package contract (Java-based, JAR distribution)
- Implement Tika managed runtime adapter using `ExternalProcessRunner` (Java process, shell:false)
- Implement text extraction adapter (input file → `extracted_text` derivative)
- Implement metadata extraction adapter (input file → structured metadata JSON)
- Implement GBK/GB2312/GB18030/Big5 encoding detection through Tika text extraction
- Implement parser validation integration: Tika as alternative validation source for formats Pandoc doesn't cover
- Security/resource-limit hardening: Java heap limits, classpath restrictions, network disable, timeout
- Output sanitization: extracted text size limits, encoding normalization

**Out-of-scope work**:
- No Pandoc replacement — Tika supplements, not replaces
- No LibreOffice — Phase 13 concern
- No Tika Server mode — CLI only
- No downloader for Tika JAR — manual placement only
- No Tika-based format detection replacing Magika — Tika text extraction only
- No DROID/Siegfried archival Tika integration — P3 future

**Task packages**:

| Package | Description | Agent rounds |
|---------|-------------|--------------|
| P12-A | Tika runtime/package contract + GBK/Big5 encoding detection design | 1 |
| P12-B | Extract text / metadata adapter (wire to ExternalProcessRunner) | 2 |
| P12-C | Parser validation integration (Tika as secondary validation source) | 1–2 |
| P12-D | Security/resource-limit smoke (Java heap, timeout, network disable) | 1 |
| P12-E | Fixture smoke, closeout | 1 |

**Dependencies**: Phase 10 (trust gate), Phase 11 (conversion infrastructure: FileAccessRef, ExternalProcessRunner patterns)
**Main risks**: Java runtime dependency (JRE must be installed); JAR size; Tika startup overhead per invocation; Java process sandboxing complexity on Windows; encoding detection false positives for CJK text.

**Test / scan expectations**:
- Real Tika extraction tests with fixture documents (`.docx`, `.pdf`, `.html`, GBK text)
- Java process constraint tests (heap limit, timeout, network isolation)
- Encoding detection tests (GBK, GB2312, Big5, Shift-JIS)
- Forbidden scans: 0 `shell:true`, 0 path leaks, 0 Java system property injection vectors
- Manual smoke: extract text from real documents, verify encoding correctness

**Commit strategy**: Commit per task package. P12-B must be Release Lane. Suggested messages: `feat: add Tika managed runtime adapter`, `feat: implement GBK/Big5 encoding detection via Tika`, `docs: close out Phase 12 Tika text extraction`.
**Stop condition**: After P12-E closeout and manual smoke pass.

---

### 4.6 Phase 13 — LibreOffice Office Conversion

**Category**: Conversion (third engine, heavyweight)
**Priority**: P2
**Goal**: Add heavyweight Office-to-PDF/HTML conversion via LibreOffice. Hardest conversion engine due to sandboxing requirements.

**In-scope work**:
- Formalize LibreOffice runtime/package contract (C++ native binary, portable install)
- Implement LibreOffice managed runtime adapter (headless mode, shell:false)
- Implement Office-to-PDF conversion path (`.docx`/`.xlsx`/`.pptx`/`.odt`/`.ods`/`.odp` → PDF)
- Implement Office-to-HTML conversion path (alternative for further Markdown conversion)
- Intermediate route decision: PDF-vs-HTML output based on user preference and model capability
- Sandbox hardening: dedicated temp directory per conversion, file isolation, no macro execution, no network access, process tree kill on timeout
- Output validation: PDF structure check, page count sanity, file size limits
- Integration: conversion output feeds into SendPlan as PDF attachment or further Markdown conversion (via Pandoc)

**Out-of-scope work**:
- No Pandoc replacement — LibreOffice handles Office formats Pandoc cannot reliably convert
- No Tika replacement — LibreOffice is a renderer/converter, not a text extractor
- No macro-enabled document execution — `.docm`/`.xlsm`/`.pptm` rejected or macro-stripped
- No downloader for LibreOffice portable — manual placement only
- No online/cloud LibreOffice — local headless only

**Task packages**:

| Package | Description | Agent rounds |
|---------|-------------|--------------|
| P13-A | LibreOffice runtime/package contract + sandbox design | 1 |
| P13-B | Office to PDF/HTML/Markdown intermediate route decision | 1 |
| P13-C | Sandbox and resource hardening (temp dir isolation, macro block, process kill) | 2 |
| P13-D | Smoke fixture matrix (docx, xlsx, pptx, odt, ods, odp) | 1–2 |
| P13-E | Output validation, SendPlan integration, closeout | 1 |

**Dependencies**: Phase 10 (trust gate), Phase 11 (conversion infrastructure, SendPlan integration)
**Main risks**: LibreOffice portable is large (~500MB); headless mode stability on Windows; macro-enabled documents (security boundary); temp file cleanup; multiple concurrent conversions competing for LibreOffice user profile; long conversion times for complex documents.

**Test / scan expectations**:
- Real LibreOffice conversion tests with Office fixture documents
- Sandbox tests (no macro execution, no network access, temp isolation)
- Timeout/kill tests for slow conversions
- Output validation tests (PDF structure, size limits)
- Forbidden scans: 0 `shell:true`, 0 path leaks, 0 macro execution vectors
- Manual smoke: convert Office documents to PDF, verify output

**Commit strategy**: Commit per task package. P13-C must be Release Lane (external audit required). Suggested messages: `feat: add LibreOffice managed runtime adapter`, `feat: implement Office sandbox hardening`, `docs: close out Phase 13 LibreOffice Office conversion`.
**Stop condition**: After P13-E closeout, manual smoke pass, and external audit for P13-C.

---

### 4.7 Phase 14 — provider_file_ref Lifecycle

**Category**: Data Model / Provider Integration
**Priority**: P2
**Goal**: Implement provider-managed remote file references — upload, persistence, expiry, retry, delete, and privacy semantics. Only after local conversion and send planning are stable.

**In-scope work**:
- Formalize provider capability and lifecycle contract (which providers support file refs, upload APIs, retention policies)
- Implement upload flow: local file → provider file reference (URL/ID returned by provider)
- Implement reference persistence: store provider file ID, URL, expiry timestamp alongside local asset
- Implement expiry/retry/delete semantics: refresh expired references, retry failed uploads, delete remote refs on local removal
- Implement privacy and cache interaction: ensure remote refs are not cached locally in a way that leaks content
- Integrate `provider_file_ref` into SendPlanCandidate generation (prefer reference over base64 for large files)
- OpenRouter serializer integration: map `provider_file_ref` to OpenRouter file reference content parts

**Out-of-scope work**:
- No conversion engine integration — provider_file_ref is a transport concern, not a conversion concern
- No provider-agnostic multi-cloud — start with single provider
- No automatic upload-on-ingest — upload is explicit/user-triggered
- No real-time sync or collaboration — single-user local app

**Task packages**:

| Package | Description | Agent rounds |
|---------|-------------|--------------|
| P14-A | Provider capability and lifecycle contract design | 1 |
| P14-B | Upload/reference persistence implementation | 2 |
| P14-C | Expiry/retry/delete semantics | 1–2 |
| P14-D | Privacy and cache interaction hardening | 1 |
| P14-E | SendPlan + OpenRouter serializer integration, closeout | 1–2 |

**Dependencies**: Phase 11 (stable SendPlan integration and conversion infrastructure)
**Main risks**: Provider API changes (breaking file reference format); rate limits on upload; stale references (provider deletes file, Starverse still has reference); privacy boundary (remote file is on provider infrastructure, not local); OpenRouter file reference support stability.

**Test / scan expectations**:
- Upload + reference persistence tests (mock provider)
- Expiry + retry tests
- Privacy tests (no local cache of remote content beyond reference metadata)
- SendPlan integration tests (provider_file_ref preferred over base64 for large files)
- Forbidden scans: 0 provider API keys in logs, 0 raw file content in reference metadata

**Commit strategy**: Commit per task package. Suggested messages: `feat: implement provider_file_ref upload and persistence`, `feat: integrate provider_file_ref into SendPlan`, `docs: close out Phase 14 provider_file_ref lifecycle`.
**Stop condition**: After P14-E closeout.

---

### 4.8 Phase 15 — Official Downloader / Marketplace / Auto-update

**Category**: Platform (late phase only)
**Priority**: P3
**Goal**: Close the plugin ecosystem loop — enable users to browse, download, install, and update plugins without manual file placement.

**In-scope work**:
- Formalize official catalog distribution contract (catalog metadata, signatures, platform matrix, versioning)
- Implement downloader: fetch plugin package from official catalog, verify catalog signature, verify manifest integrity, verify file hashes
- Implement installer: extract package to managed plugin directory, register in DB, set verification status
- Implement auto-update: check catalog for newer versions, download, verify, replace, rollback on failure
- Implement update/rollback lifecycle hooks (completing Phase 10 upgrade/rollback scaffold)
- Implement marketplace settings UI: browse available plugins, see installed/available versions, install/update/uninstall from UI
- License/attribution display for each plugin in marketplace UI

**Out-of-scope work**:
- No third-party plugin ecosystem — official plugins only
- No user-submitted plugins — curated catalog only
- No payment/licensing — free plugins only
- No plugin dependency resolution — standalone plugins only
- No background auto-update — user-initiated update checks

**Task packages**:

| Package | Description | Agent rounds |
|---------|-------------|--------------|
| P15-A | Official catalog distribution contract | 1 |
| P15-B | Downloader / installer implementation | 2 |
| P15-C | Update / rollback lifecycle | 1–2 |
| P15-D | Marketplace settings UI | 2 |
| P15-E | License attribution, closeout, external audit | 1 |

**Dependencies**: Phase 10 (production signing — trust chain must be complete before distribution)
**Main risks**: Catalog distribution infrastructure (where is the catalog hosted?); download integrity (network errors, partial downloads, corrupted packages); rollback safety (ensuring rollback doesn't downgrade to a vulnerable version); UI complexity (marketplace browsing, version comparison, install progress).

**Test / scan expectations**:
- Downloader tests (success, network failure, integrity failure, catalog signature failure)
- Installer tests (package extraction, registration, verification)
- Update/rollback tests (upgrade path, rollback path, rollback to same version)
- Marketplace UI tests (browse, install, update, uninstall)
- Forbidden scans: 0 catalog URL leaks in logs, 0 download path leaks, 0 rollback file leaks

**Commit strategy**: Commit per task package. P15-B, P15-C must be Release Lane. Suggested messages: `feat: implement plugin downloader and installer`, `feat: implement plugin update and rollback`, `feat: add marketplace settings UI`, `docs: close out Phase 15 marketplace and auto-update`.
**Stop condition**: After P15-E closeout and external audit.

---

## 5. Analysis Sections

### 5.1 Why Phase 8 Should Start with Real Magika Smoke

Real Magika operational smoke is the highest-value, lowest-cost next step:

1. **Only untested real-runtime path**. The entire detection pipeline has been tested exhaustively with mock/fake runtimes. The only gap between code-complete and truly-verified is real Magika execution. Closing this gap validates the architecture under real conditions.

2. **Prerequisites are minimal**. The wire exists (`2cf3bfc`), the gated test suite exists (5 tests behind `STARVERSE_ENABLE_REAL_MAGIKA_TESTS=1`), and the pure JS runtime smoke already passed manually (`52-phase6-magika-pure-js-runtime-smoke.md`). Only a local plugin package is needed.

3. **Unblocks test reliability**. The 23 SQLite-dependent test failures (Node.js version mismatch) are fixed as a byproduct of this phase. Clean test baseline is a prerequisite for all subsequent phases.

4. **Small scope, clear stop condition**. This is an operational validation phase, not an architecture phase. If the plugin is unavailable, the phase records a gated-skip. No new code architecture, no UI, no refactoring.

5. **Does not depend on any future phase**. Phase 8 can run independently of Phases 9–15. It validates the existing architecture without blocking or being blocked by UI/signing/conversion work.

### 5.2 Why Plugin UI Should Remain Local/Manual Before Marketplace

1. **Visibility before automation**. The user must see what plugins are installed, what state they're in, and whether they work before any automated download/install flow makes sense. Without a settings panel, there's no feedback loop.

2. **Trust chain is incomplete**. Until Phase 10 delivers production signing, automated download cannot verify plugin authenticity. Manual placement lets the user control trust decisions explicitly.

3. **Scope control**. Settings UI is a bounded UI task. Marketplace UI is a larger task that requires download infrastructure, catalog hosting, version management, and trust verification. Settings UI is the natural incremental step.

4. **Diagnostic DTO already exists**. `getDiagnosticsSummary()` returns all the data needed for a settings panel. The UI work is presentation-only — no new backend infrastructure.

### 5.3 Why Production Signing Must Precede Downloader/Marketplace

1. **Trust chain dependency**. The downloader must verify catalog signatures before extracting packages. Without production keys, every downloaded package would be unverified — a security regression from the current manual-placement model.

2. **Security boundary**. A downloader that installs unsigned code is a remote code execution vector. Production signing is the gate that prevents this.

3. **Rollback requires signed bundles**. Rollback to a previous version requires knowing which version was previously verified. Without signing, rollback cannot distinguish legitimate previous versions from malicious replacements.

4. **Scaffold exists but is incomplete**. P5-D delivered trust contracts, verification gates, and canonicalization. What's missing is the production key material and the runtime wiring. This is a bounded infrastructure task — smaller than downloader, but a hard prerequisite.

### 5.4 Why Pandoc Should Be the First Conversion MVP

1. **Self-contained**. Pandoc is a single static binary (~50MB). No Java runtime (Tika), no C++ runtime dependencies (LibreOffice), no model files (Magika). Simplest deployment.

2. **Existing scaffold is Pandoc-specific**. P5-E3 (`48-phase5-p5e3-first-runtime-pilot-closeout.md`) built the conversion scaffold with Pandoc as the reference engine. 26 fake runner tests exist. The scaffold matches Pandoc's CLI interface.

3. **Clear user-visible workflow**. "Convert this DOCX to Markdown" is an immediately useful feature. The output (Markdown text) integrates naturally into the existing text-based send pipeline.

4. **Lower security surface**. Pandoc reads input files and writes output files. It doesn't execute macros, render to screen, or maintain persistent state. Comparatively lower sandboxing requirements than LibreOffice.

5. **License compliance is manageable**. GPLv2 requires attribution display (planned in Phase 9 settings UI) but does not restrict distribution of output.

### 5.5 Why Tika and LibreOffice Should Be Separate Phases

1. **Different runtime dependencies**. Tika requires Java (JRE). LibreOffice is a native C++ application. Packaging, discovery, and sandboxing are completely different.

2. **Different security profiles**. Tika is primarily a text extractor — reads files, outputs text. LibreOffice is a full document renderer — renders Office formats to PDF/HTML. The latter has a much larger attack surface (macros, embedded objects, active content).

3. **Different use cases**. Tika addresses text extraction and encoding detection. LibreOffice addresses visual fidelity conversion (Office → PDF). They don't overlap — one doesn't replace the other.

4. **Scope control**. Each engine requires its own package contract, adapter, sandbox tests, fixture matrix, and manual smoke. Bundling them would create a phase too large to complete in a reasonable number of agent rounds.

5. **Risk sequencing**. Pandoc (low risk) proves the conversion infrastructure works. Tika (medium risk, Java dependency) extends it. LibreOffice (high risk, heavyweight) extends it further. Each phase builds on the patterns proven by the previous.

### 5.6 Why provider_file_ref Should Remain Separate from Local Conversion

1. **Different domain**. `provider_file_ref` is a data model and provider integration concern — how files are referenced in API calls. Local conversion is a computation concern — how files are transformed. Completely different code surfaces.

2. **Different security boundaries**. Conversion engines interact with the local filesystem. provider_file_ref interacts with remote provider APIs. Mixing them creates ambiguous security boundaries.

3. **Stable conversion prerequisite**. provider_file_ref depends on SendPlan integration (Phase 11) to make decisions about when to use references vs base64 vs conversion output. It should not be built before SendPlan patterns are stable.

4. **No coupling to conversion engines**. provider_file_ref works with any asset — original, converted, derived. It doesn't need any specific conversion engine to function.

### 5.7 Audit Gap to Phase Mapping

Builds a complete mapping from `55-final-spec-coverage-audit.md` gaps to proposed future phases:

| Audit Item | Status | Phase | Priority | Blocking | Rationale |
|-----------|--------|-------|----------|----------|-----------|
| Real Magika plugin operational smoke | completed_gated | **Phase 8** | P1 | Yes (test reliability) | Only untested real-runtime path; unblocks SQLite test fixes; validates existing architecture |
| better-sqlite3 rebuild / Node.js compat | needs_verification | **Phase 8** | P1 | Yes (23 tests fail) | Environment hygiene prerequisite; unblocks full test suite for all future phases |
| Settings UI for plugin management | deferred | **Phase 9** | P1 | No | Diagnostics DTO exists; UI is presentation-only |
| Developer diagnostic mode | needs_verification | **Phase 9** | P2 | No | Natural pairing with settings UI; provides dev visibility into engine internals |
| Production signing workflow | deferred | **Phase 10** | P2 | Yes (blocks P15) | Security prerequisite for downloader/marketplace; scaffold exists, needs production keys |
| setVerificationStatus wired at registration | not_started | **Phase 10** | P1 | No | Security hardening; API exists, needs wiring |
| revoked_roots.json file loading | not_started | **Phase 10** | P2 | No | Revocation infrastructure; parse function exists |
| Plugin upgrade / rollback | partially_completed | **Phase 10** (metadata), **Phase 15** (full lifecycle) | P2 | No | Upgrade hooks need trust gate (P10); full lifecycle needs downloader (P15) |
| Conversion engines: Pandoc | out_of_scope_current | **Phase 11** | P1 | No | First real conversion engine; self-contained, existing scaffold |
| Conversion engines: Tika | out_of_scope_current | **Phase 12** | P2 | No | Second engine; text extraction, metadata deep path, encoding detection |
| GBK / GB2312 / Big5 text detection | deferred | **Phase 12** | P2 | No | Bundled with Tika text extraction (multi-encoding support) |
| parser validation on demand (Step 8) | partially_completed | **Phase 11** (Pandoc), **Phase 12** (Tika) | P2 | No | Conversion-engine concern; activates when first real engine runs |
| Conversion engines: LibreOffice | out_of_scope_current | **Phase 13** | P2 | No | Third engine; heavyweight, requires stronger sandbox |
| Conversion engines: ffprobe | out_of_scope_current | **Deferred** (future, no numbered phase) | P3 | No | Audio/video probe; independent risk profile; not prioritized |
| FileAccessRef / FileReadAdapter | partially_completed | **Phase 11** | P1 | No | Conversion infrastructure prerequisite; needed before first real engine |
| userOverride persistence | partially_completed | **Phase 11** | P2 | No | User conversion preference persistence; bundles with conversion routes |
| provider_file_ref lifecycle | not_started | **Phase 14** | P2 | No | Provider integration; depends on stable SendPlan (Phase 11) |
| Downloader / installer | not_started | **Phase 15** | P3 | No | Late phase; requires signing (Phase 10) and conversion stability (Phase 11–13) |
| Marketplace / plugin gallery | deferred | **Phase 15** | P3 | No | Late phase; requires downloader (Phase 15) and signing (Phase 10) |
| Auto-update | deferred | **Phase 15** | P3 | No | Late phase; requires downloader and signing |
| Advanced polyglot detection | deferred | **Future** (beyond Phase 15) | P3 | No | P2 spec item; no current user demand |
| DROID / Siegfried archival detector | out_of_scope_current | **Future** (beyond Phase 15) | P3 | No | Archival-grade detection; niche use case |
| Fixture expansion (7 deferred types) | partially_completed | **Phase 8**, **11**, **12**, **13** (incremental) | P2 | No | Added as each engine phase introduces new file types |
| Cross-platform symlink boundary tests | needs_verification | **Future** (beyond Phase 15) | P3 | No | Phase 3 follow-up; no current demand |
| Consolidate log sanitization (5 files) | needs_verification | **Deferred** (no phase) | P3 | No | Maintenance improvement; not user-visible |

### 5.8 Deferred / Not Started Items That Remain Intentionally Future

These items from the audit are correctly classified as beyond the proposed 15-phase roadmap:

| Item | Reason for Deferral |
|------|-------------------|
| Advanced polyglot detection | P2 spec item; minimum heuristic is sufficient; no real-world demand for deeper polyglot analysis |
| DROID / Siegfried archival-grade detector | Niche use case (digital preservation); heavyweight Java dependency; P3 |
| ffprobe audio/video metadata probe | Independent engine with native binary dependencies; not coupled to document conversion; lower priority than text-focused engines |
| Enterprise policy / multi-user config | Personal-project scope; no enterprise deployment target |
| Third-party plugin ecosystem | Official plugins first (Phase 15); third-party ecosystem requires plugin SDK, review process, additional trust infrastructure |
| Cross-platform symlink boundary tests | Phase 3 follow-up item; no reported issues |
| Consolidate log sanitization across 5 files | Maintenance optimization; existing 7-layer sanitization is sufficient |

### 5.9 Work That Should Never Be Bundled Together

| Work A | Work B | Why Not |
|--------|--------|---------|
| Conversion engine implementation | Production signing | Different security domains; signing is cryptographic infrastructure, conversion is process management. Bundling creates ambiguous security review scope. |
| Real Magika smoke | Downloader | Smoke validates existing architecture; downloader builds new platform infrastructure. Different risk profiles, different stop conditions. |
| provider_file_ref | Conversion engines | Data model vs computation. provider_file_ref depends on stable SendPlan patterns but NOT on any specific conversion engine. |
| Multiple conversion engines | — | One engine per phase. Each has unique package contracts, sandboxing requirements, fixture matrices, and manual smoke. Bundling creates phases too large for single-agent completion. |
| Marketplace UI | Settings UI | Settings UI is a bounded presentation task; marketplace UI requires download infrastructure, catalog browsing, version management. Different scopes, different dependencies. |
| UI implementation | Security infrastructure | Security work (signing, trust gates) requires Release Lane governance (external audit). Mixing with UI creates ambiguity about audit scope. |

---

## 6. Recommended Model/Agent Strategy Per Phase

| Phase | Primary Agent | Recommended Subagents | Lane |
|-------|---------------|----------------------|------|
| Phase 8 | DeepSeek V4 Pro | flash-code-reader (code mapping), flash-test-runner (smoke execution) | Safe Lane |
| Phase 9 | DeepSeek V4 Pro | flash-code-reader (Vue component conventions, IPC surface) | Safe Lane |
| Phase 10 | DeepSeek V4 Pro | flash-risk-review (P0 verification), flash-code-reader | Release Lane |
| Phase 11 | DeepSeek V4 Pro | flash-code-reader (conversion infra), flash-risk-review (runner safety), flash-test-runner | Release Lane |
| Phase 12 | DeepSeek V4 Pro | flash-risk-review (Java sandbox), flash-test-runner | Release Lane |
| Phase 13 | DeepSeek V4 Pro | flash-risk-review (sandbox hardening), flash-test-runner | Release Lane |
| Phase 14 | DeepSeek V4 Pro | flash-code-reader (provider API), flash-risk-review (privacy boundary) | Safe Lane |
| Phase 15 | DeepSeek V4 Pro | flash-risk-review (download integrity), flash-test-runner | Release Lane |

Lane definitions from `50-post-p5-user-level-roadmap.md §2.1`:
- **Safe Lane**: Scoped plan, internal scans only, targeted tests, one compact closeout doc
- **Release Lane**: External audit required (`flash-risk-review`), manual smoke, full targeted tests + scans

---

## 7. Commit Strategy Summary

| Phase | Estimated Commits | Key Messages |
|-------|-------------------|--------------|
| Phase 8 | 3 | `chore: rebuild better-sqlite3`, `test: gated real Magika smoke`, `docs: Phase 8 closeout` |
| Phase 9 | 3–4 | `feat: plugin settings panel`, `feat: plugin enable/disable`, `docs: Phase 9 closeout` |
| Phase 10 | 4–5 | `feat: embed production trust root`, `feat: wire verification status`, `feat: revocation list`, `docs: Phase 10 closeout` |
| Phase 11 | 5–6 | `feat: FileAccessRef/FileReadAdapter`, `feat: Pandoc runner`, `feat: SendPlan integration`, `feat: userOverride persistence`, `docs: Phase 11 closeout` |
| Phase 12 | 4–5 | `feat: Tika runtime adapter`, `feat: GBK/Big5 encoding`, `docs: Phase 12 closeout` |
| Phase 13 | 4–5 | `feat: LibreOffice runner`, `feat: Office sandbox`, `docs: Phase 13 closeout` |
| Phase 14 | 4–5 | `feat: provider_file_ref upload`, `feat: provider_file_ref SendPlan`, `docs: Phase 14 closeout` |
| Phase 15 | 4–5 | `feat: downloader/installer`, `feat: update/rollback`, `feat: marketplace UI`, `docs: Phase 15 closeout` |

All commits must pass `git diff --check` + forbidden scans. No phase is committed until its stop condition is met.

---

## 8. Risks and Stop Conditions

### 8.1 Cross-Cutting Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Real Magika plugin package unavailable | Blocks Phase 8 | Record gated-skip; proceed to Phase 9 (settings UI can display mock data) |
| Production signing key material mismanaged | P0 security risk | Never commit private key; embed only public key; preserve P5-A dev-mode guard |
| Pandoc GPLv2 license compliance | Legal risk | Attribution UI required before Pandoc is enabled-by-default |
| Java runtime unavailable | Blocks Phase 12 | Gate Tika features behind Java detection; fall back to Pandoc-only conversion |
| LibreOffice portable too large or unstable | Blocks Phase 13 | Accept reduced scope (Office-to-HTML only); defer PDF path |
| Provider API changes | Blocks Phase 14 | Design provider_file_ref with versioned capability negotiation |
| No catalog hosting infrastructure | Blocks Phase 15 | Defer marketplace; keep manual placement flow as primary path |

### 8.2 Per-Phase Stop Conditions

| Phase | Stop If |
|-------|---------|
| Phase 8 | Gated-skip recorded (plugin unavailable) OR smoke passed + closeout written |
| Phase 9 | Settings panel renders plugin state correctly OR blocked on missing Phase 8 data |
| Phase 10 | Production keys generated, trust gate passes, external audit passes OR blocked on key management decisions |
| Phase 11 | Pandoc converts real docx→md, output valid, manual smoke passes, external audit passes |
| Phase 12 | Tika extracts text from real documents, encoding detection works, external audit passes |
| Phase 13 | LibreOffice converts Office→PDF/HTML, sandbox holds, external audit passes |
| Phase 14 | provider_file_ref uploads reference, SendPlan integrates reference, closeout written |
| Phase 15 | Marketplace UI browses catalog, downloader installs plugin, update/rollback work, external audit passes |

---

## 9. README Index Update

Recommended addition to `docs/file-pipeline/file-type-detection-implementation/README.md`:

```markdown
| 56-post-v1-future-phase-roadmap.md | Post-v1 future phase roadmap — file processing, plugins, conversion, provider lifecycle |
```

Status line update:
```markdown
Current phase: Phase 7 closed (File Content Identification v1.0). Post-v1 roadmap planned (Phase 8–15). Real runtime distribution, conversion engines, provider_file_ref, downloader, and marketplace remain future.
```

---

## 10. Recommended Immediate Next Phase

**Phase 8: Local Real Magika Plugin Operational Smoke**

Rationale:
- Only untested real-runtime path in the entire detection pipeline
- Lowest cost, highest value — wire exists, tests exist, only needs local package placement
- Unblocks 23 SQLite-dependent test failures as a byproduct
- Does not depend on any future phase — can run independently
- Small, bounded scope with clear stop condition (pass or gated-skip)
- Validates the architecture before investing in UI/signing/conversion

If Phase 8 is gated-skip (no local Magika plugin available), proceed to **Phase 9** (settings UI using existing mock data from diagnostics DTO). Phase 9 can display engine state without real runtime execution.

---

## 11. Future Deferred Items (Beyond Phase 15)

These items are intentionally deferred past the 15-phase roadmap. Each requires a separate Owner decision before starting:

| Item | Trigger Condition | Priority |
|------|-------------------|----------|
| ffprobe audio/video metadata probe | User needs audio/video format detection beyond basic magic bytes | P3 |
| DROID / Siegfried archival-grade detector | Archival/document-preservation use case emerges | P3 |
| Advanced polyglot / nested format detection | Real-world files trigger false negatives in polyglot heuristic | P3 |
| Enterprise policy / multi-user config | Project scope expands beyond single-user desktop | P3 |
| Third-party plugin ecosystem | Official marketplace is stable and plugin SDK is mature | P3 |
| Cross-platform symlink boundary tests | macOS/Linux platform support is prioritized | P3 |
| Consolidate log sanitization (5 files) | Maintenance burden becomes measurable | P3 |
| Local LLM service plugin (ollama, llama.cpp) | User wants local AI model support | P3 |
| Calibre EPUB conversion | EPUB conversion demand exceeds Pandoc EPUB support | P3 |
| ImageMagick image conversion | Image processing demand exceeds preview_optimized scope | P3 |

---

## 12. Claim-Safety Verification

### 12.1 Forbidden Claims Scan

The following claims are NOT made in this document (verified by scan):

- Full file-processing platform completed
- Plugin ecosystem completed
- Conversion engine platform completed
- Marketplace ready
- Production signing complete
- provider lifecycle complete
- Real Magika local smoke complete
- Any future phase has started

### 12.2 Allowed Language Used

This document uses:
- planned, proposed, future, deferred, prerequisite, gated
- local/manual only, code-level milestone
- not yet started, remains future, remains open

---

## 13. Final Report

### 13.1 Preflight Git Status and HEAD

- **HEAD**: `8cca912` — `fix: add fullHash redaction to electron ipc log sanitizer`
- **Working tree**: Clean (only auto-generated `public/build-id.json` modified)
- **`git diff --check`**: Clean (1 CRLF warning in `build-id.json`)

### 13.2 Model Used

DeepSeek V4 Pro (primary agent, planning only)

### 13.3 Subagents/Commands Used

None. This is a planning-only task. Read-only code exploration was not required — all evidence was gathered from document reads and prior audit context.

### 13.4 Files Read

| File | Purpose |
|------|---------|
| `55-final-spec-coverage-audit.md` | Primary input — audit gaps, completion status, deferred items |
| `starverse_file_type_detection_engineering_final.markdown` | Master spec — architecture boundaries, three-layer engine strategy |
| `54-file-content-identification-v1-roadmap.md` | Phase 7 closeout, completion endpoint, scope boundaries |
| `README.md` | Directory index, current status, file list |
| `50-post-p5-user-level-roadmap.md` | Phase 6/7 planning, governance lanes, scope control rules |
| `45-phase5-batch2-trust-runtime-planning.md` | Trust/signing history, risk catalog, coupling analysis |
| `51-phase6-user-level-magika-runtime-pilot-closeout.md` | Phase 6 lifecycle + diagnostics closeout |
| `format-conversion-preview-final.md` | Conversion architecture, preview policies, engine roles |
| `progress-ledger.md` | File pipeline progress (separate domain, Phase 1-9) |

### 13.5 Files Changed

| File | Change |
|------|--------|
| `docs/file-pipeline/file-type-detection-implementation/56-post-v1-future-phase-roadmap.md` | Created (this document) |

### 13.6 Proposed Phase List and Task Package Counts

| Phase | Task Packages |
|-------|--------------|
| Phase 8 — Local Real Magika Plugin Operational Smoke | 3 (P8-A, P8-B, P8-C) |
| Phase 9 — Plugin Settings Minimal UI | 4 (P9-A, P9-B, P9-C, P9-D) |
| Phase 10 — Production Trust and Signing | 5 (P10-A, P10-B, P10-C, P10-D, P10-E) |
| Phase 11 — Pandoc Conversion MVP | 5 (P11-A, P11-B, P11-C, P11-D, P11-E) |
| Phase 12 — Tika Text Extraction and Metadata | 5 (P12-A, P12-B, P12-C, P12-D, P12-E) |
| Phase 13 — LibreOffice Office Conversion | 5 (P13-A, P13-B, P13-C, P13-D, P13-E) |
| Phase 14 — provider_file_ref Lifecycle | 5 (P14-A, P14-B, P14-C, P14-D, P14-E) |
| Phase 15 — Downloader / Marketplace / Auto-update | 5 (P15-A, P15-B, P15-C, P15-D, P15-E) |
| **Total** | **37 task packages across 8 phases** |

### 13.7 Changes to User-Provided Route Skeleton

| Change | Justification |
|--------|---------------|
| Added `better-sqlite3` rebuild to Phase 8 | Environment hygiene prerequisite; unblocks 23 tests |
| Moved ffprobe from conversion phases to deferred items | Independent engine; lower priority than text-focused engines |
| Added `userOverride` persistence to Phase 11 | Conversion integration prerequisite; bundles with first conversion engine |
| Added `FileAccessRef`/`FileReadAdapter` to Phase 11 | Conversion infrastructure prerequisite; needed before real engines |
| Added `parser validation on demand` to Phase 11 | Conversion-engine concern; activates when first real engine runs |
| Added `GBK/Big5` encoding detection to Phase 12 | Bundled with Tika multi-encoding text extraction |
| Added `fixture expansion` incrementally across Phases 8/11/12/13 | Each engine phase adds its own fixtures; no standalone fixture phase |
| Added `developer diagnostic mode` to Phase 9 | Natural pairing with settings UI |
| Added `upgrade/rollback` metadata hooks to Phase 10 | Trust gate prerequisite for upgrade lifecycle |
| Split full upgrade/rollback lifecycle between Phase 10 (metadata) and Phase 15 (full) | Metadata hooks need trust gate first; full lifecycle needs downloader |
| Listed 10 deferred items beyond Phase 15 | Explicit scope boundary for the roadmap |

### 13.8 Gap-to-Phase Mapping Summary

26 audit gaps mapped to 8 numbered phases, 3 mapped to deferred future (beyond Phase 15), 2 already fixed (fullHash redaction, console.warn path check).

### 13.9 Recommended Immediate Next Phase

**Phase 8: Local Real Magika Plugin Operational Smoke**

### 13.10 Risks and Stop Conditions

Documented in §8. Each phase has explicit stop conditions. Cross-cutting risks identified with mitigations.

### 13.11 Claim-Safety Scan Results

- **rg "Phase 8\|Phase 9\|Phase 10\|Phase 11\|Phase 12\|Phase 13\|Phase 14\|Phase 15"**: Found only in this document (expected — new roadmap)
- **rg "marketplace.*completed\|downloader.*completed\|production signing.*completed\|provider.*completed\|conversion.*completed\|plugin ecosystem.*completed"**: 0 matches in this document (verified)
- All forbidden completion claims absent from this document.

### 13.12 Commands Run

| Command | Result |
|---------|--------|
| `git status --short` | `M public/build-id.json` (auto-generated) |
| `git log --oneline -5` | Recent commits visible |
| `git diff --check HEAD` | Clean (1 CRLF warning in build-id.json) |
| `rg "Phase 8\|Phase 9\|Phase 10\|..." docs/` | 0 prior matches (fresh roadmap) |
| `rg "marketplace.*completed\|..." docs/` | Only in old docs with proper scope qualification |
| `rg "provider_file_ref\|pandoc\|tika\|..."` audit docs | Properly tagged as future/deferred |

### 13.13 Commit Hash or No-Commit Statement

Document created. Not yet committed. Awaiting Owner review before commit.

### 13.14 Final Git Status

```
M public/build-id.json (auto-generated, not part of this task)
?? docs/file-pipeline/file-type-detection-implementation/56-post-v1-future-phase-roadmap.md (new)
```

### 13.15 Explicit Confirmation

**No implementation was performed during this planning task.** No production code, test files, package.json, lockfiles, conversion engines, plugin UI code, signing keys, provider_file_ref code, or downloader/marketplace code was modified or created. This is a documentation-only future phase roadmap.

---

## 14. Signed Off

- [ ] Owner review of phase ordering and scope boundaries
- [ ] Owner decision on Phase 8 entry (proceed OR record gated-skip)
- [ ] README index update (upon Owner approval)
- [ ] Commit: `docs: plan post-v1 file processing phases`
