# DFC-M54 LibreOffice Resumable Streaming Download

Date: 2026-06-24

## Scope

M54 implements resumable streaming download for the fixed first-party LibreOffice Windows x64 GitHub Release `.svpkg` asset used by the Plugin Management `install_official_plugin` operation.

This round did not run a real full LibreOffice package download and did not run a real `install_official_plugin` install. The implementation remains limited to:

- fixed official LibreOffice GitHub Release asset descriptor;
- Plugin Management user-initiated official install only;
- Windows x64 LibreOffice DOCX-to-PDF package;
- existing size/hash/trust/staging/activation gates.

No arbitrary URL input, automatic download, startup/background download, postinstall download, conversion-time download, system LibreOffice, PATH fallback, external `.svpkg` injection, external runtime root injection, macOS/Linux approval, or unsupported Office/PDF/image/audio format support was added.

## M53 Capability Summary

M53 classified the official asset as `resume_supported`:

- HEAD passed with `http_200`;
- content length matched `bytes_518907010`;
- `Accept-Ranges` was `bytes`;
- direct browser download URL first/mid/tail Range probes returned `http_206`;
- final redirected asset host first/mid/tail Range probes returned `http_206`;
- repeated first range was deterministic;
- GitHub asset API octet-stream mode was not selected as the preferred path because one bounded first-range probe timed out.

M54 uses the direct release download URL / final redirected asset-host behavior. It does not generalize resume to arbitrary URLs.

## Resume Metadata Model

The resumable path persists renderer-safe internal metadata beside the app-managed temporary artifact. The metadata records:

- plugin id;
- runtime id;
- package id;
- release tag;
- asset name;
- source kind: `github_release_asset`;
- expected size class: `bytes_518907010`;
- expected sha256 as an internal comparison value;
- current bytes written;
- internal temp artifact id;
- range support mode: `direct_browser_download_url`;
- created/updated timestamps;
- retry count;
- terminal diagnostic when paused or failed.

The metadata is not sent to renderer and does not include raw temp path, package path, runtime root, executable path, raw URL, token, command line, environment, storage ref, content token, DOCX/PDF body, manifest body, or private key material.

## Retry Policy

LibreOffice official download now keeps the M50 streaming-to-temp-file path and adds resume:

1. First attempt streams from byte `0` into an app-managed partial file.
2. Transient body-transfer failure preserves partial metadata when the descriptor still matches.
3. Automatic retry count is capped at `3`.
4. Retry delay is `3000 ms`.
5. Retry sends `Range: bytes=<currentSize>-`.
6. Resume requires `206 Partial Content` and a `Content-Range` starting at `currentSize`.
7. `200` on a resume request fails closed with `resume_range_ignored`; it does not blindly append.
8. `416` fails with `resume_range_rejected` unless the partial already equals expected size and final verification passes.
9. Invalid `Content-Range` fails with `resume_content_range_invalid`.
10. Exhausted retry budget pauses the operation with `resume_retries_exhausted`.
11. Hash mismatch, size mismatch, revoked package, expired package, untrusted catalog, unsupported platform, invalid manifest, executable mismatch, and path policy failures are not retried as network failures.

Completion still verifies final size and sha256 before the package enters the existing trust/staging/activation pipeline.

## Retry And Cancel Behavior

After automatic retries are exhausted:

- operation state becomes `paused_retryable`;
- status remains visible and no runtime is activated;
- Plugin Management surfaces a user Retry path through the existing official install action;
- Plugin Management surfaces `Cancel install`;
- Cancel clears the retained partial artifact and metadata through lifecycle cleanup;
- renderer receives only symbolic state and diagnostics.

Retry reuses the same `install_official_plugin` operation model and the same fixed official descriptor. It does not add a local package UI, arbitrary URL input, or production-facing local install mode.

## Status And Progress

Operation states now include:

- `retrying`;
- `paused_retryable`;
- existing states `accepted`, `pending`, `downloading`, `verifying`, `staging`, `registering`, `health_checking`, `installed`, `failed`, and `cancelled`.

The downloader emits sanitized progress with current byte count, total byte count, retry count, and phase. The lifecycle layer uses this to keep status observable as `downloading`, `retrying`, or `paused_retryable`.

Status polling remains distinct from download failure:

- `resume_retries_exhausted` is a retryable paused download state;
- `resume_range_ignored`, `resume_range_rejected`, and `resume_content_range_invalid` are hard transport failures;
- `install_operation_status_timeout` remains reserved for status channel failure.

## Verification, Staging, And Activation

After the resumable stream completes, the existing gates still run:

1. final package size;
2. final package sha256;
3. signed catalog / trust policy;
4. staging extraction;
5. manifest identity;
6. runtime identity;
7. package/runtime version;
8. platform/arch;
9. executable relative path;
10. executable hash/size;
11. capabilities `office_to_pdf` and `docx_to_pdf`;
12. realpath containment;
13. symlink/reparse escape rejection;
14. revocation/expiration;
15. activation.

Activation failure leaves no active runtime, no ready `converted_pdf`, no process launch from a failed gate, no legacy fallback, no system LibreOffice fallback, and no PATH fallback.

## Simulated Test Results

Sanitized test evidence:

| Area | Result |
| --- | --- |
| interrupted stream resumes with Range | passed |
| retry budget exhaustion pauses retryable | passed |
| resume request returning `200` fails closed | passed |
| invalid `Content-Range` fails closed | passed |
| `416` resume rejection fails closed | passed |
| status transition to `retrying` and `paused_retryable` | passed |
| Cancel clears retained partial metadata | passed |
| Magika official install remains on bytes path | passed |
| Plugin Management paused state display and actions | passed |
| renderer DTO path/privacy scan | passed |

The simulated tests do not download the real LibreOffice package body.

## Real Install Status

Real full install attempted in M54: no.

The next full LibreOffice official install should be a separate controlled round. It must run only once unless Owner explicitly permits another attempt.

## Privacy And Artifact Evidence

Evidence and renderer state remain sanitized:

- no raw temp path;
- no package path;
- no runtime root;
- no executable path;
- no raw URL;
- no command line;
- no environment dump;
- no storage ref;
- no content token;
- no full hash in renderer evidence;
- no DOCX/PDF body;
- no manifest body;
- no private key.

No LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, packaged output, or temp output was intentionally committed in this round.

## Remaining Network / Live Verification Status

M54 completes resumable downloader implementation and simulated coverage. Live installed-state DOCX-to-PDF remains pending until a future controlled real install succeeds or an app-managed runtime is already installed.

Recommended M55: perform one controlled real LibreOffice `install_official_plugin` attempt using the resumable streaming path, then verify live DOCX-to-PDF if activation succeeds.
