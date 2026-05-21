# Privacy Scan Gate

`npm run gate:privacy` scans `electron`, `src`, `infra`, and `docs` for privacy-sensitive strings:

- `contentToken`
- `fullHash`
- `absolutePath`
- Windows drive paths
- `C:\Users`
- `D:\Starverse`

The gate does not globally ignore docs or tests. Every expected hit must match an allowlist rule in `scripts/gates/privacy-scan.mjs` with a reason, such as sanitizer implementation, domain schema field, sanitizer fixture, historical file-pipeline doc, or Windows setup guide example.

Unclassified hits are reported with file, line number, match type, and a short excerpt, and the gate exits non-zero.
