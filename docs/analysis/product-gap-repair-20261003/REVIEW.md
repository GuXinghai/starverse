# Review record

Date: 2026-10-03. Bounded G-A/G-B review; coordinator owns final diagnosis and completion.

## Before production edits

Read-only mapping identified template-owner/default-workspace divergence, delete cascade, unscoped draft callbacks, missing durable edit ownership/snapshot and failure-factory URL/header gaps. Coordinator rejected the mapper's proposed template rehoming: the existing owner is authoritative. A/B/C reviewed PLAN before implementation; exact additive upgrade, snapshot reference retention, branch cancellation and IPC ownership were resolved there. Existing Cloud closure was then fast-forwarded rather than rewritten.

## Implementation review and closure

| Reviewed issue | Decision / current result |
|---|---|
| Competing Inbox identities / partial relocation | Existing template owner; one quiesced authority transaction; older-owner and rich rollback tests PASS. |
| Missing prior-compose lifetime | FK-backed reference retention plus scoped asset-retirement guard; exact DFC cancel restoration PASS. |
| Over-broad schema recovery | Three pinned complete predecessor digests, full canonical SQL and real identity before DDL; atomic metadata/trigger rollback; no generic reset fallback. |
| Same question cancelled/reopened | Server opening revision identifies edit incarnation; old update/cancel with current CAS rejects; UI old captured packet is not adopted. |
| Same-binding external revision adoption | Hydrated dirty binding keeps its acknowledged version/conflict; confirmed reload is the deliberate adoption path. |
| Accepted command during A→B→A | Exact source aggregate under submission lock can acknowledge clear; no general late-result publication or automatic branch follow. |
| Edited conversation cascade | Actual workspace handler with FK on removes draft/session/refs atomically; no extra production ordering patch needed. |
| Attachment batch/picker P1 | Actual queue trace showed file1→cancel→file2 borrowing restored compose CAS. Pre-fix real-repository tests reproduced delayed compose roundtrip and edit batch. Shared action identity+CAS now checks before every attachment IPC and advances only from its own accepted mutation. Cancel/reopen, branch-only compose and action-owned flush tests PASS. |
| Attachment preparation timer gap | Pre-fix real-repository T1/T2 test reproduced unsaved T2 after stale prep cleared its timer. Clear now occurs only after action acceptance and only for exact binding+captured visible text. In-flight save and unchanged-revision read/no-op variations PASS. |
| G-B failure privacy | Coordinator inspected the factory-only production diff; actual factory, decoder/projection, two repositories and safe-details/copy fixtures use synthetic credentials. Safe URL preservation and new-header query controls PASS. |

The read-only review inspected the refrozen action/token and timer changes and reports no remaining confirmed P0/P1 within these paths. Coordinator independently inspected central action/queue/submit/schema/relocation/sanitizer seams and ran final expanded acceptance. This review does not assert full Electron, real-user-data or whole-repository security coverage.

## Resource and evidence limits

A dedicated new risk-reviewer slot and reactivation of old reviewers were unavailable. C's independent G-B implementation was finished before its explicit read-only G-A review; coordinator owns independent G-B review and the final synthesis. No child agents, review-source edits or architecture decisions delegated to C. Final commands/results are in validation.json; baseline, focused and provisional runs are not double-counted.
