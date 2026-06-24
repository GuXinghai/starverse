# DFC-M53 GitHub Asset Resume Capability Probe

Date: 2026-06-24

## Scope

M53 probed whether the fixed first-party GitHub Release asset for the LibreOffice Windows x64 `.svpkg` supports HTTP byte-range resume. This round did not run `install_official_plugin`, did not download the full package, did not consume the real install retry, and did not change product download behavior.

The probe used the existing official descriptor only:

- source kind: `github_release_asset`;
- expected size: `518907010`;
- arbitrary URL input: not used;
- package body download: not performed.

## Metadata Result

Sanitized metadata evidence:

- release metadata reachable: true;
- expected release tag found: true;
- expected asset found: true;
- asset size metadata: `bytes_518907010`;
- terminal diagnostic: none.

## HEAD Result

Sanitized HEAD evidence:

- HEAD attempted: true;
- HEAD passed: true;
- status class: `http_200`;
- content length present: true;
- content length match: `match`;
- `Accept-Ranges`: `bytes`;
- redirect host class: `release_assets_githubusercontent`;
- redirect location class: `allowed_asset_host`;
- terminal diagnostic: none.

This reverses the M52 HEAD instability for this run: HEAD/content-length was available and matched the catalog-pinned size.

## Range Results

The bounded Range probe downloaded only small slices:

| Mode | First range `0-1023` | Mid range | Tail range | Summary |
| --- | --- | --- | --- | --- |
| `browser_download_url` | `http_206`, 1024 bytes, valid `Content-Range`, total match | `http_206`, 1024 bytes, valid `Content-Range`, total match | `http_206`, 24 bytes, valid `Content-Range`, total match | passed |
| `final_redirect_asset_host` | `http_206`, 1024 bytes, valid `Content-Range`, total match | `http_206`, 1024 bytes, valid `Content-Range`, total match | `http_206`, 24 bytes, valid `Content-Range`, total match | passed |
| `github_asset_api_octet_stream` | network timeout | `http_206`, 1024 bytes, valid `Content-Range`, total match | `http_206`, 24 bytes, valid `Content-Range`, total match | network failed |

The direct browser download URL and the final redirected asset host both support bounded byte ranges. The GitHub asset API octet-stream mode was unstable for the first small range, so it should not be the first implementation target.

## Deterministic Byte Check

The first 1024-byte range was fetched twice through the direct browser download URL. The returned bytes matched. No byte body, raw URL, local path, or full hash was recorded.

## Redirect And API Mode

- Redirect to the GitHub release asset host was accepted by the current allowlist policy.
- Range support works after following the redirect.
- Range support also worked directly against the final asset host.
- GitHub asset API octet-stream mode is not reliable enough to prefer because one bounded first-range request timed out.

## Classification

Final classification: `resume_supported`.

M54 should implement resumable download for the direct GitHub Release `browser_download_url` / final redirected asset-host path, not for arbitrary URLs and not for the API mode as the primary path.

## M54 Implementation Plan

Implement only after Owner accepts the design:

1. Keep the existing M50 streaming-to-temp-file path.
2. Persist partial download metadata:
   - plugin/runtime/package identity;
   - release tag and asset name;
   - expected size and sha256;
   - current bytes written;
   - source descriptor version;
   - ETag and Last-Modified if stable;
   - range support mode.
3. On transient network failure, retry up to 3 times with a 3-second interval.
4. On retry, validate partial file size and metadata, then send `Range: bytes=<currentSize>-`.
5. Append only after `206 Partial Content` and valid `Content-Range` are observed.
6. Recompute or continue sha256 safely before final verification.
7. Never retry hash mismatch, size mismatch, revoked package, expired package, unsupported platform, invalid manifest, executable mismatch, or trust failure.
8. After retries are exhausted, pause the operation and expose renderer-safe `Retry` / `Cancel` actions.
9. `Retry` resumes only if range support and metadata still match.
10. `Cancel` deletes the partial temp file.
11. Completion still runs the existing size/hash/trust/staging/activation pipeline.
12. Renderer must not receive temp paths, raw URLs, command lines, environment, response bodies, full hashes, or package bytes.

## Privacy And Redaction Evidence

The probe output recorded only booleans, status classes, range classes, byte-count classes, redirect host classes, and symbolic diagnostics. It did not print raw URLs, tokens, command lines, environment, local paths, full hashes, response bodies, package body, manifest body, DOCX/PDF body, or private keys.

No LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, packaged output, or temp output was intentionally created or committed in this round.
