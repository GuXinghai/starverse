# First official Cloud Rules corpus — research recommendation

Research and candidate construction are complete as of 2026-10-02. Recommend the **5 reviewed Packs / 293 exact Rules** in [candidate-corpus.json](candidate-corpus.json) as the bounded first-corpus proposal for Owner review. They describe 1029 exact model/path claims across 334 provider-scoped model IDs. **No release is approved or published by this research.** Account membership, source freshness and execution/lifecycle review remain publication prerequisites.

## A. Research completeness and scope

| Provider | Inventory searched | Families examined | Official surfaces searched | Search limitations |
| --- | --- | --- | --- | --- |
| gemini | 63 documented IDs | Gemini 2.x/3.x through 3.8, Live/Omni/TTS/transcription, Robotics ER, embeddings, image, Lyria and hosted Gemma | Developer catalog/cards, operation guides, API schema, migration/release/deprecation pages, DeepMind cards | Chrome/web/Exa; no authenticated list. Developer/Vertex/consumer/third-party hosts kept separate. Image-table and preview/snapshot disagreements retained. |
| deepseek | 2 current primary IDs; 2 temporary accepted aliases; 2 retired IDs | V4.1 Flash, V4 Pro0813, prior V4 Flash/experimental vision, V3/R1 history | Catalog/pricing, model/schema docs, thinking/tool/JSON guides, changelog, migration/retirement notices, DeepSeek-authored report | Chrome/web/Exa; authenticated list unobserved. Moving serving aliases require recheck. Planned Pro migration superseded by current service evidence. |
| openai | 210 documented inventory IDs | GPT 5/6 generations and GPT6.1 Sol, o-series, earlier GPT, Responses/pro/cyber variants, realtime/audio/image, embeddings/moderation | Model index/cards/snapshots, API reference, reasoning/mode, file/vision, tools/structured, compact/context, migration/changelog/deprecations | Chrome/web/Exa; account model-list membership unobserved. Some dynamic docs/search caches differ; operation-specific conditions retained. Partial modalities do not become exhaustive. |
| anthropic | 38 IDs: 14 active, 2 deprecated, 19 retired, 3 convenience aliases | Fable/Mythos5/5.1; Opus4.5–5.5; Sonnet4.5–5.5; Haiku4.5; retired history | Current/release model pages, lifecycle and ID-versioning, Messages reference, effort/thinking/output matrix, context, PDF/files/citations, structured/code/search, batches/token count | Chrome/web/Exa; cached routes can lag live docs. No authenticated list or invitation entitlement verified. Direct Claude API only. Mythos Preview retirement conflict and conditional controls held. |
| openrouter | 645 public all-category IDs; 464 text-output IDs; 88 namespaces | OpenAI, Claude, Gemini, DeepSeek, Qwen, Llama and remaining captured catalog namespaces | Public model/all-category metadata, model pages and endpoint listings, parameter/reasoning guides, image/structured/tool/routing guides, migration/lifecycle and official SDK | Chrome/web/Exa; public catalog and advertisements, no authenticated entitlement or execution probes. Route/version differences remain; no upstream inheritance. |


Five independent provider agents used requested GPT-6.1 Sol / High configuration. Three ran through collaboration tools and two through ephemeral Codex CLI because the thread-lifetime cap included the completed contract mapper. Accepted CLI startup configuration is recorded in [research-agent-execution.json](research-agent-execution.json); no model substitution occurred. Configuration is observable; backend self-description is not stronger introspection. Provider reports and source ledgers retain inventory discovery and per-source limitations. All 36 current canonical paths were reviewed by each provider stream; missing evidence stays unknown.

## B. Evidence quality

The 264 provider ledger records support 1,350 intermediate facts before coordinator expansion into 6,333 disposition rows. Strong areas are named-model compatibility matrices, exact API schema limits, explicitly scoped HTTP rejection rules, per-model effort sets/defaults, and public gateway model metadata transformed by current adapters. Coordinator independently rechecked critical source clusters; [coordinator-evidence.jsonl](coordinator-evidence.jsonl) records those checks.

Weak areas are authenticated model-list membership, invite access, conditional controls absent from the current projection, undocumented enum exhaustiveness, preview longevity, and route-dependent execution. No local database/runtime was inspected. Public snapshots establish observed public payload values, never current account entitlement or active local state. Rounded marketing labels, silence and missing metadata do not justify exact limits or unsupported claims. Anthropic context conversion uses technical limits with Japanese decimal units; ordinary output limits exclude the 300k Batches beta.

Stale/conflicting areas include Gemini image tables and dated/preview cards, DeepSeek planned migration versus continued service, OpenAI card/operation/snapshot differences, Anthropic cached deprecation routes and preview retirement, and OpenRouter advertised defaults/guide/version conflicts. Keep all source versions visible; publication requires a fresh check.

## C. Candidate Rule inventory

One provider-scoped Pack is recommended per provider after evidence review. Pack/Rule priority is 0, Rule configured is default, Pack mode is no_control and target enabled. These research Pack IDs are review organization, not final release identity. Pack controls do not raise Cloud source authority: default source ordering remains Provider Native3 > models.dev2 > Capability Rules1.

| Provider | Research Pack | Facts | Evidence records | Provider proposals | Final Rules | Exact model/path claims |
| --- | --- | --- | --- | --- | --- | --- |
| gemini | research.gemini.documented-gaps.v1 | 416 | 63 | 216 | 135 | 135 |
| deepseek | research.deepseek.documented-gaps.v1 | 51 | 18 | 7 | 7 | 13 |
| openai | research.openai.documented-gaps.v1 | 328 | 72 | 63 | 59 | 59 |
| anthropic | research.anthropic.documented-gaps.v1 | 79 | 50 | 49 | 38 | 264 |
| openrouter | research.openrouter.documented-gaps.v1 | 476 | 61 | 64 | 54 | 558 |


| Canonical path | Gemini | DeepSeek | OpenAI | Anthropic | OpenRouter |
| --- | --- | --- | --- | --- | --- |
| limits.contextWindow.maxTokens | 1 | 1 | 1 | 2 | 0 |
| limits.input.maxTokens | 19 | 0 | 0 | 0 | 0 |
| limits.output.maxTokens | 4 | 0 | 1 | 3 | 0 |
| modalities.input | 8 | 0 | 1 | 1 | 0 |
| modalities.output | 7 | 0 | 1 | 1 | 0 |
| input.attachments.support | 0 | 0 | 0 | 1 | 0 |
| operations.supported | 4 | 1 | 0 | 1 | 0 |
| reasoning.support | 6 | 0 | 1 | 2 | 0 |
| reasoning.required | 7 | 1 | 0 | 4 | 0 |
| reasoning.toggle.support | 3 | 0 | 0 | 2 | 2 |
| reasoning.modes.nativeValues | 0 | 1 | 7 | 4 | 0 |
| reasoning.effort.nativeValues | 0 | 0 | 0 | 0 | 27 |
| reasoning.effort.providerDefault | 0 | 1 | 12 | 0 | 1 |
| reasoning.budgetTokens.support | 0 | 0 | 0 | 2 | 2 |
| reasoning.budgetTokens.domain | 0 | 0 | 0 | 1 | 0 |
| generation.effort.nativeValues | 0 | 0 | 0 | 3 | 1 |
| generation.effort.providerDefault | 0 | 0 | 0 | 4 | 0 |
| sampling.temperature.support | 0 | 0 | 0 | 1 | 0 |
| sampling.temperature.providerDefault | 0 | 0 | 0 | 0 | 10 |
| sampling.temperature.modelMaximum | 0 | 0 | 0 | 0 | 0 |
| sampling.topP.providerDefault | 0 | 1 | 0 | 0 | 4 |
| sampling.topK.support | 0 | 0 | 0 | 1 | 2 |
| sampling.topK.providerDefault | 0 | 0 | 0 | 0 | 4 |
| tools.calling.support | 7 | 0 | 1 | 1 | 0 |
| tools.trainingForToolUse | 0 | 1 | 0 | 0 | 0 |
| tools.codeExecution.support | 18 | 0 | 13 | 1 | 0 |
| structuredOutput.support | 7 | 0 | 1 | 1 | 0 |
| image.generation.support | 18 | 0 | 0 | 0 | 1 |
| image.generation.aspectRatios | 2 | 0 | 0 | 0 | 0 |
| image.generation.resolutionPresets.nativeValues | 2 | 0 | 0 | 0 | 0 |
| image.generation.resolutionPreset.providerDefault | 3 | 0 | 0 | 0 | 0 |
| search.web.support | 18 | 0 | 12 | 1 | 0 |
| search.image.support | 1 | 0 | 0 | 0 | 0 |
| documents.citations.support | 0 | 0 | 0 | 1 | 0 |
| contextManagement.support | 0 | 0 | 4 | 0 | 0 |
| contextManagement.actions.nativeValues | 0 | 0 | 4 | 0 | 0 |


## D–E. Model inference and regex

Selected claims: EXPLICIT_MODEL **774**, independently approved INFERRED_HIGH **255**, SERIES_MATERIALIZED_MEMBER **0**. Anthropic preserves 332 researched identity-to-document audits: 254 HIGH approvals, 16 lifecycle deferrals, 58 conditional/incomplete/beta deferrals and 4 downgraded MEDIUM deferrals. Evidence approval alone does not guarantee inclusion; duplicates, source coverage and lifecycle checks also apply. Every selected HIGH claim has a matching exact-model coordinator approval in [manual-review.json](manual-review.json). Targeted repair decisions and historical interpretations are recorded in [disposition repair](../repairs/disposition-20261002/report.md).

All final selectors are **KNOWN_MEMBERS_ONLY** exact lists. Four constrained Gemini naming patterns passed the actual decoder and positive/negative examples in [regex-decoder-audit.json](regex-decoder-audit.json). Naming syntax does not establish future assertion inheritance. Gemini dated snapshots have retirement and limit changes; OpenAI snapshots may differ; modern Anthropic dateless IDs are pinned; DeepSeek aliases change serving targets; gateway slugs/routes do not establish upstream equivalence. No researched capability regex was approved FUTURE_SERIES_SAFE. Full provider and coordinator records are in [inference-audit.md](inference-audit.md).

## F. Native / models.dev / Cloud coverage

[coverage-matrix.md](coverage-matrix.md) contains all6,333 researched exact-model/path or API-concept disposition rows, including source values/states, candidate values, confidence, temporal/conflict status and remaining gaps. [fact-decisions.json](fact-decisions.json) is the machine-readable final disposition authority. This matrix enumerates fact claims rather than claiming all inventory members have all facts; provider fact documents retain full36-path inventory review matrices.

Current real adapters transformed a saved public models.dev snapshot into485 registered subjects with zero invalid refs, and the public OpenRouter text catalog into464 Native subjects with zero invalid refs. Other Native payloads are unobserved: a static mapping means mapped-if-supplied, not a present value. Anthropic has no models.dev registry binding. Equal observed values are generally excluded; Anthropic explicit redundancy approvals retain potential documented fallback for missing/null Native metadata, without claiming such local absence was verified.

Final disposition rows: RULE_CANDIDATE: 904; ALREADY_MODELS_DEV: 1171; TEMPORALLY_UNSAFE: 368; ONTOLOGY_GAP: 129; AMBIGUOUS_DEFER: 1899; REDUNDANT_BUT_USEFUL: 140; ALREADY_PROVIDER_NATIVE: 1722. These are exact model/path/concept rows, not Rule counts or independent source counts.

## G. Duplicate and conflict audit

Real decoder and coordinator validation report zero duplicate Rule/Pack identities and zero selected exact model/path overlaps. 69 grouped provider conflict records remain visible in [conflict-audit.md](conflict-audit.md), alongside actual models.dev value/completeness differences. Equal proposal claims are deduplicated, conflicting claims held, partial sets never silently unioned. A priority0 fallback cannot automatically correct a conflicting higher-source fact; overriding policy was not changed.

## H. Temporal/deprecation audit

[temporal-audit.md](temporal-audit.md) groups stable, preview, version_bound, deprecation_bound, time_limited and unknown records. Per-model lifecycle overrides are retained, with known end dates, recheck recommendations, superseding IDs and REQUIRES_EXPIRY_REVIEW. Preview, deprecated, time-limited and beta lifecycle assertions are excluded from this first-corpus recommendation. A pinned identity still needs a hosted-feature/source recheck. Known examples include Sonnet4.5 retirement2026-11-30, retired Gemini snapshots, and temporary DeepSeek aliases with unknown removal deadlines. Unknown expiry is not permanent validity.

## I–J. Ontology gaps and deferred facts

[ontology-gaps.md](ontology-gaps.md) retains provider/model, official concept/source, representation limits and possible future design questions. Current ontology/projection gaps include Gemini thinkingLevel/sentinel budgets and operation-specific media behavior; DeepSeek context strategy and conditional thinking/tool parameters; OpenAI independent mode/effort and endpoint-specific operation details; Anthropic cross-parameter thinking/sampling, tool versions/beta actions and invite access; OpenRouter route, upstream and metadata conditions. No ontology change was implemented.

[deferred.md](deferred.md) includes ambiguous evidence, medium/low confidence where researched, incomplete enums, source conflicts, temporary identities and missing first-party support. Specific holds include Flash Lite Image512-versus1K and Pro Image table headings; OpenAI floating latest lifecycle; Anthropic Opus5 effort-conditioned toggles, Sonnet5.5 between_tools conditions, legacy sampling, four Fable/Mythos web-search joins and beta context actions; OpenRouter null reasoning domains and route-dependent guarantees. Positive partial text output and Sonnet5.5 adaptive are now selected; 26 OpenAI partial input rows retain higher-authority coverage, cyber fills a bounded gap and chat-latest remains held. Exhaustive output and conditional between_tools meanings have not been admitted. There are **1899 AMBIGUOUS_DEFER** and **368 TEMPORALLY_UNSAFE** rows. They are not in candidate-corpus.json.

## K. Current-schema validation

[validation-result.json](validation-result.json): **PASS**,5Packs,293Rules,1029exact claims,0regex Rules. Uses current Rule/Pack/Cloud ownership decoders plus actual canonical normalization, global ID/scoped selector checks, registry pairs, direct non-null first-party evidence and resolved refs, fact/model/path/value links, coordinator HIGH/redundancy approvals, baselines and duplicate/overlap exclusion. The saved SHA256 is artifact integrity only; no release contentRevision was computed.

Research-only helpers can be rerun from the repository root:

```powershell
node docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/validate-corpus.mjs
node docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/validate-research.mjs
```

The original corpus construction passed 18 pure contract tests across capabilityRuleCoreV1.test.ts, canonicalSourceFactsV1.test.ts and materializedCapabilityRuleSourceV1.test.ts using vitest.unit.config.ts. The targeted disposition repair reruns current corpus/research validation and the actual pure materialization adapter, with results in [repair materialization validation](../repairs/disposition-20261002/materialization-validation.json) and [targeted reconciliation](../repairs/disposition-20261002/reconciliation.json). These checks do not access better-sqlite3; no native ABI rebuild or Electron smoke was needed. Production implementation and native/build outputs were unchanged.

## L. First official corpus recommendation

**Ready for bounded Owner semantic review:** the 293 selected exact Rules only, with their evidence and 1029 selected per-model claims, traced within all 6333 dispositions. Preserve useful documented gaps and explicitly justified fallback rather than duplicating complete model definitions. Claims remain dormant unless an already-authoritative exact subject matches.

**Owner review before publication:** fresh provider/version/source checks; authenticated exact subject membership and restricted access; serving-alias lifecycle/recheck policy; whether lower-source disagreement offers useful fallback; Pack naming and controls; and any conditional semantics affecting the app's current projection. Source priorities and owner decisions were not delegated.

**Remain deferred:** all records excluded in fact-decisions, future-member regex inheritance, preview/deprecated/beta/temporary identities, weak inference, conflicts and unrepresented conditions. Publishing, activating, applying or wrapping into the official Release Document is a separate Owner-reviewed task.

## M. Git and scope

All created/changed task artifacts are confined to this research directory on models-dev-capability-resolution. One coherent research commit follows validation and an exact file allowlist. The original [git-audit.json](git-audit.json) remains historical; [repair Git scope](../repairs/disposition-20261002/git-scope.json) records this repair's scope. The final chat reports its resulting commit ID and post-commit status. The unrelated untracked pelican-bicycle.html is preserved and excluded. No main edits, production/schema/adapter/resolver/identity changes, database writes, Release Document, final version/contentRevision, Apply, GitHub Release or release upload occurred.
