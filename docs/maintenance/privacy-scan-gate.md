# Privacy Scan Gate

**Last updated**: 2026-09-26

`npm run gate:privacy` scans tracked files and non-ignored untracked candidates in `electron`, `src`, `infra`, `docs`, `ops`, `.github`, `.codex`, `.gemini`, `scripts`, `tests`, and `artifacts`, plus the root README, `AGENTS.md`, `.cursorrules`, and `.windsurfrules`:

- `contentToken`
- `fullHash`
- `absolutePath`
- Windows drive paths
- Windows user-profile paths
- repository-root absolute paths
- captured email addresses and provider credentials under `artifacts/`
- credential-bearing Authorization headers in committed logs and debug captures
- generated disk-audit output directories under `artifacts/disk_audit_*/`

The gate does not globally ignore docs or tests. Every expected hit must match an allowlist rule in `scripts/gates/privacy-scan.mjs` with a reason, such as sanitizer implementation, domain schema field, sanitizer fixture, historical file-pipeline doc, or Windows setup guide example. Ignored local logs are not read; the gate checks tracked content and files Git could add under the scanned paths.

Unclassified hits are reported with repository-relative file, line number, match type, and reason; matched content is never printed. The gate exits non-zero.

Private `.env` files fail by path (example, sample, and template files are allowed). UTF-16 text artifacts are decoded before scanning. Raw disk inventories must stay in the ignored `.artifacts/disk-audit/` location or outside the repository. Captured responses may use `privacy-placeholder@example.invalid` only as synthetic data; real contact values, authorization headers, provider keys, and private-key material fail the gate.
