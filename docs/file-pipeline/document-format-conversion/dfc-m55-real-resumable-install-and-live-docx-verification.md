# DFC-M55 Real Resumable Install and Live DOCX Verification

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. M55 consumed exactly one real LibreOffice `install_official_plugin` attempt after M54 resumable streaming. It did not approve any additional platform, acquisition mode, runtime source, or file format.

## Runtime Preflight

| Evidence point | Result |
| --- | --- |
| App mode | dev Electron live user data |
| External `.svpkg` env/path injection | not used |
| External runtime path injection | not used |
| System LibreOffice / PATH fallback | not used |
| Initial runtime state | missing |
| Existing runtime reused | no |
| Install attempt count | one real `install_official_plugin` operation |

No `STARVERSE_DFC_LIBREOFFICE*` external injection variables were present in the shell before the live smoke.

## Operation State and Retry Behavior

The live smoke launched the real Plugin Management / `install_official_plugin` path and reached the LibreOffice resumable downloader. The process did not produce final JSON evidence because the smoke harness did not yet treat the M54 `paused_retryable` state as terminal. A read-only sanitized runtime observation of the app-managed official download metadata showed:

| Field | Sanitized result |
| --- | --- |
| Official descriptor match | matched |
| Source kind | `github_release_asset` |
| Range support mode | `direct_browser_download_url` |
| Current bytes written | `0` |
| Partial package file | absent |
| Retry count metadata | `4` |
| Terminal diagnostic | `resume_retries_exhausted` |
| Effective operation result | `paused_retryable` |

Interpretation: the operation started the real resumable official install path, but package body transfer did not make progress beyond byte 0. M54 automatic retry policy was exercised and exhausted. Because `currentBytesWritten=0` and no partial package file exists, verification, staging, activation, and DOCX conversion were not reached.

## Harness Observability Fix

M55 added a harness-only fix in `scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs`:

- `paused_retryable` is now treated as a terminal live-smoke state.
- Install polling now prints sanitized `dfc-m47-live-smoke-install-progress` records on state/progress changes.

This does not change production downloader, lifecycle, Plugin Management, DFC worker, runtime gate, trust policy, package descriptor, or acquisition behavior.

## Verification and Activation Result

| Gate | Result |
| --- | --- |
| Package size verification | not reached |
| Package sha256 verification | not reached |
| Signed catalog / trust policy | not reached |
| Manifest/runtime identity | not reached |
| Platform/arch | not reached |
| Executable relative path/hash/size | not reached |
| Capabilities `office_to_pdf` / `docx_to_pdf` | not reached |
| Realpath containment / symlink escape checks | not reached |
| Revocation/expiration checks | not reached |
| Path-cap policy | not reached |
| Activation | not reached |

## Plugin Management Status

The live Plugin Management status path was exercised sufficiently to start the official operation. Ready-state Plugin Management verification was not reached because the install paused retryable before activation.

Expected existing policy remains unchanged:

- Windows x64 DOCX-to-PDF is the only production-approved scope when the package gate is valid.
- Manual install only.
- Automatic/startup/background/postinstall/conversion-time download remains disabled.
- macOS/Linux packages remain pending.
- DOCX-only scope remains enforced.

## Live DOCX-to-PDF Result

Live DOCX-to-PDF was not reached. The runtime remained unavailable because the install operation paused retryable before any package body was staged or activated.

| DFC evidence | Result |
| --- | --- |
| `pdf_attachment` ready option | not reached |
| Target kind `pdf_attachment` | not reached |
| DerivedAsset kind `converted_pdf` | not reached |
| Send strategy `file_attachment` | not reached |
| SendAssetRef kind `derived_asset` | not reached |
| Selected-ref authority | not reached |
| PDF validation `valid_pdf` | not reached |
| Metadata-only preview | not reached |

No silent fallback was observed from a completed conversion path because conversion did not run. The missing-runtime preflight path remains blocked rather than falling back to system LibreOffice, PATH, markdown, original file, plain text, or legacy selectedSendMode.

## Privacy and Artifact Evidence

M55 evidence records only runtime state class, source kind, range mode, retry count, current byte count, terminal diagnostic, and gate reachability. It does not record raw URLs, raw filesystem paths, package paths, temp paths, runtime roots, executable paths, sandbox roots, input/output paths, command lines, env values, storage refs, content tokens, full hashes, DOCX bodies, PDF bodies, manifest bodies, or private keys.

No LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, packaged output, or private key is intentionally added by this round. The observed app-managed partial file was absent after retry exhaustion.

## Validation

| Check | Result |
| --- | --- |
| `npm run rebuild:node` | passed before live smoke |
| `npm run rebuild:electron` | passed before live Electron |
| External LibreOffice env check | no `STARVERSE_DFC_LIBREOFFICE*` injection present |
| Live smoke | consumed one real install operation; paused retryable |
| `node --check scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs` | passed after harness fix |
| `npx vue-tsc --noEmit --pretty false` | passed |
| `git diff --check` | passed with LF/CRLF warnings only |
| Privacy/artifact scan | passed for M55 evidence; policy-language hits were reviewed as non-leaks |
| Runtime artifact git-status scan | no `.svpkg`, MSI, runtime, staging, sandbox, official-download, packaged-output, or private-key artifact matched git status |
| Final `npm run rebuild:node` | passed |

## Final Classification

`real_resumable_install_paused_retryable`

M55 proves the real official install path reaches the M54 resumable downloader, but the current network/transport fails before any package body bytes are retained. The single authorized real install operation was consumed. Do not start a second install operation or click Retry without explicit Owner authorization.

## Recommended Next Step

M56 should make the Retry path observable and owner-controlled: surface the paused retryable state in live smoke evidence immediately, then only after explicit Owner approval click `Retry install` once or use a harness-local official asset body substitute that still exercises `install_official_plugin -> downloader -> size/hash/trust -> staging -> activation -> DFC`.
