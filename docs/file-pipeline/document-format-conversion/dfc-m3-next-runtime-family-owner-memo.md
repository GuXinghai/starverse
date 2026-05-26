# DFC-M3 Next Runtime Family Decision Owner Memo

Status: owner-level stop memo. DFC-M3 selects the next runtime family but does not implement a pilot because the selected family requires a spreadsheet parser dependency or equivalent engine that is not currently present in the repository.

Date: 2026-05-26
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline HEAD observed: `5e22ab8`

## 1. Decision

Recommended next runtime family: XLSX/XLS to `table_markdown`.

Rationale:

- It maps directly to the existing DFC `table_markdown` target kind.
- It is closer to the current CSV/TSV table runtime than DOCX/Office, HTML-to-PDF, Office-to-PDF, or PS/EPS.
- The preview/send shape can reuse the existing derived text pathway once a backend-owned parser produces markdown table text.
- It should not require new DFC target vocabulary, broad Send Plan changes, DB schema changes, or renderer option identity changes.

Stop decision:

- Do not implement the pilot in this round.
- Current dependencies include Playwright, but no XLSX/XLS parser such as SheetJS/xlsx and no Office conversion engine.
- Existing CSV/TSV `table_markdown` support is text-delimiter parsing. XLSX/XLS are binary/workbook formats and cannot be safely parsed by the current CSV/TSV seam without a parser dependency or engine.

## 2. Dependency and engine findings

Read-only dependency check found:

- Present: `playwright`, `@axe-core/playwright`.
- Not found: `xlsx`, SheetJS wrappers, `mammoth`, `turndown`, `pandoc`, `puppeteer`, LibreOffice/`soffice`, Ghostscript/PostScript conversion wrappers.

Implication:

- XLSX/XLS requires owner approval for a parser dependency or a separate engine decision.
- DOCX/Office requires an Office parser or external engine decision.
- HTML-to-PDF and Office-to-PDF require browser/external-engine sandbox decisions.
- PS/EPS to PDF requires a PostScript/PDF engine decision.

## 3. Existing reusable DFC seams

The following seams are reusable after a parser decision:

- `infra/files/derivativeJobService.ts` already supports text conversion jobs that emit `targetKind: table_markdown`.
- CSV/TSV inference maps `.csv` and `.tsv` to `table_markdown`.
- `convertTextForTarget(..., 'table_markdown')` parses delimited text and emits markdown tables.
- Existing DFC option, preview, selected-ref, message snapshot, and Send Plan paths already understand `table_markdown` as a derived text target.
- Existing DFC `DerivedAsset` facade can represent `table_markdown` output over derivative storage.

What is not reusable without new dependency/engine:

- Reading workbook sheets.
- XLS binary parsing.
- XLSX zip/XML workbook parsing.
- Formula evaluation.
- Merged-cell interpretation.
- Hidden-sheet policy.
- Multi-sheet selection.

## 4. Rejected candidate families

### DOCX/Office to `markdown`

Rejected for M3 implementation because no DOCX/Office parser dependency or wrapper is present. It also introduces richer document semantics, embedded media, styles, tables, comments, tracked changes, and privacy boundaries that need a separate owner memo.

### HTML-to-PDF / Office-to-PDF

Rejected for M3 implementation because these require browser rendering or external engines plus sandbox and resource-loading policy. This crosses the M1 non-goal boundary and the M2 confidence path did not approve a real browser/Electron harness.

### PS/EPS to PDF attachment

Rejected for M3 implementation because PostScript/EPS conversion normally requires an external engine such as Ghostscript or equivalent sandboxed renderer. No such dependency or wrapper is present, and the security boundary is higher risk than XLSX/XLS table extraction.

## 5. Recommended implementation package

Proposed package: DFC-M4 XLSX/XLS parser-owner decision and pilot.

Owner decision required:

- Approve one parser strategy:
- Option A: add a maintained in-process spreadsheet parser dependency for XLSX and, if supported, XLS.
- Option B: support XLSX only first and keep legacy XLS unsupported until a separate engine/parser decision.
- Option C: use an external office engine only after a sandbox memo.

Recommended scope if Option A or B is approved:

- Add one backend-only parser wrapper.
- Generate a single `table_markdown` derived asset from the first visible worksheet by default.
- Emit warnings for unsupported workbook features instead of productizing them in the pilot.
- Keep `selectedOptionId`, `selectedAssetRefs`, preview, message snapshot, and Send Plan behavior on existing DFC paths.
- Add targeted tests for option generation, derived markdown table output, preview/send-source coherence, and privacy field exclusion.

## 6. Privacy and security boundary

The pilot must not expose:

- absolute paths
- raw storage refs
- `fileUrl`
- full hashes
- content tokens
- workbook binary body
- raw worksheet XML
- parser-internal metadata with hidden path or environment data

Renderer-visible DTOs should expose only backend-owned option IDs, `SendAssetRef` opaque IDs, sanitized warnings, preview text, and existing safe attachment metadata.

## 7. Pilot acceptance proposal

Minimal acceptance for a future approved pilot:

- One XLSX fixture with one visible worksheet converts to `table_markdown`.
- Backend-owned option generation includes a `table_markdown` option with a `derived_asset` ref.
- Preview displays the selected markdown table text.
- Message commit snapshots `usedOptionId`, `usedAssetRefs`, `targetKind: table_markdown`, and `sendStrategy: text_in_prompt`.
- Send Plan uses selected `derived_asset` refs and does not fall back to legacy routing.
- No path, storage ref, full hash, content token, file body, or workbook binary appears in renderer DTOs or Send Plan output.

## 8. Stop conditions for the future pilot

Stop before implementation if any of these are required:

- DB schema change.
- Send Plan main-flow rewrite.
- IPC shape expansion beyond narrow DFC DTO use.
- Renderer-generated option identity.
- External engine or browser rendering.
- New dependency without owner approval.
- Productized sheet picker, formula engine, hidden-sheet policy, merged-cell handling, or full Office compatibility.

## 9. Next recommendation

Do not enter implementation until the owner approves the parser strategy.

Recommended next task: DFC-M4 XLSX/XLS parser dependency decision. If the owner rejects new parser dependencies, choose DOCX/Office or HTML-to-PDF only as a separate owner memo, not as implementation.
