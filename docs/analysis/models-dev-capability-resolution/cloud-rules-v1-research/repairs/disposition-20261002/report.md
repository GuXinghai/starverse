# Targeted Cloud Rules v1 disposition repair

The corpus is ready for **bounded Owner semantic review**, with 293 exact Rules and 1,029 selected model/path claims. This repair corrects the four authorized fact-to-rule findings and research metadata. It does not approve release, runtime execution, restricted access or Apply.

The [completed audit](../../audits/fact-to-rule-20261002/fact-to-rule-audit.md) and its 26 files remain byte-for-byte unchanged. Before-state commit: `ca2d9bd95023f7076e988863f53bdf86c0b4894e`. [Review history](review-history.json) preserves the original targeted facts and reviews; [baseline](baseline.json) records original hashes and selected corpus. Provider evidence captures were preserved, including their original research claim interpretations. Current facts/proposals and final dispositions carry the revised interpretations; historical complete assertions are not described as equivalent to positive partial assertions.

## Fixed findings

1. **Anthropic failed supersession — three facts / six rows.** Re-reviewed positive output evidence as `modalities.output = partial[text]`. The complete-set interpretation was too strong. The selected `anthropic-v1-active-output` now covers 14 recorded active exact IDs. All six source rows point to this actually selected Rule with an equivalent revised assertion. Assembly verifies replacement selection and same scope/value or positive containment after selection; an unresolved replacement becomes deferred. All 15 historical omitted-proposal rows now have checked selected replacements, including nine existing positive-subset relations. Original omitted proposal IDs are historical identifiers, not claims that those proposals were selected.

2. **OpenAI partial input — 28 rows.** Twenty-six documented partial subsets are contained in saved real models.dev adapter values and remain `ALREADY_MODELS_DEV`; they add no Rule and are not completeness conflicts. The missing `gpt-5.6-cyber` gap is filled by one version-bound explicit `partial[image,text]` Rule using the exact saved model card and its own capture timestamp. Account membership/restricted access remains unverified. `chat-latest` retains its positive partial input fact but is `TEMPORALLY_UNSAFE`: unknown mutable target/lifecycle, recheck 2026-10-09. No lifecycle policy was redesigned, and the 26 higher-authority observations were preserved even where other lifecycle constraints exist.

3. **Sonnet 5.5 recoverable subset.** Select `reasoning.modes.nativeValues = partial[adaptive]`. The former complete `[adaptive,between_tools]` interpretation remains in review history. `between_tools` is excluded: its high-or-lower effort limit and restriction on extra thinking fields remain material. `anthropic-F-between-tools-constraints` is unchanged and remains an ontology gap. No conditional value was admitted by dropping its conditions.

4. **Four Fable/Mythos web-search joins.** A [capability-specific recheck](capability-recheck.json) read the [web-search guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [linked tool reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference) and the four exact model overview pages. The capability guide's 4.6-and-later/Mythos Preview wording, general agentic descriptions and shared specifications do not directly bind the four Fable/Mythos identities to this tool. Downgrade those joins to `INFERRED_MEDIUM / AMBIGUOUS_DEFER`; preserve all four research/audit entries and all 332 Anthropic join records. They remain unknown, not unsupported. The web-search Rule retains eight existing Opus/Sonnet members, outside this bounded recheck.

Research metadata was corrected: ten selected Rules no longer carry expiry requirements for omitted Sonnet 4.5, and the 4.5-mode description explicitly identifies active selected members. All 332 Anthropic manual entries distinguish an exact identity target from genuinely documented siblings; they no longer present the target itself as sibling evidence. Downgraded joins explicitly state that capability-specific membership is unestablished. The two partial-set holds and MEDIUM deferrals are preserved by the amended research review writer. The broad review writer was not rerun; equivalent deterministic targeted updates avoided inventing fresh retrieval timestamps for untouched pages.

## Counts and closure

| Measure | Before | After |
| --- | ---: | ---: |
| Packs | 5 | 5 |
| Selected Rules | 290 | 293 |
| Selected exact model/path claims | 1,017 | 1,029 |
| EXPLICIT_MODEL selected claims | 773 | 774 |
| INFERRED_HIGH selected claims | 244 | 255 |
| Gemini Rules / claims | 135 / 135 | 135 / 135 |
| DeepSeek Rules / claims | 7 / 13 | 7 / 13 |
| OpenAI Rules / claims | 58 / 58 | 59 / 59 |
| Anthropic Rules / claims | 36 / 253 | 38 / 264 |
| OpenRouter Rules / claims | 54 / 558 | 54 / 558 |
| Provider evidence records | 264 | 264 |
| Facts / disposition rows | 1,350 / 6,333 | 1,350 / 6,333 |

Six scoped page-review summaries are stored separately in the repair recheck record; they are not additional provider ledger records. Selected claim delta is **16 added, four removed**, with no retained claim value changed. Fifty-three disposition rows change semantics; the other disposition semantics are preserved. Current primary classifications are 904 candidate, 1,171 models.dev-covered, 1,722 Native-covered, 140 redundant/useful, 1,899 ambiguous, 368 temporally unsafe and 129 ontology gaps. Selected redundancy has 125 claims; the 15 unselected redundancy rows all resolve to checked selected replacements.

## Every selected Rule change

Three Rules added:

| Rule ID | Selected assertion | Claims |
| --- | --- | ---: |
| `anthropic-v1-active-output` | `modalities.output = partial[text]` | 14 |
| `anthropic-v1-sonnet55-modes` | `reasoning.modes.nativeValues = partial[adaptive]` | 1 |
| `cloud.openai.gpt-5.6-cyber.modalities.input` | `modalities.input = partial[image,text]` | 1 |

Eleven existing Rules changed:

| Rule ID | Change |
| --- | --- |
| `anthropic-v1-modern-websearch` | Remove four Fable/Mythos selector members; 12 → 8 claims. Assertion and remaining members unchanged. |
| `anthropic-v1-45-modes` | Description/evidence note clarify selected active scope; remove omitted Sonnet 4.5 expiry requirement. |
| `anthropic-v1-all-thinking` | Evidence note removes omitted Sonnet 4.5 expiry requirement. |
| `anthropic-v1-code-execution-all` | Same evidence metadata correction. |
| `anthropic-v1-context-200k` | Same evidence metadata correction. |
| `anthropic-v1-manual-budget-min` | Same evidence metadata correction. |
| `anthropic-v1-manual-budget-support` | Same evidence metadata correction. |
| `anthropic-v1-optional-thinking` | Same evidence metadata correction. |
| `anthropic-v1-optional-toggle` | Same evidence metadata correction. |
| `anthropic-v1-small-output` | Same evidence metadata correction. |
| `anthropic-v1-structured-all` | Same evidence metadata correction. |

**No Rule removed, split or merged.** The three additions were previously unselected assertions; this report distinguishes selected-corpus changes from edits to their research proposals. The [machine-readable Rule ledger](rule-changes.json) includes complete before/after definitions and changed fields. [Claim changes](selected-claim-changes.json) and [row transitions](row-transitions.json) enumerate each affected exact subject.

## Validation

All acceptance checks passed:

- [Current corpus validation](../../final/validation-result.json): real Rule/Pack/ownership decoder, canonical values, identity scopes, first-party refs, unique exact fact/proposal links and matching HIGH approvals; 293 exact Rules, zero regex Rules, zero duplicate/overlap claims.
- [Research validation](../../final/research-validation-result.json): all 264 evidence records, 1,350 facts, 6,333 dispositions and 332 Anthropic audits close. Provider proposal count increases 398 → 399 for cyber; no orphan proposal.
- [Actual materialization](materialization-validation.json): current pure adapter materializes all 1,029 claims exactly once using 334 synthetic supplied exact subjects. This exercises matching/provenance, not account membership or production publication.
- [Reconciliation](reconciliation.json): every current fact has rows; selected fact/Rule/value/provenance joins close; all six repaired supersessions and all 28 partial input rows are checked; retained conditional information is unchanged; only authorized semantic rows/claims change.
- Original audit hashes, eight production/document contract hashes and `pelican-bicycle.html` are unchanged. Git whitespace and exact commit scope checks are recorded in [Git scope](git-scope.json).

The original corpus validator initially rejected a newly descriptive approval label; the repair now uses the existing exact `APPROVE_INFERRED_HIGH` label, with bounded-partial detail in the rationale. This preserved the validator contract. A read-only mapper identified the cyber copied timestamp and four stale series descriptions; both were corrected and checked before final validation.

## Remaining Owner decisions

Regex promotion, general lifecycle/recheck policy, fallback usefulness in higher-source disagreements, ontology/conditional projection, and cross-source priority remain Owner decisions. In particular, `chat-latest`, preview/deprecated/beta/temporary subjects, effort-conditioned controls, between_tools conditions and unresolved source disagreements remain held. Four Fable/Mythos web-search assertions require direct capability-specific support or an explicit Owner inference decision before reconsideration. No broader release taxonomy was repaired by assumption.

The corpus is ready for bounded semantic review of the repaired assertions, held conditions and remaining policy choices. Publication still requires fresh source/subject/lifecycle review and restricted-access checks. No production code, Rule schema, resolver, adapters, DB, source priority, release state, release document, control activation or Apply changed. The branch remains `models-dev-capability-resolution`; one research-only commit is authorized after validation. `pelican-bicycle.html` is preserved and excluded.

## Reproduction

From the repository root, run the deterministic repair, then assemble using the saved observation copies it creates outside the Vite watch scope:

```text
python -X utf8 docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/repairs/disposition-20261002/repair.py
node docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/assemble-research.mjs D:/CodexResearch/Starverse-cloud-rules-disposition-repair-20261002
node docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/validate-corpus.mjs
node docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/validate-research.mjs
node docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/repairs/disposition-20261002/materialization-check.mjs
python -X utf8 docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/repairs/disposition-20261002/reconcile.py
node docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/write-recommendation.mjs
```

Do not rerun the original audit writers into the immutable audit directory after this repair. The scripts above use saved provider evidence/adapter observations; only the recorded four-join capability review used fresh scoped page reads. No DB or Electron smoke is needed for these pure research checks.
