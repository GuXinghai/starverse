# DFC-M6 DOCX/Office Markdown Runtime Owner Memo

Date: 2026-05-26
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: DFC-M5 checkpoint `c6cf2c9`

## Decision

Recommend DOCX-first `markdown` as the next runtime-family pilot, but do not implement it in M6.

The current repository does not already include a DOCX markdown parser dependency or external Office conversion wrapper. A low-risk implementation therefore requires an owner dependency decision first.

## Dependency scan

Checked `package.json` and `package-lock.json` for DOCX/Office conversion candidates:

- `mammoth`: not present.
- `turndown`: not present.
- `pandoc`: not present.
- `libreoffice` / `soffice`: not present.
- Existing browser/Electron or other unrelated packages are not an Office conversion runtime and should not be repurposed for DOCX.

## Reusable DFC seams

The existing DFC pipeline can reuse the same backend-owned structure used by text-like and XLSX pilot conversions:

- `conversationDraft.ensureDfcOptions` can remain the owner of option identity.
- `targetKind: markdown` already exists in the DFC vocabulary.
- Markdown derived outputs can use the existing `derived_asset` facade.
- Preview can read the selected derived markdown asset.
- Send Plan can continue to rely on `selectedOptionId` and verified `selectedAssetRefs`.
- `original_file` must remain available as the raw-file option.

No DB schema, IPC shape, asset model, Send Plan main-flow, renderer UI, or legacy bridge change is required for the decision itself.

## Recommended runtime strategy

Use a DOCX-first backend-only pilot if owner approves one parser dependency.

Preferred dependency direction:

- Primary candidate: Mammoth for DOCX-to-markdown-like semantic extraction.
- Optional follow-up candidate: Turndown only if the chosen DOCX parser emits sanitized HTML and a markdown conversion step is needed.
- Do not introduce Pandoc or LibreOffice for the first pilot because they imply external engine lifecycle, sandboxing, install detection, and broader failure modes.

Runtime boundary:

- Input must come only from an already stored local file asset.
- Output must be markdown text stored as a `derived_asset`.
- Renderer DTOs must not expose local paths, storage refs, full hashes, file body, or parser internals.
- Formula-like, embedded object, tracked-change, comment, image, macro, external relationship, and remote resource semantics must be warning-only or omitted unless separately productized.

## Explicit non-goals

- Do not support `.doc` in the DOCX-first pilot.
- Do not support `.rtf` in the DOCX-first pilot.
- Do not implement Office-to-PDF.
- Do not implement HTML-to-PDF.
- Do not implement PS/EPS conversion.
- Do not introduce external engines, browser rendering, Playwright/Electron harness, DB schema changes, IPC expansion, Send Plan rewrite, asset-model changes, UI picker changes, or legacy bridge work.

## Stop conditions for a future DOCX-first pilot

- The parser dependency requires native binaries, external engine execution, browser rendering, or abnormal install hooks.
- The parser cannot run in backend/worker-only paths without renderer bundle exposure.
- The implementation requires DB schema, IPC shape, Send Plan main-flow, asset-model, or UI changes.
- The pilot cannot produce a bounded markdown derived asset without leaking paths, storage refs, full hashes, file body, remote URLs, or embedded object contents.
- `.doc`, `.rtf`, Office-to-PDF, or HTML-to-PDF becomes necessary to complete the pilot.

## Proposed next implementation package

If owner approves Mammoth:

1. Add Mammoth as the only DOCX parser dependency.
2. Implement backend-only `.docx -> markdown` conversion helper.
3. Generate a DFC `markdown` derived option for local stored `.docx`.
4. Preserve `original_file` as the raw-file option.
5. Add targeted tests for ensure, preview, selected refs, Send Plan semantic/ref coherence, `.doc` unsupported, malformed DOCX fail-closed, and renderer DTO privacy.

If owner does not approve Mammoth, keep DOCX/Office in owner-memo state and continue XLSX hardening only.
