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

## 6. Current implementation status

Slice 1 completed on 2026-09-21 with focused acceptance evidence:

- owner-neutral shared Pack/Rule content with separate Cloud/User ownership snapshots;
- stable Rule identity independent of mutable Pack membership;
- canonical-path/typed-value assertions and deterministic Rule → Pack → ownership revisions;
- shared activation truth table and one-shot Rewrite planning;
- atomic whole-ownership replacement with expected-revision checks and nested-transaction savepoints;
- canonical/JSON write preparation outside the SQLite write transaction and bulk metadata reads inside it;
- closed-schema integration and schema semantic digest coverage.

The new core is intentionally dormant: no runtime, canonical publisher, adapter, IPC, renderer, or provider imports it as an authority. The Goal 2C bundled/query-bound path remains the sole production Rules authority until the Slice 3.5 atomic cutover. Slice 2 is the next implementation slice.
