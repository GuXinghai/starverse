# DFC-M9 Runtime Pilot Closeout

Date: 2026-05-29

Baseline: `20c7162`

Branch: `docs/dfc-0-format-conversion-foundation`

## 1. Purpose

DFC-M9 closes the current runtime pilot expansion stage. It does not add a
runtime, dependency, IPC surface, DB schema, Send Plan behavior, asset model,
UI flow, browser harness, or external engine.

The closeout state is suitable for returning DFC to owner-supervised task
packages instead of continuing automatic small-gap expansion.

## 2. Phase 1 supported and pilot matrix

| Input family | Supported targetKind | Output authority | Preview authority | Send authority | Status |
| --- | --- | --- | --- | --- | --- |
| Any supported attachment original | `original_file` | Existing raw file asset | Raw/original attachment option | `raw_file` `SendAssetRef` selected by backend-owned option | Phase 1 supported |
| Plain text | `plain_text` | DFC `derived_asset` | Selected derived asset | `selectedOptionId` plus `selectedAssetRefs` using verified derived asset refs | Phase 1 supported |
| Markdown | `markdown` | DFC `derived_asset` | Selected derived asset | `selectedOptionId` plus `selectedAssetRefs` using verified derived asset refs | Phase 1 supported |
| Code/text source | `code` | DFC `derived_asset` | Selected derived asset | `selectedOptionId` plus `selectedAssetRefs` using verified derived asset refs | Phase 1 supported |
| CSV/TSV | `table_markdown` | DFC `derived_asset` | Selected derived asset | `selectedOptionId` plus `selectedAssetRefs` using verified derived asset refs | Phase 1 supported |
| HTML safe text path | `markdown` | DFC `derived_asset` from safe text conversion | Selected derived asset | `selectedOptionId` plus `selectedAssetRefs` using verified derived asset refs | Phase 1 supported safe path |
| HTML source/code path | `code` | DFC `derived_asset` preserving source text | Selected derived asset | `selectedOptionId` plus `selectedAssetRefs` using verified derived asset refs | Phase 1 supported safe path |
| XLSX workbook | `table_markdown` | Backend-only ExcelJS parser into DFC `derived_asset` | Selected derived asset | `selectedOptionId` plus `selectedAssetRefs` using verified derived asset refs | Phase 1 backend-only supported pilot |
| DOCX document | `markdown` | Backend-only Mammoth parser plus internal safe HTML-to-markdown text path into DFC `derived_asset` | Selected derived asset | `selectedOptionId` plus `selectedAssetRefs` using verified derived asset refs | Phase 1 backend-only supported pilot |

`original_file` remains a first-class `targetKind` and uses `raw_file`
`SendAssetRef`. Converted text-like outputs use `derived_asset`.

Renderer code must continue to treat option identity, target kind, send asset
refs, and conversion identity as backend-owned. It must not synthesize DFC
option identity or silently route DFC-managed attachments through legacy
fallback behavior.

## 3. Backend-only pilot boundary

Backend-only supported pilot means the runtime is wired into the existing DFC
backend option, ensure, preview, selected-ref, and Send Plan authority path, but
is not a full productized runtime family.

It does not imply:

- Advanced UI for sheet/page/object selection.
- Visual fidelity to Office or browser rendering.
- Formula calculation.
- External engine execution.
- Browser, Electron, Playwright, Puppeteer, Pandoc, LibreOffice, or shell based
  conversion.
- Broad asset model, DB schema, IPC shape, Send Plan, or legacy bridge changes.

## 4. XLSX pilot boundary

The XLSX pilot is `.xlsx` first and uses ExcelJS as a backend-only library.

Supported minimum:

- Visible worksheets are converted into markdown table sections.
- Worksheet order is stable.
- Basic size, worksheet, row, and cell guards fail closed.
- Sheet headings and cell text are markdown-escaped.
- Empty worksheets, formulas without cached values, hidden sheets/rows/columns,
  merged-cell limitations, media, and unsupported workbook features are handled
  through warnings or fail-closed behavior.
- Preview and send read the selected `derived_asset`.

Not supported:

- `.xls`.
- Formula evaluation.
- Macros.
- Images, charts, or embedded media extraction.
- Hidden sheet UI.
- Sheet picker UI.
- Pagination UI.
- Full workbook productization.
- External engines or browser rendering.

## 5. DOCX pilot boundary

The DOCX pilot is `.docx` first and uses Mammoth as a backend-only library. The
Mammoth CLI bin is not invoked.

Supported minimum:

- Ordinary paragraphs, headings, and visible link text can enter a `markdown`
  derived option.
- Hyperlink targets are omitted from derived markdown.
- Malformed DOCX input fails closed and does not generate a ready
  `derived_asset`.
- Embedded media/resource omission and parser warnings are represented by
  symbolic diagnostics, not raw Mammoth warning text.
- Preview and send read the selected `derived_asset`.

Not supported:

- `.doc`.
- `.rtf`.
- Turndown, Pandoc, LibreOffice, Office-to-PDF, or HTML-to-PDF.
- Image extraction.
- Comments or tracked-change productization.
- Headers, footers, footnotes, endnotes, visual layout, fonts, colors, or
  pagination fidelity.
- External resources, embedded objects, macros, or shell/external process
  conversion.

## 6. Dependency boundary

ExcelJS and Mammoth are retained only for backend parser pilots.

Current dependency boundary:

- No new native binary dependency was added by the pilot closeout itself.
- No external engine was added.
- No browser rendering dependency was added.
- No Playwright or Electron harness was added in M9.
- M9 does not change `package.json` or `package-lock.json`.

Residual dependency risks are transitive package footprint and future
maintenance/security review for parser libraries. Those are backlog items, not
runtime-expansion approval.

## 7. Safety Gate conclusion

Safety-Gate-1 committed the minimum IPC and local image-source safety boundary:

- Raw `ipcRenderer` exposure was removed from renderer access.
- Image source handling rejects arbitrary local path strings for the previously
  identified high-risk entry.
- Related mocks and security tests were updated.

Safety-Gate-2 found no new P0/P1 in the same class:

- No exploitable production raw `ipcRenderer` residual was found.
- No DFC/image/preview arbitrary local-path-read residual was found.
- No DFC renderer DTO privacy P0/P1 was found.
- Worktree remained clean and no Gate-2 code change was needed.

Gate-3 is skipped. Generic technical debt and legacy local-file-ingestion trust
boundary questions should move to backlog unless the owner opens a dedicated
security hardening package.

## 8. Known risks and non-goals

Known risks:

- There is still no real packaged Browser/Electron smoke proving the full OS
  file picker, packaged preload, renderer, worker, preview, and Send Plan path.
- Existing full-suite failures from Safety-Gate-1 attribution remain outside
  this DFC closeout unless they block a targeted owner-approved package.
- Legacy local file ingestion still relies on scoped file path flows and may
  deserve a future tokenized file-selection registry decision.
- ExcelJS and Mammoth parser transitive footprints require normal dependency
  maintenance over time.
- XLSX and DOCX pilots are semantic text extraction paths, not Office fidelity
  products.

Non-goals for this closeout:

- New runtime formats.
- `.xls`, `.doc`, or `.rtf`.
- Office-to-PDF, HTML-to-PDF, PS/EPS, or external engine sandbox.
- Browser/Electron/Playwright harness implementation.
- DB schema, IPC shape, Send Plan main-flow, asset model, or legacy bridge
  changes.
- npm audit, ESLint, `any`, electron-builder, or broad packaging governance.

## 9. Next owner-gated directions

Only two next directions remain open:

1. Packaging / smoke confidence.

   Decide whether to implement a real Browser/Electron or packaged smoke owner
   package. The target should be one representative DFC attachment flow from
   file selection through backend-owned option, ensure, selected preview,
   selected refs, and Send Plan visibility. This should not become a broad E2E
   framework rewrite.

2. Heavy runtime owner decision.

   Decide whether to enter Office-to-PDF, HTML-to-PDF, PS/EPS, or external
   engine sandbox design. This requires an owner memo before implementation and
   must cover dependency/engine choice, sandboxing, privacy DTO boundary,
   failure semantics, and packaging impact.

Recommended next task: Packaging / smoke confidence, because it validates the
existing Phase 1 and pilot paths before expanding into heavier runtime families.
