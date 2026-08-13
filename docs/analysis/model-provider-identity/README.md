# Model and Provider Identity Post-hard-cut Analysis Bundle

- **Lifecycle Status**: reference
- **Document Role**: entry
- **Last updated**: 2026-08-14
- **Authority**: Evidence bundle only; it does not replace current source code, owner decisions, or the provider architecture SSOT.

---

This directory preserves the model/provider identity compatibility-purge closeout and the independent post-cut semantic reviews imported from the user-provided `新建 文本文档.txt`.

## Reading order

1. [Compatibility purge closeout](01-compatibility-purge-closeout.md) — completed hard-cut scope, database reset, and validation record.
2. [DeepSeek V4 Pro review](02-deepseek-v4-pro-semantic-review.md) — provider namespace and mapping analysis.
3. [ChatGPT 5.6 Sol review](03-chatgpt-5-6-sol-semantic-review.md) — end-to-end identity flow and boundary semantics.
4. [DeepSeek V4 Flash review](04-deepseek-v4-flash-semantic-review.md) — broad residual-surface scan.
5. [Credential-scope follow-up](05-credential-scope-follow-up.md) — targeted resolution of the `credentialScopeId` dual-format question.
6. [Cross-review synthesis](06-cross-review-synthesis.md) — comparison, disputed findings, candidate actions, and the proposed semantic framework.
7. [Frozen decisions and implementation plan](07-frozen-decisions-and-implementation-plan.md) — owner-frozen architecture decisions, phased implementation contract, acceptance gates, and progress ledger.

## Status and authority

- Files 01–05 are historical point-in-time evidence.
- File 06 is a reference synthesis and candidate action list, not an implementation plan or SSOT.
- File 07 is the owner-frozen decision and implementation-plan authority for the identity cleanup it defines. Implementation progress must be recorded in that file.
- The reports use different checkout baselines; each report's own baseline statement remains authoritative only for that report.
- For current implementation facts, inspect the local checkout. For owner-confirmed provider architecture, begin with [provider architecture](../../architecture/provider-architecture/README.md).

## Import fidelity

- Source SHA-256: `8E937CBDF580A3DEA2A01FC485AD7EB9A4CE3FFF5617733DA2BDCDD84BB70FBE`.
- Substantive report text was preserved.
- Import-only cleanup: section splitting, document titles/status metadata, portable repository-relative links, valid Mermaid fences, and removal of copied model/build UI footer lines.
- Machine-specific user-profile paths were replaced with stable environment notation.
