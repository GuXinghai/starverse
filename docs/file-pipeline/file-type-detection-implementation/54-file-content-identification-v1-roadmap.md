# 54. File Content Identification v1.0 Remaining Phase Plan

**Status**: Planning only — no implementation, no production code changes, no real runtimes
**Date**: 2026-05-11
**Phase**: Post-Phase-6 remaining phase proposal
**Parent docs**: `50-post-p5-user-level-roadmap.md`, `53-phase6-magika-lifecycle-integration.md`, `starverse_file_type_detection_engineering_final.markdown`

本 roadmap 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。
Full plugin ecosystem remains future. Conversion engines remain future. Downloader/marketplace remain future.

---

## 1. Current Implementation State

### 1.1 Completed Core Detection Work

| Area | Status | Reference |
|------|--------|-----------|
| FileAccessRef / FileReadAdapter | Implemented | Phase 1 MVP (A~K) |
| FileTypeDetectionState job state machine | Implemented | Phase 1 MVP |
| FileTypeVerdict data model | Implemented | Phase 1 MVP |
| Taxonomy + taxonomyMap | Implemented | Phase 1 MVP |
| magicDetector (header magic, strong signatures) | Implemented | Phase 1 MVP |
| textProbe (UTF-8/16, GBK, encoding, BOM) | Implemented | Phase 1 MVP |
| Container probe (OOXML, ODF, EPUB, ZIP, OLE CFB) | Implemented | Phase 1 MVP |
| evidenceMerge (priority rules, tie-breakers) | Implemented | Phase 1 MVP |
| fileTypeStaticPolicy (preview modes, blocked flags) | Implemented | Phase 1 MVP |
| sendRouteMapping (SendPlanCandidate generation) | Implemented | Phase 1 MVP |
| FileTypeCache (version-keyed, fingerprint-bound) | Implemented | Phase 1 MVP |
| User override (SendPlan-only, no evidence mutation) | Implemented | Phase 1 MVP |
| Polyglot minimum heuristic | Implemented | Phase 1 MVP |
| Magika mock adapter + taxonomy label mapping | Implemented | Phase 1 MVP |
| detectBasic (magic + text + extension, no Magika) | Implemented | Phase 1 MVP |
| detectFull (magic + text + Magika mock + container) | Implemented | Phase 1 MVP |

### 1.2 Completed Trust / Runtime Scaffold Work

| Area | Status | Reference |
|------|--------|-----------|
| P5-A: Production dev-mode guard (BL-06) | Completed | `43` |
| P5-B: messageAsset IPC sanitization (BL-07) | Completed | `43` |
| P5-C: Batch 1 security closeout + external audit | Completed | `44` |
| P5-D1: Trust contracts (VerificationBinding, TrustVerificationStatus, etc.) | Completed | `46` |
| P5-D2: Production verification gate (fail-closed) | Completed | `46` |
| P5-D3: Root rotation / revocation scaffold (parsers + filters) | Completed | `46` |
| P5-E1: Runtime package inventory contract (PackageFileEntry, validation, path safety) | Completed | `47` |
| P5-E2: Fake Magika pre-stage package scaffold (50 tests) | Completed | `47` |
| P5-E3: Pandoc conversion runtime pilot scaffold (26 tests, fake) | Completed | `48` |
| P5-E4: Packaging regression / smoke scaffold (40 tests, fake) | Completed | `49` |
| Trust gate hotfix (`092811b`): verificationStatus undefined fail-open closed | Completed | `47 §8` |

### 1.3 Completed Magika Local Lifecycle Work

| Area | Status | Reference |
|------|--------|-----------|
| P6-A: registerLocalPackage (local/manual package lifecycle) | Completed | `51` |
| P6-B: getDiagnosticsSummary (combined engine view) | Completed | `51` |
| P6-C: Magika managed plugin loader wired to detectFull | Completed | `51`, `2cf3bfc` |
| P6-C: Pure JS Magika runtime smoke (external, passed) | Completed | `52`, `056ad40` |
| P6-C: Lifecycle integration tests (register→enable→health→diagnostics→disable→uninstall, 21 tests) | Completed | `53`, `f92e673` |
| `install_source` CHECK constraint updated (`local_package`) | Completed | `53` |

### 1.4 Currently Open Real Integration Gaps

| Gap | Status | Severity |
|-----|--------|----------|
| Real Magika `detectFull` end-to-end via managed pure JS runtime | **Open** — loader wired, pure JS smoke passed externally, but the full chain (Node.js child process → `ExternalProcessRunner` → `createMagikaClassifyCallback` → `magikaRuntimeLoader.load()` → `detectFull` with real Magika evidence) has not been exercised end-to-end | P0 |
| Production signing workflow (key generation, offline signing tool) | **Open** — scaffold contracts exist, canonicalization exists, no actual production keys or signing tool | P2 |
| Production public key embedded in build | **Open** — production gate exists but no consumer wires `isProduction=true` with embedded key | P2 |
| `setVerificationStatus` not wired into plugin registration | **Open** — API exists but not called at registration time | P1 |
| `revoked_roots.json` file loader | **Open** — parse function exists, no file loading | P2 |
| Settings UI for plugin management (P6-B UI was planned but not implemented) | **Open** — diagnostics DTO exists, no renderer-side settings panel | P1 |

---

## 2. Original Engineering Document Alignment

Comparison of current status against `starverse_file_type_detection_engineering_final.markdown`:

### 2.1 Phase 1 Core Identification (Section 17.1)

| Original Requirement | Status |
|----------------------|--------|
| FileAccessRef接入完成，renderer不持有绝对路径 | Implemented |
| detectBasic / detectFull 均有jobId和状态机 | Implemented |
| 写回verdict前校验currentJobId与fingerprint | Implemented |
| 内置magic可识别常见二进制格式 | Implemented |
| 文本与编码探针可识别UTF-8/UTF-16/GBK基础文本 | Implemented |
| Magika可接入并返回evidence | **Scaffolded** — mock adapter works; real pure JS runtime smoke passed externally; end-to-end `detectFull` via managed runtime open |
| Magika label经taxonomyMap映射后进入内部FileFormatId | Implemented |
| 容器探针可区分docx/xlsx/pptx/odt/ods/odp/epub/jar/apk | Implemented |
| FileTypeVerdict数据结构稳定 | Implemented |
| SendPlanCandidate可生成并驱动UI展示 | Implemented |
| PreviewMode能表达安全预览可用但原生预览禁用 | Implemented |
| 基础UI能显示识别结果、置信度和冲突 | Implemented |

### 2.2 Phase 2 Plugin & External Engine (Section 17.2)

| Original Requirement | Status |
|----------------------|--------|
| 插件manifest可读取 | Implemented |
| 插件完整性可校验 | Implemented |
| 插件可启用、禁用、升级、回滚 | Partially implemented — lifecycle scaffold exists (register/enable/disable/uninstall); upgrade/rollback not implemented |
| 外部引擎必须用户显式启用 | Scaffolded — policy exists, not wired to real engines |
| PATH自动发现不自动执行 | Not implemented — no PATH discovery exists |
| 外部引擎有timeout和输出限制 | Implemented (ExternalProcessRunner) |
| 外部引擎超时后process tree被终止 | Implemented |
| 普通日志不记录绝对路径 | Implemented (sanitization in place) |
| 容器探针覆盖zip slip/encrypted/zip64/重复entry/伪OOXML | Implemented |
| OLE CFB至少能识别ole_cfb或legacy_office_unknown | Implemented |
| 文本探针能正确处理UTF-16/GBK/超长单行文本 | Implemented |
| polyglot_suspected最小启发式可识别并默认阻止发送 | Implemented |

### 2.3 Phase 3 Engineering Quality (Section 17.3)

| Original Requirement | Status |
|----------------------|--------|
| fixture使用expected.json黄金样本 | Partially implemented — test pattern exists |
| Magika score漂移不会导致脆弱测试 | Scaffolded — mock adapter tests are stable; real runtime tests not yet written |
| 错误扩展名样本可触发冲突 | Implemented |
| 高风险类型默认blocked | Implemented |
| 大文件不会阻塞renderer | Implemented |
| 缓存key包含taxonomyVersion/taxonomyMapVersion等 | Implemented |
| 缓存可命中并可失效 | Implemented |
| cache hit不作为evidence source | Implemented |
| 引擎不可用时可降级 | Implemented (fallback to lightweight detection) |
| 用户覆盖不删除原始evidence | Implemented |
| 用户覆盖不污染detection cache | Implemented |
| 模型切换只重算SendPlan，不重复检测文件 | Implemented |

### 2.4 MVP Must-Have vs Can-Defer (Section 19)

| Original Category | Items | Status |
|-------------------|-------|--------|
| MVP must include | All items listed | Implemented or scaffolded; Magika is the only item at scaffold level needing real completion |
| MVP can defer | Tika/LibreOffice/DROID/Siegfried/full container recursion | Correctly deferred |
| P0 | FileAccessRef, taxonomy, verdict, evidence merge, PreviewMode, SendPlan, log sanitization | Implemented |
| P1 | Container probe safety, text probe bounds, cache key, user override, fixture framework, polyglot minimum | Implemented |
| P2 | Plugin signing/trustedRoot, OLE subdivision, advanced polyglot, DROID, enterprise policy | Partially scaffolded (trust contracts exist); the rest correctly deferred |

---

## 3. Proposed Completion Endpoint

### 3.1 Endpoint Name

**File Content Identification v1.0**

### 3.2 What Counts as Complete

The file content identification system is v1.0 complete when:

1. **Real Magika classification runs end-to-end** through the managed pure JS runtime in a Node.js child process, producing valid `FileTypeEvidence` that flows into `detectFull`, with taxonomy label mapping and model version provenance intact.

2. **Fallback works when Magika is unavailable** — `detectBasic` never uses Magika; `detectFull` degrades gracefully to lightweight detection (magic, text probe, container probe) with no crash, no hang, and a clear diagnostic event indicating the fallback reason.

3. **Cache/freshness/version lifecycle** is verified end-to-end: Magika model version changes invalidate cache; model version is tracked in provenance; stale detection correctly triggers re-detection.

4. **Privacy and log safety** is verified under real runtime execution: no raw paths, no content tokens, no full hashes in ordinary logs; external process arguments sanitized; renderer IPC surfaces contain only engine IDs, status codes, and sanitized failure reasons.

5. **Manual smoke passes** — a real file (e.g., `package.json`) is classified correctly through the full chain, with visible diagnostics showing the classification label, score, model version, and engine health status.

### 3.3 What Remains Outside the Endpoint

Explicitly excluded from the v1.0 completion endpoint:

- All document conversion engines (Pandoc, Tika, LibreOffice, ffprobe)
- Downloader / installer / auto-update
- Marketplace / plugin gallery UI
- Settings UI for plugin management (diagnostics DTO exists; UI is deferred)
- Production signing workflow (key generation, offline signing tool)
- Production public key embedding
- `revoked_roots.json` file loading
- `provider_file_ref` implementation
- Enterprise policy / multi-user config
- Second runtime engine (only Magika is required for v1.0)
- Full plugin ecosystem

---

## 4. Remaining Phase Proposal

**One phase remains: Phase 7 — File Content Identification v1.0**

Previous roadmap docs proposed Phase 6 for lifecycle + UI + first real pilot, and Phase 7 for expansion + conversion integration. Given current status (Phase 6 lifecycle and diagnostics completed, pure JS Magika smoke passed), the remaining work to reach file content identification v1.0 is one bounded phase with four subpackages. Conversion expansion and UI remain outside this completion target.

### 4.1 P7-A: Real Magika detectFull End-to-End

**Purpose**: Connect the pure JS Magika runtime to `detectFull` through a real Node.js child process managed by `ExternalProcessRunner`, producing valid classification evidence.

**Allowed scope**:
- Create a Magika pure JS runtime entry script (`.mjs`) that follows the existing argv contract (`--model-dir`, `--config-dir`, `--input`, `--output-json`)
- Wire `ExternalProcessRunner` to spawn the pure JS Magika runtime as a child process
- Implement or update `createMagikaClassifyCallback` to consume real child process output (JSON with `{ label, score, modelVersion }`)
- Verify the loader path: `buildMagikaRuntimeLoader()` → `createManagedPluginMagikaRuntimeLoader` → `load()` returns `{ available: true, runtimeKind: 'pure_js' }` → `classify(filePath)` returns valid classification
- Verify `detectFull` consumes Magika evidence when runtime is available
- Verify Magika label goes through `taxonomyMap` before entering `FileFormatId`
- Verify model version appears in `VerdictProvenance.magikaModelVersion`

**Explicit non-goals**:
- No Python CLI route
- No tfjs-node native route
- No downloader — local `.starverse-engines/magika/` only
- No second runtime engine
- No conversion workflow
- No changes to `detectBasic`

**Expected deliverables**:
- Real Magika child process execution path in `detectFull`
- Test proving `detectFull` produces Magika-sourced `FileTypeEvidence` with correct `source: 'magika'`
- Test proving fallback when runtime process fails or times out

**Acceptance criteria**:
- A test file (e.g., `package.json`) classified as `json` with score >= 0.99 through the full `detectFull` pipeline
- Model version `standard_v3_3` recorded in provenance
- Child process timeout and error handling tested
- No new production dependencies (pure JS runtime uses existing `magika` + `@tensorflow/tfjs` in `.starverse-engines/`)

**Stop condition**: `detectFull` produces real Magika evidence through a managed child process, or Owner decides to defer real runtime and accept mock-only Magika as v1.0.

### 4.2 P7-B: Version, Cache, Freshness, and Fallback Hardening

**Purpose**: Ensure the Magika model version lifecycle is correct, cached verdicts invalidate on model version change, and fallback behavior is complete.

**Allowed scope**:
- Verify `FileTypeCacheKey.magikaModelVersion` is populated correctly
- Verify cache invalidates when Magika model version changes
- Verify stale detection marker (`engine_version_changed`) triggers re-detection
- Verify fallback chain: Magika unavailable → lightweight detection still works → `detectFull` returns valid verdict without Magika evidence
- Add diagnostic event for Magika fallback (`engine_unavailable` with Magika engine ID)
- Sanitize all fallback error messages (no raw paths, no process output fragments)

**Explicit non-goals**:
- No new cache infrastructure
- No Magika model auto-update
- No model version negotiation / minimum version enforcement

**Expected deliverables**:
- Cache invalidation test with model version change
- Fallback test: Magika runtime missing → `detectFull` works without it
- Fallback diagnostic event recorded

**Acceptance criteria**:
- Cached verdict invalidated when `magikaModelVersion` in cache key differs from current
- `detectFull` returns valid verdict when Magika is unavailable
- Diagnostic event shows `engine_unavailable` with Magika engine ID

**Stop condition**: Cache/freshness and fallback behavior verified and tested.

### 4.3 P7-C: Privacy and Log Audit for Real Runtime Path

**Purpose**: Run targeted scans and manual verification that real Magika child process execution does not leak paths, tokens, or hashes.

**Allowed scope**:
- Verify `ExternalProcessRunner` sanitizes stderr/stdout before logging
- Verify health check failure messages are sanitized (existing `sanitizeStoredFailureReason`)
- Verify renderer IPC surface exposes only engine IDs, status codes, and sanitized messages
- Run targeted grep scans: absolute paths, content token, console.log leaks, `shell:true`
- Verify `externalProcessPolicy` is applied to Magika child process (shell: false, timeout, output cap)

**Explicit non-goals**:
- No full security audit
- No external audit (release lane not required for file identification v1.0 — no real runtime binary distribution)

**Expected deliverables**:
- Scan results confirming no path/token/hash/shell:true leaks
- Test proving sanitization of process error output

**Acceptance criteria**:
- 0 hits on absolute path scan in ordinary log paths
- 0 hits on contentToken scan in renderer IPC
- 0 hits on `shell:true` in process spawn code for Magika

**Stop condition**: Privacy scans pass with real runtime child process path exercised.

### 4.4 P7-D: Manual Smoke and Closeout

**Purpose**: Run the full end-to-end flow manually, document results, and close Phase 7.

**Allowed scope**:
- Start application with local Magika package in `.starverse-engines/magika/`
- Register local package via `registerLocalPackage`
- Run health check; confirm engine shows `healthy`
- Run `detectFull` on a known file; confirm Magika evidence present
- Run `getDiagnosticsSummary`; confirm Magika appears with correct metadata
- Disable Magika; confirm `detectFull` falls back gracefully
- Enable Magika; confirm `detectFull` uses Magika again
- Inspect logs for path/token/hash leaks
- Document all results in a closeout doc

**Explicit non-goals**:
- No Electron packaged smoke (dev mode smoke is sufficient for v1.0)
- No manual smoke on multiple platforms (Windows only for now)
- No conversion engine smoke
- No Pandoc smoke

**Expected deliverables**:
- Manual smoke results documented
- Phase 7 closeout document
- README update reflecting v1.0 completion status

**Acceptance criteria**:
- Full lifecycle chain works: register → enable → health → detectFull with Magika evidence → disable → fallback → enable → detectFull with Magika again
- No privileged information in logs
- All existing tests (329+) still pass

**Stop condition**: Manual smoke complete, closeout documented. File content identification v1.0 declared complete.

---

## 5. Scope Boundaries

### 5.1 Current Project: File Content Identification

| Feature | Status |
|---------|--------|
| Built-in magic/text/container detection | Implemented |
| Magika classification (mock adapter) | Implemented |
| Magika classification (real pure JS runtime) | **Phase 7 target** |
| Evidence merge and verdict generation | Implemented |
| Static policy and preview modes | Implemented |
| Send route mapping | Implemented |
| Cache with version-keyed invalidation | Implemented |
| User override (SendPlan only) | Implemented |
| Polyglot minimum detection | Implemented |
| Plugin lifecycle (register/enable/disable/uninstall) | Implemented |
| Diagnostics summary | Implemented |
| Trust contracts (verification binding, revocation scaffold) | Scaffolded |
| External process safety layer | Implemented |
| Package inventory contract (path safety, validation) | Scaffolded |

### 5.2 Reserved Future Extensions

These interfaces and patterns are reserved for future conversion/runtime/plugin-platform projects but are **not** part of the current v1.0 completion target:

| Extension | Reserved Interface | Current Status |
|-----------|-------------------|----------------|
| Pandoc conversion | `conversionRuntimePackage.ts`, `pandocRunner.ts`, `createConversionRuntimeInventory()` | Fake scaffold only |
| Tika extract/metadata | `tikaRunner.ts`, `externalEngineManifest.ts` | Fake scaffold only |
| LibreOffice conversion | `libreOfficeRunner.ts`, `externalEngineManifest.ts` | Fake scaffold only |
| ffprobe metadata | `ffprobeRunner.ts`, `externalEngineManifest.ts` | Fake scaffold only |
| Downloader / installer | `installRootKind`, `installRef`, `managed_cache` | Not implemented |
| Marketplace / catalog | `pluginCatalog.ts`, `pluginCatalogSignature.ts` | Scaffold exists; no real catalog distribution |
| Auto-update | — | Not implemented |
| Enterprise policy | — | Not implemented |
| provider_file_ref | — | Not implemented |
| Full plugin ecosystem | `enginePluginLifecycleService.ts`, IPC handlers | Scaffold exists; no multi-engine production lifecycle |
| Settings UI | `enginePluginLifecycleClient.ts`, diagnostics DTO | DTO exists; no renderer-side settings panel |

---

## 6. Plugin Interface Reservation

The following interfaces were built during P4–P6 and should remain available for future conversion engines. They are **reserved**, not **required** for v1.0 completion:

| Interface | Location | Reserved For |
|-----------|----------|-------------|
| Runtime package inventory | `enginePackageContract.ts` | Future conversion engine packaging |
| Package artifact classes (9 types) | `enginePackageContract.ts:PackageArtifactClass` | Future engine file classification |
| Conversion runtime inventory factory | `conversionRuntimePackage.ts` | Pandoc/Tika/LibreOffice/ffprobe packaging |
| ExternalProcessRunner safety boundary | `externalProcessRunner.ts` | All future external engines |
| ExternalProcessPolicy | `externalProcessPolicy.ts` | Safety enforcement for all future engines |
| Trust verification gate | `enginePluginTrustContracts.ts`, `externalEngineHealth.ts` | Future production engine signing |
| Plugin lifecycle states | `enginePluginLifecycleService.ts` | Future multi-engine lifecycle management |
| Diagnostics DTO | `getDiagnosticsSummary`, `EngineDiagnosticsEntry` | Future settings UI |
| sendRouteMapping extension points | `sendRouteMapping.ts`, `SendPlanCandidate` | Future conversion route integration |
| Engine capability model | `externalEngineRegistry.ts`, `ExternalEngineRecord` | Future engine discovery |

**No part of v1.0 completion requires implementing any conversion engine.**

---

## 7. Governance Level

Phase 7 follows the **Safe Lane** governance rules from `50-post-p5-user-level-roadmap.md §2.1`:

### 7.1 Always Run

- `git diff --check` before every commit
- Targeted grep scans: private key, `shell:true`, console path/token/hash leaks, forbidden completion claims
- Relevant vitest (not full suite unless context demands)
- One compact closeout doc per subpackage batch

### 7.2 Run Conditionally

- Full vitest suite — before closeout commit
- `npx tsc --noEmit` — only if type surfaces changed; otherwise trust known baseline (17 pre-existing errors)
- External audit — **not required** for Phase 7 (no real runtime binary distribution, no signing key changes; local pure JS runtime is user-placed)
- Manual smoke — required at P7-D closeout

### 7.3 Avoid

- Full typecheck every round if known baseline remains unchanged
- External audit for docs-only updates
- Huge closeout docs for small patches
- Repeated README churn unless status changes
- Multiple subagent calls for simple file reads
- Docs-only audit records unless a blocker or Owner decision requires one

---

## 8. Recommended Immediate Next Step

**Start P7-A: Real Magika detectFull End-to-End**

The task is to connect the pure JS Magika runtime (already smoke-tested at `D:\Starverse\.external-runtime-work\magika-js-work\`) to the `detectFull` pipeline through `ExternalProcessRunner`.

Specific implementation work:
1. Create a Magika pure JS child process entry in the existing `.starverse-engines/magika/runtime/` directory structure (the runtime `.mjs` already exists from P6-C smoke work)
2. Implement `createMagikaClassifyCallback` to spawn the pure JS child process via `ExternalProcessRunner` with the existing argv contract (`--model-dir`, `--config-dir`, `--input`, `--output-json`)
3. Verify the full chain: `buildMagikaRuntimeLoader()` discovers the installed Magika plugin → `load()` returns `available: true` → `classify(filePath)` runs the real child process → returns `{ label, score, modelVersion }`
4. Verify `detectFull` with a real file produces Magika evidence in the verdict
5. Write targeted tests covering: happy path, process timeout, process error exit, missing model files
6. Run privacy scans on the real runtime path

---

## 9. Forbidden Claims

This document does **not** claim:

- Full plugin ecosystem completed
- Marketplace completed
- Downloader completed
- All runtime plugins completed
- Document conversion completed
- Real runtime packaging completed (scaffold exists; real distribution is not done)
- Real Pandoc runtime completed
- Real Tika runtime completed
- Real LibreOffice runtime completed
- Real ffprobe runtime completed
- Full project completed

Allowed wording used:
- Phase plan proposed
- File content identification v1.0 endpoint proposed
- Conversion interfaces reserved
- Conversion engines remain future
- Full plugin ecosystem remains future

---

## 10. Stop Confirmation

- Remaining phase plan proposed: one phase (Phase 7) with four subpackages (P7-A through P7-D)
- Completion endpoint defined: File Content Identification v1.0
- Real Magika end-to-end `detectFull` is the core remaining gap
- All conversion engines remain future
- Downloader / installer remain future
- Marketplace remains future
- Full plugin ecosystem remains future
- No implementation performed
- No production code changed
- No real runtimes added
- No model files added
