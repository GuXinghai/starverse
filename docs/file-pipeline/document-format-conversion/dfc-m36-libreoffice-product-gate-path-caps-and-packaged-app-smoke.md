# DFC-M36 LibreOffice Product Gate Path Caps And Packaged App Smoke

Date: 2026-06-22

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. M36 promotes the M34/M35 controlled short-path policy into the real LibreOffice DOCX-to-PDF runtime gate. Office-to-PDF remains DOCX-only, owner-gated, experimental, and not production-approved.

## Scope Boundary

M36 changes the real managed LibreOffice DOCX-to-PDF launch path only to fail closed before `soffice` launch when the Windows x64 controlled short-path caps are exceeded.

Unchanged:

- `productionApproved=false`.
- `downloadEnabled=false`.
- no production Office-to-PDF support claim.
- no user-visible experimental exposure.
- no `.doc`, `.rtf`, `.docm`, `.xls/.xlsx`, PS/EPS, PDF OCR, image, or audio expansion.
- no system LibreOffice discovery, PATH fallback, arbitrary executable path, renderer-provided executable path, implicit runtime download, postinstall download, or conversion-time download.
- no DB schema, renderer IPC shape, Send Plan main-flow, DFC vocabulary, asset model, package lockfile, dependency, or GitHub release asset change.

## Product Gate Policy

The adapter now evaluates the controlled short-path policy after the sandbox plan is derived and before sandbox file creation, argument construction, or process launch.

Windows x64 managed LibreOffice caps:

| Path | Cap |
| --- | ---: |
| runtime root | <= 120 |
| sandbox root | <= 80 |
| input path | <= 130 |
| output directory | <= 90 |
| isolated profile directory | <= 110 |

When any active cap is exceeded, the adapter returns `office_pdf_path_policy_exceeded` and does not call the process runner. The worker maps that symbolic internal diagnostic to the existing blocked Office PDF product state `conversion_sandbox_denied`, so the DOCX `pdf_attachment` option is unavailable/blocked, has no ready `converted_pdf` DerivedAsset, has empty PDF send refs, and does not fall back to legacy PDF behavior or system/PATH lookup.

The normal fake seam remains excluded from this policy because it is not production runtime authority. Managed-manifest and imported managed-runtime descriptors are covered.

## Short Sandbox Root

M36 also changes the Office PDF worker sandbox root from the longer descriptive temp path to a controlled short temp prefix. This preserves the M35 short-path success envelope after the production gate is active.

The sandbox remains process-local temp output, still under the existing DFC sandbox input/output/work structure, still isolated from source storage, and still cleaned up by the existing worker cleanup path.

## Production-Like Packaged Smoke Evidence

The M36 packaged smoke reuses the M35 env-gated command after the product gate change:

```text
npm run test:office-pdf-libreoffice-packaged-smoke
```

The command imports a repo-external Windows x64 prerelease `.svpkg` into a short app-managed runtime root, validates package/runtime/executable identity, uses active managed runtime discovery, runs DOCX-to-PDF through managed `soffice`, and then runs the DFC worker real-managed smoke.

Observed sanitized path lengths:

| Path | Length | Cap | Result |
| --- | ---: | ---: | --- |
| runtime root | 98 | 120 | pass |
| sandbox root | 47 | 80 | pass |
| input path | 66 | 130 | pass |
| output directory | 54 | 90 | pass |
| isolated profile directory | 72 | 110 | pass |

DOCX-to-PDF result: passed.

PDF validation: `valid_pdf`.

Cleanup status: `attempted`.

Output location: controlled sandbox output directory.

## DFC Worker Semantics

The packaged smoke and targeted worker tests verify:

- ready DOCX `pdf_attachment` option on short-path success.
- `derivedKind: converted_pdf`.
- `sendStrategy: file_attachment`.
- `sendAssetRefs: derived_asset`.
- metadata-only PDF preview.
- Send Plan selected-ref authority from verified DerivedAsset metadata.
- no raw storage refs or PDF body in option/preview/send-plan payloads.

The cap-exceeded worker test verifies:

- DOCX `pdf_attachment` option is unavailable/blocked.
- no ready `converted_pdf` DerivedAsset is produced.
- PDF send refs are empty.
- no legacy fallback is selected for PDF.
- no process launch occurs.
- no raw runtime root, storage URI, executable name, or symbolic adapter diagnostic is exposed in the user-facing option payload.

## Sanitized Evidence

M36 evidence records only symbolic diagnostics, path classes, path lengths, pass/fail state, validation stages, cleanup state, and PDF validation state.

It does not record raw absolute paths, usernames, runtime roots, sandbox roots, executable paths, input/output paths, command lines, environment, DOCX body, PDF body, storage refs, content tokens, or full hashes.

## Validation

M36 validation:

- `npm run rebuild:node`
- `npx vue-tsc --noEmit --pretty false`
- `git diff --check`
- `npm run test:office-pdf-libreoffice-packaged-smoke`
- `npx vitest --run infra/files/dfcLibreOfficePdfAdapter.test.ts --reporter=dot --silent`
- targeted LibreOffice runtime/adapter/installer/acquisition/lifecycle/archive/checklist/M35 tests
- targeted DFC worker tests for LibreOffice / Office PDF / DOCX `pdf_attachment` / unsupported / real managed
- default-off path-depth matrix test
- privacy/sanitized evidence scan

Result: passed. The first targeted worker run was discarded because the sandboxed command resolved `tests/setup.ts` from the wrong cwd before collecting tests; the same worker filter passed when rerun from the real repo cwd.

## Gate Status

Closed in M36:

- Product/runtime path-cap guard implemented for managed Windows x64 LibreOffice DOCX-to-PDF.
- Cap-exceeded cases fail before process launch with `office_pdf_path_policy_exceeded`.
- Worker option semantics for path-cap failure are blocked/unavailable with no ready PDF asset.
- Short-path packaged managed-runtime smoke remains green after the product gate change.

Still blocked:

- production Office-to-PDF support.
- `productionApproved=true`.
- `downloadEnabled=true`.
- user-visible experimental exposure.
- full multi-platform packaged app / installer smoke matrix.
- legal/provenance final approval.
- signing/trust final approval.
- production acquisition/distribution approval.
- broad long-path support.
- Office format expansion beyond DOCX.

## Recommended M37

Recommended M37: run a true packaged Electron app / installer smoke under the same controlled short-path policy, using the active managed runtime discovery path and owner-gated local package import. Keep `productionApproved=false` and `downloadEnabled=false`; do not expand Office formats or claim production support.
