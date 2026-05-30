# DFC-M17A Playwright Chromium Runtime Packaging Decision

Date: 2026-05-31
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: `11b08e5`

## Purpose

DFC-M17A decides whether HTML -> PDF `pdf_attachment` production conversion may depend on Playwright Chromium after M17 stopped on a missing local browser executable.

This package is decision-only. It does not implement HTML->PDF, download a browser binary, change `package-lock.json`, change production runtime code, build a package, or wire CI.

## Decision summary

Recommended strategy: **use Playwright Chromium as the rendering API, but distribute and discover the browser binary through a Starverse managed engine/runtime package before treating HTML->PDF as production-capable.**

Do not rely on:

- A developer's global Playwright cache as a production runtime.
- `postinstall` browser downloads as the normal product install path.
- Arbitrary system Chrome / Edge as the default conversion engine.
- The app renderer, app preload, or user session as the conversion runtime.

Runtime auto-download should be disabled by default. Missing browser runtime should produce a blocked/unavailable diagnostic, not a legacy fallback and not an implicit download.

## Strategy comparison

| Strategy | Binary location | Packaged app includes binary? | Offline behavior | Version pinning | Hash / provenance | Missing binary UX / diagnostic | Runtime auto-download | Managed engine / plugin fit | Windows/macOS/Linux | App size impact | Security update responsibility | M15 sandbox fit | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `npx playwright install chromium` dev-only prerequisite | Playwright user cache, for example `%LOCALAPPDATA%\\ms-playwright` on Windows. | No. | Fails unless previously installed. | Indirectly pinned by the installed Playwright package revision. | Playwright download provenance, but not Starverse-owned artifact attestation in repo/package metadata. | Show `html_pdf_browser_runtime_missing` with setup guidance for dev builds. | No for production; explicit dev command only. | Weak. Outside Starverse engine inventory. | Playwright handles platform-specific browser artifacts, but local cache path differs per OS/user. | No packaged app growth. | Developer/environment owner. | Good for local validation only. | Accept only as dev unblock after Owner approval, not production. |
| Install/postinstall download | Playwright user or project cache during npm install. | Usually no, unless install output is captured into package artifacts. | Poor. Offline/proxy-restricted installs fail or skip browser. | Pinned by Playwright package revision and install script behavior. | Download source is Playwright/CDN; Starverse must still record expected revision/hash if used. | Install-time failure or runtime missing diagnostic; failure can be confusing. | Yes, at install time; not acceptable by default for app users. | Weak to medium. It bypasses explicit engine package lifecycle. | Platform-specific downloads at install time. | No committed binary, but install time large download. | Starverse inherits update/availability risk from Playwright CDN/install flow. | Good technically after install, weak operationally. | Not recommended for production. |
| Starverse managed engine/runtime package with Playwright Chromium | Starverse managed engine directory under app data or packaged resources, with per-platform engine manifest. | Yes if bundled; alternatively shipped as an explicit offline-installable engine package. | Good if bundled or preinstalled. If absent, fail closed with an install/repair action. | Explicit engine package version pins Playwright package version and browser revision. | Engine manifest should include artifact URL/source, SHA-256, size, platform, license/provenance, and optional signature. | Show `html_pdf_browser_runtime_missing` or `html_pdf_browser_runtime_invalid` with repair/install instructions; do not generate ready derivative. | No implicit runtime auto-download by default. Optional explicit user/admin repair flow only after approval. | Strong. Aligns with managed engine/plugin package direction and future external runtimes. | Requires per-platform artifacts and discovery paths. | High: Chromium payload is large per platform. Can be optional package to protect base app size. | Starverse owns engine package update cadence, security advisories, revocation, and compatibility testing. | Strong. M15 sandbox supplies input/output/cleanup; engine package supplies executable/runtime discovery. | Recommended production path. |
| System Chrome / Edge channel | OS/browser install path discovered from system registry/common locations/channel APIs. | No. | Works only if a supported browser is installed. | Weak. Browser updates independently of Starverse. | Weak. OS/vendor-supplied provenance, but version can drift. | Show unsupported/missing/incompatible browser diagnostic; never silently fall back to legacy. | No. | Weak. Not managed by Starverse. | Very different discovery and channel behavior across OSes. | No app size growth. | Browser vendor/user/admin controls updates; Starverse owns compatibility burden without pinning. | Medium. M15 still controls files, but engine behavior drifts. | Not recommended as default; possible advanced fallback only after separate approval. |
| Dedicated Electron conversion window | Electron binary already bundled with the app. | Yes, because Electron is already packaged. | Good wherever app runs. | Pinned by app Electron version. | App build provenance covers Electron. | If conversion service cannot initialize, show blocked runtime diagnostic. | No. | Medium. Not an engine package, but already app-managed. | Good where Electron package works. | No extra browser payload beyond existing app. | Starverse owns Electron update cadence. | Medium. Needs adapter to print controlled sandbox input to controlled output. | Fallback if Owner rejects managed Playwright Chromium package. Must not reuse app renderer/preload/session. |
| Defer HTML->PDF | None. | No. | N/A. | N/A. | N/A. | Keep HTML->PDF unavailable. | No. | N/A. | N/A. | None. | None. | N/A. | Choose only if Owner rejects both managed Playwright runtime and dedicated Electron conversion window. |

## Required policy answers

### Browser binary storage

Production Playwright Chromium should live in a Starverse-managed engine/runtime location, not an implicit Playwright user cache. The engine manifest should define the platform-specific executable path relative to the engine package root.

Developer-only installs may use the Playwright cache after explicit Owner approval, but that cache is not a production contract.

### Packaged app inclusion

Preferred production model: keep the base app independent from the large Chromium payload and ship HTML->PDF as an optional managed engine package. If Owner wants HTML->PDF always available offline, include the engine package in the installer and accept the app size increase explicitly.

### Offline environments

Offline support requires either:

- The managed Chromium engine package is bundled with the app/installer.
- The managed engine package is preinstalled through an offline artifact.

If absent, HTML->PDF must fail closed as unavailable/blocked and must not auto-download at runtime.

### Version pinning

Pin all of these together:

- Starverse HTML->PDF adapter version.
- Playwright npm package version.
- Playwright Chromium browser revision.
- Engine package version and platform.

The DFC derived asset metadata should record only sanitized converter identity/version, not executable paths or raw engine internals.

### Hash and provenance verification

Each engine package should carry a manifest with:

- Browser revision.
- Platform/architecture.
- Artifact SHA-256.
- Size.
- Source/provenance URL or build source.
- License/attribution reference.
- Optional signature when engine package signing exists.

Runtime discovery should verify the manifest and executable presence before enabling HTML->PDF. A failed hash/provenance check should produce a blocked diagnostic and no ready DerivedAsset.

### Missing binary diagnostic

If missing or invalid, DFC should expose a sanitized failure such as:

- `html_pdf_browser_runtime_missing`
- `html_pdf_browser_runtime_invalid`
- `html_pdf_browser_runtime_platform_unsupported`

The diagnostic must not expose raw paths, cache directories, command lines, env, full hashes, storage refs, file body, or tokens to renderer. Send Plan must not silently route a DFC-managed selected PDF option through legacy behavior.

### Runtime auto-download

Do not allow runtime auto-download by default. A future explicit repair/install action can be considered only if Owner approves UX, network policy, provenance verification, admin/offline behavior, and rollback semantics.

### Managed engine / plugin package system

Yes: production Playwright Chromium should enter the managed engine/runtime package system or an equivalent Starverse-owned runtime inventory before HTML->PDF is considered production-capable.

### Platform differences

- Windows: avoid relying on `%LOCALAPPDATA%\\ms-playwright`; use engine package path. Validate executable presence and avoid leaking Windows paths in diagnostics.
- macOS: handle app bundle quarantine/notarization implications for bundled engine artifacts. Engine package signing/notarization policy must be explicit.
- Linux: browser runtime may require shared libraries/sandbox compatibility. Engine package health check must distinguish missing binary from unsupported host dependencies.

### App size impact

Chromium is a large binary payload. The preferred product shape is optional managed engine package to avoid increasing the base installer for users who never use HTML->PDF. Bundling in the main app is acceptable only with explicit Owner approval of size and update cost.

### Security update responsibility

If Starverse packages Chromium, Starverse owns:

- Monitoring Chromium/Playwright security updates.
- Updating and revoking vulnerable engine packages.
- Compatibility testing against the HTML->PDF adapter.
- Clear diagnostics for disabled/outdated engine packages.

Using system Chrome shifts patching to the OS/browser vendor but sacrifices deterministic rendering and compatibility. That is why system Chrome/Edge is not the default recommendation.

### M15 sandbox helper integration

M15 remains the conversion boundary:

- Create controlled sandbox input copy.
- Create controlled output directory/path.
- Provide working directory policy.
- Map timeout/termination policy.
- Sanitize diagnostics.
- Fail closed if the engine runtime is missing, invalid, times out, writes outside output dir, or produces invalid PDF.
- Cleanup sandbox after success and failure.

The managed browser runtime supplies only engine discovery/launch. It does not replace M15 sandbox path/output/diagnostic rules.

## Owner approvals required

Owner must approve these before M17 implementation resumes:

1. Playwright Chromium is allowed as the HTML->PDF rendering engine API.
2. Production binary distribution uses a Starverse managed engine/runtime package, or Owner explicitly accepts bundling in the base app.
3. Developer-only `npx playwright install chromium` is allowed only for local validation and is not a production dependency.
4. Runtime auto-download is disallowed by default.
5. Missing/invalid runtime fails closed with sanitized diagnostics and no ready `derived_asset`.
6. Engine package manifest must pin browser revision and include hash/provenance metadata.
7. Windows/macOS/Linux support is owner-gated by available signed/verified engine package artifacts or explicit platform unsupported diagnostics.
8. HTML->PDF adapter must continue through M15 sandbox helper and existing DFC selected-ref authority.

## Can M17 implementation resume?

M17 implementation may resume as **M17B** only after Owner approves the browser runtime package policy above.

If Owner only approves a dev-local pilot, M17B must be labeled dev/runtime-gated and cannot claim production HTML->PDF support.

If Owner rejects managed Playwright Chromium packaging, do not resume the Playwright implementation. Move to either:

- Dedicated Electron conversion window owner package.
- Managed external engine package owner package.
- Deferral.

## Next package: DFC-M17B HTML-to-PDF Pilot Implementation

### Goal

Implement the minimal backend-only HTML -> PDF `pdf_attachment` pilot using Playwright Chromium, gated by the approved browser runtime discovery policy and M15 sandbox helper.

### Scope

- Add browser runtime discovery/health check against the approved managed engine package path or explicitly approved dev cache path.
- Fail closed with sanitized diagnostics if the browser runtime is missing, invalid, or unsupported.
- Support only backend-owned managed local `.html` / `.htm` assets.
- Use M15 sandbox helper for input copy, output directory/path, working directory, timeout/cleanup, diagnostics, and fail-closed result.
- Launch isolated Playwright Chromium context/page per conversion job.
- Disable JavaScript by default.
- Block network/external resources by default.
- Block local file access by default.
- Use isolated cookie/storage/profile state.
- Write PDF under controlled sandbox output dir, validate PDF signature/size, then copy/write into managed derivative storage.
- Expose ready DFC derived option with `targetKind: pdf_attachment`, `sendStrategy: file_attachment`, and `derived_asset` ref.
- Preserve independent `original_file` raw_file option.
- Ensure preview and Send Plan use the same selected derived asset authority.

### Forbidden

- Do not run runtime auto-download from app code.
- Do not use app renderer, app preload, or user session.
- Do not support remote URL input.
- Do not support Office->PDF, PS/EPS, Puppeteer, LibreOffice, Ghostscript, or Pandoc.
- Do not change DB schema, IPC shape, Send Plan main-flow, asset model, DFC target vocabulary, packaged smoke, or CI.

### Acceptance

- `git diff --check`
- `npx vue-tsc --noEmit --pretty false`
- Targeted tests for browser runtime missing diagnostics, safe HTML PDF generation, JS/network/local-file blocking, sandbox output containment, preview/send selected derived refs, timeout/failure no ready derived asset, and sanitized diagnostics.
- If DB worker tests are touched, run `npm run rebuild:node` first.
- Do not run full Vitest.
