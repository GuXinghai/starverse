# DFC-M53 Harness GitHub Asset Body Intercept Live Install Verification

Date: 2026-06-24

## Scope

M53 added a smoke/test-only transport intercept for the LibreOffice official GitHub Release asset body. The intent is to keep the product path as `install_official_plugin -> downloader -> streaming acquisition -> size/hash verification -> staging -> activation -> runtime gate -> DFC`, while allowing the smoke harness to replace only the unstable GitHub large-asset body stream with a local catalog-equivalent `.svpkg`.

This round did not add a production local install feature, did not add arbitrary URL input, did not expose local package paths to renderer, did not activate directly from a local path, and did not bypass size/hash/trust/staging/activation/runtime/path-cap gates.

## Intercept Design

Implementation:

- helper: `infra/files/dfcLibreOfficeOfficialAssetBodyIntercept.ts`;
- worker wiring: `infra/db/worker/runtime.ts`;
- smoke preflight evidence: `scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs`;
- tests: `infra/files/dfcLibreOfficeOfficialAssetBodyIntercept.test.ts`.

The intercept is dormant unless `STARVERSE_DFC_M53_OFFICIAL_ASSET_BODY_INTERCEPT=1` is set. When enabled, it can stream a local package only for the fixed LibreOffice official GitHub asset descriptor. The request must match the catalog `sourceUrl`, GitHub release asset name, source kind, expected size, and expected sha256 metadata. Non-matching requests fall through to the normal transport.

The local package path is read only by the worker-side smoke transport and smoke preflight. It is not sent to renderer DTOs and is not a product install input.

## Not A Production Local Install Feature

This is harness-only transport substitution. Plugin Management still calls `enginePluginLifecycle.installOfficialPlugin`, and the lifecycle service still uses the official catalog entry. The renderer receives no arbitrary package path and no new local install UI was added. Existing offline import remains the only bounded local package lifecycle control.

## Local Package Equivalence

Required equivalent package:

- extension: `.svpkg`;
- expected size: `518907010`;
- expected sha256: official catalog pin;
- source class: `harness_local_equivalent_to_official_github_asset`.

Local search evidence for this machine:

- `.svpkg` candidates checked: 3;
- size matches: 0;
- hash matches: 0.

No catalog-equivalent local package was available, so the live install path was not allowed to start.

## Live Harness Result

M53 harness env was enabled without a valid local equivalent package. The live Starverse smoke launched, mounted the renderer, opened Plugin Management, and stopped before install.

Sanitized evidence:

- app mode: `dev_electron_live_user_data`;
- Plugin Management visible: true;
- initial runtime status: `missing`;
- final runtime status: `missing`;
- runtime diagnostic: `conversion_engine_missing`;
- install attempted: false;
- download attempted: false;
- operation states: none;
- harness intercept enabled: true;
- harness source class: `harness_local_equivalent_to_official_github_asset`;
- local package provided: false;
- preflight passed: false;
- preflight diagnostic: `office_pdf_package_missing`;
- Plugin Management status/open started download: false.

This confirms the harness fails closed before `install_official_plugin` when the local package equivalence preflight is not satisfied.

## Verification/Staging/Activation

Not reached in live smoke because no valid local equivalent package existed. The code path and targeted tests prove the intercept streams to the existing downloader file output and leaves size/hash verification in the downloader/import pipeline.

## DOCX-To-PDF Result

Not reached. Runtime remained missing and no install was attempted. No `pdf_attachment`, `converted_pdf`, `file_attachment`, `derived_asset`, PDF validation, or metadata-only PDF preview claim is made for M53.

## No Silent Fallback

Live DOCX workflow was not run after the preflight block. Because no install or conversion started, there was no fallback to markdown, original file, plain text, legacy selectedSendMode, system LibreOffice, or PATH output.

## Fail-Closed Intercept Tests

Targeted tests passed for:

- intercept disabled;
- wrong local package size;
- wrong local package hash;
- matched official asset body streamed from local equivalent package;
- unrelated network request not intercepted;
- local package stream error cleanup;
- path-free renderer-safe preflight evidence.

Existing lifecycle tests also passed for LibreOffice official install behavior, including explicit install only, status observability during streaming, size/hash fail-closed behavior, and activation failure sanitization.

## Privacy And Redaction

Evidence records only booleans, state classes, symbolic diagnostics, operation phases, and size/hash match status. It does not record raw local package paths, runtime roots, executable paths, sandbox roots, input/output paths, command lines, environment dumps, raw URLs, storage refs, content tokens, full hashes, DOCX/PDF body, manifest body, or private keys.

## Remaining Network Issue

The real GitHub large-asset transfer remains unresolved in this environment. M52 showed release metadata resolves but HEAD fails with `network_econnreset`. M53 isolates product logic from that external network issue, but live install cannot complete until a local catalog-equivalent `.svpkg` is supplied to the harness or the network path becomes reliable again.

## Next Step

M54 should provide a repo-external catalog-equivalent `.svpkg` via the M53 harness env and rerun the live intercept install. If install succeeds, proceed to live DOCX-to-PDF verification through the normal DFC flow. Do not use the intercept as a production feature.
