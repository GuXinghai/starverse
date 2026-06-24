# DFC-M50 LibreOffice Streaming Acquisition and DB-Worker Isolation

Date: 2026-06-23

## Scope

M50 hardens the LibreOffice official install path for the large Windows x64 `.svpkg` by replacing the LibreOffice network body-transfer step with a shared streaming-to-temp-file acquisition path. It does not perform another full LibreOffice package retry by default and does not change the user-initiated-only acquisition model.

## Old Architecture

Before M50, the shared official package transport exposed only `fetchPackage() -> bytes`. The default transport used `fetch(...)` followed by `response.arrayBuffer()`. LibreOffice official install then verified size/hash from the in-memory bytes and passed those bytes into the existing `.svpkg` import/activation pipeline.

This was acceptable for small packages, but it left the Windows x64 LibreOffice package exposed to a 500 MB full body buffer during official install. M47/M49 did not reproduce a service-level or DB-handler status-polling bug with mocked pending operations, so the remaining risk was live body-transfer pressure during a real large package acquisition.

## New Architecture

The shared downloader now supports a file-staging path:

1. Validate fixed official catalog/source policy.
2. Use `fetchPackageToFile()` when the caller requires file staging.
3. Stream response chunks to an app-managed temporary download file.
4. Update operation status freshness from chunk progress.
5. Enforce max bytes and content length.
6. Compute sha256 while streaming.
7. Verify expected package size and hash before import/activation.
8. Delete partial files on cancellation, stream error, size mismatch, hash mismatch, or redirect rejection.
9. Pass the verified temp package file into the existing LibreOffice `.svpkg` import/activation seam.
10. Delete the verified temp file after import completes.

LibreOffice official install now uses `downloadOfficialPackageToFile()`. The Magika official install path keeps its existing bytes-based flow.

## Status Observability

LibreOffice install operation state remains the existing Magika-aligned DTO/state model:

`accepted -> pending -> downloading -> verifying -> staging -> registering -> health_checking -> installed`

During streaming, the service keeps the operation record updated without exposing file paths, URLs, command lines, environment, package paths, runtime roots, executable paths, storage refs, content tokens, full hashes, DOCX/PDF bodies, or manifest bodies to the renderer.

The status polling regression used a simulated streaming file transport that stayed in `downloading` while repeated `getInstallOperationStatus` calls returned promptly. The operation then completed through the file importer seam and reached `installed`.

## Simulated Large-Body Result

No real LibreOffice package body was downloaded in M50.

Simulated and unit coverage:

- `downloadOfficialPackageToFile` stages and verifies a file transport result.
- Hash mismatch removes the downloaded temp file and does not activate.
- `fetchPackageToFileWithFetch` streams response body chunks to a file without `arrayBuffer()`.
- Stream error removes partial output.
- LibreOffice official install uses `fetchPackageToFile`, not `fetchPackage`.
- LibreOffice status polling remains observable during a pending streaming acquisition.
- The verified temp file is removed after import.

## Cleanup Behavior

Partial download cleanup is fail-closed:

- stream failure: partial file removed;
- hash mismatch: downloaded temp file removed;
- size mismatch: downloaded temp file removed;
- redirect rejection after transfer: downloaded temp file removed;
- import failure: active runtime not registered and temp file removed;
- operation status DTO remains path-free.

The writer cleanup waits for the file stream to close before removing partial files, which avoids Windows handle races.

## Import And Activation Integration

After size/hash verification, the verified temp package enters the existing LibreOffice `.svpkg` import/activation seam. The existing import/activation checks remain in force:

- manifest identity;
- runtime identity;
- package/runtime version;
- platform/arch;
- executable relative path;
- executable hash/size;
- `office_to_pdf` and `docx_to_pdf` capabilities;
- trust/revocation/expiration policy;
- realpath containment;
- symlink/reparse escape rejection.

Known remaining implementation note: the existing `.svpkg` archive extractor is still byte-based after the verified temp file enters import. M50 removes full `arrayBuffer()` buffering from the network acquisition phase and keeps operation status observable during streaming; a future package-archive streaming extractor can reduce import-stage memory pressure further if needed.

## Real Install Retry

No real full LibreOffice official install retry was attempted in M50. The live app-managed runtime remains unverified in this round unless a separate M51/M47 rerun performs one controlled user-initiated install after this streaming change.

## Installed-State DOCX Result

Not reached in M50. No runtime was installed or activated by a real full package download in this round, so no live installed-state DOCX-to-PDF workflow was rerun.

## Privacy Evidence

The new code keeps renderer-facing operation DTOs symbolic and path-free. Tests assert no Windows path, file URL, executable path, storage ref, or content token appears in operation output. The evidence in this document records only symbolic states, sanitized diagnostics, and pass/fail summaries.

## Final Classification

`streaming_acquisition_ready_no_real_retry`

## Remaining Work

Recommended M51:

1. Perform one controlled real `install_official_plugin` retry through the normal Plugin Management path after Owner/network approval.
2. If install succeeds, rerun live installed-state DOCX-to-PDF verification.
3. If memory pressure appears during import rather than download, consider a separate bounded `.svpkg` archive streaming extractor round.

Keep Windows x64 DOCX-to-PDF scoped production approval unchanged. Do not enable automatic/startup/background/postinstall/conversion-time download, external `.svpkg` injection, system LibreOffice, PATH fallback, arbitrary executable paths, arbitrary URLs, macOS/Linux approval, or unsupported Office/PDF/image/audio formats.
