# Goal 3 Three-Source Model Facts Resolution Implementation Plan

- **Lifecycle Status**: Slice B complete; Slice C not started
- **Document Role**: production implementation plan derived from the frozen Goal 3 Owner contract
- **Last updated**: 2026-09-22
- **Baseline**: `models-dev-capability-resolution` at `e928b5cc02c1092c1e80f3f78eaabe1c6a0be3ff`
- **Authority**: implementation sequencing only; Owner semantics remain controlled by items 06, 10, 12, and 13
- **Controlling inputs**: items 06, 10, 12, 13, 14, this bundle README, and current production code

## Slice checkpoint ledger

### Slice A — Pure resolved-facts ontology

- **Status**: complete on 2026-09-22.
- **Implementation**: added `src/next/generation-v2/model-facts/resolvedModelFactsV1.ts` with explicit three-source inputs/absence markers, resolved/unknown/conflict field states, completeness disposition, full canonical assertion provenance, diagnostics, deterministic canonicalization, and final semantic `capabilityRevision` digest.
- **Tests**: added `src/next/generation-v2/model-facts/resolvedModelFactsV1.test.ts` covering state losslessness, deterministic field/provenance order, explicit source absence, source/config revision identity, round-trip/tamper rejection, and execution-layer exclusion.
- **Validation**: `npx vitest --run src/next/generation-v2/model-facts/resolvedModelFactsV1.test.ts` (4 passed); `npx tsc --noEmit --pretty false` (passed); targeted ESLint (no errors; two existing-style warnings for function complexity/length); `git diff --check` (passed for Slice A files).
- **Boundary**: no DB/schema, IPC, service, UI, runtime snapshot, compiler, provider, or consumer changes. No ABI rebuild was required.

### Slice B — Source-priority configuration and revision

- **Status**: complete on 2026-09-22.
- **Implementation**: added `sourcePriorityConfigV1` with exact three-source keys, safe-integer priorities, equal-priority support, canonical semantic JSON, deterministic `sourcePriorityConfigRevision`, and schema digest; added the seeded `model_facts_source_priority_v1` Epoch-2 table with monotonic timestamps and identity protection; added `SourcePriorityConfigV1Repo` CAS persistence and `SourcePriorityConfigV1Service`; registered strict main-process IPC and preload `generationV2.modelFacts.sourcePriority` read/update access; added a typed renderer bridge adapter without binding Settings UI yet.
- **Schema integration**: added the source-priority SQL fragment, raised the closed manifest fragment count from 19 to 20, and included the resolved-facts ontology and source-priority ontology digests in the Epoch-2 schema digest.
- **Tests**: added codec, repository/CAS, and IPC tests; extended schema-composer coverage for the new fragment/table. Equal priorities, insertion-order independence, stale CAS, seeded defaults, semantic corruption rejection, and strict IPC payloads are covered.
- **Validation**: `npm run rebuild:node`; `npx vitest --run src/next/generation-v2/model-facts/sourcePriorityConfigV1.test.ts` (4 passed); `npx vitest --run --config vitest.integration.config.ts infra/db/repo/sourcePriorityConfigV1Repo.test.ts` (2 passed); `npx vitest --run --config vitest.integration.config.ts electron/ipc/generationV2SourcePriorityConfigIpc.test.ts` (1 passed); `npx vitest --run --config vitest.integration.config.ts infra/db/v2/schemaComposerV2.test.ts` (19 passed); `npx tsc --noEmit --pretty false` (passed); targeted ESLint (no errors; existing complexity/length warnings); `git diff --check` (passed).
- **Boundary**: no resolver, resolved-facts cache/publication, Settings UI, provider snapshot cutover, compiler/runtime authority, or legacy deletion. Node ABI is the active validation target.

### Next Slice

Slice C — Deterministic three-source resolver.

## Sol-medium review budget

Consumed: 0 / 6. Slice A requires no Sol-medium review.

- [ ] C pre-implementation
- [ ] D post-implementation
- [ ] E pre-cutover
- [ ] E post-cutover
- [ ] F residual authority audit
- [ ] G closeout

---

## 1. Objective and decision status

Goal 3 replaces the current provider-specific capability assembly plus temporary Rules-only overlay with one field-level resolver over three canonical Model Facts sources:

1. Provider Native;
2. models.dev;
3. Capability Rules.

The implementation must preserve complete/partial set and range semantics, conflict, full provenance, source-local LKG, exact-subject identity, and one final `capabilityRevision`. Freshness and stale state remain diagnostics only. API Contract, operation, compatibility, encoding, runtime constraints, and execution policy remain downstream authorization concerns and must not become Model Facts inputs.

The frozen documents and current code provide enough information to begin implementation. **No additional Owner decision is required before Goal 3 implementation.**

This document plans implementation only. It does not itself authorize production code, database, configuration, IPC, or UI changes.

## 2. Current implementation map

### 2.1 Canonical source inputs already exist

The current `canonicalSourceFactsV1` ontology already provides the Goal 3 input substrate:

- canonical paths for limits, modalities, attachments, reasoning, sampling, tools, structured output, image, and search;
- exact subject identity;
- typed support, scalar, set, and integer-domain values;
- `complete` and `partial` collection semantics;
- `present_valid`, `missing`, and `invalid` observations;
- current observation versus effective same-subject LKG assertion;
- explicit/derived provenance, raw field references, and Rule claim context;
- independent canonical source and exact-subject fact revisions.

The adapters and publishers remain source-local. They normalize raw evidence but do not compare source priority, choose cross-source winners, or compute a final `capabilityRevision`.

### 2.2 Existing three-source production entrypoints

| Source | Current entrypoint | Publication shape |
| --- | --- | --- |
| Provider Native | `generationV2ModelAvailabilityIpc` → `CanonicalModelFactSourceIngestionV1Service.refreshProviderNative()` | Provider-authority, endpoint/profile, credential-scope/revision, and acquisition-scope isolated immutable source revisions and exact-subject facts |
| models.dev | `ModelsDevOfficialSourceRefreshV1` → `refreshModelsDev()` | Official API raw snapshot, canonical source revision, exact-subject facts, LKG, and freshness |
| Capability Rules | `CapabilityRuleMaterializationV1Service` → `prepareCapabilityRuleMaterializationV1()` | Complete exact-subject source in which every matching active Rule remains an independent canonical claim with owner/Pack/Rule identity, exact/regex origin, priority, evidence, and provenance |

`CanonicalModelFactSourceV1Repo` already provides immutable raw/source/subject-fact persistence, Provider/models.dev transaction publication, Rules stage/promote CAS, old-or-new current-pointer visibility, and source-local freshness/LKG state.

### 2.3 Missing Goal 3 production substrate

Production currently has no:

- cross-source priority configuration or revision;
- pure three-source Model Facts resolver;
- resolved conflict/provenance ontology;
- immutable resolved-facts repository or cache;
- atomic per-subject resolved current pointer;
- final revision digest over canonical subject-fact refs, resolution config, and resolved provenance.

The existing `CanonicalModelFactsV2` revision is derived from the older fixed Generation Intent fields and evidence. The existing `capabilityResolutionV2` boundary also carries protocol, operation, encoding, and runtime binding, so it is not the pure Goal 3 Model Facts boundary.

### 2.4 Temporary Rules-only authority is not a Goal 3 input

`MaterializedCapabilityRuleProjectionV2Repo` reads the active materialized Rules source but returns `materializedCapabilityRuleProjectionV2`, which already performs exact-over-regex selection, Rule-priority winner selection, same-priority conflict handling, and overlays onto the old capability shape.

Goal 3 must instead consume every materialized Rule claim directly from the canonical subject-fact outcomes. The temporary projection and its compose/apply helpers remain only until normal consumers migrate; they must never be passed into the Goal 3 resolver.

### 2.5 Current downstream closure

`generationV2CapabilityResolutionService` currently feeds renderer/session preflight, but new runtime snapshots are still produced independently by provider-specific authority and coordinator paths. Those paths cover OpenRouter, OpenAI Responses, Anthropic, DeepSeek, Gemini text/image, OpenAI-compatible, LM Studio, Ollama, and Generic Local, including initial send, regenerate, edit-resend, and image action/send.

OpenRouter additionally derives semantic capability fields directly from Catalog `supportedParameters` and `inputModalities`. This and every provider-specific Rules overlay are cutover blockers.

The existing snapshot chain is reusable:

- initial send, regenerate, and edit-resend create a new immutable runtime capability snapshot;
- retry and replay use the originating persisted snapshot and do not re-resolve current sources;
- tool continuation uses the originating immutable snapshot;
- IPC expected-revision context, snapshot commit, and compiler validation enforce one frozen revision.

## 3. Implementation slices

Each Slice is a separately reviewable and verifiable commit. Slices 1–4 are additive and dormant. Slice 5 is the cohesive production cutover and must not be split into a state where UI and snapshot producers use different authorities. Slice 6 removes old authorities. Slice 7 closes acceptance without adding new product behavior.

### Slice 1 — Pure resolved-facts ontology

**Goal**

Define the execution-independent Goal 3 resolved ontology and final revision contract.

**Inputs**

- `CanonicalModelSubjectV1`;
- canonical subject-fact payloads and refs from all three sources;
- existing typed canonical values, completeness, observation, and provenance types.

**Outputs**

Add pure types equivalent to:

- `ResolvedModelFactsV1`;
- `ResolvedModelFactFieldV1`;
- `ResolvedModelFactProvenanceV1`;
- `ModelFactsResolutionInputV1`.

Each resolved field must express `resolved | unknown | conflict`, an optional selected typed value, completeness disposition, selection reason, and complete supporting/opposing/overridden provenance plus missing/invalid diagnostics. `ResolvedModelFactsV1` binds the exact subject, three source inputs or explicit absence markers, source-priority config revision, resolver/ontology revision, resolved fields, and final `capabilityRevision`.

**Acceptance criteria**

- `supported`, `unsupported`, `unknown`, and `conflict` are lossless.
- `missing` and `invalid` remain source diagnostics and cannot become `unsupported`.
- Multiple supporting sources and overridden/opposing sources remain attributable.
- Canonical codecs, ordering, and digests are deterministic.
- The ontology contains no protocol, operation, API contract, encoding, runtime constraint, execution policy, or `requires_confirmation` authority.

**Explicit exclusions**

- No resolver algorithm, database, IPC, UI, or consumer cutover.
- No new capability path without preserved raw evidence.
- Do not delete or rewrite the existing runtime capability shape in this Slice.

**Expected modules**

New pure model-facts-resolution types/codecs and focused unit tests under Generation V2.

### Slice 2 — Source-priority configuration and revision

**Goal**

Create the durable, editable SSOT for cross-source priority.

**Inputs and outputs**

The default configuration is:

```text
provider_native = 3
models_dev      = 2
capability_rule = 1
```

Values are canonical safe integers; the codec rejects non-integers and values outside the host safe-integer range. Equal values are allowed so equal-priority conflict remains representable. Rule `effectiveRulePriority` remains an intra-Rules-source input and cannot substitute for cross-source priority. This numeric representation is an implementation detail; the frozen semantic contract is the default ordering, editability, and support for equal-priority conflict.

`sourcePriorityConfigRevision` is a deterministic digest of schema version plus the canonical three-source integer map. Timestamps, freshness, UI order, and descriptive metadata are excluded. Mutation uses `expectedConfigRevision` CAS. The Slice provides a main-process service and UI-safe read/update IPC; Settings binding occurs during Slice 5.

**Acceptance criteria**

- Default priority is Provider Native > models.dev > Capability Rules.
- Equal-priority configurations persist and round-trip.
- Identical semantic configuration produces the same revision; any priority change produces a new revision.
- Freshness/stale changes cannot affect the config revision.
- Persistence, stale-CAS failure, initialization, and schema-recovery tests pass.

**Explicit exclusions**

- No three-source resolution or product Settings UI.
- No custom conflict-policy DSL.
- No reinterpretation of Pack/Rule priority as source priority.

**Expected modules**

Priority domain/codec, repository/schema, service/IPC, and Epoch-2 schema initialization/digest coverage.

### Slice 3 — Pure three-source resolver

**Goal**

Implement a deterministic resolver with no database, time, renderer, provider runtime, or compiler dependency.

**Inputs**

- exact subject;
- Provider Native, models.dev, and Capability Rules canonical subject facts;
- canonical source/subject-fact refs or explicit absence markers;
- normalized source-priority config and its revision;
- resolver and ontology revisions.

Capability Rules input is the full materialized `outcomes` collection, never the temporary winner projection.

**Resolution contract**

- A silent or missing higher-priority source does not suppress a lower-priority valid claim.
- Ordinary stale current/LKG sources participate exactly at their configured priority.
- Within one source and priority, explicit declarations outrank derived declarations.
- Rules resolution applies exact-over-regex, then effective Rule priority, with equal-priority incompatible claims producing conflict; every unselected claim remains provenance.
- Cross-source priority applies only where sources actually claim the same field/subfield.
- A complete list/range is an atomic fact and cannot be implicitly unioned with a lower-priority complete fact.
- Only explicitly partial knowledge may be supplemented, and every contributed member/bound retains provenance.
- Equal-priority incompatible values produce deterministic `conflict`, independent of load, refresh, map, or insertion order.
- A higher-priority winner never deletes lower-priority supporting, opposing, or overridden evidence.
- An invalid current observation may use its effective same-subject LKG assertion while preserving the invalid observation and disposition.
- The resolver never parses or reinterprets source-native raw fields.

The `capabilityRevision` semantic digest includes exact subject, source subject-fact refs/absence markers, resolved values/conflicts/provenance, source-priority config revision, and resolver/ontology revision. It excludes freshness timestamps/state and all execution-layer inputs.

**Acceptance criteria**

Table-driven and property tests cover order independence, missing fill, complete/partial set and range behavior, same/different-priority conflict, explicit/derived selection, invalid/LKG behavior, all-claims Rules input, complete provenance, priority-revision changes, and freshness invariance.

**Explicit exclusions**

- No DB/cache, IPC, UI, availability, provider compiler, or runtime authorization.
- No future conflict strategy DSL or arbitrary derivation language.

**Expected modules**

Pure resolver, canonical digest, fixtures, table/property tests.

### Slice 4 — Resolved publication, cache, and service seam

**Goal**

Connect the pure resolver to current source persistence and publish immutable, atomic per-subject resolved snapshots without changing normal consumers.

**Inputs and outputs**

- Resolve an exact execution binding to its canonical subject and correct Provider Native source scope.
- Read current Provider Native, models.dev, and Capability Rules subject facts.
- Keep ordinary stale/LKG sources eligible; retain the existing Cloud LKG integrity-unavailable behavior.
- Cache by subject, three subject-fact refs/absence markers, priority revision, and resolver revision.
- Persist immutable resolved payloads and atomically CAS the per-subject current pointer only after revalidating all source refs and the priority revision.

A publication race receives exactly one full reread/recompute retry. A second observed change returns an explicit stale-publication error; it must not loop indefinitely or publish a half-current result.

**Acceptance criteria**

- Readers see a complete old or complete new snapshot, never mixed source inputs.
- Freshness-only changes reuse the same semantic cache key and `capabilityRevision`.
- Fact/ref/priority changes produce a new revision.
- Failed validation, persistence, or CAS leaves the current pointer unchanged.
- Current resolved and persisted runtime snapshots pin their referenced provenance/raw evidence.
- `RuntimeCapabilityV2Repo` remains an execution snapshot repository, not the canonical resolved cache.

**Explicit exclusions**

- No normal consumer or provider cutover.
- No eager recomputation of every known subject.
- No changes to source ingestion, Rules materialization, or authoritative-subject construction.

**Expected modules**

Resolved-facts schema/repository, three-source reader, Goal 3 main-process service, and atomic publication tests.

### Slice 5 — Atomic consumer cutover and snapshot continuity

**Goal**

Move all normal capability consumers and every new operation snapshot producer to Goal 3 resolved facts without keeping the old authority as fallback.

**Cutover closure**

1. Central capability service/IPC, renderer client, and active session projection.
2. Model Picker, Catalog-derived badges, Composer, reasoning/generation controls, attachment compatibility, and the Facts Inspector resolved view.
3. Every provider, local, compatible, text, and image initial/regenerate/edit-resend/action snapshot producer.
4. Execution authorization after Model Facts resolution. API Contract, operation, encoding, runtime constraints, and policy may reject but cannot expand or rewrite Model Facts or `capabilityRevision`.
5. Prepared-request compilers, runtime registry, and stream runner reading only the frozen persisted snapshot.
6. Functional source-priority Settings editor using the Slice 2 CAS API.

**Snapshot contract**

- New operations write a new runtime snapshot schema containing the Goal 3 resolved-facts ref/provenance and pure `capabilityRevision`.
- Encoder/execution revisions remain separate.
- A read-only decoder for already-persisted old runtime snapshots may remain solely for historical retry/replay. It is not a resolver fallback.
- Retry, replay, and tool continuation use the originating frozen snapshot without current-source resolution.
- Regenerate and edit-resend create a new operation and resolve current Goal 3 facts.
- UI expected revision versus snapshot-producer revision mismatch stale-fails; it never silently refreshes, retries, or calls the old authority.

**Acceptance criteria**

- Every production scope that resolves current facts for an initial, regenerate, edit-resend, or image action snapshot uses the same Goal 3 service. Retry/replay/continuation paths instead consume the originating frozen snapshot and never call an old or new current-facts resolver.
- UI, preflight, snapshot commit, and compiler use one revision per send.
- Catalog booleans, `supportedParameters`, and the temporary Rules projection cannot affect a new snapshot.
- Idempotent replay preserves the originating snapshot and hash. Retry-as-new/retry-replace preserve the frozen `capabilityRevision`, semantic/evidence digests, and Model Facts content, while their new operation/answer identity may produce a new snapshot hash.
- Provider Model Facts removal does not remove legitimate downstream API/encoding/runtime restrictions.
- Static reference checks find no new snapshot producer using the temporary projection.

**Explicit exclusions**

- No provider wire-compiler rewrite.
- No execution policy in Model Facts.
- No unbounded Catalog refactor, race fuzzing, or opportunistic hardening.

**Expected modules**

Capability service/IPC, provider authority/coordinators, runtime snapshot codec/repo, renderer/UI projections, Settings, and Facts Inspector.

### Slice 6 — Delete temporary and legacy authorities

**Goal**

Delete the dual-track authorities after Slice 5 proves zero normal-consumer references, then add gates preventing their return.

**Delete or remove authority from**

- `MaterializedCapabilityRuleProjectionV2Repo`;
- `materializedCapabilityRuleProjectionV2`;
- `applyCapabilityRuleProjectionV2` and `applyCapabilityRuleProjectionToResolvedCapabilityV2`;
- all `compose*WithMaterializedRulesV2` helpers;
- provider-specific Rules overlays and Model Facts matrices;
- OpenRouter `supportedParameters`/`inputModalities` send authority;
- legacy Catalog capability booleans as facts authority;
- compatible manual/remote capability overlays as send authority;
- duplicated supported-parameter decision paths;
- any remaining model capability allowlist, request-time capability regex, or silent fallback;
- dead file-capability utilities after a final static/dynamic reference check;
- old authority fixtures, characterization tests, and gate exceptions.

**Retain**

- materialized Capability Rules source and materialization-time selector regex;
- raw Catalog evidence and metadata still used for non-authoritative display/search;
- exact Catalog membership and credential/binding evidence;
- identity/schema validation regex;
- API Contract, operation, encoding, runtime, and execution-policy restrictions;
- historical immutable snapshot decoding.

**Acceptance criteria**

- A new static gate forbids temporary imports/symbols and Catalog-to-send semantic decisions.
- Schema/DTO removal of legacy booleans includes the applicable migration/recovery tests.
- No path handles new resolver failure by calling a legacy capability authority.
- Remaining Catalog fields are explicitly evidence/display metadata rather than send authority.

**Explicit exclusions**

- Do not delete raw evidence solely because it once fed a legacy authority.
- Do not treat family/tag or identity regex as capability resolution without evidence of such use.
- Do not refactor unrelated Catalog or UI code.

### Slice 7 — End-to-end closeout

**Goal**

Complete full-chain acceptance, negative authority audit, and documentation status synchronization without adding new product behavior.

**Acceptance criteria**

- Real persistence-to-resolver-to-UI/send-snapshot-to-compiler coverage exists for all three sources.
- A source-priority change produces a new final revision; freshness-only change does not.
- All materialized Rule claims, complete/partial behavior, conflict, and complete provenance are inspectable in the final resolved view.
- Normal send, regenerate, and edit-resend use new revisions.
- Retry, replay, and continuation retain their originating revision.
- Concurrent refresh/send produces a complete old or complete new snapshot.
- Static authority scans report no temporary or legacy fallback.
- README and items 06/10/12/13/14/15 report actual, evidence-backed status without calling unrun checks successful.

**Explicit exclusions**

- No conflict DSL, automatic repair, telemetry platform, or infinite hardening campaign.
- A non-blocking P1 does not automatically create another Slice.

## 4. Dependency and cutover graph

```text
completed three-source ingestion + Rules all-claims materialization
                              │
                   ┌──────────┴──────────┐
                   ▼                     ▼
       Slice 1 resolved ontology   Slice 2 priority SSOT
                   └──────────┬──────────┘
                              ▼
                    Slice 3 pure resolver
                              ▼
             Slice 4 atomic publication/cache
                              ▼
       Slice 5 one-authority consumer/snapshot cutover
              ├───────────────┼────────────────┐
              ▼               ▼                ▼
       UI/preflight     new snapshot       downstream API/
                        producers          encoding/policy
                              │
                    frozen runtime snapshot
                       ┌──────┴──────┐
                       ▼             ▼
                 retry/replay   regenerate/edit
                 reuse snapshot resolve new snapshot
                              │
                              ▼
               Slice 6 legacy authority deletion
                              ▼
                    Slice 7 closeout
```

The following must cut over together:

- UI expected revision and every new snapshot producer;
- initial, regenerate, and edit-resend for each provider family;
- text, image, local, and compatible production scopes;
- the boundary from pure resolved facts into execution authorization.

Provider-specific compose/apply callsites may be deleted as each internal migration lands inside Slice 5, but the shared temporary projection/repository and legacy Catalog/provider authority cannot be deleted until the entire Slice 5 closure has zero references.

## 5. Delete-after-migration checklist

- [ ] Temporary Rules-only projection and repository
- [ ] Rules winner/overlay/apply helpers
- [ ] Local/compatible/image `compose*WithMaterializedRulesV2`
- [ ] Provider-specific Model Facts overlays and matrices
- [ ] OpenRouter `supportedParameters`/`inputModalities` send authority
- [ ] Legacy Catalog capability booleans authority
- [ ] Compatible manual/remote capability overlay authority
- [ ] Duplicated supported-parameter decision paths
- [ ] Hard-coded model capability allowlists
- [ ] Request-time capability regex
- [ ] Silent capability fallbacks
- [ ] Dead file-capability mapping utilities after reference proof
- [ ] Old authority fixtures, tests, and gate exceptions

Materialized Rules source, raw Catalog evidence, identity regex, and execution constraints are explicitly outside this delete list.

## 6. Test and gate strategy

### 6.1 Slice-level validation

- Slices 1 and 3: pure unit, table-driven, and property tests without DB setup.
- Slices 2 and 4: repository, CAS, schema recovery, and atomic-publication integration tests.
- Slice 5: all provider scopes and command kinds, UI revision propagation, IPC/snapshot/compiler consistency, and frozen replay coverage.
- Slice 6: negative import, symbol, and authority scans.
- Slice 7: full unit/UI/integration suites, Electron smoke, and documentation-status audit.

### 6.2 Required semantic scenarios

- resolution and refresh-order independence;
- `missing`, `invalid`, `unknown`, and `unsupported` separation;
- lower-priority fill when a higher-priority source is silent;
- complete list/range whole-value competition;
- explicit partial set/range supplementation;
- equal-priority conflict;
- explicit-over-derived selection;
- full supporting/opposing/overridden provenance;
- direct use of all materialized Rule claims;
- source-priority revision in `capabilityRevision`;
- stale/freshness exclusion from semantic resolution and revision digest;
- source/CAS competition without half publication;
- Catalog and temporary projection exclusion from new send authority;
- retry/replay/continuation freeze and regenerate/edit-resend re-resolution.

### 6.3 Validation command order

1. Before DB-heavy Node/Vitest tests, run `npm run rebuild:node`.
2. Run focused Slice tests.
3. Run `npm run test:unit`, `npm run test:ui`, and `npm run test:integration`.
4. Run `npm run gate:generation-v2-zero-residual`, `npm run gate:generation-v2-capability-rule-authority`, `npm run gate:model-identity-purge`, and `npm run verify:ssot`.
5. Add and run a Goal 3 authority gate that forbids temporary/legacy authority revival.
6. Run type checking and Vite/build validation.
7. Run `npm run test:electron-smoke` last. If Electron smoke is the task endpoint, leave the active ABI target as Electron.
8. Before every commit, run `git status --short`; never commit native rebuild outputs, `node_modules`, `public/build-id.json`, or temporary artifacts.

## 7. Deferred findings ledger

Severity and blocking status are independent. The following findings do not add Slices unless later evidence makes them necessary for an existing acceptance criterion.

| Finding | Severity | Blocks Goal 3 | Disposition |
| --- | --- | --- | --- |
| models.dev/Ollama and other raw semantics/evidence gaps | P1 | No | Keep affected paths unmapped/unknown; handle in separate data-quality work |
| Exhaustive source-failure × invalid-field × LKG matrix | P1 | No | Cover representative contract cases in Slices 3/4; defer exhaustive/fuzz coverage |
| Long-running high-concurrency refresh/send stress and fault injection | P1 | No | Prove CAS invariants in Slices 4/5; defer extended stress campaign |
| Long-term resolved-provenance GC/compaction optimization | P1 | No | First guarantee pins and no dangling references; optimize later |
| Catalog family/tag/display regex cleanup | P2 | No | These are not currently capability authority; treat as polish |
| Advanced source-priority editor UX, presets, and explanatory copy | P2 | No | Slice 5 delivers functional CAS editing and revision feedback only |
| Broader per-family IPC mutation-rejection coverage | P2 | No | Current shared boundary plus Goal 3 acceptance is sufficient; harden later |
| Physical slimming of non-authoritative Catalog metadata/DTOs | P3 | No | Remove only after display/search consumers no longer need them |

## 8. True Slice blockers

The current implementation blockers are:

1. no pure resolved-facts ontology;
2. no deterministic all-claims three-source resolver;
3. no atomic resolved publication/cache;
4. new snapshot producers still use provider-specific and temporary Rules authorities;
5. legacy authority cannot be deleted until the complete consumer closure migrates.

Slices 1–6 cover these blockers directly. No blocker requires reopening the frozen Owner contract.

## 9. Stop boundary

The current task explicitly authorizes Goal 3 implementation on `models-dev-capability-resolution`. Continue only through the recorded slice checkpoints:

- do not delete the temporary Rules-only path before the complete consumer cutover;
- do not treat the current provider/Catalog assembly as the Goal 3 resolver;
- do not report Goal 3 complete until Slices C–G and their acceptance evidence are finished;
- preserve unrelated user changes and never touch `pelican-bicycle.html`.
