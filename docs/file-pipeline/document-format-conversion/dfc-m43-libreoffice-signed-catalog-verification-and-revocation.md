# DFC-M43 LibreOffice Signed Catalog Verification And Revocation Enforcement

Date: 2026-06-22

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This round implements a signed Starverse catalog verification layer for LibreOffice DOCX-to-PDF managed runtime packages, including revocation, expiration, and rollback eligibility enforcement. It keeps current owner-gated hash-pinned candidate usage working and does not enable production approval or downloads.

## Scope Boundary

Unchanged:

- `productionApproved=false`.
- `downloadEnabled=false`.
- LibreOffice Office-to-PDF remains DOCX-only, owner-gated, experimental, and not production-approved.
- no production Office-to-PDF support claim.
- no unsigned package can be production-approved.
- no `.doc`, `.rtf`, `.docm`, `.xls/.xlsx`, PS/EPS, PDF OCR, image, or audio expansion.
- no automatic runtime download, install/repair download, postinstall download, or conversion-time download.
- no system LibreOffice discovery, PATH fallback, common-install probing, arbitrary executable path, or renderer-provided executable path.
- no Send Plan main-flow, asset model, dependency, lockfile, GitHub release asset mutation, sandbox loosening, path-cap loosening, macro-policy loosening, network-policy loosening, external-link-policy loosening, shell-policy loosening, or diagnostics privacy loosening.
- no private signing material is committed or embedded.

## Signed Catalog Schema

Implemented module: `infra/files/dfcLibreOfficeSignedCatalog.ts`.

Catalog payload schema:

| Field | Requirement |
| --- | --- |
| `schemaVersion` | supported value `1` |
| `catalogId` | `starverse-dfc-libreoffice-runtime-catalog` |
| `createdAt` | ISO timestamp |
| `entries` | array of LibreOffice runtime package entries |

Each entry includes:

- package id.
- runtime package id.
- runtime id.
- plugin id.
- runtime version.
- package version.
- platform.
- arch.
- package sha256.
- package size.
- executable relative path.
- executable sha256.
- executable size.
- capabilities.
- source kind.
- channel.
- production approval state.
- trust policy id.
- createdAt.
- optional expiresAt.
- optional revokedAt.
- optional revocationReason.
- rollbackAllowed.
- minimum Starverse contract version.

Signed envelope schema:

| Field | Requirement |
| --- | --- |
| `schemaVersion` | supported value `1` |
| `payload` | canonicalized catalog payload |
| `signature.algorithm` | `ed25519` |
| `signature.keyId` | must match a trusted catalog key |
| `signature.value` | base64 signature bytes |
| `signature.signedAt` | optional ISO timestamp |

## Canonicalization

M43 implements a narrow deterministic JSON serializer for the signed LibreOffice catalog payload. Object keys are sorted lexicographically, arrays preserve order, and primitive values use JSON encoding. No new dependency was added.

## Trust Root Model

M43 implements a test/dev trust root mechanism:

- trust root schema version `1`.
- trusted keys include `keyId`, `algorithm`, `publicKeyPem`, and scope.
- scope is `test_only` or `owner_controlled_production`.
- tests generate Ed25519 key pairs at runtime.
- no private signing material is committed.
- no production signing secret is embedded.

Production trust root remains owner-controlled and must be supplied through an approved production trust-root path in a later round.

## Verification Order

Signed catalog verification checks:

1. catalog envelope is present when signed-catalog mode is required.
2. catalog schema version is supported.
3. signature algorithm is allowed.
4. key id is trusted by the trust root.
5. Ed25519 signature validates over the canonical catalog payload.
6. catalog entry matches manifest identity.
7. package sha256 and package size match catalog entry.
8. runtime identity matches catalog entry.
9. platform and arch match.
10. executable relative path matches.
11. executable hash and size match.
12. capabilities include `office_to_pdf` and `docx_to_pdf`.
13. trust policy id matches the M42 selected policy.
14. package is not revoked.
15. package is not expired.
16. source/channel is allowed for the requested mode.
17. owner-gated candidate readiness or production trust readiness is emitted.

The existing package import/runtime gates still perform archive extraction, manifest validation, realpath containment, symlink/reparse rejection, activation, sandboxing, and process launch controls.

## Owner-Gated Compatibility

Current M41/M42 behavior is preserved:

| Mode | Unsigned hash-pinned candidate behavior |
| --- | --- |
| owner-gated candidate | allowed to run when existing hash-pinned gate passes |
| production | blocked by `office_pdf_catalog_signature_missing` |

Explicit status fields distinguish the two states:

- `ownerGatedCandidateReadiness=owner_gated_hash_pinned_ready`.
- `productionTrustReadiness=blocked_signature_missing`.
- `signatureCatalogStatus=signature_missing_catalog_unsigned`.

This keeps packaged smoke compatibility while making signature absence a production approval blocker.

## Production Signature Requirement

Production-required mode blocks unless signed catalog trust passes. Missing, invalid, untrusted, revoked, expired, mismatched, unsupported-schema, or source-unapproved catalog states all produce blocked trust status before launch.

Symbolic diagnostics:

- `office_pdf_catalog_signature_missing`.
- `office_pdf_catalog_signature_invalid`.
- `office_pdf_catalog_untrusted_key`.
- `office_pdf_catalog_package_revoked`.
- `office_pdf_catalog_package_expired`.
- `office_pdf_catalog_package_mismatch`.
- `office_pdf_catalog_schema_unsupported`.
- `office_pdf_catalog_source_unapproved`.

These diagnostics are path-free and renderer-safe.

## Revocation And Expiration

Revocation is a hard block:

- must not launch `soffice`.
- must not be a rollback target.
- DOCX `pdf_attachment` unavailable/blocked when surfaced to DFC.
- no ready `converted_pdf`.
- no stale ready PDF option.
- no legacy fallback.
- no system/PATH fallback.

Expiration is also treated as a hard block for signed-catalog verification and rollback eligibility in M43. Owner-gated unsigned candidate usage remains controlled by the current hash-pinned compatibility path and remains blocked for production.

## Rollback Eligibility

M43 adds signed-catalog rollback eligibility evaluation and wires optional catalog verification into the LibreOffice managed package rollback path. A rollback target is eligible only when:

- plugin/runtime identities match.
- platform and arch match.
- package hash and size verification passed.
- manifest/runtime/executable catalog verification passed.
- target is not revoked.
- target is not expired.
- `rollbackAllowed=true`.
- trust policy passes for the requested mode.

Revoked, expired, platform/arch-mismatched, catalog-mismatched, signature-failed, and rollback-disallowed targets are rejected before filesystem restore.

## Plugin Management Trust Display

Plugin Management status includes:

- catalog signature status.
- key id status.
- revocation status.
- expiration status.
- rollback eligibility.
- production trust readiness.
- owner-gated candidate readiness.
- existing trust states, distribution states, package decision, signature/catalog status, production approval, download state, last verification result, and sanitized diagnostic code.

No raw package path, executable path, manifest body, license body, command line, env, full hash, storage ref, content token, DOCX body, or PDF body is displayed.

## DFC Behavior Under Trust States

| Trust state | DFC behavior |
| --- | --- |
| valid owner-gated hash-pinned candidate | ready DOCX `pdf_attachment`, `converted_pdf`, `file_attachment`, `derived_asset`, metadata-only preview, selected-ref Send Plan authority |
| production mode with missing signature | blocked before process launch |
| invalid signature | blocked before process launch |
| untrusted key | blocked before process launch |
| revoked package | blocked before process launch |
| expired package | blocked before process launch |
| catalog/package mismatch | blocked before process launch |
| rollback-ineligible target | rollback rejected before filesystem restore |

DOCX `markdown` and `original_file` remain independent where already supported. `.doc`, `.rtf`, and `.docm` remain unsupported.

## Privacy And Redaction Evidence

Evidence and status expose only:

- symbolic diagnostic codes.
- enum trust states.
- enum distribution states.
- enum readiness states.
- short hash prefixes where existing smoke policy already allows them.
- path length classes in smoke evidence.

The signed catalog tests generate keys at runtime and do not commit signing secrets. Smoke logs are sanitized; no raw `.svpkg` path, runtime root, sandbox root, executable path, input/output path, user path, command line, env, storage ref, content token, DOCX/PDF body, manifest body, license body, or full hash is recorded in the evidence doc.

## Packaged Smoke Status

M43 preserves M41/M42 packaged smoke compatibility. The owner-gated unsigned candidate path remains usable because signature absence blocks production mode, not the existing owner-gated hash-pinned candidate mode.

Validation reran the true packaged Electron smoke and direct packaged smoke with a valid repo-external `.svpkg` and sanitized output.

| Field | Evidence |
| --- | --- |
| true packaged Electron smoke | passed |
| direct packaged smoke | passed |
| package size class | `>=100mb` |
| expected size/hash | matched |
| hash evidence | short prefix only |
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
| evidence privacy scan | no raw path, package path, command line, `soffice` path, env var, or full-hash hits |

## Remaining Production Blockers

- explicit Owner approval.
- owner-controlled production trust-root provisioning.
- signed production catalog publication.
- final legal/provenance approval.
- approved production distribution source.
- approved production release/mirror/bundling decision.
- multi-platform package evidence.
- invocation-enforced or explicitly accepted production policy for macros, external links, network, and embedded objects.
- continued packaged-app smoke evidence after production trust-root/catalog publication.

## M44 Recommendation

Proceed to M44 by adding an owner-controlled production trust-root/catalog provisioning path and a production distribution approval workflow. Keep `productionApproved=false`, `downloadEnabled=false`, DOCX-only scope, owner gating, and no system/PATH fallback until Owner/legal/distribution gates close.
