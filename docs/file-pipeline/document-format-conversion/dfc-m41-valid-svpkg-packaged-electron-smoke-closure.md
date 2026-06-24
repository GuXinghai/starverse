# DFC-M41 Valid SVPKG Packaged Electron Smoke Closure

Date: 2026-06-22

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This round closes the M40 smoke blocker with a valid repo-external LibreOffice managed runtime package. It does not expand plugin functionality, does not approve production support, and keeps LibreOffice Office-to-PDF DOCX-only, owner-gated, experimental, `productionApproved=false`, and `downloadEnabled=false`.

## Scope Boundary

Unchanged:

- `productionApproved=false`.
- `downloadEnabled=false`.
- Office-to-PDF remains DOCX-only, owner-gated, experimental, and not production-approved.
- no production Office-to-PDF support claim.
- no `.doc`, `.rtf`, `.docm`, `.xls/.xlsx`, PS/EPS, PDF OCR, image, or audio expansion.
- no system LibreOffice discovery, PATH fallback, common-install probing, arbitrary executable path, renderer-provided executable path, automatic runtime download, postinstall download, install/repair download, or conversion-time download.
- no DB schema, Send Plan main-flow, asset model, DFC vocabulary, dependency, lockfile, GitHub release asset mutation, sandbox policy, macro policy, network policy, external-link policy, shell policy, diagnostics privacy, or path-cap loosening.

## Valid Package Preflight

The true packaged Electron smoke used an explicit repo-external package through:

```text
STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SVPKG
```

The package source class was `github_prerelease_repo_external_temp`. The package was acquired for this local evidence run only; product runtime download remains disabled and no automatic download path was added.

Sanitized preflight result:

| Field | Evidence |
| --- | --- |
| extension | `.svpkg` |
| size bytes | 518907010 |
| size class | `>=100mb` |
| expected size matched | yes |
| expected hash matched | yes |
| hash evidence | short prefix `ce012cf1215f` |
| diagnostic | none |
| result | pass |

The preflight rejects missing, non-`.svpkg`, unreadable, tiny, expected-size-mismatch, and expected-hash-mismatch inputs before import/staging. Tiny placeholders, HTML error pages, JSON/text responses, empty files, and truncated artifacts fail closed with symbolic diagnostics such as `office_pdf_package_invalid_size`.

## True Packaged Electron Smoke Result

Command executed:

```text
npm run test:office-pdf-libreoffice-packaged-electron-smoke
```

Result: passed.

The smoke imported/staged the valid repo-external `.svpkg` into a production-like app-managed runtime root, rebuilt the Electron ABI for packaging, built a directory-packaged Windows x64 Electron app, launched the packaged app with smoke-only DFC mode, and triggered DOCX-to-PDF through the packaged app path.

Packaged app evidence:

| Field | Evidence |
| --- | --- |
| case id | `m41-valid-svpkg-packaged-electron-smoke` |
| app mode | packaged Electron directory app |
| plugin row visible | yes |
| plugin status | `degraded` because owner gate remains not production-approved |
| plugin diagnostic | `owner_gate_not_production_approved` |
| package version | `0.1.0` |
| runtime version | `26.2.4` |
| runtime source | `managed_manifest` |
| runtime discovery | `validated_by_packaged_worker` |
| DOCX-to-PDF result | ready `pdf_attachment` |
| PDF validation | `valid_pdf` from adapter-level staged packaged smoke |
| cleanup status | attempted |
| selected-ref authority | `derived_asset` |
| send strategy | `file_attachment` |
| preview | metadata-only `raw_file:ready` |
| evidence privacy | sanitized |

Additional direct packaged smoke validation also passed through:

```text
npm run test:office-pdf-libreoffice-packaged-smoke
```

That command validated the same valid repo-external package through import, adapter conversion, and the real managed DFC worker path without launching Electron.

## Path Cap Evidence

The M36 production short-path gate remained active.

Packaged Electron path lengths emitted by the true packaged app smoke:

| Path | Length | Cap | Result |
| --- | ---: | ---: | --- |
| user data root | 17 | n/a | pass |
| runtime root | 72 | 120 | pass |
| input path | 41 | 130 | pass |

Adapter-level staged packaged smoke path lengths from the same command:

| Path | Length | Cap | Result |
| --- | ---: | ---: | --- |
| runtime root | 72 | 120 | pass |
| sandbox root | 47 | 80 | pass |
| input path | 66 | 130 | pass |
| output dir | 54 | 90 | pass |
| isolated profile dir | 72 | 110 | pass |

Direct packaged smoke path lengths:

| Path | Length | Cap | Result |
| --- | ---: | ---: | --- |
| runtime root | 98 | 120 | pass |
| sandbox root | 47 | 80 | pass |
| input path | 66 | 130 | pass |
| output dir | 54 | 90 | pass |
| isolated profile dir | 72 | 110 | pass |

Path-cap result: all observed M36 controlled short-path caps were satisfied. The product/runtime gate still fails closed before `soffice` launch with `office_pdf_path_policy_exceeded` when any cap is exceeded.

## Package and Runtime Validation Summary

| Validation | Result |
| --- | --- |
| package hash/size | matched expected catalog evidence |
| manifest identity | validated |
| runtime identity | validated |
| package/runtime version | validated as `0.1.0` / `26.2.4` |
| platform/arch | validated as `win32` / `x64` |
| executable relative path | validated as manifest-relative `program/soffice.exe` |
| executable hash/size | validated |
| required capabilities | `office_to_pdf` and `docx_to_pdf` validated |
| realpath containment | validated by managed runtime gate |
| symlink/reparse escape rejection | covered by package/runtime archive tests |
| active runtime activation | validated |
| spawn source | managed runtime descriptor only |

## DFC Option, Preview, and Send Plan Summary

| Behavior | Result |
| --- | --- |
| DOCX `pdf_attachment` | ready when valid managed runtime is active and enabled |
| DerivedAsset | `converted_pdf` |
| send strategy | `file_attachment` |
| send asset ref | `derived_asset` |
| preview | metadata-only; no PDF body exposed in UI evidence |
| Send Plan authority | selected refs plus verified DerivedAsset metadata |
| `original_file` | independent |
| DOCX `markdown` | independent |
| unsupported `.doc` / `.rtf` / `.docm` | remain unsupported |

## Fail-Closed Coverage

| Case | Diagnostic / state | Launch behavior | DFC behavior |
| --- | --- | --- | --- |
| invalid/tiny `.svpkg` | `office_pdf_package_invalid_size` | no Electron launch after preflight failure | no package import, no stale ready PDF |
| missing package | `office_pdf_package_missing` | no Electron launch after preflight failure | no package import, no stale ready PDF |
| invalid manifest | `office_pdf_runtime_manifest_invalid` / invalid state | no process launch after runtime gate failure | blocked/unavailable `pdf_attachment` |
| executable hash/size mismatch | manifest/runtime invalid diagnostic family | no process launch after runtime gate failure | no ready `converted_pdf` |
| disabled runtime | `office_pdf_runtime_disabled` / disabled state | no process launch | blocked/unavailable `pdf_attachment` |
| quarantined runtime | `office_pdf_runtime_quarantined` / quarantined state | no process launch | blocked/unavailable `pdf_attachment` |
| path policy exceeded | `office_pdf_path_policy_exceeded` | no `soffice` launch | blocked/unavailable `pdf_attachment`, no legacy fallback |

For all fail-closed states: no system LibreOffice discovery, no PATH fallback, no arbitrary executable path, no renderer-provided executable path, no `.doc` / `.rtf` / `.docm` route, and no stale ready `converted_pdf` option.

## Privacy and Redaction Evidence

The smoke and preflight evidence intentionally record only symbolic and bounded fields: case id, source class, extension, size class, short hash prefix, validation stage, pass/fail, diagnostic code, cleanup status, PDF validation status, and DFC semantic summary.

Evidence does not include raw package paths, user paths, runtime roots, sandbox roots, executable paths, input/output paths, command lines, env, storage refs, content tokens, DOCX/PDF body, manifest body, license body, or full hashes.

## Remaining Production Blockers

- `productionApproved` remains false.
- `downloadEnabled` remains false.
- Owner must still approve production exposure.
- Signing/trust policy and production acquisition/distribution decisions remain incomplete.
- Multi-platform package evidence remains incomplete.
- Macros, external links, network, and embedded object execution remain manifest-declared controls and production blockers until invocation-enforced evidence or accepted policy exists.
- Long-path support remains deferred; controlled short-path policy remains the only supported execution envelope for this plugin path.

## Recommended Next Round

Recommended M42: convert this closed packaged Electron smoke into a release-candidate readiness gate by adding signed package/trust verification evidence and production distribution decision wiring, while keeping Office-to-PDF owner-gated, experimental, DOCX-only, `productionApproved=false`, and `downloadEnabled=false` until explicit Owner approval.
