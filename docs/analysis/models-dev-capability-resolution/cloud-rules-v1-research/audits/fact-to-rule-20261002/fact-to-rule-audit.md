# Fact-to-Rule audit — Cloud Rules v1

## 1. Executive conclusion

The **290-Rule core is not materially over-compressed by selector aggregation**. Independent reconstruction and the actual pure materialization adapter reproduce264 evidence records →1350 facts →6333 disposition rows →1017 selected exact claims →290 Rules. No selected assertion disappears or changes value. The727-claim reduction at Rule aggregation is lossless for the single path/value assertion each Rule can express.

The excluded-fact pipeline does need **targeted repair before endorsing the existing “ready as-is” recommendation**. Three Anthropic output facts, expanded to six rows, are described as superseded even though their replacement was itself held;28 OpenAI input facts are already partial but retain a complete-set deferral rationale. Positive text output and Sonnet5.5 adaptive mode could plausibly be retained through existing partial-set types. Four Fable/Mythos web-search HIGH joins need a capability-specific scope recheck. This is an audit of saved evidence, not proof of current provider behavior.

No release/apply or existing-artifact modification occurred. All findings and machine joins are in this new directory. There is no selected-corpus structural BLOCKER; HIGH findings concern exclusion accounting and potentially recoverable coverage. Conditional/surface semantics and lifecycle do expose real design boundaries, but repairing this bounded proposal does not require opening a general ontology redesign first.

## 2. Count reconciliation

| Provider | Evidence | Facts | Disposition rows | Provider proposals | Final Rules | Selected claims |
| --- | --- | --- | --- | --- | --- | --- |
| gemini | 63 | 416 | 416 | 216 | 135 | 135 |
| deepseek | 18 | 51 | 95 | 7 | 7 | 13 |
| openai | 72 | 328 | 328 | 62 | 58 | 58 |
| anthropic | 50 | 79 | 451 | 49 | 36 | 253 |
| openrouter | 61 | 476 | 5043 | 64 | 54 | 558 |

| Final disposition | Rows | Selected |
| --- | --- | --- |
| RULE_CANDIDATE | 893 | 893 |
| ALREADY_MODELS_DEV | 1145 | 0 |
| TEMPORALLY_UNSAFE | 367 | 0 |
| ONTOLOGY_GAP | 129 | 0 |
| AMBIGUOUS_DEFER | 1938 | 0 |
| REDUNDANT_BUT_USEFUL | 139 | 124 |
| ALREADY_PROVIDER_NATIVE | 1722 | 0 |

893 RULE_CANDIDATE +124 selected REDUNDANT_BUT_USEFUL =1017. All893 final candidate rows are selected. The remaining15 redundant rows comprise9 with a selected replacement and6 without one. Inference is already part of row expansion:773 explicit +244 HIGH =1017, not an additional124 claims. Original provider proposals total398:290 retained and108 rejected/superseded with recorded row or superseded-fact links.

Checks: zero duplicated fact IDs, evidence IDs or fact/model row identities; zero missing fact expansions or unresolved evidence refs; zero selected subject/path duplicates; zero orphan selected claims. There are53 repeated disposition keys across facts, of which29 have a non-null exact subject and path. These are retained repeated/partial/conflicting evidence, not multiply-classified rows. In the29 exact keys,11 have identical values and18 differ (four input subset comparisons, twelve held beta action-subset comparisons, two held gateway conflicts). Each disposition row has exactly one final classification. Eighty rows have no model,77 no canonical path,198 null values: these are API/concept/unknown records and must not be counted as exact executable claims.

## 3. Counting units

- **Evidence record:** a durable ledger retrieval/source summary with an evidenceId; it may be inventory, identity, lifecycle, failed retrieval, schema or capability evidence. It is not necessarily one document or one independent capability assertion. Provider ledgers have264 unique IDs; the28 coordinator records are a separate corroboration ledger and are not silently added to264.
- **Intermediate fact:** a provider-local factId with a canonical value or retained null/concept and a model-coverage list. One fact may bundle many exact subjects. There are1350; unknown-path reviews also count as facts.
- **Disposition row:** one provider fact expanded over union(explicit/high/medium/low exact IDs), or one null-model concept row if the union is empty. There are6333; repeated subject/paths across different facts are allowed evidence records.
- **Exact claim:** one selected authority/profile/nativeModelId/path/value link. Selection is non-null candidateRuleId, not classification alone. There are1017.
- **Rule:** one scope plus exact selector list and **one** canonical path/value assertion, priority/activation and shared evidence metadata. There are290, organized in5 Packs. A Rule can compress equal exact assertions; it cannot represent arbitrary cross-parameter conditions, per-member values or expiry.

## 4. Full transformation and trace model

`evidence/{provider}.jsonl:evidenceId` → `facts/{provider}.json:factId/evidenceRefs` → union of model lists (or concept) → `final/fact-decisions.json:rowOrdinal` → temporal/confidence/source/hold/overlap gates → non-null candidateRuleId → final Rule selector member → actual materialized exact claim.

The reproducible [reconstruct.py](reconstruct.py) does not invoke the original writer scripts. [row-to-rule-trace.jsonl](row-to-rule-trace.jsonl) contains all6333 row-level chains, including fact pointers, evidence URLs, rationale, selected Rule and selector. [fact-transitions.jsonl](fact-transitions.jsonl) contains1350 fact vectors; [proposal-selection-audit.json](proposal-selection-audit.json) accounts for398 original proposals; [materialized-claims.jsonl](materialized-claims.jsonl) contains all1017 actual adapter outputs.

The materialization fixture supplies334 **synthetic exact subjects** corresponding to recorded selected IDs. It verifies matching and values, not account membership. The actual current decoder, canonicalization, activation and materialized source adapter ran in memory, with no DB or stored-source mutation; “publication” in the pure builder is an in-memory projection, never a release or app Apply. See [materialization-validation.json](materialization-validation.json).

Representative traces:

- `deepseek/deepseek:fact:flash-training-tool-use`: refs `deepseek:flash-paper-20261002, deepseek:pricing-20261002, deepseek:flash-release-20260910` →1 rows →{'RULE_CANDIDATE': 1} → selected Rules ['deepseek.flash-training-tool-use.v1']. The exact model/path/value is preserved when selected; no model identity is generated.
- `anthropic/anthropic-F-pdf-input-active`: refs `anthropic-E025, anthropic-E001, anthropic-E023` →14 rows →{'REDUNDANT_BUT_USEFUL': 14} → selected Rules ['anthropic-v1-pdf-input-active']. The exact model/path/value is preserved when selected; no model identity is generated.
- `anthropic/anthropic-F-current-output`: refs `anthropic-E001` →4 rows →{'REDUNDANT_BUT_USEFUL': 4} → selected Rules []. The exact model/path/value is preserved when selected; no model identity is generated.
- `openai/openai.gpt-6.1-sol.modalities.input`: refs `openai-model-gpt-6.1-sol` →1 rows →{'AMBIGUOUS_DEFER': 1} → selected Rules []. The exact model/path/value is preserved when selected; no model identity is generated.
- `openrouter/openrouter.fact.03855e07829f6516`: refs `openrouter.inventory.20261002, openrouter.catalog-standard, openrouter.provider-routing` →180 rows →{'RULE_CANDIDATE': 178, 'TEMPORALLY_UNSAFE': 2} → selected Rules ['openrouter.rule.03855e07829f6516.1']. The exact model/path/value is preserved when selected; no model identity is generated.

Canonical normalization preserves semantics: three Gemini aspect-ratio facts reduce21:9 to7:3 and sort sets; completeness remains unchanged. This is mathematical ratio normalization, not removal of a supported format. Overlapping source facts remain visible; input text/image may be subsumed by a selected partial text/image/PDF assertion. Supersession must be checked against the **final selected** replacement, however, which fails for six output rows.

## 5. Higher-authority exclusion audit

All1145 models.dev and1722 Native exclusions were checked against saved **exact authority/profile/model/path** outcomes. All2867 are present_valid, non-null, and match their recorded observations;2864 equal canonical values and3 positive partial sets are contained in higher complete sets. None is justified by superficial source presence, a null value, or static mapping alone. These are public saved adapter observations, not local DB/account state.

The three containment cases are Gemini2.5Flash input partial audio/image/text/video versus complete audio/image/pdf/text/video, and Gemma4 31b/26b partial image/text versus complete same members. Exclusion preserves positive information; the generic conflict flag should not be read as a contradiction. Higher-source exhaustiveness is not independently established by this containment test.

A missing future Native/models.dev value could make first-party fallback useful. The corpus deliberately omits most equal observations yet retains124 Anthropic fallback rows where Native payloads are unobserved and models.dev has no registry binding. Owner must decide durable fallback policy (O2), rather than assuming public present_valid guarantees permanent local coverage. No false higher-authority coverage was found.

Four selected lower-priority disagreements remain: Gemini Lite Image complete input/image-PDF-text-video versus models.dev image/text, and tool calling unsupported versus supported; DeepSeek Flash/Pro context1048576 versus1000000. A Cloud fallback at priority0 cannot override these higher-source values under current source order. This is a documented limitation requiring O7, not permission to alter source priority.

## 6. Deferred-fact audit

### Ambiguous groups

Primary reason labels partition all1938 rows; they are deterministic audit routing labels over retained rationale, with all group members recorded in [excluded-groups.json](excluded-groups.json). Labels do not assert that every row in a broad category needs the same remedy.

| Category | Rows |
| --- | --- |
| evidence_conflict | 8 |
| incomplete_domain | 52 |
| conditional_semantics | 500 |
| identity_uncertainty | 242 |
| surface_mismatch | 1076 |
| weak_inference | 57 |
| other | 3 |

OpenRouter contributes1764. Its exact substantive partition is457 route-scoped top_provider output ceilings,689 other batch-subject paths,240 other Router-subject paths,362 nontext/chat-profile rows,3 exact migration conflicts,13 guide/null placeholders. Output-ceiling grouping precedes batch/Router grouping. Only13 of these1764 canonical values are null; missing metadata does not explain this deferral total. Null raw output ceilings7/464 generate no positive ceiling fact. Context-minus-output arithmetic remains excluded.

Over-deferral candidates using current ontology:

- OpenAI28 partial image/text input assertions are held using complete-set rationale. Twenty-six are already positively covered by saved models.dev; gpt-5.6-cyber has no such coverage, chat-latest has unknown lifecycle. This is misclassified/under-explained coverage and one bounded current gap, not28 absent capability values. Seven of the28 identities already have deprecation metadata; lifecycle review remains separate.
- Anthropic14 complete text-output proposals are correctly held as exhaustive assertions, but partial[text] can retain positive text support. Existing HIGH approvals for those complete assertions are deferred, so partial repair needs its own bounded identity/evidence approval. Six supposedly redundant exact source rows currently lack any selected replacement.
- Sonnet5.5 full adaptive/between_tools modes lose effort restrictions. Partial[adaptive] is a plausible salvage; conditional between_tools remains held. Opus5 toggles, legacy sampling support/defaults/maxima and hosted-tool execution dependencies cannot be repaired by simply dropping their conditions.
- Gemini Lite Image required/toggle on/off versus minimal-not-fully-off needs evidence/semantics resolution. Eight document-citation positives need File Search/Interactions scope clarification; Pro-specific AI Studio limits must not be transferred to stable Flash IDs.

OpenRouter batch, Router, nontext and route-scoped claims are not automatically over-deferred. Public aggregate metadata cannot establish intrinsic exact-model behavior on another profile. SDK/gateway plugins, server tools, rerouting mode changes and forced-tool compatibility require their recorded scope; partial sets alone do not fix them.

### Temporal groups

The following categories are primary and non-overlapping as of2026-10-02. Preview and other flags may coexist, but no row is counted twice.

| Temporal category | Rows |
| --- | --- |
| preview | 101 |
| beta | 42 |
| dated_snapshot | 0 |
| temporary_alias | 25 |
| deprecated | 61 |
| retirement_scheduled | 138 |
| other | 0 |

No row is excluded solely because its ID is dated. Dated Haiku/Opus pinned releases are selected; Anthropic modern dateless names are also pinned, not evergreen. The61 deprecated/retired rows,25 moving-alias rows and42 beta rows have substantive lifecycle/condition reasons to remain held under the existing first-corpus policy. Preview101 can only be reconsidered through explicit bounded operational review; it is not capability=false.

The138 primary scheduled-retirement rows have future end dates: Sonnet4.5 (12rows,2026-11-30), OpenAI o1-pro (6rows,2026-10-22), and120 gateway rows with end dates2026-10-05 through2026-12-31. Two additional Sonnet4.5 context-management rows have the same future retirement date but are counted primarily under beta;140 rows have future dates overall. Stable values attached to these identities are not logically invalid just because lifecycle metadata exists. They could exist under explicit recheck/withdrawal/expiry policy, but the current Rule schema has no expiry field; audit metadata cannot expire runtime claims. Beta execution headers and action conditions would still need semantic handling even with expiry.

DeepSeek's two selected primary API IDs are explicitly described as moving aliases in its provider report, despite version_bound metadata on13 selected claims. They differ operationally from retired compatibility aliases and floating-latest names, but their backend target still requires recheck. The training claim is bound to captured V4.1-Flash. This is a selected lifecycle policy exception to make explicit (S14), not13 automatically invalid claims.

### Ontology groups

| Audited category | Rows |
| --- | --- |
| semantic_mapping_or_missing_support_leaf | 22 |
| semantic_mapping | 3 |
| condition_scope_or_missing_concept | 97 |
| insufficient_evidence_existing_path | 7 |

Of129 rows, seven are evidence deficiencies on existing paths: six OpenAI unknown budget/effort/image-search/citation leaves and one Anthropic web-tool compatibility record. They should be separated from true inability to represent a known value. Other OpenAI media/tool distinctions still raise scope questions; this is not a blanket reclassification of all ten OpenAI ontology rows.

Gemini22 thinking-level rows are semantic-mapping or missing-support-leaf questions, not proof that arbitrary native_string_set values cannot decode. Three signed budget domains already remain excluded because-1 dynamic and0 disabling meanings are not encoded by integer membership alone. Decoder acceptance is not semantic approval. DeepSeek mode-conditioned sampling/output defaults, prefix caching/quotas/strict-beta scope, Anthropic cross-feature incompatibility and control interactions, and gateway rerouting/plugins/native-vs-server distinctions cannot be reduced to current unconditional scalars without distortion. No schema change was made.

## 7. Candidate-to-selected accounting

There is no expansion after the893 final candidate rows. Exactly124 selected Anthropic redundant fallback rows explain the1017 total;120 of those are HIGH and4 explicit. The selected HIGH total244 includes123 Anthropic candidate +120 Anthropic redundancy +1 DeepSeek candidate. Counting only candidate HIGH would undercount by120.

All398 provider proposals have selection, excluded disposition or explicit superseded-fact links. The108 rejected proposals are accounted for procedurally; a recorded reason is not automatically a valid semantic reason. **S01** demonstrates this difference: three superseded output facts/six rows point to a broader output proposal that final/manual-review then holds. The9 other unselected redundant rows are covered by actual selected input/tool/web assertions. See [supersession-audit.json](supersession-audit.json).

Deduplication happens at model-list union, identical selected exact-key detection, and broader-fact supersession. The final assembly aggregates accepted members by RuleId; it does not silently union differing partial domains. Different researched values and constraints remain outside final selection. No candidate disappears without a recorded final classification; six redundant records have an **insufficient** coverage justification.

## 8. Rule aggregation audit

All290 Rules were checked through their exact linked rows, assertion value, provider/profile, evidence and lifecycle. Seventy-six have multiple members;214 are singleton Rules. Those76 represent803 claims, while214 singletons represent214. The727 reduction is legitimate selector aggregation, not727 suppressed capabilities.

There are zero mixed selected EXPLICIT/HIGH Rules, zero within-Rule value differences and zero profile crossings. Selected lifecycle classes are version_bound1009 andstable8; no selected preview/deprecated/time-limited member crosses into a stable group. Variant/cross-brand membership is safe when the captured assertion is independently shared: large gateway effort groups use each exact catalog allowlist, and Anthropic cross-tier tool/PDF/citation groups use bounded all-active or named compatibility scopes. Haiku REPL exceptions do not negate base code execution; detailed conditions are retained separately and must not be reinterpreted as guaranteed composability.

No Rule is forced to split purely because families/tiers differ. The four Fable/Mythos members of the web-search Rule require scope confirmation or narrower confidence/selector repair (S12). Eleven Anthropic notes carry stale Sonnet4.5 warnings despite its removal; this is evidence-note cleanup, not an actual mixed-lifecycle selector. A future assembly could append mixed-basis members while keeping first-member evidence; that code risk is not triggered by this corpus.

Three optional same-evidence merge groups could reduce290 to286 without changing exact claims: three Gemini image-model1K defaults; two Gemma operations partial content_generate Rules; two Gemma required=false Rules. These are demonstrated in [merge-opportunities.json](merge-opportunities.json). No merge is requested merely to optimize count. Rules with different evidence can be semantically shared, but merging them requires preserving attributable source/identity provenance; equal values alone are insufficient.

## 9. INFERRED_HIGH group audit

[inference-groups.md](inference-groups.md) and its machine counterpart audit31 meaningful fact/path/source/selector groups, covering244 claims. Anthropic contributes30 groups/243 claims; DeepSeek contributes one exact served-version training claim. Every selected HIGH has a recorded coordinator approval and bounded exact identity. Preview/stable/tier exceptions are retained: five/four/three generation-effort levels, Opus5.5 medium default,4.6 manual modes/budgets versus4.7+ removal, ordinary Messages output versus Batches beta, PDF/file limits, and direct-API hosted-tool scope.

HIGH is generally justified as identity-to-document expansion, not prefix inheritance. Four Fable/Mythos web-search joins are closer to MEDIUM pending direct capability-scope recheck because their recorded expansion bridges4.6+ web support through a context-guide taxonomy. Source summaries and boilerplate approvals are not a substitute for that specific capability bridge. The eight Opus/Sonnet4.6+ joins and remaining groups retain their scoped evidence basis; no blanket downgrade or244-model re-research is warranted.

The current materializer labels direct Rule assertions explicit; this is not the EXPLICIT_MODEL research confidence label. No derivation result is invented, and research confidence remains traceable through rows/manual-review.

## 10. Exact versus regex audit

[regex-promotion-review.md](regex-promotion-review.md) covers all144 pairs for the four decoder-valid Gemini patterns. Identity-pattern confidence and future capability inheritance are assessed independently. Three historical patterns have six retired matching IDs but no scoped capability facts; structural36-path coverage does not fill that evidential gap. Stable Flash3.5–3.8 is the meaningful recheck candidate: six common support booleans agree, and specialized Live/TTS/image exceptions cannot match its anchored pattern.

No current source summary commits future matching stable Flash subjects to those assertions, so no promotion is recommended **yet**. Family-language recheck could justify promotion per boolean. The concrete minimal-effort and sampling differences defeat blanket control inheritance; equal numeric/modality specifications alone do not prove future specifications. Absence of evidence, concrete divergence and irrelevant sibling exceptions are distinguished; theoretical possibility of future changes is not the sole rejection rationale.

## 11. Potential semantic loss and fact flow

The1350 intermediate facts partition as follows using selected-first precedence. Selected facts may also have excluded model members; fourteen such facts contain15 excluded rows. Full vectors, rather than additive fact counts, preserve this overlap.

| Exclusive fact destination | Facts |
| --- | --- |
| represented_in_rules | 290 |
| higher_authority_only | 427 |
| TEMPORALLY_UNSAFE | 217 |
| ONTOLOGY_GAP | 66 |
| AMBIGUOUS_DEFER | 344 |
| repeated_evidence_covered_by_selected | 3 |
| superseded_without_selected_replacement | 3 |

Of290 represented facts,214 have singleton selectors and76 aggregated selectors. Higher authorities cover427 facts/2867rows. Three repeated-evidence facts/nine rows have genuine selected replacement; three superseded facts/six rows do not. The344 ambiguous-only facts,217 temporal-only facts and66 ontology-only facts remain in durable ledgers rather than being erased.

**Structurally missing/unaccounted intermediate facts:0. Selected assertion losses:0. Proven false supersession coverage:6 rows/3facts.** Potential positive representation improvements are bounded, require review and are not a count of newly approved Rules. Twenty-six OpenAI partial inputs are already covered, so their misclassification is not current canonical value loss. Anthropic positive output spans14 exact paths, including the six failed supersession rows; count those model/path opportunities once.

Only161/264 provider evidence IDs are directly referenced by intermediate facts. The103 others include inventory, lifecycle, API schema, discovery/failed-read and source-context records also referenced by inventories/reviews/reports. Not directly linked to a fact does not mean103 useful capabilities were discarded. Specialized OpenAI record summaries often preserve only page inspection and null candidates; the evidence does not support manufacturing omitted facts. Historical Gemini regex evidence is a concrete example of insufficient pre-fact capture, not deletion during6333-row processing.

| Finding | Severity | What requires action |
| --- | --- | --- |
| S01 | HIGH | 6 redundant output rows have no selected replacement |
| S02 | HIGH | 28 already-partial OpenAI inputs retain complete-set deferral rationale |
| S03–S04 | MEDIUM | Partial text/adaptive-mode positive salvage |
| S05 | MEDIUM | 7 evidence gaps mislabeled ontology limitations |
| S06–S07 | MEDIUM | 138 future-end rows and cross-provider fallback policy |
| S08 | MEDIUM | Stable Flash six boolean regex family rechecks |
| S09–S10 | LOW | 11 stale notes and self-sibling terminology |
| S11 | MEDIUM | Four selected higher-source disagreements remain fallback-only |
| S12 | MEDIUM | Four Fable/Mythos web-search HIGH joins need capability-specific bridge |
| S13 | LOW | Historical regex matches have no scoped capability facts |
| S14 | MEDIUM | 13 selected DeepSeek claims use moving primary serving aliases |

All questionable groups/Rules have evidence refs, rationale, suggestion, confidence and external-check need in [suspicious-decisions.jsonl](suspicious-decisions.jsonl). Findings are not summed as lost facts because their affected rows overlap. No evidence-backed BLOCKER was found in the selected decoder/materialization accounting. The strongest deficiencies are disposition quality and bounded capability-scope confidence, not raw Rule count.

## 12. Owner decisions required

Seven decision packages; subtype actions do not create additional mandatory approval counts. Audit preparation and outputs are complete; this audit does not execute the repairs.

| ID | Type | Concrete decision |
| --- | --- | --- |
| O1 | Repair recoverable positives and failed supersession | Re-review partial output for14 active Anthropic members; relink6 redundant rows only after selected replacement exists; triage28 OpenAI partial inputs (26 already covered, one cyber gap, one latest lifecycle); consider Sonnet5.5 partial adaptive mode. |
| O2 | Fallback durability policy | Decide whether saved equal higher-authority coverage is sufficient to omit first-party fallback across providers;124 selected Anthropic redundancy approvals illustrate an intentional policy choice. |
| O3 | Lifecycle/recheck and withdrawal policy | Distinguish101preview/42beta/25temporary-alias/61deprecated/138scheduled rows; no date-only rejection. Separately acknowledge13 selected DeepSeek claims on two moving primary API names. Decide bounded recheck/withdrawal or future expiry semantics. |
| O4 | Ontology versus evidence/surface gaps | Separate7 existing-path evidence gaps from real conditional, sentinel, media/tool and absent-concept constraints. Decide whether common subsets may be retained as partial facts; keep unsafe conditions held. |
| O5 | Constrained regex promotion policy | Six stable Flash boolean paths require family-level evidence recheck; grammar and sibling exceptions alone are insufficient. No automatic promotion recommended. |
| O6 | Grouped inference confidence and review metadata | Narrow recheck of four Fable/Mythos web-search HIGH joins; correct explicitSiblings self-reference terminology and11 stale Rule notes. Keep independently justified remaining HIGH groups. |
| O7 | Higher-authority conflict handling intent | Four selected Gemini/DeepSeek disagreements remain lower-priority fallbacks. Decide documented diagnostic/fallback intent before any authoritative correction; do not raise priority implicitly. |

The recommended next step is targeted repair of the **research dispositions/provenance**, followed by bounded semantic review. Current source priority, conditional ontology and lifecycle semantics remain authoritative. The selected290-Rule core is structurally suitable for Owner inspection, but the overall completeness/readiness claim should include this audit and cannot be endorsed unchanged. No publication or Apply follows from this conclusion.

## 13. Reproduction, integrity and Git

Run only the new scripts, from repository root:

```powershell
node docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/audits/fact-to-rule-20261002/materialization-audit.mjs
python -X utf8 docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/audits/fact-to-rule-20261002/reconstruct.py
python -X utf8 docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/audits/fact-to-rule-20261002/write-audit.py
```

Original validate-corpus/validate-research/assembly/report writers were inspected but **not executed**, because they overwrite existing research artifacts. This audit uses no DB-heavy test, native rebuild, Electron smoke, adapter network fetch or external provider re-research. Current decoder/materializer checks run against in-memory fixtures. No ABI mismatch was encountered, no ABI target was changed, and no native artifact was generated or committed.

Branch models-dev-capability-resolution, baseline HEAD ca2d9bd95023f7076e988863f53bdf86c0b4894e. The unrelated untracked pelican-bicycle.html is preserved. [input-manifest.json](input-manifest.json) freezes75 pre-existing research files; [scope-verification.json](scope-verification.json) records the final hash/Git check. No commit, push, production/schema/resolver/provider-adapter/database/release change, Rule application or publication.
