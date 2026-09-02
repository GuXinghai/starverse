# models.dev Capability Resolution Analysis Bundle

- **Lifecycle Status**: reference
- **Document Role**: entry
- **Last updated**: 2026-09-02
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
10. [Goal 2B three-source Canonical Model Facts design](10-goal-2b-three-source-canonical-facts-design.md) — frozen raw-first ontology, source mappings, provenance, adapter contract, revision/LKG semantics, Rules follow-up migration, and the strict Goal 3 boundary; the document remains design-only while the later Goal 2C implementation is separately authorized.
11. [Goal 2C three-source ingestion closeout](11-goal-2c-three-source-ingestion-closeout.md) — implemented ontology/registry, three independent source adapters, raw persistence, revisions, LKG/publication, focused verification, and the strict Goal 3 handoff.
12. [Model Facts UI synchronization plan](12-model-facts-ui-synchronization-plan.md) — frozen post-Goal 2C UI/product plan and Owner amendments for one Capability Rules source, isomorphic Cloud/User Pack/Rule semantics, exact-subject materialization, Rules workflows, and Facts Inspector.
13. [Original Word compilation](source/starverse-models-dev-capability-assessments.docx) — renamed, unmodified source evidence.

## Status and authority

- The three reports are historical point-in-time evidence. They may disagree because they used different research paths and external snapshots.
- The updated recommendations are a candidate action and decision list. Its “建议冻结” wording records proposals, not decisions already frozen by the Owner.
- DeepSeek `reasoning_effort` claims in the reports must be reverified before implementation. In particular, the V4 Flash report contains an earlier `high/max` conclusion and later addenda, while the other reports record newer or conflicting conclusions.
- The reports' file/line references describe their respective checkout baselines and can drift as the repository changes.
- For current implementation facts, inspect the current checkout. For approved architecture, follow the current Generation V2 authority and Owner-frozen decisions.
- models.dev data in these reports is treated as potential evidence, never as model availability or final capability authority.
- Rule selector policy has one explicit Owner amendment: item 9 supersedes item 6 only for constrained regex matching. Exact identity remains preferred; narrowly scoped, anchored, evidenced and tested regex may select identity, while wildcard/family/alias/general matching DSL remains forbidden. All other item 6 decisions remain authoritative.
- The 2026-08-31 Owner amendment freezes the models.dev official deployed API flattened payload as the models.dev Raw Source. Provenance references only fields actually exposed by that API; Starverse does not reconstruct unexposed `base_model/base_model_omit` or internal contributor chains. A future Git/TOML source would be a separately versioned source surface.
- Item 12 is the controlling post-Goal 2C UI/product amendment. It supersedes items 8–11 only for bundled built-in lifecycle, Cloud/User ownership semantics, Capability Rules source convergence, authoritative-subject identity input, and regex materialization timing. It does not replace the Goal 2B ontology or authorize Goal 3.
- Current implementation status and remaining TODOs are split between items 7–12: item 7 records the authority-boundary residuals, item 8 records the historical Goal 2A migration, item 9 records the historical Goal 2A-Fix dataset/fact-quality closeout, item 10 is the frozen Goal 2B design, item 11 is the Goal 2C ingestion closeout, and item 12 freezes the required next UI/product migration. Do not revive the deleted Catalog capability resolver while implementing Goal 3.

## Current post-Goal 2C planning status / TODO

- Production still reflects the Goal 2C-era bundled built-in/user ownership and query-bound Rules implementation until a separately authorized migration changes it; documentation does not claim that migration is already complete.
- Before Cloud-managed Rules production work, Owner must freeze the Cloud distribution contract: repository/ref/release authority, manifest, version/revision identity, digest/integrity verification, acquisition, redirect, retention, and rollback.
- The next Rules implementation must use one isomorphic Pack/Rule core for Cloud-managed and User ownership, then publish both through one Capability Rules canonical source revision.
- Regex Rules must be materialized only against the revisioned authoritative exact-subject set. models.dev, Rules, aliases, examples, and display names never create subjects.
- UI implementation remains unstarted by this planning document: Settings integration, Cloud/User Rules workflows, durable User drafts, UI-safe services/IPC, Facts Inspector, and Model Picker deep-link require separate production authorization.
- Goal 3 priority/merge/winner/conflict/final `capabilityRevision` remains deferred. Before Goal 3 consumer migration, remove or schedule removal of replaced query-bound/bundled Rules paths without creating a parallel fallback.

## Import fidelity

- Original filename: `Codex GPT5.docx`.
- Preserved source filename: `source/starverse-models-dev-capability-assessments.docx`.
- Source SHA-256: `99C6A859AF831A49EC3C8374B35C4A8B4C64A8DF889C4DC50E881C29F3C99475`.
- Additional synthesis source: `新建 文本文档 (4).txt`, moved as `04-updated-architecture-recommendations.md`; pre-metadata SHA-256 `358430DAEDC28A2CC784F4F2CB92E3BF090C58612CC216D279A471B345805B34`.
- Source structure: 46 rendered pages, 1,187 paragraphs, no tables, embedded images, comments, or tracked changes.
- Substantive report text and report-specific addenda were preserved.
- Import-only cleanup: split the compilation into three reports, add titles/status metadata, collapse excess blank lines, and remove model labels, timing/UI footers, context-injection markers, duplicate subagent deliveries, and requests to save the report.
- The source contains some tab-spaced pseudo-tables and copied Markdown/code markers. They remain mechanically preserved rather than being reconstructed from inference.
