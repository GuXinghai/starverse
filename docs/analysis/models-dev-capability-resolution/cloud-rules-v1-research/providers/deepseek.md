# DeepSeek official API research

**Current status: provider research complete; all seven Rule candidates await independent coordinator approval. No release or database application occurred.** Research date: 2026-10-02. Authority/profile confirmed in the registry and by the mapper: `deepseek` / `deepseek-stable-api-v1`. Current checkpoint: 2026-10-02T05:24:53.000Z.

Candidate file shape is an **array of seven actual CapabilityRuleCoreRuleV1 Rules**. It contains only schema fields, exact selectors, priority 0, configured `default`, and non-null evidence. The coordinator can place approved Rules into actual Packs. The fact layer is research metadata, not a production contract. Earlier checkpoint prose has been consolidated into this report.

## Scope and methods

The eight mandatory contracts, AGENTS.md, Exa Search skill and search reference were read before external research. Built-in web search/open, Exa search/fetch and live Chrome dynamic reference tabs were used. Official pricing, full changelog, API reference, thinking/vision/tool/JSON/Responses/cache/Files guides, dated release notices, model cards and a first-party technical report were compared. Evidence and fact checkpoints were saved after meaningful clusters before further searches.

Exa accounting: `sources_reviewed: 45` = requested numResults 10 + 10 + 10 + 10 + 5, including the initial schema-rejected call and retry, per the skill's accounting convention. This is not 45 unique inspected official documents. Four workstreams: inventory; capability surfaces; training/version evidence; explicit image-generation restrictions. Built-in discovery and live Chrome added corroboration. Document extraction freshness problems are retained below.

No authenticated current GET /models response or local database source state was read. The current documented catalog example establishes published metadata, not account inventory. The public models.dev snapshot was transformed in memory using the repository's real adapter; it was not applied.

## Model inventory and naming

| Exact API identity | Current official serving version/status | Proposed disposition |
|---|---|---|
| `deepseek-flash` | DeepSeek-V4.1-Flash; primary moving alias | Exact known-member candidate scope |
| `deepseek-v4-pro` | DeepSeek-V4-Pro-0813; primary moving alias; continues after Sept 14 | Exact known-member candidate scope |
| `deepseek-v4-flash` | Accepted compatibility alias, routed to V4.1-Flash; original backend retired | TEMPORALLY_UNSAFE; no Rule selector |
| `deepseek-v4-flash-vision-exp` | Accepted compatibility alias, routed to V4.1-Flash; original experimental backend retired | TEMPORALLY_UNSAFE; no Rule selector |
| `deepseek-chat`, `deepseek-reasoner` | Retirement July 24, 2026 at 15:59 UTC already passed | Exclude; do not revive old facts |

[Current pricing](https://api-docs.deepseek.com/quick_start/pricing/) establishes versions and accepted aliases; [current changelog](https://api-docs.deepseek.com/updates/) corroborates migration and retirement. The [catalog example](https://api-docs.deepseek.com/api/list-models/) lists only the two primary IDs. Accepted aliases are separately inventoried rather than mistaken for their former backends.

`DeepSeek-V4-Pro-0813` and `DeepSeek-V4.1-Flash` are version/display names; native API IDs with those strings were not established. The temporary V3.2-Speciale endpoint expired December 15, 2025 at 15:59 UTC and belongs to a different endpoint surface.

No native dated-snapshot family or safe future-member grammar was established. No regex is proposed. Exact IDs are finite known-member coverage; matching a selector never creates a subject. Flash does not confer image support on Pro. No capabilities are inherited from V3/R1, the former experimental backend, or preview weights.

## Candidate inventory and exact versus inferred coverage

| Rule ID | Canonical assertion | Primary IDs | Evidence basis |
|---|---|---|---|
| `deepseek.context-max.v1` | `limits.contextWindow.maxTokens = 1048576 token` | Flash, Pro | EXPLICIT_MODEL; documented precise catalog metadata; source conflict |
| `deepseek.effort-default.v1` | `reasoning.effort.providerDefault = high` | Flash, Pro | EXPLICIT_MODEL |
| `deepseek.reasoning-required.v1` | `reasoning.required = false` | Flash, Pro | EXPLICIT_MODEL; non-thinking explicitly available |
| `deepseek.reasoning-modes.v1` | complete native modes `disabled, enabled` | Flash, Pro | EXPLICIT_MODEL; wire `thinking.type` values |
| `deepseek.top-p-default.v1` | `sampling.topP.providerDefault = 1` | Flash, Pro | EXPLICIT_MODEL; stable Chat wire default |
| `deepseek.content-generate.v1` | partial operations `[content_generate]` | Flash, Pro | EXPLICIT_MODEL; confirmed Chat operation only |
| `deepseek.flash-training-tool-use.v1` | `tools.trainingForToolUse = supported` | Flash only | INFERRED_HIGH; coordinator review pending |

Six direct Rules cover 12 model/path assertions; one inferred Rule covers one Flash assertion. Seven compatibility-alias fact records contain 14 separately audited INFERRED_HIGH model/path expansions. They remain TEMPORALLY_UNSAFE with no proposed Rule IDs or selector expansion.

The [V4.1-Flash report](https://arxiv.org/html/2609.19969), sections 5.1.1/5.1.2, describes training with tool interfaces/API schemas and interactive agent environments. Independent first-party pricing identifies the exact hosted `deepseek-flash` backend as DeepSeek-V4.1-Flash; the [Sept 10 release](https://api-docs.deepseek.com/news/news260910/) corroborates that mapping. This bridges the exact trained version to the exact hosted identity, rather than extrapolating from a sibling prefix. Earlier V4 Flash, experimental vision, Pro0813 and base-versus-instruct variants were considered and excluded. Generic Pro preview post-training evidence does not establish the current Pro0813 tool-training fact. Full inference audits and pending coordinator verdicts are in facts JSON.

## Provider Native and models.dev comparison

Static code-backed Provider Native coverage is **identity-only** for every DeepSeek capability path: `providerNativeSourceAdapterV1.ts#factsForSurface` and native mappings=[] in `sourceCoverageManifestV1.ts`. The newly rich public catalog schema does not mean the current adapter maps it. No path is classified ALREADY_PROVIDER_NATIVE.

The current models.dev adapter maps attachment/reasoning/tool/structured-output/temperature support, modalities, token limits, reasoning toggle/effort and budget when present. It does not map native reasoning modes/default effort, sampling defaults, operations or tool-training. Mapping potential is separate from actual values.

The coordinator retrieved [models.dev API JSON](https://models.dev/api.json) at **2026-10-02T05:12:03.622Z** and transformed it with the actual current adapter/registry. The compact external observations contain four DeepSeek subjects. Public transformed output maximum 393216, effort low/high/max, reasoning/toggle/tool/JSON/temperature support and modalities agree with official documentation; 11 facts are ALREADY_MODELS_DEV and emit no redundant Rules. Public input max and reasoning budget support/domain are missing, not unsupported. Local applied values remain unverified.

All 36 current canonical paths are audited below. “no_coverage” means the current adapter does not map this path; “missing” is an actual missing mapped value in the public snapshot. Both leave the fact unknown.

| Canonical path | Official value/proposal for primary IDs | Public models.dev transformed state/value | Primary fact disposition |
|---|---|---|---|
| `limits.contextWindow.maxTokens` | 1048576 | 1000000 | RULE_CANDIDATE |
| `limits.output.maxTokens` | 393216 | 393216 | ALREADY_MODELS_DEV |
| `modalities.input` | Flash: [image,text] (complete); Pro: [text] (complete) | [image,text] (complete); [text] (complete) | ALREADY_MODELS_DEV |
| `modalities.output` | [text] (complete) | [text] (complete) | ALREADY_MODELS_DEV |
| `reasoning.effort.nativeValues` | [high,low,max] (complete) | [high,low,max] (complete) | ALREADY_MODELS_DEV |
| `reasoning.effort.providerDefault` | high | no_coverage | RULE_CANDIDATE |
| `reasoning.support` | supported | supported | ALREADY_MODELS_DEV |
| `reasoning.required` | false | no_coverage | RULE_CANDIDATE |
| `reasoning.toggle.support` | supported | supported | ALREADY_MODELS_DEV |
| `reasoning.modes.nativeValues` | [disabled,enabled] (complete) | no_coverage | RULE_CANDIDATE |
| `input.attachments.support` | Flash: supported | supported | ALREADY_MODELS_DEV |
| `tools.calling.support` | supported | supported | ALREADY_MODELS_DEV |
| `structuredOutput.support` | supported | supported | ALREADY_MODELS_DEV |
| `sampling.topP.providerDefault` | 1 | no_coverage | RULE_CANDIDATE |
| `operations.supported` | [content_generate] (partial) | no_coverage | RULE_CANDIDATE |
| `image.generation.support` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `tools.trainingForToolUse` | Flash: supported; Pro: unresolved | no_coverage | RULE_CANDIDATE; AMBIGUOUS_DEFER |
| `limits.input.maxTokens` | unresolved | missing | AMBIGUOUS_DEFER |
| `reasoning.budgetTokens.support` | unresolved | missing | AMBIGUOUS_DEFER |
| `reasoning.budgetTokens.domain` | unresolved | missing | AMBIGUOUS_DEFER |
| `generation.effort.nativeValues` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `generation.effort.providerDefault` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `sampling.temperature.support` | supported | supported | ALREADY_MODELS_DEV |
| `sampling.temperature.providerDefault` | unresolved | no_coverage | ONTOLOGY_GAP |
| `sampling.temperature.modelMaximum` | unresolved | no_coverage | ONTOLOGY_GAP |
| `sampling.topK.support` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `sampling.topK.providerDefault` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `tools.codeExecution.support` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `image.generation.aspectRatios` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `image.generation.resolutionPresets.nativeValues` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `image.generation.resolutionPreset.providerDefault` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `search.web.support` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `search.image.support` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `documents.citations.support` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `contextManagement.support` | unresolved | no_coverage | AMBIGUOUS_DEFER |
| `contextManagement.actions.nativeValues` | unresolved | no_coverage | AMBIGUOUS_DEFER |

Classification totals: **51 facts = 7 RULE_CANDIDATE + 11 ALREADY_MODELS_DEV + 8 ONTOLOGY_GAP + 18 AMBIGUOUS_DEFER + 7 TEMPORALLY_UNSAFE**. No ALREADY_PROVIDER_NATIVE or REDUNDANT_BUT_USEFUL records. Canonical-path-null records capture additional real, unrepresentable controls; they do not emit Rules.

## Source conflicts and temporal review

1. **Context precision conflict.** Live official catalog example at 05:07:14 UTC gives 1048576; current public models.dev transformation at 05:12:03.622 UTC gives 1000000. Pricing says 1M. Rounded marketing versus precise binary-token metadata is a plausible explanation, not a confirmed explanation or explicit supersession. Detailed source/date/surface/version audit is in `deepseek:fact:context-max`. The Rule is a precise provider fallback/provenance proposal: priority 0/default Cloud Rules cannot replace a higher-priority present models.dev value. It does not fix current resolved context data.

2. **Pro sunset explicitly reversed.** The [Sept 10 announcement](https://api-docs.deepseek.com/news/news260910/) planned Pro rerouting on Sept 14. The current changelog explicitly continues Pro after that date in response to demand; current pricing retains distinct Pro0813 and modalities. This defensible supersession keeps Pro current and excludes Flash vision inheritance.

3. **Stale extraction versus live references.** Exa's catalog excerpt retains old Flash ID/identity-only schema. Live Chrome Schema and Example tabs show primary `deepseek-flash`, precise limits, modalities and effort metadata. Older thinking extraction says top_p is ignored; live [thinking guide](https://api-docs.deepseek.com/guides/thinking_mode/) and [Chat reference](https://api-docs.deepseek.com/api/create-chat-completion/) agree it is effective in thinking at 0.95–1, while non-thinking is fixed at 1. Old Responses extraction has no real images and built-in web search; live [Responses guide](https://api-docs.deepseek.com/guides/responses_api/) accepts images and ignores built-in search/code tools. Current live reference is corroborated before choosing semantics; stale extracts stay recorded.

4. **Protocol/current-table discrepancy.** Live Responses table names Flash only while pricing lists Responses support for Pro too. This remains unresolved for that protocol. Native built-in web/code tools and context_management restrictions in Responses are not transferred into the registry's stable Chat profile. Likewise Anthropic ignored budget_tokens/top_k/citations do not prove stable Chat unsupported facts.

5. **Weights/version discrepancy.** [Pro model card](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro) describes preview weights and earlier effort settings; [GA notice](https://api-docs.deepseek.com/news/news260813/) and current API metadata establish low/high/max for Pro0813. Model-card scalar effort is not a public native string domain or a hard token budget.

All main capability assertions are version-bound and require fresh provider review on alias backend changes. Compatibility alias validity/retirement deadlines are unknown: temporalClass unknown plus explicit temporary-moving-alias lifecycle flag; no invented expiry or recheck date. Historical retired IDs and expired temporary endpoints are excluded. Unknown publishedAt/updatedAt/lifecycle fields remain null.

## Facts not converted into Rules and ontology gaps

Image generation remains **AMBIGUOUS_DEFER**. Exact text-only output modalities are directly documented and ALREADY_MODELS_DEV. Three built-in official-domain searches and Exa found no explicit image-generation prohibition. Mapping that metadata into a negative image-generation capability would require a separate inference rationale/policy; no negative Rule was emitted.

The [tool guide](https://api-docs.deepseek.com/guides/tool_calls/) describes caller-executed function tools, not a provider code sandbox. [JSON guide](https://api-docs.deepseek.com/guides/json_mode/) establishes JSON-object output, not arbitrary strict JSON schema. Strict function schemas use /beta and are outside the stable profile. Flash [vision](https://api-docs.deepseek.com/guides/vision/) and [Files API](https://api-docs.deepseek.com/guides/files_api/) establish image attachments; image storage quotas, formats/count/size/expiry do not become generic-file/PDF capabilities.

Eight ONTOLOGY_GAP records cover mode-conditioned sampling controls, output defaults, temperature default/maximum effectiveness, automatic prefix caching, image-file quotas, Beta strict schema and thinking-enabled default. Explicit accepted temperature default 1/maximum 2 are only active non-thinking; an unconditional effective model control would lose that condition. top_p default 1 is retained because both documented modes share that default. Output defaults 8K/64K/128K depend on mode/effort and are not a reasoning budget.

[Automatic prefix cache](https://api-docs.deepseek.com/guides/kv_cache/) is not context compaction/native management actions or a cache-create operation. Report effort scalar 1–100 and public low/high/max mapping do not establish reasoning-token budget bounds. Separate input-token maximum is unknown; no context-minus-output arithmetic was used.

Additional deferred canonical families include independent generation effort, top_k, code execution, native web/image search, citations, image-generation ratios/presets/defaults, and context-management/actions. No unsupported values, lower/upper bounds, defaults or complete enum sets were invented from absent parameters or different protocols.

## Durable evidence and validation

The ledger contains 18 records; current source URLs and retrieval timestamps are in JSONL. Principal surfaces searched:

- [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/) — deepseek:pricing-20261002; 2026-10-02T05:04:22.000Z
- [Change Log](https://api-docs.deepseek.com/updates/) — deepseek:updates-20261002; 2026-10-02T05:04:22.000Z
- [Lists Models](https://api-docs.deepseek.com/api/list-models/) — deepseek:models-chrome-20261002; 2026-10-02T05:07:14.000Z
- [Thinking Mode (live Chrome)](https://api-docs.deepseek.com/guides/thinking_mode/) — deepseek:thinking-live-20261002; 2026-10-02T05:08:12.000Z
- [Vision](https://api-docs.deepseek.com/guides/vision/) — deepseek:vision-20261002; 2026-10-02T05:08:12.000Z
- [Chat Completions API (live Chrome)](https://api-docs.deepseek.com/api/create-chat-completion/) — deepseek:chat-live-20261002; 2026-10-02T05:08:31.000Z
- [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/) — deepseek:tools-20261002; 2026-10-02T05:08:31.000Z
- [JSON Output](https://api-docs.deepseek.com/guides/json_mode/) — deepseek:json-20261002; 2026-10-02T05:08:31.000Z
- [models.dev public API snapshot](https://models.dev/api.json) — deepseek:models-dev-snapshot-20261002; 2026-10-02T05:08:31.000Z
- [Using the Responses API](https://api-docs.deepseek.com/guides/responses_api/) — deepseek:responses-live-20261002; 2026-10-02T05:11:24.000Z
- [Context Caching](https://api-docs.deepseek.com/guides/kv_cache/) — deepseek:cache-20261002; 2026-10-02T05:12:06.000Z
- [Files API](https://api-docs.deepseek.com/guides/files_api/) — deepseek:files-20261002; 2026-10-02T05:12:06.000Z
- [DeepSeek-V4.1-Flash release](https://api-docs.deepseek.com/news/news260910/) — deepseek:flash-release-20260910; 2026-10-02T05:12:06.000Z
- [DeepSeek-V4-Pro GA Release](https://api-docs.deepseek.com/news/news260813/) — deepseek:pro-ga-20260813; 2026-10-02T05:12:06.000Z
- [DeepSeek-V4.1-Flash technical report](https://arxiv.org/html/2609.19969) — deepseek:flash-paper-20261002; 2026-10-02T05:14:03.000Z
- [V4 Pro model card (preview version)](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro) — deepseek:weights-cards-20261002; 2026-10-02T05:14:03.000Z
- [models.dev public DeepSeek rows canonicalized by current code](https://models.dev/api.json) — deepseek:models-dev-canonical-20261002; 2026-10-02T05:12:03.622Z
- [Image-generation restriction search audit](https://api-docs.deepseek.com/) — deepseek:image-generation-restriction-search-20261002; 2026-10-02T05:22:19.000Z

Files: `evidence/deepseek.jsonl`, `facts/deepseek.json`, `candidates/deepseek.json`, and this report. Every fact has one classification, factId, proposedRuleIds, typed canonical value or explicit null when unresolved/unrepresentable, and evidence references. Candidate facts all have non-null typed canonical values. Provider Native code mapping, actual public models.dev observations, exact/inferred coverage and coordinator approval are separate metadata.

Validation: all seven Rules pass the real `decodeCapabilityRuleCoreRuleV1`; an in-memory actual Pack containing those Rules passes `decodeCapabilityRuleCorePackV1`. JSON/JSONL parse, fact-to-evidence references and fact-to-proposed-Rule references pass. Audit counts: 51 facts, 18 evidence records, 36 canonical paths, 7 Rules. No DB-heavy tests, native ABI rebuild, code changes, commits or release operations were needed.

## Exact next step

Coordinator independently review all seven Rules, the context conflict, Flash hosted-version training inference, and compatibility-alias lifecycle audits before final corpus inclusion. No provider-level approval is implied by decoder success.

**Exact next question:** Does the coordinator approve the six direct exact-ID Rules as priority-0/default proposals with the documented context fallback limitation, and independently approve the INFERRED_HIGH Flash tool-training Rule, while keeping temporary alias expansions and image-generation inference deferred?
