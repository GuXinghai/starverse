# DFC-M14 Heavy Runtime Decision & External Engine Boundary

Date: 2026-05-29

Baseline: `429fd9e`

Branch: `docs/dfc-0-format-conversion-foundation`

## 1. Purpose

DFC-M14 decides the next heavy runtime direction after Phase 1 text-like
conversion, XLSX/DOCX backend-only pilots, Safety Gate, and Electron
backend-owned attachment smoke have all landed.

This package is decision-only. It does not implement a runtime, add an engine,
add a dependency, change DB schema, alter Send Plan main flow, change the asset
model, change DFC option semantics, extend smoke coverage, or start broad code
health work.

## 2. Current baseline

Completed DFC capabilities:

| Family | Status |
| --- | --- |
| `original_file` | Supported as first-class `targetKind` using `raw_file` `SendAssetRef`. |
| `plain_text` | Supported as DFC `derived_asset` with `text_in_prompt`. |
| `markdown` | Supported as DFC `derived_asset` with `text_in_prompt`. |
| `code` | Supported as DFC `derived_asset` with `text_in_prompt`. |
| CSV/TSV `table_markdown` | Supported as DFC `derived_asset` with `text_in_prompt`. |
| HTML safe `markdown` / `code` | Supported safe text/code paths; no browser rendering. |
| XLSX-first `table_markdown` | Backend-only supported pilot via ExcelJS; `.xls` still unsupported. |
| DOCX-first `markdown` | Backend-only supported pilot via Mammoth; `.doc` / `.rtf` still unsupported. |
| Electron smoke confidence | App shell, scoped preload, raw `ipcRenderer` absence, and backend-owned DFC attachment seam covered. |

Current DFC invariants remain unchanged:

- Renderer must not invent option identity, target kind, send refs, or conversion
  identity.
- `selectedOptionId` plus `selectedAssetRefs` remain the authority for preview,
  send, and compatibility decisions.
- DFC-managed attachments must not silently fall back to legacy routing.
- No paths, storage refs, full hashes, content tokens, file bodies, or external
  engine internals may be exposed to renderer DTOs or ordinary logs.

## 3. Read-only seam findings

### 3.1 Existing external process and engine foundation

The repository already has a file-type/external-engine foundation:

| Existing seam | Finding | M14 interpretation |
| --- | --- | --- |
| `src/next/file-type/externalProcessPolicy.ts` | Enforces `shell: false`, blocks batch entrypoints by default, blocks script interpreters, clamps timeouts/output caps. | Useful safety primitive, but not yet a DFC conversion runtime contract. |
| `src/next/file-type/externalProcessRunner.ts` | Runs child processes with `shell: false`, hidden windows, timeout, stdout/stderr caps, best-effort process tree termination, and path/secret redaction. | Candidate process primitive for future external conversion engines. |
| `src/next/file-type/externalEngineRegistry.ts` | Registers built-in stub manifests for `tika`, `libreoffice`, `ffprobe`, and `pandoc`; includes availability/health concepts. | Registry is available, but current built-ins are stubs/metadata, not installed engines. |
| `src/next/file-type/conversionRuntimePackage.ts` | Defines runtime package inventory requirements: runtime, manifest, signature, license, attribution. | Useful for managed conversion packages, but DFC does not yet consume this as a runtime layer. |
| Existing runner files | `libreOfficeRunner.ts`, `pandocRunner.ts`, `tikaRunner.ts`, `ffprobeRunner.ts` exist in file-type area. | Treat as contract/scaffold unless a concrete installed engine and DFC integration are added. |

M14 conclusion: the repo has reusable safety and registry building blocks, but
not a complete DFC heavy-runtime sandbox. DFC still needs a conversion-specific
foundation that owns sandbox input/output directories, managed storage writes,
engine availability, diagnostics redaction, fail-closed option generation, and
preview/send same-source rules.

### 3.2 Dependency and engine inventory

Observed package/dependency state:

| Engine/dependency | Current state |
| --- | --- |
| Playwright | Present and currently used for Electron smoke. Not approved as a production conversion runtime. |
| Electron/Chromium | Electron exists as app runtime. No DFC PDF rendering path currently uses it. |
| Puppeteer | Not present. |
| LibreOffice / `soffice` | No package dependency or installed managed runtime in this DFC path; only stub/contract references. |
| Ghostscript | No dependency or managed runtime found. |
| Pandoc | No package dependency or installed managed runtime in this DFC path; only stub/contract references. |
| External engine package system | Contract/scaffold exists in file-type area; not wired to DFC conversion execution. |

M14 conclusion: no heavy runtime can be implemented now without either using
an existing app/browser runtime in a new conversion role or approving a managed
external engine package. Both require owner approval and a dedicated safety
package.

### 3.3 DFC `pdf_attachment` seam

`pdf_attachment` already exists in DFC target vocabulary and contract helpers:

- `pdf_attachment` is a valid `DfcTargetKind`.
- Derived `pdf_attachment` options use `sendStrategy: file_attachment`.
- Derived `pdf_attachment` options use `derived_asset` `SendAssetRef`.
- Send Plan has semantic handling for `pdf_attachment` and provider PDF input
  capability checks.

But current runtime state is vocabulary/contract-only for generated PDFs:

- No HTML-to-PDF runtime writes a PDF `derived_asset`.
- No Office-to-PDF runtime writes a PDF `derived_asset`.
- No PS/EPS-to-PDF runtime writes a PDF `derived_asset`.
- Existing PDF annotation capture is not a general PDF generation runtime.

M14 conclusion: `pdf_attachment` is the correct target kind for heavy runtime
pilots, but it must remain unavailable until a verified backend-generated PDF
`derived_asset` exists and is selected through backend-owned options.

## 4. Heavy runtime comparison

| Candidate | User value | Complexity | Security risk | Dependency / engine size | Sandbox requirements | Path / temp / storage / log privacy boundary | Preview-send same-source requirement | First heavy pilot fit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HTML -> PDF attachment | High for web reports, receipts, exported pages, rendered HTML artifacts. | Medium-high. Requires deterministic rendering, resource blocking, print settings, and PDF output validation. | High if arbitrary HTML can load external resources, execute script, access local files, or leak paths. | Potentially no new binary if using Electron/Chromium already present; high boundary change if Playwright/Electron becomes runtime. Puppeteer would be a new dependency and is not approved. | Must run with network disabled or explicit deny, script/resource policy, controlled temp profile, input sandbox copy/string, output-only managed directory, timeout, size limits. | Renderer must never receive source path, temp dir, storage ref, raw HTML body, or engine stderr. Logs must redact paths/URLs/tokens. Output must be written as managed `derived_asset`. | Preview and Send Plan must reference the exact generated PDF `derived_asset`; no re-render on send, no extension/MIME fallback. | Best first format pilot after sandbox foundation because it can target one input family and `pdf_attachment` semantics directly. |
| Office/DOCX -> PDF attachment | Very high for user expectations around Word/Office fidelity. | Very high. Requires LibreOffice or equivalent, profile isolation, font availability, layout variance handling, and multi-format policy. | Very high due to macro/embedded object risk, external links, temp files, large documents, and engine crash/hang behavior. | LibreOffice is large and operationally heavy. No approved managed runtime exists in this branch. | Requires managed LibreOffice package, health checks, isolated user profile, no network, sandbox input/output, macro/external link disabled policy, timeout/process tree kill. | Must redact engine profile paths, temporary document names, stdout/stderr, user file paths, storage refs, and full hashes. | Send Plan must use the generated PDF `derived_asset`; source Office file cannot silently route as PDF. | Not first. Best second after sandbox foundation and one simpler PDF pilot prove the boundary. |
| PS/EPS -> PDF attachment | Medium for specialist print/design files. | High. Requires Ghostscript or equivalent and PostScript-specific policy. | Very high because PostScript is a programming language with file/network/device primitives; historical sandbox escapes matter. | Ghostscript would be a new external engine with separate security and licensing review. Not present. | Requires strongest sandbox: no arbitrary file operators, no network, sandbox copy, locked output path, version/security gate, strict args, timeout, output validation. | Must not log PostScript content, source path, engine paths, or stderr with raw file details. Output only as managed PDF `derived_asset`. | Same-source PDF derived asset required; no raw PS/EPS fallback as PDF. | Explicitly postposed. Do not pilot before external engine sandbox and Ghostscript security decision. |
| General external engine sandbox foundation | High enabling value across Office/PDF/PS-EPS and future engines. | Medium-high but bounded if it reuses existing file-type runner/policy and avoids format runtime implementation. | High if underspecified; manageable as foundation-only with tests and no real engine. | No new engine required if foundation-only. May reuse existing contracts and runner. | Must define DFC conversion sandbox copy/output dir, engine invocation contract, resource limits, output validation, diagnostics, cleanup, and fail-closed semantics. | Centralizes privacy redaction: no paths, storage refs, full hashes, file bodies, temp paths, engine stderr, or command lines to renderer/logs. | Foundation must require one generated managed `derived_asset` as the sole preview/send authority. | Best first implementation package. It is not a user-visible format pilot, but it is the right first heavy-runtime step. |

## 5. Recommended ordering

1. **DFC external engine / rendered-output sandbox foundation**.

   This should be the next implementation package. It should not add a real
   engine or runtime. It should define and test the DFC conversion boundary for
   sandbox input, sandbox output, managed derived asset writes, diagnostics,
   cleanup, engine availability, and no path/privacy leakage.

2. **HTML -> PDF attachment pilot**.

   This is the recommended first user-visible heavy runtime pilot after the
   foundation. It has high value, uses the existing `pdf_attachment` vocabulary,
   and is narrower than Office/PDF or PS/EPS. The owner must still decide
   whether the engine is Electron/Chromium, Playwright/Chromium, or a separate
   managed engine. M14 does not approve runtime use of the smoke harness as a
   production converter.

3. **Office/DOCX -> PDF attachment**.

   This should follow only after sandbox foundation plus one PDF-output pilot.
   It likely requires LibreOffice or equivalent and a managed runtime package,
   health checks, isolated profile, macro/external-resource policy, and larger
   packaging/security review.

4. **PS/EPS -> PDF attachment**.

   This is explicitly postposed. It requires Ghostscript or equivalent and the
   strictest external-engine security review because PS/EPS is executable page
   description content.

## 6. Why not continue text parser family

The Phase 1 text-like parser family already covers the high-confidence semantic
text path: plain text, markdown, code, CSV/TSV, safe HTML, XLSX table markdown,
and DOCX markdown. More parser-only slices now have diminishing value compared
with the remaining fidelity gap:

- Users who need HTML/Office/PS-EPS as attachments often need a rendered PDF,
  not more extracted text.
- `pdf_attachment` already exists as the next DFC target kind that changes send
  modality from `text_in_prompt` to `file_attachment`.
- Further text parser work would not exercise external engine sandboxing,
  rendered-output validation, or PDF send-source authority.

M14 therefore recommends moving from parser pilots to rendered-output sandbox
and PDF attachment pilots.

## 7. Owner decision

M14 recommends: **do not implement a heavy runtime yet**.

Owner should approve the next package in this order:

1. Approve a DFC conversion sandbox foundation package with no real engine and
   no new dependency.
2. After foundation passes, approve an HTML -> PDF pilot engine choice.
3. Defer Office/DOCX -> PDF until LibreOffice/engine packaging and sandbox
   boundaries are explicitly approved.
4. Defer PS/EPS -> PDF until Ghostscript/PS sandbox and security acceptance are
   explicitly approved.

Required owner approvals before implementation:

- Any new external engine or binary runtime.
- Any use of Electron/Chromium or Playwright as a production conversion runtime.
- Any new dependency such as Puppeteer or a Ghostscript/LibreOffice wrapper.
- Any engine package distribution, trust root, signature, or health-check policy
  change.
- Any DB schema, IPC shape, Send Plan main-flow, asset model, or DFC option
  semantic change.

## 8. Required boundary for future heavy runtime packages

Every future heavy runtime package must preserve these rules:

- Input must come from a registered backend local file asset or a backend-owned
  derived asset, never an arbitrary renderer string.
- Engine input must use a sandbox copy or controlled input stream, not the
  original managed storage path directly.
- Engine output must be written to a controlled temp output path and then moved
  or copied into managed derivative storage only after validation.
- Renderer DTOs must expose only sanitized option/preview/send semantics; no
  paths, temp dirs, storage refs, command lines, engine stderr, full hashes,
  content tokens, file bodies, or raw conversion logs.
- External resources and network access must be denied by default.
- Timeouts, output caps, process tree termination, and cleanup must be tested.
- Failure must be fail-closed: unavailable/failed/blocked DFC option, no ready
  `derived_asset`, and no legacy fallback.
- Preview and Send Plan must use the same selected PDF `derived_asset`.
- Existing `original_file` raw option must remain available as its own
  backend-owned option where allowed, but must not masquerade as a generated
  PDF option.

## 9. Next implementation package prompt

### Task package: DFC-M15 External Engine Sandbox Foundation

**Goal:**
Define the DFC heavy-runtime sandbox foundation before any HTML/Office/PS-EPS
runtime is implemented. Reuse existing file-type external process policy/runner
where appropriate, but do not add a real engine.

**Scope:**

- Map existing `externalProcessPolicy`, `externalProcessRunner`, external engine
  registry, conversion runtime package contracts, DFC `pdf_attachment`,
  DerivedAsset facade, ensure/options, preview, and Send Plan selected-ref seams.
- Add a DFC conversion sandbox contract/helper only if it stays local and
  low-intrusion.
- Define controlled input sandbox copy / controlled output directory / cleanup
  semantics.
- Define sanitized diagnostics for engine unavailable, timeout, output missing,
  output invalid, output too large, and privacy redaction.
- Define how a future PDF output becomes a DFC `derived_asset` with
  `targetKind: pdf_attachment`, `sendStrategy: file_attachment`, and
  `derived_asset` `SendAssetRef`.
- Add targeted unit tests for path rejection/redaction, temp cleanup,
  fail-closed behavior, and no renderer DTO privacy leakage if code is added.
- Update M14/M15 docs, ledger, and important context.

**Forbidden:**

- Do not implement HTML->PDF, Office->PDF, PS/EPS->PDF, or any real conversion.
- Do not add LibreOffice, Ghostscript, Puppeteer, Pandoc, or a new external
  engine dependency.
- Do not use the Electron smoke harness as a production converter.
- Do not change DB schema, Send Plan main-flow, asset model, IPC shape, DFC
  target vocabulary, or legacy bridge behavior.
- Do not add CI, packaged installer smoke, npm audit fixes, ESLint cleanup, or
  full-suite failure work.

**Acceptance:**

- If docs-only: `git diff --check`.
- If helper/tests are added: `git diff --check`; `npx vue-tsc --noEmit --pretty false`;
  targeted tests for new sandbox helper plus existing DFC contract tests touched
  by the change.
- Run `npm run rebuild:node` before DB-heavy Vitest only if DB worker tests are
  touched.
- Do not run full Vitest.

**Stop conditions:**

- Requires real engine execution.
- Requires new dependency or runtime package.
- Requires DB schema, Send Plan main-flow, asset model, IPC shape, or DFC option
  semantic change.
- Requires broad refactor of file-type engine infrastructure.
- Cannot define fail-closed/no-leak semantics without touching renderer DTOs or
  broad logging infrastructure.

**Required security checks:**

- Path/temp/storage refs are never returned to renderer DTOs.
- Engine stdout/stderr and command lines are sanitized before diagnostics.
- Sandbox input/output paths cannot be supplied by renderer.
- Generated `pdf_attachment` must be sendable only through verified selected
  `derived_asset` refs.
- DFC-managed attachments never silently fall back to legacy routing.
