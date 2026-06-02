# DFC-M32 Deadline Closeout / Demo Readiness

Date: 2026-06-03
Branch: docs/dfc-0-format-conversion-foundation
Baseline: 7040dc5

## 1. Purpose

M32 closes the current deadline-oriented DFC push by summarizing what can be demonstrated, what remains unsupported, and what should be owner-gated in the next phase. This package is documentation-only and does not change code, tests, dependencies, DB schema, renderer IPC, Send Plan flow, asset model, DFC vocabulary, runtime behavior, smoke harnesses, packaged installer behavior, or CI.

## 2. Current supported / pilot matrix

| Capability | Target kind | Send strategy | Asset refs | Level | Demo/readiness note |
| --- | --- | --- | --- | --- | --- |
| Original file | `original_file` | `file_attachment` when model/policy allows file send | `raw_file` | supported | First-class DFC target. Renderer does not invent raw refs. |
| Plain text | `plain_text` | `text_in_prompt` | `derived_asset` | supported | Backend-owned derived text preview/send source. |
| Markdown | `markdown` | `text_in_prompt` | `derived_asset` | supported | Includes markdown source and text-like converted outputs. |
| Code | `code` | `text_in_prompt` | `derived_asset` | supported | Backend-owned code option/preview/send source. |
| CSV/TSV table markdown | `table_markdown` | `text_in_prompt` | `derived_asset` | supported | Text-table runtime with selected-ref preview/send authority. |
| HTML safe markdown/code | `markdown` / `code` | `text_in_prompt` | `derived_asset` | supported | String-level safe conversion; not browser rendering. |
| XLSX table markdown | `table_markdown` | `text_in_prompt` | `derived_asset` | backend pilot | ExcelJS backend-only pilot; `.xls` remains unsupported. |
| DOCX markdown | `markdown` | `text_in_prompt` | `derived_asset` | backend pilot | Mammoth backend-only semantic markdown pilot; `.doc`/`.rtf` remain unsupported. |
| HTML to PDF | `pdf_attachment` | `file_attachment` | `derived_asset` | experimental-gated | Electron-backed backend pilot with real Electron smoke; not broad production-ready. |
| DOCX to PDF | `pdf_attachment` | `file_attachment` | `derived_asset` | dev managed runtime smoke | LibreOffice managed runtime seam validated through imported-runtime real `soffice` smoke; production enablement remains owner-gated. |
| DOC / RTF / DOCM to PDF | none | none | none | unsupported | Explicitly out of current scope. |
| PS/EPS to PDF | none | none | none | unsupported | No engine or runtime support. |

## 3. Demo checklist

- Electron shell smoke: available. Confirms app launch, composer shell, scoped preload, and absence of raw `window.ipcRenderer`.
- Backend-owned DFC attachment Electron smoke: available. Confirms a controlled backend-owned attachment seam, details dialog, option visibility, and preview visibility.
- HTML-to-PDF Electron smoke: available. Confirms real Electron-backed HTML `pdf_attachment` generation, selected derived ref, metadata-only preview, and original/markdown/code options remaining visible.
- Office-to-PDF imported runtime smoke: available in dev managed-runtime mode. Confirms imported active managed LibreOffice runtime, real `soffice`, ready DOCX `pdf_attachment`, `converted_pdf` DerivedAsset, metadata-only preview, and selected-ref Send Plan authority.

## 4. Explicit non-support / non-goals

- `.doc`, `.rtf`, and `.docm` are not supported.
- PS/EPS is not supported.
- Broad production LibreOffice enablement is not approved.
- Production packaged LibreOffice installer/import/update/revocation is not complete.
- Packaged installer smoke is not complete.
- CI integration for runtime smoke is not complete.
- System LibreOffice / PATH fallback is not approved.
- User-selected executable paths are not approved.
- Production Office-to-PDF support is not declared.
- JavaScript-enabled HTML-to-PDF rendering, remote URL input, external-resource authorization UI, and advanced PDF rendering controls are not supported.

## 5. Risk summary

- HTML-to-PDF is credible as a backend pilot with Electron smoke, but still needs packaged/runtime confidence and focused security review before broad exposure.
- DOCX-to-PDF has stronger evidence than fake-process tests because imported managed LibreOffice real smoke now passes, but it is still dev managed-runtime smoke and not production support.
- LibreOffice package lifecycle remains the largest production gap: install/import UX, update/revocation, offline import policy, packaged smoke, and user-visible diagnostics.
- External process timeout cap was raised for explicit long conversion jobs; future exposure should keep observing hang containment and cleanup behavior.
- All current PDF paths must preserve selected-ref / verified-DerivedAsset authority and no-silent-fallback behavior.

## 6. Next-stage route

Recommended order:

1. Packaged smoke confidence.
2. User-visible experimental gate.
3. Production managed package update/revocation and offline import policy implementation.
4. Office family expansion decision.

Do not expand to `.doc`, `.rtf`, `.docm`, PS/EPS, system fallback, or production Office-to-PDF claims until the owner explicitly approves the corresponding package.
