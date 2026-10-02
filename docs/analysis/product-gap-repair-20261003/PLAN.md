# First repair wave: G-A workspace ownership and G-B failure privacy

Date: 2026-10-03 (Asia/Tokyo). Branch: `models-dev-capability-resolution`.
Initial HEAD: `8d928d6d913d61e51052a8c52f2b665cac332c03`.

## Baseline and authorized scope

The initial HEAD does **not** contain `4ac2de5796e2ef75f180c3efc4a67354d351a77a`; that commit is its direct successor. After this plan's internal review, fast-forward to that existing commit before new implementation. This restores the requested baseline without recreating Cloud Rules work or creating a new commit. Revalidate all affected findings at that HEAD. The prior audit's statement that `8d928d6d` already contained that commit is incorrect.

G-A covers SV-PGA-001/002/003/005/008 as one workspace/scope ownership repair. G-B independently covers SV-PGA-004. SV-PGA-012 is already repaired by the existing Cloud lifecycle commit; SV-PGA-009 remains a later bounded semantic-refresh Goal. No other repairs start in this wave.

Preserve pre-existing `.codex/config.toml` and `pelican-bicycle.html`. Keep audit findings/evidence facts and protected-file hashes. No real profile/DB/credentials, provider calls, Cloud Apply state, staging, new commits, pushes or publication. Validation uses memory/temp databases and synthetic credentials. Baseline hashes/status are in `baseline.json`.

## Invariants and transaction boundary

1. The project owning the single persisted `new_template` conversation is the Inbox. The template repository supplies that identity; bootstrap, New, renderer navigation and delete protection use the same value. No latest-project selection, localized-name inference, dedicated Inbox marker or template rehoming. If no template exists, an explicit bootstrap creates its project and template together.
2. Project deletion retains its existing preservation promise. Runtime project quiescing precedes **one existing immediate authority transaction**: resolve Inbox, reject its deletion, move every source conversation's project FK to Inbox, delete the source project, commit. IDs of conversations/branches/messages/drafts/attachments/config/route and immutable generation snapshots do not change. Existing search triggers update project ownership. FK enforcement stays enabled. Any failure rolls back all relocation/deletion.
3. The renderer binds transcript, branch, active IDs, draft and edit projection as one scope. Async work captures immutable conversation ID, branch ID, navigation identity and the relevant draft CAS revision. Writes use those captured IDs; publication checks the captured binding. A late A result cannot publish into B, including A→B→A with a new navigation identity.
4. Draft writes serialize per conversation and use its latest acknowledged CAS revision; a revision conflict remains visible. They do not borrow another conversation's revision or silently retry against another active scope. Capture pending visible text before rebinding; blank/unbound/loading state cannot flush old text into a new owner. Conversation-owned compose drafts stay conversation-owned; branch identity belongs to the binding and edit session.
5. Edit sessions persist their exact conversation/branch/question/answer ownership and the previous compose snapshot. Opening edit, replacing its draft/attachments and saving the session is atomic under draft CAS. Navigation suspends A's persisted edit and hydrates B's own state. Cancel restores A's saved compose snapshot and clears its session in one transaction. Submit uses the captured source branch/question and clears durable edit state with the committed draft. Restart hydrates the persisted session; it never guesses a branch from a question shared by branches.
6. Successful single/bulk deletion reconciles the current bound conversation against successful deletions and the authoritative workspace snapshot. Deleting the active owner invalidates it immediately and deterministically binds a valid survivor/New template, or an explicit empty state. Partial bulk success is reconciled before reporting failures; late deletion callbacks do not displace a separately selected surviving conversation.
7. New provider failure envelopes redact credential labels independently of URLs and recursively redact provider credential header keys. Safe URLs and useful diagnostic facts remain. The strict envelope schema and persistence format stay unchanged.

There is one compose/edit aggregate per conversation. Cross-conversation navigation suspends its edit. Hydrating an edit binds the transcript to its exact saved branch. Explicit navigation to a different branch in the **same** conversation first uses the same atomic cancel/restore transition, then binds the requested branch; it does not invent multiple draft slots. This policy is centralized and tested. Edit-open does not alter model/config, so no separate config snapshot is needed.

CAS failure must also retain the outgoing unsaved text. Keep an explicit failed captured packet/error per conversation in the renderer's pending mutation state; returning to that owner shows that text and conflict. It is never silently rebased/retried, and mutations remain blocked until an intentional reload/discard with confirmation. Selection/copy stays available. This preserves the failure payload without inventing a second durable draft authority or overwriting a concurrent DB writer. Test failed navigation, return and absence of automatic retry.

## Durable edit state and data impact

The current draft has text/mode/source-question/revision but no original branch or pre-edit draft. A question's origin cannot recover its selected branch; the original unsent text cannot be reconstructed from message history.

Use a small `composer_edit_session_v2` companion table, owned by the draft conversation, in the existing composer schema fragment. Store exact branch/question/answer IDs and a bounded, validated prior-compose snapshot (text and attachment/DFC-selection references). It is one draft aggregate, not a second settings/renderer authority. Repository and IPC edit-open/cancel operations update both in the same authority transaction and CAS. Clear/remove operations clear the session as part of the same transaction.

Implementation review also identified snapshot lifetime: active draft attachment rows are replaced during edit-open, and asset retirement currently ignores JSON references. A companion `composer_edit_session_attachment_v2` holds deterministic raw/effective/URL revision references with FK retention and a scoped retirement guard. These rows protect the authoritative snapshot's lifetime and are created/cleared in its transaction; they do not define separate semantics. Test physical deletion/retirement rejection and exact DFC restoration. Validate edit question/answer membership on the selected branch route, not only same-conversation SQL joins. Existing schema/app-meta immutable triggers must be restored and verified within the recognized upgrade transaction.

An edit instance also carries its immutable server-captured `openedDraftRevision`. The same branch/question/answer can be cancelled and reopened; captured text/conflict packets must compare the exact edit instance, including answer and opening revision, before using an acknowledged CAS revision. This prevents an old packet from mutating a new session after authoritative refresh. The opening revision is derived from the existing draft CAS, not a new clock/authority.

The closed-schema verifier currently rejects advanced fragment digests and otherwise offers backup/recreate. This repair must **not** turn a routine additive change into a reset. Add a narrowly recognized transactional predecessor upgrade at the existing database initialization/verification seam: recognize the complete pre-repair fragment digest and installed SQL projection, validate manifest/app-meta identity, FK and integrity, add only the reviewed companion objects, update manifest/object projection/app-meta digests together, verify the current schema, then commit. Unknown, damaged or modified schemas keep their existing strict failure classification. No generic auto-repair or reset bypass.

Fresh DBs install the new canonical fragment directly. Existing databases preserve all data. Pre-repair persisted edits lack recoverable branch/prior-compose state: the one-time recognized upgrade retains their current text/attachments as compose drafts and clears the old edit marker. It cannot reconstruct a pre-edit snapshot that was never stored. Test this explicit transition; do not invent a source branch or discard current draft content. New persisted edits fully support restart/cancel.

## Interfaces and expected files

Backend worker A owns template/Inbox lookup, workspace relocation, durable draft edit aggregate, strict predecessor schema upgrade and backend tests:

- `infra/db/repo/systemChatTemplateV2Repo.ts`, `conversationWorkspaceV2Repo.ts`, `composerDraftV2Repo.ts`.
- `electron/ipc/generationV2WorkspaceIpc.ts`, `generationV2ComposerIpc.ts`.
- `electron/preload.ts` and `electron/electron-env.d.ts` (or the existing actual declaration location) for the coordinated composer API additions; worker A owns these exposure/declaration changes.
- `infra/db/v2/composerDraftSchema.sql`, `schemaComposerV2.ts`, their schema tests, and the existing epoch database initialization seam/tests if required.
- A shared/domain edit-session DTO/validator if needed; agree its exact contract with worker B first.
- Existing workspace/composer IPC, draft/graph and schema/initializer integration tests.

Renderer worker B is the only writer to `src/ui-app/app/appChatApp.logic.ts`. It owns the scoped binding/queues, edit hydration/cancel/submit, deletion rebinding, renderer composer/workspace client DTOs and focused UI tests. Extend the existing test bridge only to model per-conversation draft/CAS/deferred production-shaped behavior; do not refactor unrelated tests. A narrow scope helper may be extracted if it centralizes this invariant.

Privacy worker C owns only `src/shared/provider/providerFailureV2.ts`, its sanitizer/projection tests, existing `infra/db/repo/generationExecutionV2Repo.test.ts` and `modelCatalogV2Repo.test.ts`, and a focused `ProviderFailureDetailsV2.test.ts`. It does not edit workspace/draft files or production persistence/runners.

Coordinator owns plan, cross-thread contracts/review, final diagnosis and closeout. Other repair threads are active; every writer must respect ownership and preserve others' changes. No child agents. An independent read-only reviewer is preferred; if the agent limit prevents starting one, use explicit cross-thread read-only plan/diff review plus coordinator review and record that limitation.

## Required validation

Production-shaped G-A regressions:

- Older template-owning project plus newer ordinary project: bootstrap/New/Inbox/protection agree on older owner.
- Project relocation retains messages, branches, draft text/attachments/DFC selection, config/route, generation records and search ownership; project alone disappears.
- Failure after relocation and before delete/commit leaves all original ownership/data unchanged.
- Distinct A/B drafts, rapid A→B→A, delayed get/update/open/cancel/clear responses and CAS conflicts.
- Edit A → B: B cancel/submit never acts on A; returning A resumes its edit. Captured submission never targets the destination branch.
- Restart with a new durable edit: exact branch and prior-compose text/attachments restore; cancel is atomic. Recognized legacy edit transition preserves current content.
- Delete active conversation singly/bulk, partial failures and navigation during deletion; all bound projections leave deleted scope.
- Predecessor schema upgrade with populated data, idempotent reopen/current verification, tampered/unknown schema rejection and injected transactional failure rollback.

G-B regressions use actual exported sanitizer, real repository round trips, actual UI safe-details/copy projection and dummy credentials: label alone; label plus safe HTTPS URL; nested/mixed-case `x-api-key`/`x-goog-api-key` in objects/arrays; Authorization/query/userinfo controls; safe `/api-key/docs` URLs; useful status/code/type/parameter/request-ID/retry diagnostics and size bounds.

Dependencies were missing. `npm ci` uses the existing lockfile and its postinstall runs `npm run rebuild:node`; no dependency upgrade is intended. Baseline four scoped integration files passed (27 tests) before application changes. Run focused new tests first, then relevant unit/UI/integration suites, `vue-tsc --noEmit`, current zero-residual/Goal-3/capability-rule/model-identity/privacy gates and `git diff --check`. Leave ABI as Node after automated validation. No Electron/manual/paid-provider requirement is inferred.

## Risks and rejected alternatives

- Rejected: five isolated guards, global edit session, late active-ID lookup, draft-only CAS without ownership, renderer move/delete loops, fallback latest Inbox, template rehoming, disabling FK enforcement, cascade reconstruction, and changing deletion consent.
- Schema transition is the largest added risk. Accept exactly the known full predecessor schema, verify before mutation, update schema authority atomically, and test rollback. Do not add a permissive migration framework.
- Preserve frozen generation command/retry semantics and avoid automatic resubmission. Project-derived config may change after a deliberate relocation; conversation overrides/history remain.
- Old edit sessions already lost their prior-compose snapshot; document the content-preserving compose transition rather than claim reconstruction.
- Static/UI tests provide scoped evidence, not full real-profile/Electron acceptance. Closeout must report actual PASS/FAIL and unresolved risks, protect hashes and show the expected dirty patch separately from pre-existing work.

## Internal review status

Reviewed by backend A, renderer B, privacy C and coordinator before production changes. All agree on one persisted template owner, one atomic relocation transaction and one draft aggregate with captured renderer scope. Review resolved same-conversation branch navigation through atomic edit cancellation, server-side previous-snapshot capture under CAS, full attachment/DFC snapshot semantics, and explicit preload API ownership. Upgrade must occur at the owned writable initialization transaction seam, never the read-only post-commit verifier; compare the complete known predecessor installed projection before mutation and update all schema authority within that transaction. Direct system-template draft reset/finalize paths must also clear the companion session. No generic schema recovery or credentials/history rewrite is added.

A new independent `risk_reviewer` and reactivation of completed read-only reviewers were rejected by the agent thread limit. Explicit cross-thread read-only review and coordinator review substitute for that resource in this wave; privacy C will also review G-A diffs after its independent work. Final diagnosis and security-boundary decisions remain with the coordinator.

Required gate execution exposed baseline integration defects: the existing Cloud selector display helper and overview panel were missing from the exact Model Facts identity allowlist, and two prior audit JSONs plus one research JSON contained machine paths. Coordinator classified their selector-ID usage as presentation (canonical selector IDs are displayed/diffed, never resolved into runtime identity), adds only those two exact files to the existing allowlist, and redacts only those evidence path fields. All send-path identity-fallback bans remain. No privacy allowlist relaxation is made; evidence facts/hashes remain. These are validation prerequisites, not another product repair wave.

**Plan stable / implementation GO: 2026-10-03.** Restore the existing Cloud lifecycle baseline first, then implement only the assigned G-A/G-B ownership. Closeout and any next plan require actual validation and review evidence.

## Implementation review refinements

Accepted command completion after A→B→A may clear the returned A projection only while A's submission lock is still held and the hydrated conversation/branch, submitted draft revision, mode, text and complete edit instance all exactly match. This is acknowledgement of that same aggregate; it does not authorize general late-result publication or following a child branch after navigation.

Read-only final review found an attachment continuation gap: a multi-file import queued each file separately, allowing cancel/open between files; a delayed file picker also retained only the conversation binding. The whole action must capture its draft aggregate identity and relevant acknowledged revision before delayed preparation. Each continuation validates that captured action before adopting any newer owner revision; only the action's own accepted mutation may advance its acknowledgement. A compose→edit→cancel round trip must invalidate an old compose action even though its mode returns to compose. This refines the existing immutable captured-scope invariant; it does not create per-branch compose drafts or retry stale actions. Real-repository deferred-picker and multi-file cancel/reopen regressions now pass. Preparation cancels a text-save timer only after acceptance and for the original binding/unchanged captured visible text; stale preparation and newer input keep their normal autosave. Both delayed timer regressions pass.
