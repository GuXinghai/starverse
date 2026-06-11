# DFC LibreOffice Owner Source Decision

Status: owner decision memo for LibreOffice `.svpkg` package preparation. This does not approve production support, GitHub release upload, or a bundled LibreOffice binary.

Date: 2026-06-11

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This memo records the upstream source and packaging policy needed before release/upload work can continue.

## Decision Summary

LibreOffice runtime packages for Starverse-managed Office-to-PDF must use The Document Foundation official download infrastructure as the upstream authority. Third-party package managers, portable builds, system installations, PATH discovery, `.external-runtime-work`, and ad hoc local runtime directories are not official upstream authority.

The current packaging path remains owner-gated and experimental:

- `productionApproved=false`
- `ownerGated=true`
- `experimental=true`
- no production support claim
- no binary committed to git
- no GitHub release upload in this task

## Upstream Authority

Approved upstream authority candidate:

- LibreOffice official download page: `https://www.libreoffice.org/download/download-libreoffice/`
- The Document Foundation release announcement / release notes for the selected line.
- Official download host and mirrors rooted at `download.documentfoundation.org`.

Do not use as authority:

- Chocolatey, winget, PortableApps, third-party download sites, or vendor mirrors outside TDF control.
- Installed system LibreOffice.
- `soffice` from PATH.
- `.external-runtime-work/libreoffice`.
- Agent-constructed URLs that are not supported by official TDF pages.

## Version Policy

Recommended current line: LibreOffice 26.2 stable line.

As of 2026-06-11, TDF official download and release material indicate LibreOffice 26.2.4 as the current maintained stable release for Windows x86_64. The 25.8 line is near or at end-of-life and must not be hardcoded as the production candidate for new runtime packaging.

The package preparation script accepts explicit `--runtime-version` and `--package-version` arguments. Do not hardcode a future version into runtime code; update the Owner memo and package metadata when Owner approves a concrete release asset.

## Platform Scope

First package target:

- platform: `win32`
- arch: `x64`
- upstream artifact: Windows x86_64 LibreOffice installer from TDF official download infrastructure

macOS and Linux package policy remain contract-only until Owner approves platform-specific layout, source artifact, and smoke policy.

## Source URL Policy

Recommended Windows x86_64 URL pattern:

```text
https://download.documentfoundation.org/libreoffice/stable/<runtimeVersion>/win/x86_64/LibreOffice_<runtimeVersion>_Win_x86-64.msi
```

The final package record must also capture the official info page, mirror page, checksum, and signature references when available.

## Required Metadata

Each Starverse `.svpkg` package candidate must record:

- `sha256`
- `sizeBytes`
- `packageVersion`
- `runtimeVersion`
- `platform`
- `arch`
- upstream URL
- download timestamp
- license references
- provenance references
- notices and attribution references
- package manifest hash
- inventory hash
- runtime manifest hash

License and provenance inputs must be reviewable before release/upload.

## Package Format

Starverse package format: `.svpkg`, zip-compatible archive.

Required top-level layout:

```text
manifest.json
inventory.json
runtime/
  manifest.json
  ...
licenses/
notices/
attribution/
provenance/
signatures/     optional until signing gate is approved
```

The runtime executable path must be manifest-relative. Absolute paths, parent traversal, system/PATH fallback, and symlink escapes are forbidden.

## Explicitly Forbidden

- PATH fallback.
- System install discovery.
- Third-party mirrors as authority.
- Committing LibreOffice binary or generated `.svpkg` to git.
- Production support claim.
- GitHub release upload before Owner approves release tag, asset naming, legal/license review, and signing policy.
- Expanding beyond the DOCX-only Office-to-PDF pilot scope.

## Open Questions

- Final release tag naming convention.
- Final asset naming convention.
- Whether GitHub Release should be draft, prerelease, or another controlled distribution channel.
- Legal/license review for repackaging and notices.
- Package signing policy and production trust root.
- Whether Owner approves flipping `productionApproved` after release redownload smoke and platform review.
