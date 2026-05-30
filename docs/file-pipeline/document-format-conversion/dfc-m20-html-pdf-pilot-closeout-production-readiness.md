# DFC-M20 HTML-to-PDF Pilot Closeout / Production Readiness Owner Decision

Date: 2026-05-31
Branch: docs/dfc-0-format-conversion-foundation
Baseline: d786bb0

## Purpose

M20 closes the current Electron-backed HTML-to-PDF `pdf_attachment` pilot phase. It records what is supported today, what is not production-ready yet, and which owner decisions are required before wider user-visible exposure or additional heavy runtime work.

No code or tests are changed in this package.

## Current implemented capability

The HTML-to-PDF path is now an Electron-backed backend pipeline pilot:

- input scope: backend-owned, managed local `.html` / `.htm` assets only;
- DFC option target: `targetKind: pdf_attachment`;
- send strategy: `sendStrategy: file_attachment`;
- send refs: `sendAssetRefs: derived_asset`;
- derivative kind: `converted_pdf`;
- derived asset usage: `preview_and_send`;
- preview: metadata-only PDF preview using the selected derived asset;
- Send Plan authority: selected refs plus verified DerivedAsset metadata;
- fallback policy: no legacy fallback for DFC-managed selected PDF options;
- rendering runtime: dedicated hidden Electron conversion window in the main process;
- isolation: no app renderer reuse, no app preload, no user session reuse, per-job temporary session partition;
- default policy: JavaScript disabled, network/external resources blocked, local-file access blocked, popups/downloads/arbitrary navigation blocked;
- failure policy: service unavailable, blocked, failed, timed out, missing output, escaped output, or invalid/non-PDF output fails closed and creates no ready DerivedAsset;
- cleanup: conversion window/session cleanup covered by targeted tests, and backend sandbox cleanup covered for success and output-validation failure paths.

## Current non-support / non-goals

The following are not supported by the current pilot:

- Office->PDF;
- PS/EPS->PDF;
- remote URL input;
- renderer-provided arbitrary paths;
- external resource authorization UI;
- JavaScript-enabled rendering;
- user-facing advanced PDF rendering controls;
- packaged installer smoke;
- real Electron smoke covering an actual HTML-to-PDF job;
- CI/browser/platform matrix;
- production-readiness declaration;
- broad UI controls beyond the existing DFC option path;
- packaged runtime policy beyond using Electron already shipped with the app.

## Production readiness owner decision

Recommended decision:

- Allow declaration as **backend pilot support** for managed local HTML-to-PDF through DFC.
- Do not yet declare default production support for broad users.
- Keep the capability **experimental / owner-gated** until a real Electron smoke covers an actual HTML-to-PDF job in the app runtime.
- Require a packaged or Electron runtime smoke before broad user-visible enablement.
- Require a focused security review before default exposure, with emphasis on renderer IPC absence, session isolation, JavaScript/network/local-file policy, sandbox output containment, diagnostics redaction, and no-silent-fallback.

Rationale:

- The backend contracts and unit/targeted coverage are strong enough to preserve the pilot in Phase 1.
- The path still lacks packaged/runtime confidence: tests use fake adapter/bridge seams for backend integration and fake Electron APIs for adapter policy coverage.
- The actual app runtime path should be exercised before calling this production-ready.

## Recommended next step

Recommended M21 priority:

1. `M21 HTML-to-PDF packaged/electron smoke confidence`

   Goal: verify a real Electron runtime can execute a controlled HTML-to-PDF conversion job and produce an observable DFC `pdf_attachment` option/preview/send-ref state without using OS file picker or packaged installer initially.

2. `M21 Office->PDF owner decision`

   Goal: compare Office->PDF approaches only after HTML-to-PDF runtime confidence is accepted, because Office/PDF requires additional engine policy and likely deeper document fidelity/security decisions.

Owner should choose Office->PDF first only if expanding runtime family is more valuable than de-risking the existing HTML-to-PDF pilot.

## Stop boundaries preserved

- No Office->PDF or PS/EPS implementation.
- No new dependencies or browser binaries.
- No DB schema change.
- No renderer IPC shape change.
- No Send Plan main-flow change.
- No asset model change.
- No DFC vocabulary change.
- No CI or packaged installer work.
