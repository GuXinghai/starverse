# DFC-M42 LibreOffice Signed Package Trust and Distribution Decision Wiring

Date: 2026-06-22

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This round adds a formal trust/distribution status layer for the LibreOffice DOCX-to-PDF managed runtime package. It does not approve production support, does not enable download, and keeps Office-to-PDF DOCX-only, owner-gated, experimental, `productionApproved=false`, and `downloadEnabled=false`.

## Scope Boundary

Unchanged:

- `productionApproved=false`.
- `downloadEnabled=false`.
- LibreOffice Office-to-PDF remains DOCX-only, owner-gated, experimental, and not production-approved.
- no production Office-to-PDF support claim.
- no `.doc`, `.rtf`, `.docm`, `.xls/.xlsx`, PS/EPS, PDF OCR, image, or audio expansion.
- no system LibreOffice discovery, PATH fallback, common-install probing, arbitrary executable path, renderer-provided executable path, automatic runtime download, install/repair download, postinstall download, or conversion-time download.
- no Send Plan main-flow, asset model, DFC vocabulary, dependency, lockfile, GitHub release asset mutation, sandbox loosening, path-cap loosening, macro-policy loosening, network-policy loosening, external-link-policy loosening, shell-policy loosening, or diagnostics privacy loosening.

## Selected Trust Model

Selected model:

```text
owner_gated_hash_pinned_signed_catalog_required_for_production
```

M42 keeps the current Windows x64 LibreOffice `.svpkg` flow owner-gated and hash-pinned. The current package can be used only for owner-gated experimental validation when its catalog size/hash and managed runtime identity match. Detached signature or signed catalog verification is documented as a production requirement and is surfaced in status as missing/untrusted until implemented.

Current model decision:

| Field | Decision |
| --- | --- |
| current trust mode | hash-pinned owner-gated offline import |
| unsigned package production approval | not allowed |
| detached signature | required before production approval |
| signed catalog | required before production approval |
| current `.svpkg` status | candidate production asset pending signing/legal approval |
| current GitHub prerelease asset | owner-gated test/candidate asset |
| production release asset | pending approval |
| product-managed mirror | pending approval |
| bundled runtime | not approved |
| system LibreOffice | disallowed |

The GitHub prerelease package is not rejected, bundled, mirrored, or approved for production in M42. It remains a test/candidate asset pending signing, legal/provenance approval, distribution approval, and Owner approval.

## Verification Order

The LibreOffice first-party runtime catalog now carries the M42 verification order:

1. package size preflight.
2. package sha256 preflight.
3. signature/catalog verification if enabled or simulated.
4. archive extraction into staging.
5. manifest identity validation.
6. runtime identity validation.
7. package/runtime version validation.
8. platform/arch validation.
9. executable relative path validation.
10. executable hash/size validation.
11. provenance/license/security policy validation.
12. realpath containment.
13. symlink/reparse escape rejection.
14. activation.
15. optional health check or smoke only in controlled owner-gated mode.

Offline import and cached package validation use the same ordering where applicable. Downloaded and bundled packages remain distribution-unapproved because `downloadEnabled=false` and bundling is not approved.

## Signature And Catalog Status

Current renderer-safe status:

| Field | Evidence |
| --- | --- |
| trust states | `unsigned_owner_gated`, `hash_pinned`, `signature_missing`, `catalog_untrusted`, `production_source_unapproved` |
| signature/catalog status | `signature_missing_catalog_unsigned` |
| package decision | `candidate_production_asset_pending_signing_legal_approval` |
| last verification result for catalog-matching package | `hash_pin_matched` |
| production approval | false |
| download enabled | false |

Invalid signature, untrusted catalog, revoked, expired, or production-source-unapproved states are modeled as trust-blocked states and must not reach process launch.

## Distribution Mode Status

Plugin Management surfaces distribution status without raw paths:

| Distribution mode | M42 state |
| --- | --- |
| offline import | `offline_import_allowed`, owner-gated experimental |
| GitHub prerelease asset | `prerelease_source_owner_gated`, test/candidate only |
| explicit install/repair download | `install_repair_download_not_approved` |
| automatic product download | `download_disabled_by_policy` |
| bundled runtime | `bundled_runtime_not_approved` |
| production release asset | `production_release_pending_approval` |
| product-managed mirror | `product_mirror_pending_approval` |
| system LibreOffice | `system_libreoffice_disallowed` |

No product path enables download, install/repair download, postinstall download, conversion-time download, or system LibreOffice discovery.

## Revocation And Rollback

M42 defines and tests the trust-blocked behavior for revoked and invalid trust states:

| Case | Behavior |
| --- | --- |
| revoked package | blocked before `soffice` launch; DOCX `pdf_attachment` unavailable/blocked; no ready `converted_pdf`; no legacy fallback |
| expired package | blocked before launch when surfaced by lifecycle trust status |
| signature invalid | blocked before launch when surfaced by lifecycle trust status |
| catalog untrusted | blocked before launch when surfaced by lifecycle trust status |
| source/distribution unapproved | blocked before launch when surfaced by lifecycle trust status |
| rollback target | eligible only if still valid, not revoked, not expired, same platform/arch, and trust policy passes |
| revoked rollback target | ineligible and must be deleted or quarantined |
| cache handling | quarantine/delete status is diagnostic-only and path-free |

Quarantine remains enforced by the managed runtime gate. Revocation is represented as a trust/distribution block in M42 status and uses the same no-launch fail-closed behavior.

## Plugin Management Status Surface

LibreOffice Office-to-PDF Plugin Management status now includes renderer-safe trust/distribution fields:

- source kind.
- trust model.
- trust states.
- distribution states.
- package decision.
- signature/catalog status.
- production approval state.
- download state.
- last verification result.
- sanitized diagnostic code.

The UI renders these fields alongside the existing owner-gated experimental product-gate status. Diagnostic details include symbolic state names only; they do not include raw package paths, runtime roots, executable paths, command lines, env, storage refs, content tokens, manifest bodies, license bodies, DOCX/PDF bodies, or full hashes.

## DFC Behavior Under Trust States

Blocked trust/distribution states produce the existing DFC blocked Office PDF behavior:

| Runtime state | DOCX `pdf_attachment` | DerivedAsset | Process launch | Fallback |
| --- | --- | --- | --- | --- |
| missing runtime | unavailable/blocked | none | no | no legacy/system/PATH fallback |
| disabled runtime | unavailable/blocked | none | no | no legacy/system/PATH fallback |
| revoked runtime | unavailable/blocked | none | no | no legacy/system/PATH fallback |
| expired runtime | unavailable/blocked | none | no | no legacy/system/PATH fallback |
| signature invalid | unavailable/blocked | none | no | no legacy/system/PATH fallback |
| catalog untrusted | unavailable/blocked | none | no | no legacy/system/PATH fallback |
| source/distribution unapproved | unavailable/blocked | none | no | no legacy/system/PATH fallback |
| hash-pinned owner-gated valid package | ready | `converted_pdf` | managed descriptor only | no fallback needed |

The worker trust-blocked test injects a trust-blocked LibreOffice runtime summary and verifies no process launch, no ready PDF asset, no raw runtime/storage leak, and independent ready `markdown` and `original_file` options where already supported.

The DFC option vocabulary remains unchanged. Trust details are exposed through Plugin Management product-gate state; DFC continues to report the existing blocked product code family for Office PDF gate denial.

## Packaged Smoke Status

M42 preserves the M41 packaged smoke path and reran it as validation with an explicit repo-external `.svpkg` environment variable:

```text
STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SVPKG
```

True packaged Electron smoke result: passed.

Direct packaged smoke result: passed.

Sanitized evidence:

| Field | Evidence |
| --- | --- |
| package source class | repo-external owner-gated candidate |
| package size bytes | 518907010 |
| package size class | `>=100mb` |
| expected size matched | yes |
| expected hash matched | yes |
| package hash evidence | short prefix `ce012cf1215f` |
| packaged app runtime root length | 72 |
| packaged app input path length | 41 |
| staged adapter runtime root length | 72 |
| staged adapter sandbox root length | 47 |
| staged adapter input path length | 66 |
| staged adapter output dir length | 54 |
| staged adapter profile dir length | 72 |
| direct packaged smoke runtime root length | 98 |
| direct packaged smoke sandbox root length | 47 |
| direct packaged smoke input path length | 66 |
| direct packaged smoke output dir length | 54 |
| direct packaged smoke profile dir length | 72 |
| PDF validation | `valid_pdf` |
| DFC semantics | ready `pdf_attachment`, `converted_pdf`, `file_attachment`, `derived_asset`, metadata-only preview, selected-ref authority |
| plugin diagnostic | `owner_gate_not_production_approved` |
| evidence privacy | sanitized |

No raw `.svpkg` path, runtime root, sandbox root, executable path, input/output path, user path, command line, env, storage ref, content token, DOCX/PDF body, manifest body, license body, or full hash is recorded.

## Privacy And Redaction Evidence

M42 status and diagnostics are symbolic and path-free:

- trust states are enum strings.
- distribution states are enum strings.
- package decision is an enum string.
- signature/catalog result is an enum string.
- last verification result is an enum string.
- `downloadEnabled` remains a boolean.
- Plugin Management diagnostics expose no raw package path, executable path, manifest body, command line, environment, storage refs, content tokens, DOCX/PDF body, license body, or full hash.

The package hash may remain stored in trusted catalog/runtime metadata, but UI and evidence use only the existing short-prefix policy where hash evidence is needed.

## Remaining Production Blockers

- explicit Owner approval.
- detached package signature or signed Starverse catalog verification.
- final legal/provenance approval.
- approved production distribution source.
- approved production release/mirror/bundling decision.
- multi-platform package evidence.
- invocation-enforced or explicitly accepted production policy for macros, external links, network, and embedded objects.
- continued packaged-app smoke evidence after the production trust model is implemented.

## M43 Recommendation

Proceed to M43 by implementing detached signature or signed Starverse catalog verification for LibreOffice `.svpkg` packages, including revocation metadata and rollback eligibility enforcement. Keep `productionApproved=false`, `downloadEnabled=false`, DOCX-only scope, owner gating, and no system/PATH fallback until Owner approval and production trust/distribution decisions are complete.
