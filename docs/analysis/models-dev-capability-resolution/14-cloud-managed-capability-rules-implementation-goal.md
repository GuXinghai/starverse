# Cloud-managed Capability Rules Implementation Goal

- **Lifecycle Status**: active implementation
- **Document Role**: production implementation plan derived from frozen Owner contracts
- **Last updated**: 2026-09-21
- **Authority**: implementation sequencing only; Owner semantics remain controlled by items 06, 12, and 13
- **Controlling inputs**: items 06, 12, and 13
- **Goal 3 status**: prohibited by this Goal

---

## 1. Objective

Replace the Goal 2C-era bundled/query-bound Capability Rules authority with the Owner-frozen Cloud-managed/User Pack and Rule architecture without creating a second Rules authority or a permanent compatibility layer.

This Goal implements the production substrate in dependency slices. It does not reopen the Owner decisions in items 06, 12, or 13. If repository facts expose a semantic contradiction that those documents do not resolve, implementation must stop at that boundary and escalate to the Owner.

## 2. Non-negotiable authority boundary

At every completed cutover point there must be exactly one Capability Rules data authority.

- Cloud-managed and User Rules share one Pack/Rule domain model and one Capability Rules canonical source.
- Rules never create model subjects.
- Regex executes only during revision-bound materialization against the authoritative exact-subject set.
- Materialization emits exact-subject canonical Rule claims and does not perform cross-source resolution.
- Runtime must not continue reading bundled/query-bound Rule storage after the Rules authority cutover.
- Goal 3 alone owns Provider Native/models.dev/Capability Rules merge, final winner/conflict semantics, final resolved facts, and final `capabilityRevision`.

## 3. Implementation slices

### Slice 1 — Shared Pack/Rule core

Implement the shared Cloud/User Pack and Rule domain, persistence primitives, activation evaluator, and one-shot Rewrite semantics.

This slice includes stable identities, Pack display name, optional Rule label, Pack/Rule priority, Rule configured state, Pack mode, Pack target, selectors, direct canonical assertions, deterministic revision/digest inputs, and repository invariants.

It does not implement Cloud acquisition, User drafts, materialization, runtime cutover, UI, or Goal 3. The existing Goal 2C authority remains unchanged until Slice 3.5; the new core must not be published or consumed as a parallel authority before that cutover.

### Slice 2 — Authoritative exact-subject set

Build one revisioned exact-subject-set service from Provider Native active catalogs, compatible-provider remote/manual exact IDs, and local endpoint-profile exact bindings. models.dev, Rule selectors/examples, aliases, and display names must not contribute subjects.

The implemented boundary resolves only each currently configured first-party credential scope's complete, unfiltered active/LKG catalog. Pending snapshots, obsolete credential scopes, category subsets, disabled/deleted compatible providers, and stale compatible remote acquisitions do not contribute subjects. OpenAI-compatible provider instances receive isolated registry-scoped authorities; LM Studio, Ollama, and Generic Local use explicit local-profile registry bindings and never inherit OpenAI authority from protocol compatibility.

### Slice 3 — Revision-bound materialization

Materialize exact and constrained-regex Rules only when the Rule definition revision or authoritative-subject-set revision changes. Persist all matched exact-subject canonical claims without choosing a winner, and bind the Capability Rules source revision to the authoritative-subject-set revision.

### Slice 3.5 — Rules authority cutover

Cut runtime over from the old Rule repository authority to the materialized exact canonical Rule claims.

- Runtime no longer performs selector matching or regex execution.
- Runtime consumes only materialized exact Rule claims from the single Capability Rules source.
- The existing Rules-only consumer projection semantics may remain temporarily so current send behavior can continue.
- That temporary consumer projection must not read bundled/query-bound storage and must not perform three-source merge.
- Delete the bundled installation authority, query-bound Rules source, and request-time selector authority as part of this cutover.

This is an authority cutover, not Goal 3 and not a compatibility fallback.

### Slice 4 — Cloud candidate acquisition

Implement the item 13 GitHub Release authority, strict Release Document decoding, version/revision ledger, integrity validation, candidate persistence, latest-observed state, withdrawal handling, and refresh status.

### Slice 5 — Cloud Apply, LKG, rollback, and pin

Implement Apply, activation reconciliation, applied LKG, bounded history, rollback, and persistent version pin. Candidate validation and materialization preparation should be deterministic and repeatable outside the SQLite write transaction.

The write boundary is:

```text
prepare and validate outside transaction
        ↓
BEGIN IMMEDIATE
        ↓
revalidate expected candidate/applied/source revisions
        ↓
write prepared content + activation reconciliation
+ canonical publication + history/LKG state
        ↓
COMMIT
```

No network operation or avoidable heavy canonicalization/materialization may hold the write lock. Revision revalidation makes the prepared result stale-safe.

### Slice 6 — User Rules and durable draft

Implement committed User Packs/Rules, durable tab-scoped drafts, recovery, validation, atomic batch Save, Import/Replace, committed Export, and the shared activation/Rewrite core. A successful Save republishes the same single Capability Rules source.

### Slice 7 — UI-safe services and UI

Implement the main-process query/mutation boundary, preload/client contracts, Models & Capabilities settings category, Cloud-managed Rules, User Rules, Facts Inspector, evidence/raw views, and Model Picker exact-subject deep-link.

## 4. Goal 3 hard boundary

This Goal must not implement:

- cross-source priority or merge;
- Provider Native/models.dev/Rules winner selection;
- equal-priority cross-source conflict resolution;
- final resolved Model Facts;
- final `capabilityRevision`;
- permissive-unknown execution policy.

After Goal 3 cuts normal consumers over, delete the temporary Rules-only consumer projection retained by Slice 3.5.

### Acceptance-driven Slice closure

Each Slice closes against the acceptance criteria frozen before implementation. Review findings are classified independently from severity:

- **Current-Slice Blocker**: violates the frozen contract, fails a current acceptance criterion, creates data/authority safety risk, or directly blocks the next Slice. It must be fixed now.
- **Deferred Finding**: a real defect or gap that does not prevent the current Slice from completing correctly. Record it in the deferred ledger without expanding the Slice.
- **Polish**: optional refactoring, performance, diagnostics, extra testing, or other non-essential optimization. Defer by default.

`P0/P1/P2` severity does not by itself determine `blocksCurrentSlice`. After a blocker fix, review only that fix and its direct regression surface. Once every acceptance criterion passes and no Current-Slice Blocker remains, close, commit, and proceed; the deferred ledger is handled by a later bounded hardening/cleanup pass.

## 5. Slice 1 acceptance

Slice 1 is complete only when focused tests prove:

1. Cloud and User use the same Pack/Rule core types and validation.
2. Stable Pack/Rule identity is immutable.
3. Pack and Rule priority are explicit bounded integers in persisted/publication content; later product creation boundaries supply the frozen default `0` rather than the core decoder synthesizing omitted values.
4. Activation matches the complete `override` / `default_only` / `no_control` truth table with an explicit ownership-specific default-policy input.
5. Rewrite is a one-shot mutation, respects mode semantics, leaves Pack mode/target unchanged, and cannot affect future Rules.
6. Pack/Rule content revisions and digests are deterministic and cover every core semantic field.
7. Cloud update metadata and User draft/recovery metadata are absent from the shared core.
8. The new core is not yet a second canonical/runtime authority.

Run only Slice 1 and directly affected schema/repository/type checks. Leave the native ABI in the Node target after database tests and commit no rebuild artifacts.

## 6. Slice 4 acceptance

Slice 4 is complete only when focused tests prove:

1. Discovery reads the fixed `GuXinghai/starverse` GitHub Releases authority, follows every page, ignores unrelated or malformed tags plus draft/prerelease Releases, and selects the highest canonical stable `cloud-rules-vX.Y.Z` tag without using the repository-wide latest-release endpoint. A malformed selected Release fails the check without falling down to an older Release.
2. Every request and redirect hop is HTTPS and confined to `api.github.com`, `github.com`, or a proper DNS subdomain of `githubusercontent.com`; user-info URLs, HTTP downgrade, illegal hosts, redirect loops, and timeout fail the check without forwarding credentials across hosts.
3. The selected release has exactly one uploaded `starverse-cloud-rules.json` asset, and its closed V1 document has an exactly matching release version, valid shared Pack/Rule content, unique stable identities, and a recomputed deterministic `contentRevision`.
4. A successfully validated `releaseVersion` is permanently bound to one `contentRevision`; later content drift is rejected without changing candidate or successful freshness state.
5. The validated candidate, latest-observed metadata, refresh diagnostics, and version-binding ledger are persisted atomically. Candidate record revisions are deterministic and suitable for later stale Apply checks.
6. A higher release with unchanged candidate/applied content updates latest-observed metadata and successful freshness without creating a new content candidate or Rules source revision.
7. A failed or incomplete check leaves the current candidate, applied-state reference, and last-successful-check timestamp unchanged. The selected highest release is never replaced by a lower fallback after validation failure.
8. A later successful complete check atomically replaces or withdraws an unapplied candidate according to the current highest official publication; failed/incomplete checks never withdraw it.
9. Slice 4 does not install Cloud content into the shared Rule core, publish Capability Rules facts, implement Apply/LKG/history/rollback/pin, expose product UI/IPC, or enter Goal 3.

Run only Slice 4 and directly affected schema/repository/service/type/static checks. Leave the native ABI in the Node target after database tests and commit no rebuild artifacts.

## 7. Slice 5 acceptance

Slice 5 is complete only when focused tests prove:

1. Apply and rollback consume only locally persisted, independently validated snapshots and never fetch from the network.
2. Apply binds both the expected candidate record revision and expected currently applied snapshot revision. Rollback binds the expected current applied snapshot and exact retained history target. Any stale input fails without substitution, retry, or partial mutation.
3. Candidate/LKG integrity validation, activation-overlay preparation, exact-subject materialization, and canonical publication preparation are deterministic and repeatable outside the SQLite write transaction. The short `BEGIN IMMEDIATE` boundary revalidates every expected candidate/applied/Rule/source revision before writing the prepared result.
4. One transaction installs the remote content, reconciles local per-field activation overrides by stable Pack/Rule identity, switches the applied Cloud snapshot, publishes the same single Capability Rules canonical source, records the Apply event/history state, and only then makes the new snapshot LKG. Any failure rolls back all of it and leaves the candidate available.
5. New identities use remote activation baselines; surviving local overrides remain field-specific across Apply and rollback; removed identities lose their overrides; Rule/Pack content and activation continue to use the shared core semantics rather than a Cloud-only Rule model.
6. With no LKG, the first valid candidate may bootstrap Apply automatically. Later candidates remain notify-only until explicit Apply. Downloaded or validated-but-unapplied content is never called LKG.
7. LKG does not expire with age. Refresh failure preserves it. Local LKG integrity failure marks Cloud Rules unavailable and cannot silently promote history, clear Cloud content, or invent recovery.
8. Current LKG is retained outside the configurable history window. History limit defaults to `4`, accepts only `0–20`, and pruning removes oldest user-visible history immediately while existing provenance pins may still retain underlying evidence.
9. Rollback is a new Apply event: the chosen retained snapshot becomes LKG, the prior LKG enters bounded history, current activation overrides are reconciled by stable identity, and rollback can be undone while retained.
10. Optional rollback pin is explicit and persistent. While pinned, checks may update freshness/availability but cannot publish higher-version candidates, badges, or auto-Apply. `Resume updates` removes the policy and the next normal check observes the highest current stable Release without replaying intermediate versions.
11. Slice 5 does not add Cloud/User UI, product IPC, User drafts, a fourth Model Facts source, cross-source merge/winner/conflict logic, or final `capabilityRevision`.

Run only Slice 5 and directly affected schema/repository/service/materialization/static checks. Leave the native ABI in the Node target after database tests and commit no rebuild artifacts.

## 8. Slice 6 acceptance

Slice 6 is complete only when focused tests prove:

1. Committed User Packs/Rules use the same Pack/Rule core, selector/assertion representation, activation evaluator, priority bounds, and one-shot Rewrite semantics as Cloud ownership; no User-only Rule truth model or fourth Model Facts source is introduced.
2. The User Rules tab owns one durable editing session whose persisted draft contains the full User ownership snapshot plus its immutable base committed snapshot revision and draft revision. Opening/recovering a draft never mutates committed Rules.
3. Draft create/edit/delete, cross-Pack Rule move, activation changes, Rewrite, Import/Replace, and ordinary Pack creation mutate only the draft. Cancel/discard removes the durable draft and leaves committed Rules plus the active Capability Rules source unchanged.
4. When no User Pack exists, creating the first Rule creates one ordinary explicit User Pack. It has no reserved identity, hidden flag, or special lifecycle and may subsequently be renamed, deleted, disabled, rewritten, imported/replaced, or exported.
5. Batch Save stale-fails against the draft base revision, validates the entire draft, installs the shared User ownership snapshot, materializes and promotes the resulting state of the same single Capability Rules canonical source, and deletes the draft in one short SQLite transaction. Any claim-affecting Save produces exactly one new source revision; Note-only metadata cannot churn Model Facts. Any failure rolls back every write and leaves the recoverable draft intact.
6. User content and activation publish only through batch Save. A successful claim-affecting Save performs one canonical publication regardless of the number of draft edits; no partial Save, field autosave, three-way merge, or multi-writer merge path exists.
7. The versioned User Rule Pack import/export format uses shared typed Pack/Rule content rather than arbitrary JSON. Import fully validates before changing the draft, adds a new Pack identity or performs explicit whole-Pack replacement, rejects unexplained identity collisions, and never performs copy-ID regeneration, automatic merge, per-Rule merge, or partial replacement.
8. Export reads only the last successfully committed Pack and includes stable identities, display metadata, selector/assertion, priority, activation, and optional Note where the frozen User format permits it; it excludes DB/source/runtime/draft metadata. The backend refuses committed export while the editing session is dirty.
9. Persisted draft recovery is deterministic and crash-safe; successful Save or explicit Cancel removes the editing session, while failed validation, stale Save, or publication failure preserves it.
10. Slice 6 does not add Settings UI, renderer DB access, product IPC, Cloud content mutation, derived Rule authoring, normal consumer migration, or any Goal 3 source merge/winner/conflict/final-resolution behavior.

Run only Slice 6 and directly affected shared-core/schema/repository/service/materialization/static checks. Leave the native ABI in the Node target after database tests and commit no rebuild artifacts.

## 9. Slice 7 acceptance

Slice 7 is complete only when focused tests prove:

1. Every Cloud/User Rules, authoritative-subject, Facts Inspector, evidence/raw-view, and per-source refresh-policy renderer call crosses a closed, revision-aware main-process IPC contract. The renderer neither opens the database nor parses persisted raw source payloads.
2. Cloud/User ownership remains one Capability Rules source in every UI-safe projection. No read model, status API, cache, or component exposes either ownership as an additional Model Facts source, and no Slice 7 path chooses a cross-source winner, resolves a conflict, or computes final resolved facts/capability revisions.
3. Cloud content is read-only. Its activation mutation is immediately atomic, requires expected revision(s), reports stale state without substitution, and republishes the one Capability Rules source only when effective emitted claims change. Check, deterministic candidate diff, Apply, rollback, pin/resume, history, attention and freshness use the already frozen Cloud lifecycle rather than an alternate UI-specific state store.
4. User Rules uses the durable draft service through session-bound UI-safe operations. All content and activation edits, including ordinary first-Pack creation, cross-Pack moves, Rewrite, Import/Replace and delete confirmation state, remain draft-only until one batch Save; Cancel/discard and recovered-draft flows preserve committed authority exactly as Slice 6 established.
5. Rule list/detail projections use stable identities, priority-descending / last-modified-descending / identity tie-break ordering, typed canonical assertion/domain projections, exact selector candidates that are not a whitelist, and no arbitrary JSON or derived-claim authoring surface. Import preview and committed-only Export preserve the Slice 6 transfer boundary.
6. Facts Inspector searches only authoritative exact subjects and accepts Model Picker deep-links only by already-resolved exact identity. Overview, Fields, matched Rule claims, Evidence slice and full sanitized payload lazy-read preserve no-coverage/missing/invalid/unsupported/source-absence/LKG distinctions and expose mechanical `Values differ` only; they do not infer conflict or winner semantics.
7. Settings contains one `Models & Capabilities` category with sibling Cloud-managed Rules, User Rules and Facts Inspector tabs. The implementation reuses the existing categorized Settings navigation and supplies the frozen keyboard, ARIA, focus-trap and focus-restoration behavior without a new router or Rules-specific navigation system. Cloud/User Pack flows use breadcrumb/back rather than a third nested tab, accordion, permanent split pane or drag ordering.
8. Model Picker/Model details uses the same Inspector route/state and passes the exact subject identity it already resolved; it never re-identifies from alias/display name or creates a source/subject from models.dev, Rules or a selector.
9. Refresh UI uses per-source explicit Save and revision CAS, source-scoped status/freshness, and the frozen background cadence/notification policy. Page open, renderer network state and renderer time must not independently refresh a source or derive attention severity.
10. Slice 7 does not change the closed Pack/Rule core semantics, Cloud distribution authority, canonical source materialization, normal Composer/Preflight/Runtime/Compiler consumers, or any Goal 3 merge/winner/conflict/final-resolution behavior.

Run only Slice 7 and directly affected IPC/preload/client/UI/i18n/schema/service/static checks. Leave the native ABI in the Node target after database tests and commit no rebuild artifacts.

## 10. Current implementation status

Slice 1 completed on 2026-09-21 with focused acceptance evidence:

- owner-neutral shared Pack/Rule content with separate Cloud/User ownership snapshots;
- stable Rule identity independent of mutable Pack membership;
- canonical-path/typed-value assertions and deterministic Rule → Pack → ownership revisions;
- shared activation truth table and one-shot Rewrite planning;
- atomic whole-ownership replacement with expected-revision checks and nested-transaction savepoints;
- canonical/JSON write preparation outside the SQLite write transaction and bulk metadata reads inside it;
- closed-schema integration and schema semantic digest coverage.

Slice 2 completed on 2026-09-21 with focused acceptance evidence:

- one dormant exact-subject-set service over current first-party active/LKG catalogs, active compatible remote/manual IDs, and explicit local endpoint-profile bindings;
- deterministic exact-triple membership revision separated from a proof/currentness input revision;
- current credential scope captured before the coherent SQLite read and revalidated afterward;
- Provider Native operation/credential/category retained only as membership proof, never base subject identity;
- durable OpenAI-compatible remote acquisition binding to endpoint, credential scope/revision, and snapshot digest; endpoint replacement marks prior remote rows stale, while the subject-set reader excludes acquisitions whose credential binding is no longer current;
- explicit isolated authority registration for configured compatible instances, LM Studio, Ollama, and Generic Local;
- focused contributor tests plus a static import guard proving that only approved identity sources feed the service; models.dev, Rules, selectors, aliases, and display names are not inputs.

Slice 3 completed on 2026-09-21 with focused acceptance evidence:

- one enumerable materializer projects the shared Cloud/User Rule core onto the revisioned authoritative exact-subject set;
- exact and constrained-regex selectors run only during materialization, are provider-authority/profile scoped, and cannot create subjects;
- every enabled matched Rule remains an independent exact-subject canonical claim; the materializer performs no winner selection, cross-source merge, conflict resolution, or final capability resolution;
- the canonical Rule source revision binds the Rule definition/policy inputs and authoritative subject-set membership revision; proof-only subject metadata changes do not cause materialization churn;
- heavy validation/canonicalization happens before the SQLite write boundary, while staging rechecks the expected stage revision, current Rule snapshot revisions, and a freshly read authoritative subject-set revision;
- complete subject facts, raw provenance, and their source revision are persisted behind a dedicated dormant stage pointer and protected from retention pruning;
- before Slice 3.5, staging did not update `canonical_model_fact_source_state_v1`, so it could not create a parallel active Rules authority.

Slice 3.5 completed on 2026-09-21 with focused acceptance evidence:

- the active Capability Rules source is now a complete, exact-subject materialized source; runtime repositories read only its frozen subject facts and never evaluate selectors or regex;
- runtime provider authorities and send coordinators consume the same materialized Rules-only projection, while the temporary projection remains explicitly outside the three-source Goal 3 resolver;
- the legacy bundled dataset, installer/repository, query-bound source mode, request-time adapter, selector matching path, schema tables, and tests were deleted rather than retained as fallback;
- the fresh database seeds one empty complete Rules source only on first creation; reopen is idempotent, and process startup schedules rematerialization from the real authoritative exact-subject set;
- committed catalog, credential, compatible-provider/manual-model, and local-profile identity mutations await one serialized/coalesced rematerialization before acknowledging usable success; terminal or exhausted-stale publication failures are logged and returned to the mutation caller, while startup recovery remains an explicit fire-and-forget schedule;
- preparation remains outside SQLite write transactions and staged promotion uses expected-revision checks; a durable staged revision is recoverable after interruption before promotion;
- Rule evidence can use `verifiedAt=null` only for `capability_rule`; mapped field evidence is effect-compatible with the resulting state, and invalid overlays—including empty numeric domains and out-of-domain explicit defaults—fail closed instead of silently returning provider base fields;
- a static authority gate prevents the removed repository, installer, bundled packs, request-time adapter, and selector matcher from returning to production code.

Slice 4 completed on 2026-09-21 with focused acceptance evidence:

- one fixed `GuXinghai/starverse` GitHub Releases discovery path paginates the formal Release API, selects the highest canonical stable Cloud tag, and never uses the repository-wide latest endpoint or falls down after selected-release failure;
- every request and redirect hop is manually constrained to HTTPS GitHub authority hosts with DNS-label-safe `*.githubusercontent.com` matching, user-info rejection, cross-host sensitive-header stripping, loop detection, and one bounded check timeout;
- the exact uploaded asset is bound to the fixed repository asset API path, then decoded through one closed Release Document V1 and the shared Pack/Rule core; `contentRevision` is recomputed from normalized Rule content and GitHub digest metadata remains audit-only;
- candidate/latest-observed/freshness/failure state and the permanent `releaseVersion -> contentRevision` ledger are stored atomically without becoming a fourth Model Facts source;
- candidate identity is the normalized `contentRevision`: metadata-only higher Releases advance latest-observed/freshness while preserving the existing candidate and stale-Apply token;
- failed or incomplete checks preserve candidate, applied-reference and successful freshness; only a successful complete check may replace or withdraw the unapplied candidate;
- process startup schedules acquisition through the governed product network stack; at the Slice 4 checkpoint, Apply and the remaining lifecycle were still absent.

Slice 5 completed on 2026-09-21 with focused acceptance evidence:

- persisted candidates and retained history are independently revalidated before use; Apply and rollback never fetch from the network;
- candidate, applied-record, Cloud core, activation-override, materialization-stage, active-source, and exact-subject-set revisions form one stale-fail boundary;
- heavy overlay, core-write, materialization, and canonical publication preparation happens before a short synchronous `BEGIN IMMEDIATE`; one transaction writes the shared Cloud core, promotes the same single Capability Rules source, updates LKG/history/event/pin state, and consumes or preserves the candidate as required;
- injected LKG persistence failure rolls back core, staged/source publication, applied state, and candidate consumption together;
- remote activation baselines remain immutable release content while surviving local per-field overrides are retained by stable identity and removed identities are discarded;
- the current LKG is separate from the configurable `0–20` history window (default `4`); rollback is a new Apply event and can retain the pre-rollback LKG for undo;
- persistent rollback pin suppresses higher-version candidates without suppressing freshness checks, while Resume Updates removes that local policy;
- first-run bootstrap applies only a persisted validated candidate when no LKG exists; later updates remain candidates;
- current LKG integrity failure marks the materialized Rules source unavailable without promoting history or clearing content, and explicit candidate Apply or retained-history rollback can recover atomically;
- normal logs contain no full `contentRevision`, and the Slice remains outside product IPC/UI, User drafts, and every Goal 3 merge/winner/conflict/final-resolution concern.

Slice 6 completed on 2026-09-21 with focused acceptance evidence:

- User-owned committed Packs/Rules reuse the shared Pack/Rule core and remain a single ownership input to the existing one Capability Rules source; Notes stay outside Model Facts content and evidence;
- one persisted full-snapshot draft is scoped to the User Rules tab, records immutable base revision/content, survives close/reopen recovery, and leaves committed authority unchanged until Save;
- first Rule creation creates an ordinary explicit User Pack with no hidden identity or special lifecycle; all draft changes, including shared Rewrite behavior, stay unpublished until Save and Cancel leaves the active canonical source unchanged;
- Save performs preparation outside the SQLite write transaction, then stale-rechecks and atomically writes User core, materialization/staged promotion, committed Notes, and draft deletion; an injected late failure rolls all writes back and preserves the draft;
- transfer Import/Export uses a versioned typed whole-Pack format, rejects invalid digest/foreign Notes, replaces only an identity-matched whole Pack, and refuses committed export while the User draft is dirty;
- Note-only Save preserves the canonical Capability Rules source revision, while claim-affecting content/activation/priority changes remain publication inputs;
- this Slice adds no Settings UI, renderer database access, product IPC, Cloud-content mutation, derived Rule authoring, normal consumer migration, or Goal 3 source merge/winner/conflict/final-resolution behavior;
- the schema change uses the frozen epoch-2 closed-schema digest replacement policy rather than an old-schema migration; the schema-mismatch recovery smoke passed.

Slices 1–6 are therefore complete. Slice 7 is next. Product UI/IPC and all Goal 3 merge/winner/conflict/final-resolution behavior remain unimplemented.

## 11. Deferred findings ledger

| Finding | Classification | blocksCurrentSlice | Disposition |
|---|---|---:|---|
| Additive migration from the immediately preceding development schema was suggested during Slice 4 review. | Contract conflict, not a deferred defect | no | Rejected: the frozen development policy remains epoch-2 closed-schema digest replacement with no old decoder or compatibility migration. Schema-mismatch replacement smoke is the acceptance path. |
| Per-family IPC mutation rejection coverage could be broader after Slice 3.5. | Polish / additional regression coverage | no | Defer to the bounded hardening/cleanup pass; the shared scheduler rejection path and current authority cutover acceptance remain covered. |
| Item 13 still contains one historical sentence saying Goal 2C-era production paths remain, although item 14 and this README record their later removal. | Deferred documentation cleanup | no | Keep item 13's frozen contract semantics unchanged during Slice 4; reconcile the historical implementation-status sentence in the bounded cleanup pass. |
