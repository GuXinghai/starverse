# OpenRouter provider research — completed handoff

As of 2026-10-02. 645 public exact IDs (464 text-output), 476 facts, 64 Rule proposals, 61 evidence records; all 36 canonical paths reviewed. Actual Rule/Pack decoders passed. No inferred-high or regex Rules.

The source-cluster history below records research, not pending tasks. Exact next step: coordinator source, semantic, duplicate, temporal and release-recommendation audit. No Apply or publication.

— 2026-10-02 (Asia/Tokyo)

Research corpus complete, **not published**. Launch preflight verified `gpt-6.1-sol` / `high`; no mismatch or substitute. Branch `models-dev-capability-resolution`. Scope only `openrouter` / `openrouter-first-party-v1`; models.dev key `openrouter`. All eight contracts and AGENTS.md read before external research. No child agents, production/schema/adapter/DB edits, commit, or publication.

## Inventory and search coverage

Unauthenticated [public models API](https://openrouter.ai/api/v1/models) returned **464 text-output IDs** at 2026-10-02T05:14:00.920Z. The `output_modalities=all` snapshot returned **645 exact IDs**, including 181 outside the default text payload. Returned paging/metadata and full compact snapshots are saved; this establishes public identities and metadata, never entitlements or generation success. Native IDs come from `id`; `canonical_slug` and `links.details` are separate identifiers. Endpoint URLs were taken from catalog links rather than invented from IDs.

Live built-in web search, **Chrome**, and **Exa** were all available. Chrome read catalog/parameter documentation; Exa reviewed 20 search results across three workstreams and fetched targeted official pages. All retained authority is OpenRouter first-party; upstream documentation is never assertion authority. The ledger contains **61 records**, including discovery-only URLs, not 61 independently verified model pages. First-party surfaces include catalog/SDK schemas, model pages/migration guides, unified parameters, reasoning, tools, structured outputs, routing, PDF/multimodal, Image API/chat continuation/server tools, web search/plugins, context transforms, batch API, changelog and dated blog announcements. Full catalog metadata scanned; individual model pages and endpoint matrices sampled rather than exhaustively tested.

Models/families are catalog-derived across 88 namespaces; tokenizer and suffix distributions are in `evidence/openrouter-naming-audit.json`. OpenAI GPT/o-series, Anthropic Claude, Google Gemini, Qwen, DeepSeek, Llama and other catalog families receive no upstream/sibling inheritance. Floating `~latest` aliases, dynamic routers, batch variants and expiring members are excluded from candidate assertions. Ordinary version-bound IDs denote captured current releases, not a guarantee the public slug is immutable. Regex count **0**; inheritance disposition **KNOWN_MEMBERS_ONLY**.

## Facts and useful additions

**476 intermediate facts**, **64 current-schema Rules**, **292 exact candidate model subjects**, **581 model/path assertions**, **0 inferred-high**, **0 regex**. Every Rule links to exactly one fact via `factId` / `proposedRuleIds`; all inferred lists are empty. No absence-to-unsupported conversion, input/output arithmetic, invented ID, or synthetic numeric bound/domain.

| Classification | Grouped facts |
|---|---:|
| ALREADY_PROVIDER_NATIVE | 125 |
| ALREADY_MODELS_DEV | 9 |
| RULE_CANDIDATE | 64 |
| AMBIGUOUS_DEFER | 228 |
| TEMPORALLY_UNSAFE | 38 |
| ONTOLOGY_GAP | 12 |

| Canonical path | Candidate Rules | Exact subjects |
|---|---:|---:|
| `sampling.topK.support` | 3 | 182 |
| `reasoning.toggle.support` | 4 | 113 |
| `reasoning.effort.nativeValues` | 31 | 121 |
| `sampling.temperature.providerDefault` | 11 | 77 |
| `sampling.topP.providerDefault` | 5 | 57 |
| `sampling.topK.providerDefault` | 4 | 18 |
| `image.generation.support` | 2 | 9 |
| `reasoning.budgetTokens.support` | 2 | 2 |
| `generation.effort.nativeValues` | 1 | 1 |
| `reasoning.effort.providerDefault` | 1 | 1 |

Provider Native statically maps context, modalities, reasoning support/required/default effort **when present in the actual default public payload**. The current SDK allowlist semantics justify exact `reasoning.supported_efforts` domains that both native/models.dev adapters deliberately leave unmapped. Null allowlists are unrestricted gateway acceptance metadata, not complete native model domains; omissions stay unknown. Mandatory reasoning is explicit negative toggle evidence. Positive `none` toggle and budget support already adequately represented by current models.dev are removed where redundant. o3-mini's exact OpenRouter page fills genuinely omitted effort/default fields. Sonnet5 and Opus5.5 budgets are explicitly ignored/not forwarded, hence functional unsupported; Opus5 conflict stays deferred.

Top-k availability and non-null per-model sampling defaults add unmapped facts, but defaults/union support need coordinator route-semantics review. Nine exact existing text-plus-image model entries merit image-generation flags: catalog defines image output as generation, and first-party continuation/current chat comparison confirm the transport. Image output/flag does not imply complete text reliability, dedicated API controls, or universal ratio/resolution domains. Sonnet5 whole-response effort is a separate generation control requiring semantic review; it is never silently conflated with the reasoning channel.

Tools, structured outputs and temperature were broadly researched. Most exact positive/negative flags are already adequately in models.dev; the two apparent positive gaps were dynamic routers, so **no extra tools/structured/temperature-support Rules** remain. This is evidence-driven redundancy removal, not a narrow missing-fields-only search.

## Full coverage and limitations

`evidence/openrouter-coverage-audit.json` covers **all 36 canonical paths**. `openrouter-coverage-by-model.jsonl` contains **23,220 exact model/path rows** (645 x 36), with Provider Native static field/current public presence, models.dev public raw fields, fact disposition and Rule linkage. This is static-plus-live-public coverage; **no installed app DB or current runtime facts were inspected**. ALREADY_PROVIDER_NATIVE means static projection with a present public field, not proof an installation has ingested it. Nontext models remain profile-deferred. Zero rows/assertions mean unknown, never unsupported.

Four endpoint samples (GPT6.1 Sol, Gemini3.8 Flash, Sonnet5, o3-mini) show concrete backend differences. Sonnet5 Bedrock omits structured_outputs whereas other endpoints advertise it; Gemini3.8 Vertex sampling differs from AI Studio. Model catalog support is advertised availability; `require_parameters`, provider pins, request shape, account policy and beta routing are execution prerequisites that cannot be inserted into current model-level Rules. No paid/authenticated generation probes were made.

Open ontology gaps/deferred concepts include reasoning default-enabled state, routing modes, forced tool-choice compatibility, shell execution, native-vs-fallback search, file-parser annotations vs citations, compression plugin vs native context actions, Messages-only controls, batch provider/modalities restrictions, dedicated image endpoint capability unions/clamping, native tool-use training, image search, exact numeric budgets and model temperature maxima. Gateway accepted ranges, OCR limits and reasoning percentages are not model bounds. Detailed non-Rule facts retain explicit nulls and the next question.

## Conflicts and lifecycle

`openrouter-conflict-audit.json` records source pairs, actual retrieval/publication/update information, API/model scope, possible explanation, proposed disposition and unresolved question. Most important: Opus5.5 catalog default high vs guide omitted-effort medium; Opus5 ignored budgets vs successor-guide fixed-budget comparison; Sonnet5 effort allowlist vs none-disable text; shorthand versus unified max; historical default/identity spelling; route aggregation and image transport distinctions. No conflicting official value is silently selected for publication.

**30 catalog IDs have explicit expiration dates**. Their proposed Rules are excluded, with early October removals listed in the temporal audit. `validThrough` is null because exact cutover time is unknown; dates appear under `deprecatedAfter`, not an invented Rule expiry field. Preview candidate Rules carry `REQUIRES_PREVIEW_REVIEW` and recheck date 2026-10-09. Floating aliases/router coercion and batch identity differences are deferred. Temporal/spelling labels are review qualifications, not provider-guaranteed lifecycle statements.

## Coordinator handoff and validation

All **64 Rules** pass `decodeCapabilityRuleCoreRuleV1` and an ephemeral disabled fixture passes `decodeCapabilityRuleCorePackV1`. Exact IDs, authority/profile, evidence refs, unique IDs, fact linkage, duplicate/conflicting subject-path assertions and selector size checks pass. Validation command and UTC timestamp are in `evidence/openrouter-validation.json`. No Pack organization/release is persisted; `candidates/openrouter.json` is an actual Rules array.

First-corpus review: **34** non-preview/non-default/non-generation-effort Rules are the stronger initial review pool; **30** require explicit temporal/default/whole-response semantic review. These are coordinator recommendations, not owner decisions or approval. All require the coordinator's independent evidence and OpenRouter model-level routing interpretation review before inclusion. Deferred source conflicts/expiry/alias/batch/API scopes stay out. No cross-provider policy was decided.

Only OpenRouter-owned research paths were written. The working tree initially/finally has the shared untracked research root plus unrelated `pelican-bicycle.html`; other providers' files are preserved. No staging, commits or release publication. Decoder-only Node validation does not load better-sqlite3: ABI mismatch encountered **no**, rebuild command **none**, current ABI target **unchanged / not inspected**, tests retried **none**, Electron smoke **not run**, no native artifacts committed **confirmed**.

**NEXT QUESTION / coordinator action:** resolve Opus5 budget and Opus5.5 default conflicts; define advertised-any-route support versus pinned-backend requirements; review preview and providerDefault qualification plus Sonnet5 generation-effort mapping; then independently select exact research candidates for a corpus. Do not publish this research corpus automatically.

## Durable cluster log

Research-only; coordinator review required before corpus inclusion.

- Launch preflight verified gpt-6.1-sol / high; no model mismatch observed.
- All eight required contracts read before external retrieval. Scope openrouter / openrouter-first-party-v1 from live registry. models.dev key openrouter. No production edits, children, DB writes, commits or publication.
- Inventory-first cluster: 464 public exact IDs, unauthenticated GET 200 at 2026-10-02T05:14:00.920Z. Full compact snapshot plus HTTP metadata are durable.
- Chrome available through cua_repl; Exa callable. Memory used only for orientation; current contracts override dated memory.
- Cluster 2: catalog-standard, SDK ModelReasoning, tool/structured guides, routing and recent first-party blog searched. All-modality catalog expands 464 text IDs to 645 total; additions include non-chat modalities and must not be assigned chat operations automatically.
- Positive tools/structured metadata can support advertised availability, never guarantee every route; require_parameters is an execution prerequisite and cannot be asserted as a Model Fact. supported_efforts and supports_max_tokens now have explicit first-party semantics, unlike the current static unmapped adapter fields.
- Intermediate fact disposition: effort allowlists and positive budget acceptance are potential RULE_CANDIDATE; mapped context/modalities/mandatory/default effort remain ALREADY_PROVIDER_NATIVE where live fields exist; output maxima remain AMBIGUOUS_DEFER due to top-provider scope. Concrete exact lists will be generated from saved payload after the reasoning cluster.
- Cluster 3: reasoning guide directly corroborates SDK allowlist semantics and native budget acceptance. Initial durable generator created 385 grouped intermediate facts and 63 preliminary Rules with factId/proposedRuleIds linkage. Counts are provisional until broad capability/temporal/endpoint audits finish.
- Inference audit: all candidate subjects have their own explicit catalog fields; no INFERRED_HIGH, sibling assumption or regex. Future inheritance is KNOWN_MEMBERS_ONLY. OpenRouter variants and aliases can change route/identity; expiring, floating aliases and batch-suffix candidate facts are deferred.
- Conflict: reasoning guide generic enabled=true says medium while exact metadata says model-specific default_effort; no universal medium default asserted. exclude is not toggle; effort allocation percentages are not exact numeric budgets. default_enabled has no canonical default-state path.
- Live models.dev OpenRouter subset captured for comparison only (389 entries). Current effort adapter deliberately unmapped; new effort Rules add direct documented gateway domains. Tool/structured claims already agreeing with models.dev are classified ALREADY_MODELS_DEV; only useful exact gaps/corrections enter candidates.
- Cluster 4 persisted: PDF, multimodal, Image API, image/server tools, web search, plugins, message transforms and historical reasoning announcement. Added 21 intermediate gap/defer facts before further searches.
- PDF parsing can work with every model but native file input is a separate metadata fact. Universal PDF parser support is not an attachments Rule. File annotations are not native document citations.
- Dedicated image API publishes unions of per-endpoint capabilities; ratio/resolution normalization and clamping are not a complete model-native domain. Image server tools call another generator. No image-domain Rules yet.
- Web server tools are beta and :online/web plugins deprecated; default native search may fall back to Exa. Context compression truncates request messages, shell tools require Responses/Messages APIs. These prerequisites cannot safely fit model-only assertions.
- Cluster 5: parameter guide (Chrome), API changelog/index, GPT-6 and Claude migration guides, o3-mini model page and ContextManagement SDK searched. Parameter defaults are conventional; only non-null catalog defaults could be model facts. No universal temperature=1/top_p=1/top_k=0 assertions.
- Metadata gap: o3-mini official page documents three efforts/default medium while catalog reasoning fields omit them. This merits exact effort/default candidate after final audit; o3-mini-high is a distinct fixed-effort variant and receives no sibling expansion.
- Exceptions: Sonnet 5 ignores budgets and sampling and explicitly permits enabled=false; Opus 5 can disable only with high-or-lower effort (conditional restriction must not be hidden by support). Claude 4.7 guide uses an ID spelling absent from inventory. GPT-6 Sol/Luna none support matches their own metadata; no inheritance to GPT-6.1 variants.
- Conflicts: Sonnet5 guide describes none disabling although its metadata effort allowlist excludes none; keep its complete effort-domain claim deferred until coordinator review. Shorthand reasoning_effort enum misses max but unified reasoning.effort docs/model allowlists include max; use unified semantics only. ContextManagement edits schema does not establish model coverage.

- Cluster 6 persisted: four exact endpoint payloads, batch quickstart, Opus5.5 and Fable5.1 migrations. Sonnet5 structured-output availability differs across endpoints; Gemini3.8 sampling differs across endpoints. Dynamic router gaps are removed from candidates. Opus5 budget and Opus5.5 default-effort official conflicts are deferred. Forced tool choice and batch prerequisites remain ontology gaps/deferred API behavior.

- Cluster 7 persisted: 20 Exa search results reviewed across three workstreams, plus built-in web search and Chrome. Current image chat overlap has nine exact non-router IDs with image output; catalog explicitly calls image output image generation, and June23 continuation/September18 chat docs corroborate chat semantics. Candidate flag additions are useful; dedicated API domains still deferred.

## Final evidence and limitations

The public catalog and four exact endpoint payloads were captured without authentication. They establish advertised availability, not account entitlement or a universal route guarantee. Provider Native static mappings and models.dev comparisons are documented in the machine audits; coordinator transforms the saved public payload with the actual Native adapter separately. Existing local active source/database state was not read.

Sources include model catalog/schema, official SDK ModelReasoning, reasoning and parameter guides, provider routing, tool and structured-output guides, model migrations, exact model pages, image/chat API documentation, PDF/file parsing, web/server tools, plugins, batch/changelog and official announcements. Built-in web, Chrome and Exa were all used. Third-party discovery text is not Rule authority.

13 source conflict pairs, expiry-bound IDs and 645×36 coverage remain in openrouter-prefixed evidence audits. Native reasoning allowlists are new canonical gaps; null/omitted allowlists, output caps tied to top_provider, server prerequisites, router subjects and incompatible defaults stay deferred. Image output claims are limited to current chat-catalog overlap, not all-category image endpoint unions. Future inheritance remains KNOWN_MEMBERS_ONLY.
