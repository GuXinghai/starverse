# DFC-M15 External Engine Sandbox Foundation

Date: 2026-05-31

Baseline: `429fd9e`

Branch: `docs/dfc-0-format-conversion-foundation`

## 1. Purpose

DFC-M15 adds a DFC-specific sandbox foundation helper for future heavy runtime
work. It does not implement HTML-to-PDF, Office-to-PDF, PS/EPS-to-PDF, or any
real external converter.

The helper is intentionally backend-only and low-intrusion. It defines the
contract future runtime adapters must satisfy before they can produce a DFC
`pdf_attachment` derived asset.

## 2. Implemented helper

New helper: `infra/files/dfcConversionSandbox.ts`.

It defines:

- Controlled sandbox input path planning.
- Controlled sandbox output directory and output path validation.
- Engine working directory planning.
- External process policy mapping through the existing conversion-mode policy.
- Sanitized diagnostics.
- Fail-closed run outcomes.
- Cleanup status reporting.
- Future engine adapter request shape.
- Renderer-safe summary shape that excludes raw paths, commands, env, file
  bodies, storage refs, and hashes.

No real converter is called. No files are copied or converted by this helper in
M15.

## 3. Future adapter contract

The internal adapter request includes:

| Field | Purpose |
| --- | --- |
| `engineId` | Logical future engine id. |
| `inputAssetId` | Backend-owned source asset id. |
| `targetKind` | Future DFC output target, expected to include `pdf_attachment`. |
| `expectedOutputExtension` | Expected generated output extension, such as `pdf`. |
| `expectedOutputMime` | Expected generated output MIME, such as `application/pdf`. |
| `sandboxInputPath` | Controlled input path under the sandbox input directory. |
| `sandboxOutputDir` | Controlled output directory. |
| `sandboxOutputPath` | Controlled expected output path under `sandboxOutputDir`. |
| `workingDir` | Controlled engine working directory. |
| `processPolicy` | Existing external process conversion policy with `shell: false`. |

The run outcome only returns an internal `derivedAsset` candidate when the
future engine reports success and the output path remains under the controlled
output directory. Failure, timeout, missing output, or output escape remains
fail-closed with `derivedAsset: null`.

## 4. Security boundaries covered

M15 targeted tests cover:

- Absolute output path rejection.
- Path traversal rejection.
- UNC path rejection.
- Windows drive escape rejection.
- NUL character rejection.
- Controlled output remaining under the sandbox output directory.
- Conversion-mode timeout and termination policy mapping.
- Failed engine result not producing a derived asset.
- Cleanup attempted after success and failure.
- Output escape failing closed.
- Diagnostic redaction for absolute paths, command, env, token, storage refs,
  file body, and full hash.
- Renderer summary excluding raw path, command, env, file body, storage ref, and
  hash data.

## 5. Non-goals

M15 does not:

- Implement HTML-to-PDF.
- Implement Office-to-PDF.
- Implement PS/EPS-to-PDF.
- Add Chromium, Puppeteer, Playwright runtime use, LibreOffice, Ghostscript, or
  Pandoc.
- Change DB schema.
- Change IPC shape.
- Change Send Plan main flow.
- Change asset model.
- Change DFC target vocabulary.
- Add packaged smoke, CI, npm audit, ESLint, or full-suite failure work.

## 6. Validation

Validation run:

- `git diff --check`
- `npx vue-tsc --noEmit --pretty false`
- `npx vitest --run infra/files/dfcConversionSandbox.test.ts --reporter=dot --silent`

Targeted Vitest result: 1 file / 12 tests passed.

No DB worker tests were touched, so `npm run rebuild:node` was not required.

## 7. Recommended next package

Proceed to an owner-approved HTML-to-PDF pilot only after the owner selects an
engine strategy.

Recommended next package: DFC-M16 HTML-to-PDF Pilot Owner Decision.

That package should decide whether to use an existing Electron/Chromium path,
Playwright/Chromium as a production conversion runtime, or a managed external
engine. It must not assume the M11-M13 smoke harness is automatically approved
as a production converter.
