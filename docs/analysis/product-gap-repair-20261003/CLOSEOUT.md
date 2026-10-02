# First-wave closeout: G-A ownership and G-B privacy

Date: 2026-10-03 (Asia/Tokyo). Branch: `models-dev-capability-resolution`.
Validated base HEAD: `4ac2de5796e2ef75f180c3efc4a67354d351a77a`.
Status: **G-A/G-B closed within the requested automated scope; patch uncommitted.**

## Findings and baseline correction

| Finding | Final first-wave disposition | Closure evidence |
|---|---|---|
| SV-PGA-001 | CLOSED | One authority transaction relocates conversations to the persisted template owner's project, then deletes the source project; rich data/search preservation and injected failure rollback pass. |
| SV-PGA-002 | CLOSED | Captured bindings, per-conversation serialization, exact edit identity, guarded publication and visible retained CAS conflicts prevent delayed writes/publication into a destination conversation. |
| SV-PGA-003 | CLOSED | Durable branch/question/answer/edit-instance ownership plus prior-compose attachments/DFC snapshot; navigation suspends/resumes, cancel restores atomically, submit captures source, restart and unloaded source submit pass. |
| SV-PGA-004 | CLOSED | New failure factory redacts labels independently of safe URLs and recursively covers provider credential headers; real persistence and actual safe-details/copy tests pass with synthetic values. |
| SV-PGA-005 | CLOSED | Existing persisted template owner supplies Inbox, New/default workspace and deletion protection; older owner/newer ordinary project regression passes. |
| SV-PGA-008 | CLOSED | Active single/bulk deletion reconciles IDs/transcript/branch/draft together, including edited conversations, partial failures and navigation during deletion. |

Initial checkout `8d928d6d` was the direct parent of the requested Cloud closure, despite the old audit claiming it already included that commit. After internal plan review, fast-forwarded to the existing `4ac2de5`; no new commit was created. All 27 findings were statically revalidated there before production repairs. **SV-PGA-012 and SV-PGA-022 were already closed by that commit** and were not reimplemented. SV-PGA-009 and SV-PGA-018 remain current. See `REVALIDATION.md` and `revalidation.json`.

The six wave findings are closed by the new working-tree patch. Nineteen other findings remain outside this wave. The remaining five HIGH findings are planned in `NEXT-PLANS.md`, in the user's requested order; none has been implemented here.

## Enforced architectural invariants

1. **One Inbox authority:** the project owning persisted `new_template`. No recency/name/marker heuristic or template rehoming. An absent template uses explicit project+template bootstrap.
2. **Atomic project preservation:** existing runtime quiesce precedes one immediate authority transaction, with FK enforcement on. Move project FKs before source deletion; keep conversation/message/branch/draft/config/route/generation/snapshot IDs and search ownership consistent. No cascade reconstruction.
3. **Captured renderer scope:** conversation, branch and navigation binding travel together. Per-owner queues use acknowledged CAS; captured text packets compare the complete draft/edit instance. Late hydration/mutation responses publish only into their valid binding.
4. **One durable draft/edit aggregate:** edit ownership includes immutable `openedDraftRevision`. Server captures prior compose under CAS. Anonymous edit replacement is rejected; text/cancel require exact branch/question/answer/opening revision plus CAS. Cross-chat navigation suspends; explicit different-branch navigation in the same chat atomically cancels/restores first.
5. **Snapshot lifetime:** retained raw/effective/URL revision references and retirement protection preserve pre-edit attachments and DFC selection until cancel/accepted clear. Restored draft and session/reference removal are transactional.
6. **Honest conflict and command completion:** rejected text is retained per owner, readonly/copyable, with explicit confirmed discard/reload and no automatic rebase/resubmit. Submission locks its captured owner before its first await. Accepted-clear failure preserves state; it never cancels/resends the accepted command or follows a new branch automatically.
7. **Same-aggregate completion:** A→B→A may display accepted clear only under the source submission lock and an exact match of conversation/branch/revision/mode/text/full edit identity. Attachment actions likewise share one captured identity+CAS across preparation/batches/replacements; only their own accepted writes advance their acknowledgement. A newer owner revision is never borrowed. Stale continuations stop with a localized result.
8. **Timer ownership:** attachment preparation cancels a text-save timer only inside its accepted owner callback, for the original binding and unchanged captured visible text. Stale preparation or newer input retains normal autosave.
9. **Active deletion closes scope:** successful deletions invalidate their owners, reconcile partial bulk outcomes and bind a valid survivor/template or explicit empty state. A surviving selection made during deletion is respected.
10. **New failure privacy:** factory sanitization preserves useful URL/status/code/request/retry facts while redacting labeled/header/query/userinfo credentials. Envelope schema, strict decoder and persistence format remain unchanged.

## Schema/data transition

Fresh databases install the reviewed companion objects. Existing databases accept only the three pinned complete predecessor serializations and the canonical installed SQL projection. Before DDL, validate schema projection, FK/integrity and actual root/application/envelope identity. In one transaction add objects, update manifest/app metadata digests, recreate the exact verified immutable trigger and verify current schema. Injected failures roll back data, digests and trigger changes; unknown/tampered schemas keep strict failure behavior.

Pre-repair persisted edits never stored their original branch/prior-compose snapshot. The recognized upgrade preserves current text/attachments as a compose draft, clears the unrecoverable edit marker and increments CAS. It does not invent or reconstruct missing state. New edits restore the complete durable snapshot after restart.

Runtime upgrade tests cover actual committed LF and CRLF predecessor assets. The historical mixed-ending digest is recognized against canonical installed SQL; historical mixed-byte replay was not performed. No real user database was migrated.

## Validation

Latest passing suites are disjoint; focused/baseline reruns are not added again to the total.

| Layer | Files | Tests | Result |
|---|---:|---:|---|
| Unit: failure factory/projection, Cloud presentation, template/composer clients, conversation domain | 6 | 37 | PASS |
| Integration: draft/workspace/composer/schema/initializer/preload, failure persistence, graph/authority | 11 | 106 | PASS |
| UI: scope/send/attachments/regen-retry, safe-details/copy, Cloud overview, composer attachment/search guards | 8 | 84 | PASS |
| **Total** | **25** | **227** | **PASS** |

`npx vue-tsc --noEmit` PASS. Zero-residual, Goal-3 authority, capability-rule authority, model-identity purge and privacy gates PASS. Test-partition gate PASS (572 files, one owner each). i18n coverage PASS (zero warnings); hardcoded scan PASS with 46 tolerated baseline findings. `git diff --check` PASS.

Exact commands and final Git/protected-file evidence are in `validation.json`. The final artifact privacy scan is recorded there after writing this closeout and the next plans. Automated validation used isolated in-memory/temp state and synthetic credentials; no provider request, Cloud Apply, real profile or Electron manual smoke.

Internal review was completed before production edits. Mapping agents supplied seams; A/B/C had distinct write ownership. A separate reviewer slot was unavailable, so C performed explicit read-only G-A review after its independent G-B work, with coordinator review of G-B and final architecture decisions. Read-only review found and closed attachment-continuation and timer-ownership gaps with actual repository-backed regressions. Final bounded review has no remaining confirmed P0/P1. See `REVIEW.md`; this is not a global security/merge certification.

## Git, gate integration and protected work

HEAD remains `4ac2de5`; no new commits, staging or pushes. Worktree is **not literally clean**: it retains this reviewable patch plus initial dirty/untracked work. Initial `.codex/config.toml` and `pelican-bicycle.html` retain their exact SHA-256 values from `baseline.json`; the index remains unchanged/empty of staged differences. Native outputs, lockfile and `public/build-id.json` are not part of the patch.

Required gates exposed baseline integration defects. Added only the two Cloud selector presentation files to the exact model-ID allowlist; selector display/diff is not runtime identity resolution, and send-path fallback bans remain intact. Reduced machine-path metadata in two old audit JSONs and one research JSON; facts/protected hashes remain. No privacy allowlist was relaxed.

## Limits and ABI report

CAS-conflict text retention is renderer memory, not a second durable draft journal; copy retained text before exiting if a save failed. Accepted generation and subsequent draft clearing retain their existing separate boundaries; a clear conflict is visible and never triggers duplicate generation. No full aggregate `verify:ssot`, packaged Electron smoke or real-profile validation is claimed.

- better-sqlite3 ABI mismatch encountered: **no**.
- Rebuild command run: **npm run rebuild:node**, via the existing `npm ci` postinstall after restoring missing dependencies.
- Current ABI target after task: **node**.
- Tests retried after ABI repair: **none**; all DB-heavy acceptance ran after the Node rebuild.
- Electron smoke retried after rebuild: **no**.
- No native artifacts committed: **confirmed**; no new commit or staged native output.

User-authorized temporary cleanup remains tool-blocked. The guarded exact-target PowerShell deletion was rejected before execution by automatic approval review with `blocked by policy`. The two digest scripts, copied predecessor SQL directory and test logs remain outside the repository under `%TEMP%`; names are in `validation.json`. No retry/bypass after the resumed rejection, and no real database/credentials are in these task scratch artifacts.
