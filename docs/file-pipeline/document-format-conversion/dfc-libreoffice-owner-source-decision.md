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

## Official Download and Package Preparation Result

Task: Official LibreOffice download plus real `.svpkg` preparation and local verification.

Result date: 2026-06-11.

Owner-approved source:

- upstream authority: The Document Foundation
- upstream URL: `https://download.documentfoundation.org/libreoffice/stable/26.2.4/win/x86_64/LibreOffice_26.2.4_Win_x86-64.msi`
- observed official MirrorBrain final URL host: `www.mirrorservice.org`
- runtime version: `26.2.4`
- platform: `win32`
- arch: `x64`
- MSI sha256: `202f26cda071c5aa4996a5a28412fddceb3891dceb0366982c62650456c0730f`
- MSI sizeBytes: `372539392`
- official `.meta4` checksum and signature metadata were fetched from `download.documentfoundation.org`

Package candidate prepared in a repo-external workdir:

- packageVersion: `0.1.0`
- package sha256: `ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e`
- package sizeBytes: `518907010`
- executable relative path: `program/soffice.exe`
- executable sha256: `3c24436274cb9b5ccd363a517b377d07991eae82072690227e41c62ca9ca718b`
- executable sizeBytes: `523688`
- inventory artifact count: `19492`
- productionApproved: `false`
- ownerGated: `true`
- experimental: `true`

The MSI was extracted with Windows `msiexec /a` administrative extraction into a repo-external staging directory. The Starverse `.svpkg` was generated into a repo-external package directory and was not committed to git.

License, notices, attribution, and provenance inputs used for this experimental package candidate:

- `license.txt`
- `LICENSE.html`
- `NOTICE`
- `CREDITS.fodt`
- generated provenance JSON recording TDF authority, upstream URL, observed final URL, MSI checksum, size, platform, arch, and extraction method

This result provides local packaging and verification confidence only. It does not approve GitHub release upload, bundled runtime distribution, or production support.

## Draft Release Asset Verification Result

Task: GitHub draft release upload plus release-asset redownload verification.

Result date: 2026-06-11.

Release target:

- repository: `GuXinghai/starverse`
- release tag: `starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64`
- release type: draft
- release URL: `https://github.com/GuXinghai/starverse/releases/tag/untagged-455b5afc040fff36e435`
- asset name: `starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg`
- asset sha256: `ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e`
- asset sizeBytes: `518907010`
- GitHub asset digest: `sha256:ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e`

Verification:

- upload used only the repo-external `.svpkg` package candidate
- redownload wrote only to a repo-external cache
- redownload sha256 matched
- redownload sizeBytes matched
- archive bridge verification passed
- import helper verification passed
- managed runtime gate verification passed
- real managed DOCX-to-PDF worker smoke passed from the redownloaded package import

This draft release asset remains owner-gated and experimental. It does not change `productionApproved=false` and does not authorize normal production release, bundled runtime support, or broader Office format support.

## Prerelease Acquisition Source Result

Task: promote the verified draft release asset to an owner-gated prerelease acquisition source.

Result date: 2026-06-11.

Prerelease target:

- repository: `GuXinghai/starverse`
- release tag: `starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64`
- release type: prerelease
- publishedAt: `2026-06-11T07:54:18Z`
- release URL: `https://github.com/GuXinghai/starverse/releases/tag/starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64`
- asset name: `starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg`
- asset sha256: `ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e`
- asset sizeBytes: `518907010`

Catalog acquisition source:

- source type: `github_release_asset`
- packageRef: `GuXinghai/starverse@starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64/starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg`
- sourceUrl: `https://github.com/GuXinghai/starverse/releases/download/starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64/starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg`
- downloadEnabled: `false`
- productionApproved: `false`
- ownerGated: `true`
- experimental: `true`

The prerelease asset was redownloaded to a repo-external cache, hash/size verified, archive/import verified, and smoke-tested through the real managed DOCX-to-PDF worker path using a short repo-external runtime root. This still does not authorize production support or automatic product download.

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
- Whether the verified prerelease asset should remain prerelease, move to another controlled distribution channel, or later become a production-approved release after Owner approval.
- Legal/license review for repackaging and notices.
- Package signing policy and production trust root.
- Whether Owner approves flipping `productionApproved` after release redownload smoke and platform review.
