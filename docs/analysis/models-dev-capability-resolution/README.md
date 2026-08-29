# models.dev Capability Resolution Analysis Bundle

- **Lifecycle Status**: reference
- **Document Role**: entry
- **Last updated**: 2026-08-28
- **Authority**: Evidence bundle only; it does not replace current source code, Owner decisions, Generation V2 authority, reviewed contracts, or current provider documentation.

---

This directory preserves three independent investigations of using models.dev as a non-authoritative capability evidence source, including the DeepSeek reasoning/preflight mismatch and the requirement for one resolved capability revision across catalog, UI, preflight, runtime, and compiler.

## Reading order

1. [Codex GPT-5.6 sol assessment](01-codex-gpt-5-6-sol-assessment.md) — later independent investigation and architecture recommendations.
2. [DeepSeek V4 Flash assessment](02-deepseek-v4-flash-assessment.md) — broad code-path map, external-source investigation, and incremental official-API notes.
3. [DeepSeek V4 Pro assessment](03-deepseek-v4-pro-assessment.md) — independent architecture evaluation, migration plan, and frozen-decision candidates.
4. [Updated architecture recommendations](04-updated-architecture-recommendations.md) — cross-report synthesis, revised implementation sequence, invariants, and 30 candidate decisions for Owner review.
5. [Raw model capability evidence draft](05-raw-model-capability-evidence-and-discussion.md) — raw fact draft (事实底稿) preserving original model/capability fields, sources, evidence, and discussion conclusions; not a design or rule document.
6. [Owner-frozen model-facts architecture](06-owner-frozen-model-facts-architecture.md) — authoritative Owner decision for the model-facts boundary and the following source-ingestion Goals.
7. [Model-facts authority boundary implementation](07-model-facts-authority-boundary-implementation.md) — first post-decision authority-boundary partial closeout, intentional residuals, and next-Goal checklist.
8. [Goal 2A Capability Rule migration](08-goal-2a-capability-rule-migration.md) — database schema, built-in installation semantics, exact-model migration inventory, retained boundaries, and next-Goal blockers.
9. [Goal 2A-Fix evidence and matching closeout](09-goal-2a-fix-evidence-and-matching-closeout.md) — corrected sparse rule inventory, Provider Native identity audit, provenance classes, constrained regex semantics, removals, and deferred verification candidates.
10. [Original Word compilation](source/starverse-models-dev-capability-assessments.docx) — renamed, unmodified source evidence.

## Status and authority

- The three reports are historical point-in-time evidence. They may disagree because they used different research paths and external snapshots.
- The updated recommendations are a candidate action and decision list. Its “建议冻结” wording records proposals, not decisions already frozen by the Owner.
- DeepSeek `reasoning_effort` claims in the reports must be reverified before implementation. In particular, the V4 Flash report contains an earlier `high/max` conclusion and later addenda, while the other reports record newer or conflicting conclusions.
- The reports' file/line references describe their respective checkout baselines and can drift as the repository changes.
- For current implementation facts, inspect the current checkout. For approved architecture, follow the current Generation V2 authority and Owner-frozen decisions.
- models.dev data in these reports is treated as potential evidence, never as model availability or final capability authority.
- Current implementation status and remaining TODOs are split between items 7–9: item 7 records the authority-boundary residuals, item 8 records the Goal 2A migration, and item 9 is the controlling Goal 2A-Fix fact-quality closeout. Do not revive the deleted Catalog capability resolver while implementing source ingestion.

## Import fidelity

- Original filename: `Codex GPT5.docx`.
- Preserved source filename: `source/starverse-models-dev-capability-assessments.docx`.
- Source SHA-256: `99C6A859AF831A49EC3C8374B35C4A8B4C64A8DF889C4DC50E881C29F3C99475`.
- Additional synthesis source: `新建 文本文档 (4).txt`, moved as `04-updated-architecture-recommendations.md`; pre-metadata SHA-256 `358430DAEDC28A2CC784F4F2CB92E3BF090C58612CC216D279A471B345805B34`.
- Source structure: 46 rendered pages, 1,187 paragraphs, no tables, embedded images, comments, or tracked changes.
- Substantive report text and report-specific addenda were preserved.
- Import-only cleanup: split the compilation into three reports, add titles/status metadata, collapse excess blank lines, and remove model labels, timing/UI footers, context-injection markers, duplicate subagent deliveries, and requests to save the report.
- The source contains some tab-spaced pseudo-tables and copied Markdown/code markers. They remain mechanically preserved rather than being reconstructed from inference.
