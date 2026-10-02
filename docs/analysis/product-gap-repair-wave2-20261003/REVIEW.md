# Second-wave review record

Date: 2026-10-03. Baseline `7896ddfb`.

All five current execution paths were mapped read-only before production edits. Coordinator chose and recorded the concrete contracts in PLAN.md. A separate read-only reviewer checked all five contracts against current source and reported no P0 architecture objection. Implementation correctness is not established by this design review.

| Finding | Required implementation/acceptance checks |
| --- | --- |
| 006 | Exact model/operation capability domains; inherited/default versus explicit intent; persisted semantic preservation; Anthropic 20 across every normalization/save/reload hop; provider-switch race; unknown/conflict/stale binding; disabled dormant options; frozen retry. |
| 007 | All observed source/output/producer fields match exact persisted provenance; output A remains A after output B; tampered/missing/blocked binding; removed/excluded/retired source; provider mismatch/CAS leaves aggregate unchanged; captured renderer binding; actual preview/prepared bytes. |
| 011 | Lease before side effects and publication; committed reset acknowledgement survives later failure without repeated destructive reset; CAS failure has no acknowledgement; strict matching transcript/draft scope; edit redirect/navigation/deletion during hydration; coalesced retry; recovery settings independent of ready; bounded localized error. |
| 009 | Postcommit typed events including bootstrap; subscription catch-up race; delivery failure does not misreport commit; opaque hashes; new sends blocked until current resolution; older success/error/finally fenced; Inspector resolves server-derived current subject/scope; field/raw requests fenced; frozen retry. |
| 010 | Existing route visibility authority; current project ownership; exact selected root/question only; bounded successor anchor including hidden successor/final turn/limit 1; deleted ancestor/live child; final validation after async transition; exact DOM focus before cursor/modal; close/reopen/racing hits/conflict cancellation. |

Ownership remains explicit: backend worker 007 then 010; startup worker 011 independent helper/component/tests then 009 non-core; renderer worker is the only shared root/logic writer. Mapper/reviewer agents remain read-only and cannot spawn children. Shared preload/environment declarations pass from 007 to 009/010 by coordinated section ownership.

Broader source-acquisition invalidation and blanket SV-PGA-018 closure are not included. No real profile, provider call, Cloud Apply or runtime installation is admitted. Functional closure and final risk status require post-implementation review and automated evidence.

## Final implementation review

Read-only reviews found and the coordinator accepted corrections for these concrete defects before acceptance:

- 011: a retained transcript could still expose mutations after final draft hydration failed; readiness now guards both presentation and mutation handlers. A scope change during strict hydration supersedes the attempt rather than publishing another scope as ready.
- 009: a Send paused at draft persistence could author empty/default semantics after committed invalidation. The shared authoring path now preserves a captured capability lease across asynchronous reads and writes. Explicit text/image transitions resolve a private target through existing authority before persistence; persisted preflight intent and attachments remain captured. OpenRouter image refresh includes the draft binding in its watcher, so a branch change replaces the fenced attempt. Public Composer callbacks report bounded current-scope failures without swallowing internal persistence failures. Validated OpenRouter ratio/resolution now reach the existing semantic builder.
- 010: a valid branch beyond the cached first 50 summaries could focus a target while branch-dependent operations remained unavailable. The final authoritative view pins the selected branch summary. Query/rebuild controls cannot invalidate only the modal lease while navigation is opening.
- 007: composer reads did not reuse existing selected-output provenance validation. Read and preview now validate the same immutable selection authority as selection itself.

Final source reviews of 006/011, 009 root and non-core paths, and 010 report no remaining actionable P0/P1 in the reviewed boundaries. The coordinator retains the final completion judgment; source review alone is not runtime evidence. Final automated receipts and source fingerprints are recorded in validation.json and CLOSEOUT.md.

The OpenRouter operation fixture does not invent an `image.outputMode` domain: current image encoding coverage excludes that path. It proves supported ratio/resolution persistence and preservation of an already persisted unexposed packet during preflight, not successful provider submission or new output-mode support. The independent OpenRouter attachment encoder compatibility dependency remains explicitly deferred in NEXT-PLANS.md.

Primary-agent final reconciliation: merged frozen root acceptance is 12 files / 114 tests PASS; all accepted groups deduplicate to 59 unique files / 469 tests PASS. Type, authority, privacy, partition and i18n checks pass, and 78 source fingerprints match after execution. Final record and Git-scope inspection are performed in single-thread execution under the user's explicit authorization to commit this wave and stop.
