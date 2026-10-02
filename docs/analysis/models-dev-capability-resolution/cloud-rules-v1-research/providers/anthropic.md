# Anthropic provider research — candidate handoff

> Historical provider handoff: targeted disposition changes and current counts are recorded in [the 2026-10-02 repair](../repairs/disposition-20261002/report.md). Current facts, proposals and final dispositions include that repair; original source captures remain historical.

As of **2026-10-02 Asia/Tokyo**. This is a provider research handoff, with no publication or final policy approval.

**50 evidence records across 46 official URLs, 79 intermediate facts, 49 exact-selector candidate Rules, 332 model/path claims.** All 36 canonical paths were reviewed. The structured coverage matrix contains 576 rows for 14 active and 2 deprecated subjects. Current lifecycle inventory also retains 19 retired IDs and 3 convenience aliases.

## Execution and contract

The running CLI process was checked for `gpt-6.1-sol` and `model_reasoning_effort=high`; both matched. No substitution or child agents. Work remained on `models-dev-capability-resolution`.

The owner request, AGENTS.md, and all eight mandatory contract files were read before external research:

- src/next/generation-v2/capability-rules/capabilityRuleCoreV1.ts
- src/next/generation-v2/model-facts/canonicalSourceFactsV1.ts
- src/next/generation-v2/model-facts/providerAuthorityRegistryV1.ts
- src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1.ts
- docs/analysis/models-dev-capability-resolution/12-model-facts-ui-synchronization-plan.md
- docs/analysis/models-dev-capability-resolution/13-cloud-managed-rules-distribution-contract.md
- docs/analysis/models-dev-capability-resolution/15-goal-3-three-source-resolution-implementation-plan.md
- docs/analysis/models-dev-capability-resolution/16-goal-4-model-facts-operationalization-plan.md

Authority/profile is **anthropic / anthropic-developer-api-2023-06-01**. These claims concern the direct Claude Messages surface. Bedrock, Vertex/Google Cloud, Microsoft Foundry, Managed Agents, and consumer Claude features were checked for exceptions but not automatically copied into this profile.

Only the four Anthropic artifacts and the optional `anthropic-validate.cjs` support were written. No production, schema, adapters, database, main, commits, publication, or native rebuild changes.

## Backend and source coverage

Built-in web search was actively used for inventory, capabilities, unknowns, release notes, and migrations. Chrome supplied live dynamic tables and three legacy pages that the web backend could not open. Chrome rendered some specifications in Japanese; literal 100万, 12.8万, 20万, and 6.4万 corroborate 1,000,000, 128,000, 200,000, and 64,000 tokens.

Exa Search was available after retrying its required `objective` argument. Two successful independent searches requested 10 results each; one preceding schema-error call returned no results. Exa surfaced official docs, SDK code, and provider-maintained skill copies. Some were stale; they were discovery/counterevidence, not unqualified current capability guarantees. Exa Fetch was discovered but not needed. Direct .md HTTP retrieval returned 403 once. Native computer UI was disabled; Chrome browser control worked.

The native `GET /v1/models` documentation was inspected, but no credentialed account payload or database was accessed. Example zero limits and generic string IDs are fixtures, not observations. No backend was silently substituted.

Research was persisted after each meaningful cluster. The JSONL captures exact retrieval timestamps; unknown publication/update dates are null. Model inventory, source notes, per-fact temporal assessments, inference audits, gaps, and conflicts remain in the facts JSON.

## Native identity inventory

This is an authoritative **public documentation** inventory, not an observed account-specific Native subject set. Dateless 4.6-and-later IDs are pinned snapshots, not rolling aliases. Earlier convenience aliases remain separate; Rules do not create subjects.

| Exact ID | Lifecycle | Access | Release date | Retirement / earliest commitment |
| --- | --- | --- | --- | --- |
| claude-fable-5-1 | active | public_or_account_gated | 2026-09-01 | not sooner than 2027-09-01 |
| claude-mythos-5-1 | active | invitation_only | 2026-09-01 | not sooner than 2027-09-01 |
| claude-fable-5 | active | public_or_account_gated | 2026-06-09 | not sooner than 2027-06-09 |
| claude-mythos-5 | active | invitation_only | 2026-06-09 | not sooner than 2027-06-09 |
| claude-opus-5-5 | active | public_or_account_gated | 2026-09-22 | not sooner than 2027-09-22 |
| claude-opus-5 | active | public_or_account_gated | 2026-07-24 | not sooner than 2027-07-24 |
| claude-opus-4-8 | active | public_or_account_gated | 2026-05-28 | not sooner than 2027-05-28 |
| claude-opus-4-7 | active | public_or_account_gated | 2026-04-16 | not sooner than 2027-04-16 |
| claude-opus-4-6 | active | public_or_account_gated | 2026-02-05 | not sooner than 2027-02-05 |
| claude-opus-4-5-20251101 | active | public_or_account_gated | 2025-11-24 | not sooner than 2026-11-24 |
| claude-sonnet-5-5 | active | public_or_account_gated | 2026-09-28 | not sooner than 2027-09-28 |
| claude-sonnet-5 | active | public_or_account_gated | 2026-06-30 | not sooner than 2027-06-30 |
| claude-sonnet-4-6 | active | public_or_account_gated | 2026-02-17 | not sooner than 2027-02-17 |
| claude-haiku-4-5-20251001 | active | public_or_account_gated | 2025-10-15 | not sooner than 2026-10-15 |
| claude-sonnet-4-5-20250929 | deprecated | public_or_account_gated | 2025-09-29 | 2026-11-30 |
| claude-mythos-preview | deprecated | invitation_only | unknown | TBA / unresolved |

A “not sooner than” commitment is not a scheduled expiration. Haiku 4.5's minimum commitment is 2026-10-15; no announced retirement was inferred from that date. Sonnet 4.5 has a hard retirement date and requires expiry review. Mythos Preview has a conflicting older June 30 retirement notice and is excluded from all candidate Rules.

| Accepted convenience alias | Documented snapshot target | Rule treatment |
| --- | --- | --- |
| claude-opus-4-5 | claude-opus-4-5-20251101 | Subject membership unverified; no alias Rules |
| claude-haiku-4-5 | claude-haiku-4-5-20251001 | Subject membership unverified; no alias Rules |
| claude-sonnet-4-5 | claude-sonnet-4-5-20250929 | Subject membership unverified; no alias Rules |

| Retired exact ID | Direct API retirement date |
| --- | --- |
| claude-opus-4-1-20250805 | 2026-08-05 |
| claude-opus-4-20250514 | 2026-06-15 |
| claude-sonnet-4-20250514 | 2026-06-15 |
| claude-3-7-sonnet-20250219 | 2026-02-19 |
| claude-3-5-haiku-20241022 | 2026-02-19 |
| claude-3-haiku-20240307 | 2026-04-20 |
| claude-3-5-sonnet-20240620 | 2025-10-28 |
| claude-3-5-sonnet-20241022 | 2025-10-28 |
| claude-3-opus-20240229 | 2026-01-05 |
| claude-2.0 | 2025-07-21 |
| claude-2.1 | 2025-07-21 |
| claude-3-sonnet-20240229 | 2025-07-21 |
| claude-1.0 | 2024-11-06 |
| claude-1.1 | 2024-11-06 |
| claude-1.2 | 2024-11-06 |
| claude-1.3 | 2024-11-06 |
| claude-instant-1.0 | 2024-11-06 |
| claude-instant-1.1 | 2024-11-06 |
| claude-instant-1.2 | 2024-11-06 |

Retired IDs are historical inventory only. Partner-platform exceptions do not resurrect them on this direct API profile.

## Families, naming, and coverage expansion

Every current non-preview release has an official model-page identity/specification cross-check. Release-name compatibility statements were joined to the lifecycle and release pages. Under the owner's strict exact-ID definition, those joins are **INFERRED_HIGH**, not relabeled as literal exact evidence. Each inferred member carries an audit and a **PENDING** coordinator verdict.

| Family | Identity grammar / known IDs | Version status | Capability inheritance assessment |
| --- | --- | --- | --- |
| Fable | claude-fable-5 / claude-fable-5-1 | Pinned, stable; older 5 is legacy | Known members only; always-on thinking and hosted API features are release-scoped. |
| Mythos | claude-mythos-5 / claude-mythos-5-1 / claude-mythos-preview | Stable invitation-only IDs; preview deprecated | Stable specs corroborated independently. Preview excluded due lifecycle conflict. |
| Opus | claude-opus-5-5 / claude-opus-5 / claude-opus-4-[678] | Pinned dateless snapshots | 4.6 permits deprecated manual thinking; 4.7+ rejects it. 5 has conditional disable; 5.5 cannot disable. |
| Opus 4.5 | claude-opus-4-5-20251101; alias claude-opus-4-5 | Dated pinned snapshot plus convenience alias | Only exact snapshot proposed; no future dated inheritance. |
| Sonnet | claude-sonnet-5-5 / claude-sonnet-5 / claude-sonnet-4-6 | Pinned dateless snapshots | 5.5 adds between_tools; 5 supports disabled; 4.6 accepts deprecated manual thinking. |
| Sonnet 4.5 | claude-sonnet-4-5-20250929; alias claude-sonnet-4-5 | Deprecated dated snapshot, retirement 2026-11-30 | Expiry review required; not automatically in all-active scope. |
| Haiku 4.5 | claude-haiku-4-5-20251001; alias claude-haiku-4-5 | Stable dated snapshot | Manual thinking, no effort control, hosted code supports fewer subfeatures. Future snapshots unproven. |

The guide's “all active models” language expands base tool use, text output, PDF/attachments, citations, batches, and token counting over the current active inventory. Deprecated Sonnet 4.5 was separately corroborated where possible; the phrase did not automatically cover it. Tool-specific lists, thinking modes, effort levels, and compaction remain release-specific.

## Canonical capability findings

- Context is a shared input/output budget, including thinking output. Current technical guides and literal model-page units support 1,000,000 for 4.6+ releases and 200,000 for Opus/Sonnet/Haiku 4.5. No input-only maximum was derived by subtraction.
- Ordinary output ceilings are 128,000 or 64,000 tokens by release. The 300,000-token batch beta is recorded separately and not copied into ordinary Messages maximums.
- Anthropic `output_config.effort` is **generation effort**, not a separate reasoning-effort domain. Modern releases support five levels; Opus/Sonnet 4.6 four; Opus 4.5 three. The exact closed sets come from the explicit effort compatibility table.
- Manual thinking accepts a minimum budget of 1,024 on the documented legacy models. Its upper relationship to `max_tokens` changes with interleaving; no unconditional numeric maximum was invented.
- Thinking mode, ability to disable, and effort constraints differ by release. Opus 5 can disable at high/medium/low effort. Sonnet 5.5's `between_tools` behavior needs a coordinator decision for binary required/toggle semantics.
- Structured output and hosted code execution have explicit current compatibility lists. Hosted tool execution is not model-local execution. Haiku's REPL/programmatic-call restrictions remain distinct from code-execution support.
- Citations and structured output are independently supported but cannot be combined in one request. Image-citation limits do not imply image-search support or lack of it.
- PDF/image attachments are supported on active models. Files API infrastructure and binary office-format conversions do not prove a generic-file input modality.
- Current web-search dynamic filtering establishes the 4.6+ scope. Basic hosted search for older IDs remains unresolved because the two official compatibility links are circular.
- Context editing and threshold compaction use different beta headers. Partial per-model action sets preserve unknown actions and request-combination restrictions.

## Provider Native / models.dev / Cloud comparison

Static Native mappings exist for input/output limits, reasoning support, partial enabled/adaptive modes, generation effort, structured output, partial image/PDF input, citations, code execution, context support/actions, and partial request_batch. These mappings do not prove any current model observation. The new Sonnet 5.5 `between_tools` member is outside the static mode mapping.

The registry has **no Anthropic models.dev provider key**. Public anthropic records are skipped by the current adapter; no models.dev value or coverage is claimed. Every coverage row records null Native values with `UNVERIFIED_NO_PAYLOAD` and null models.dev values with `NO_REGISTERED_PROVIDER_KEY`.

| Canonical path | Candidate Rules | Model/path claims | Native static mapping | Unrepresented current/deprecated subjects |
| --- | ---: | ---: | --- | ---: |
| limits.contextWindow.maxTokens | 2 | 15 | no mapping | 1 |
| limits.input.maxTokens | 0 | 0 | mapped; observations unverified | 16 |
| limits.output.maxTokens | 3 | 15 | mapped; observations unverified | 1 |
| modalities.input | 2 | 15 | mapped; observations unverified | 1 |
| modalities.output | 2 | 15 | no mapping | 1 |
| input.attachments.support | 1 | 14 | no mapping | 2 |
| operations.supported | 1 | 14 | mapped; observations unverified | 2 |
| reasoning.support | 2 | 15 | mapped; observations unverified | 1 |
| reasoning.required | 5 | 14 | no mapping | 2 |
| reasoning.toggle.support | 3 | 14 | no mapping | 2 |
| reasoning.modes.nativeValues | 4 | 15 | mapped; observations unverified | 1 |
| reasoning.effort.nativeValues | 0 | 0 | no mapping | 16 |
| reasoning.effort.providerDefault | 0 | 0 | no mapping | 16 |
| reasoning.budgetTokens.support | 2 | 15 | no mapping | 1 |
| reasoning.budgetTokens.domain | 1 | 5 | no mapping | 11 |
| generation.effort.nativeValues | 3 | 13 | mapped; observations unverified | 3 |
| generation.effort.providerDefault | 4 | 13 | no mapping | 3 |
| sampling.temperature.support | 2 | 15 | no mapping | 1 |
| sampling.temperature.providerDefault | 1 | 5 | no mapping | 11 |
| sampling.temperature.modelMaximum | 1 | 5 | no mapping | 11 |
| sampling.topP.providerDefault | 0 | 0 | no mapping | 16 |
| sampling.topK.support | 2 | 15 | no mapping | 1 |
| sampling.topK.providerDefault | 0 | 0 | no mapping | 16 |
| tools.calling.support | 1 | 14 | no mapping | 2 |
| tools.trainingForToolUse | 0 | 0 | no mapping | 16 |
| tools.codeExecution.support | 1 | 15 | mapped; observations unverified | 1 |
| structuredOutput.support | 1 | 15 | mapped; observations unverified | 1 |
| image.generation.support | 0 | 0 | no mapping | 16 |
| image.generation.aspectRatios | 0 | 0 | no mapping | 16 |
| image.generation.resolutionPresets.nativeValues | 0 | 0 | no mapping | 16 |
| image.generation.resolutionPreset.providerDefault | 0 | 0 | no mapping | 16 |
| search.web.support | 1 | 12 | no mapping | 4 |
| search.image.support | 0 | 0 | no mapping | 16 |
| documents.citations.support | 1 | 14 | mapped; observations unverified | 2 |
| contextManagement.support | 1 | 15 | mapped; observations unverified | 1 |
| contextManagement.actions.nativeValues | 2 | 15 | mapped; observations unverified | 1 |

The 23 REDUNDANT_BUT_USEFUL facts propose independent documented fallback/provenance where mappings exist, but actual redundancy remains unverified. Coordinator justification is required before including such Rules. No ALREADY_PROVIDER_NATIVE or ALREADY_MODELS_DEV classification was asserted without observations.

## Candidate facts and Rules

`candidates/anthropic.json` is an array using the actual Rule schema. Every candidate has non-null evidence, exact provider/profile, a canonical value accepted by the decoder, null derivation, and a factId/proposedRuleIds trace. Priority 0 and configured default are neutral research placeholders; pack activation is not decided here.

Forty-one candidate Rules contain at least one INFERRED_HIGH member, totaling 320 pending model/path joins. Twelve candidate model/path claims are literal exact evidence. Inference evidence uses `explicit_provider_series`; no empirical derivation was created.

Subset discoveries are retained as facts but omitted from the Rule array when a broader corroborated assertion supersedes them. Context action subsets were combined so there is one candidate value per exact model/path. The decoder check found **zero same-model/path collisions**.

| Fact | Canonical path | Value | Primary classification | Proposed Rule count |
| --- | --- | --- | --- | ---: |
| anthropic-F-current-input | modalities.input | text, image (partial) | REDUNDANT_BUT_USEFUL | 0 |
| anthropic-F-current-output | modalities.output | text (complete) | RULE_CANDIDATE | 0 |
| anthropic-F-current-tool-calling | tools.calling.support | supported | RULE_CANDIDATE | 0 |
| anthropic-F-current-thinking | reasoning.support | supported | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-always-on-current | reasoning.required | true | RULE_CANDIDATE | 1 |
| anthropic-F-fable-default-effort | generation.effort.providerDefault | high | RULE_CANDIDATE | 1 |
| anthropic-F-opus55-default-effort | generation.effort.providerDefault | medium | RULE_CANDIDATE | 1 |
| anthropic-F-sonnet55-default-effort | generation.effort.providerDefault | high | RULE_CANDIDATE | 1 |
| anthropic-F-five-efforts | generation.effort.nativeValues | low, medium, high, xhigh, max (complete) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-four-efforts | generation.effort.nativeValues | low, medium, high, max (complete) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-opus45-efforts | generation.effort.nativeValues | low, medium, high (complete) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-effort-default-others | generation.effort.providerDefault | high | RULE_CANDIDATE | 1 |
| anthropic-F-sonnet55-output-limit | limits.output.maxTokens | 128000 | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-manual-budget-min | reasoning.budgetTokens.domain | minimum 1024; maximum unknown (partial_bounds) | RULE_CANDIDATE | 1 |
| anthropic-F-between-tools-constraints | ontology / lifecycle | UNKNOWN | ONTOLOGY_GAP | 0 |
| anthropic-F-mythos51-required | reasoning.required | true | RULE_CANDIDATE | 1 |
| anthropic-F-mythos51-output | modalities.output | text (complete) | RULE_CANDIDATE | 0 |
| anthropic-F-opus45-output | modalities.output | text (complete) | RULE_CANDIDATE | 0 |
| anthropic-F-all-thinking | reasoning.support | supported | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-adaptive-modes | reasoning.modes.nativeValues | adaptive (partial) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-sonnet55-modes | reasoning.modes.nativeValues | adaptive, between_tools (complete) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-46-modes | reasoning.modes.nativeValues | adaptive, enabled (partial) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-45-modes | reasoning.modes.nativeValues | enabled (partial) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-always-on-older | reasoning.required | true | RULE_CANDIDATE | 1 |
| anthropic-F-always-on-toggle | reasoning.toggle.support | unsupported | RULE_CANDIDATE | 1 |
| anthropic-F-optional-thinking | reasoning.required | false | RULE_CANDIDATE | 1 |
| anthropic-F-optional-toggle | reasoning.toggle.support | supported | RULE_CANDIDATE | 1 |
| anthropic-F-manual-budget-support | reasoning.budgetTokens.support | supported | RULE_CANDIDATE | 1 |
| anthropic-F-manual-budget-unsupported | reasoning.budgetTokens.support | unsupported | RULE_CANDIDATE | 1 |
| anthropic-F-large-output | limits.output.maxTokens | 128000 | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-small-output | limits.output.maxTokens | 64000 | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-sampling-removed | sampling.temperature.support | unsupported | RULE_CANDIDATE | 1 |
| anthropic-F-topk-removed | sampling.topK.support | unsupported | RULE_CANDIDATE | 1 |
| anthropic-F-thinking-display-and-binding | ontology / lifecycle | UNKNOWN | ONTOLOGY_GAP | 0 |
| anthropic-F-structured-all | structuredOutput.support | supported | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-code-execution-all | tools.codeExecution.support | supported | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-hosted-tool-versions | ontology / lifecycle | UNKNOWN | ONTOLOGY_GAP | 0 |
| anthropic-F-citations-active | documents.citations.support | supported | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-citations-structured-conflict | ontology / lifecycle | UNKNOWN | ONTOLOGY_GAP | 0 |
| anthropic-F-context-editing | contextManagement.support | supported | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-context-actions | contextManagement.actions.nativeValues | clear_tool_uses_20250919, clear_thinking_20251015 (partial) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-pdf-input-active | modalities.input | text, image, pdf (partial) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-attachments-active | input.attachments.support | supported | RULE_CANDIDATE | 1 |
| anthropic-F-document-format-constraints | ontology / lifecycle | UNKNOWN | ONTOLOGY_GAP | 0 |
| anthropic-F-opus55-websearch | search.web.support | supported | RULE_CANDIDATE | 0 |
| anthropic-F-webfilter-scope | ontology / lifecycle | UNKNOWN | ONTOLOGY_GAP | 0 |
| anthropic-F-active-toolcalling | tools.calling.support | supported | RULE_CANDIDATE | 1 |
| anthropic-F-active-output | modalities.output | text (complete) | RULE_CANDIDATE | 1 |
| anthropic-F-sdk-sampling-removal | ontology / lifecycle | UNKNOWN | ONTOLOGY_GAP | 0 |
| anthropic-F-active-operations | operations.supported | content_generate, token_count, request_batch (partial) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-compaction-action | contextManagement.actions.nativeValues | compact_20260112 (partial) | REDUNDANT_BUT_USEFUL | 0 |
| anthropic-F-legacy-temperature-support | sampling.temperature.support | supported | RULE_CANDIDATE | 1 |
| anthropic-F-legacy-temperature-default | sampling.temperature.providerDefault | 1 | RULE_CANDIDATE | 1 |
| anthropic-F-legacy-temperature-max | sampling.temperature.modelMaximum | 1 | RULE_CANDIDATE | 1 |
| anthropic-F-legacy-topk-support | sampling.topK.support | supported | RULE_CANDIDATE | 1 |
| anthropic-F-tooltraining-model-scope | tools.trainingForToolUse | UNKNOWN | AMBIGUOUS_DEFER | 0 |
| anthropic-F-context-1m | limits.contextWindow.maxTokens | 1000000 | RULE_CANDIDATE | 1 |
| anthropic-F-context-200k | limits.contextWindow.maxTokens | 200000 | RULE_CANDIDATE | 1 |
| anthropic-F-top-p-historical-default | sampling.topP.providerDefault | UNKNOWN | AMBIGUOUS_DEFER | 0 |
| anthropic-F-image-generation-scope | image.generation.support | UNKNOWN | AMBIGUOUS_DEFER | 0 |
| anthropic-F-modern-websearch | search.web.support | supported | RULE_CANDIDATE | 1 |
| anthropic-F-tool-web-reference-cycle | ontology / lifecycle | UNKNOWN | ONTOLOGY_GAP | 0 |
| anthropic-F-sonnet45-input | modalities.input | text, image (partial) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-sonnet45-output | modalities.output | text (complete) | RULE_CANDIDATE | 1 |
| anthropic-F-modern-context-actions | contextManagement.actions.nativeValues | clear_tool_uses_20250919, clear_thinking_20251015, compact_20260112 (partial) | REDUNDANT_BUT_USEFUL | 1 |
| anthropic-F-opus5-optional | reasoning.required | false | RULE_CANDIDATE | 1 |
| anthropic-F-opus5-toggle | reasoning.toggle.support | supported | RULE_CANDIDATE | 1 |
| anthropic-F-sonnet55-required-scope | reasoning.required | UNKNOWN | ONTOLOGY_GAP | 0 |
| anthropic-F-sonnet55-toggle-scope | reasoning.toggle.support | UNKNOWN | ONTOLOGY_GAP | 0 |
| anthropic-F-unknown-limits-input-maxTokens | limits.input.maxTokens | UNKNOWN | AMBIGUOUS_DEFER | 0 |
| anthropic-F-unknown-reasoning-effort-nativeValues | reasoning.effort.nativeValues | UNKNOWN | AMBIGUOUS_DEFER | 0 |
| anthropic-F-unknown-reasoning-effort-providerDefault | reasoning.effort.providerDefault | UNKNOWN | AMBIGUOUS_DEFER | 0 |
| anthropic-F-unknown-sampling-topK-providerDefault | sampling.topK.providerDefault | UNKNOWN | AMBIGUOUS_DEFER | 0 |
| anthropic-F-unknown-image-generation-aspectRatios | image.generation.aspectRatios | UNKNOWN | AMBIGUOUS_DEFER | 0 |
| anthropic-F-unknown-image-generation-resolutionPresets-nativeValues | image.generation.resolutionPresets.nativeValues | UNKNOWN | AMBIGUOUS_DEFER | 0 |
| anthropic-F-unknown-image-generation-resolutionPreset-providerDefault | image.generation.resolutionPreset.providerDefault | UNKNOWN | AMBIGUOUS_DEFER | 0 |
| anthropic-F-unknown-search-image-support | search.image.support | UNKNOWN | AMBIGUOUS_DEFER | 0 |
| anthropic-F-effort-no-control-models | generation.effort.nativeValues | UNKNOWN | ONTOLOGY_GAP | 0 |
| anthropic-F-mythos-preview-temporal | ontology / lifecycle | UNKNOWN | TEMPORALLY_UNSAFE | 0 |

## Regex analysis

Regex and exact selectors were both considered. Current identity grammar is stronger than future capability inheritance. Neither pattern was emitted as a Rule.

| Pattern | Positive examples | Negative examples | Decoder | Future inheritance |
| --- | --- | --- | --- | --- |
| `^claude-opus-4-[678]$` | claude-opus-4-6, claude-opus-4-7, claude-opus-4-8 | claude-opus-4-5-20251101, claude-opus-5, claude-sonnet-4-6, claude-opus-4-8-preview | accepted | KNOWN_MEMBERS_ONLY; not FUTURE_SERIES_SAFE |
| `^claude-haiku-4-5-[0-9]{8}$` | claude-haiku-4-5-20251001 | claude-haiku-4-5, claude-haiku-3-5-20241022, claude-haiku-4-5-preview, claude-haiku-4-5-20251001-foo | accepted | UNKNOWN; not FUTURE_SERIES_SAFE |

The Opus range only compresses known members and masks important per-capability differences. The Haiku dated grammar has one known official snapshot; a future date is a new pinned release, not proof of identical capabilities. A matching regex would still require an authoritative Native subject and independent coordinator approval.

## Source conflicts and temporal review

- **anthropic-C001**: Older /docs/about-claude indexed page is stale relative to current canonical URL. Proposed disposition: Live E002 history explicitly dates Sonnet4.5 deprecation2026-09-30 and Opus4.1 retirement2026-08-05; use current lifecycle for those known IDs. Old indexed copy remains historical only.
- **anthropic-C002**: Exa cached first-party pages omit newer 5.5 IDs and still label Sonnet 4.5 active. Proposed disposition: Use live direct first-party model pages; Exa discovery only where stale.
- **anthropic-C003**: Old URL states June 30 retirement; live table says deprecated/TBA without explicit rescission. Proposed disposition: AMBIGUOUS_DEFER or TEMPORALLY_UNSAFE for preview facts; require coordinator lifecycle review.
- **anthropic-C004**: Autogenerated Opus5 APIexample sends forbiddentopK/topP;schema fixture is not guaranteed valid request. Proposed disposition: Use explicit rejection prose, never examples as capability observations.
- **anthropic-C005**: Doc reorganization left circular model compatibility pointer. Proposed disposition: 4.6+ claim and Opus5.5example suffice onlytheirscopes; olderbasic supportremainsunresolved.

Version-bound facts are reviewed as of this date, with a proposed recheck of **2026-10-16**. This is a research review schedule, not provider evidence of validity through that date. Unknown validFrom/validThrough values remain null.

Sonnet 4.5 facts and evidence notes carry deprecation 2026-09-30, retirement 2026-11-30, replacement Sonnet 5.5, and REQUIRES_EXPIRY_REVIEW. Mixed model groups carry structured perModelTemporal entries; their overall expiry flag conservatively requires review for the group. The current Rule schema has no expiry field and was not changed.

Preview retirement is unresolved. Beta/tool-version and organization settings are request conditions, not permanent model capabilities or API-version guarantees. No guarantee was inferred from old pricing promotions, archived system prompts, a current SDK enumeration, or generated request examples.

## Facts not converted / ontology gaps

Null facts preserve uncertainty for input maximums, independent reasoning effort, topP/topK defaults, exact model tool-training scope, image generation and its aspect/resolution controls, and image search. Silence was never converted to unsupported.

The 11 ontology-gap records retain provider-native concepts, source URLs, why existing paths are insufficient, and possible future representation directions. They include cross-parameter thinking conditions, tool versions/hosted subfeatures, thinking display/binding, citations versus structured output, document-format restrictions, SDK-only parameter removal, and effort-unsupported releases. No ontology paths were added.

Mythos Preview is TEMPORALLY_UNSAFE. Old aliases have documented targets but unverified authoritative subject membership. Retired models have no capability Rules.

## Official source ledger

The full JSONL contains freshness, surface/version fields, exact-ID versus researcher-mapped release scope, null unknown metadata, claim candidates, and counterevidence links. This index makes the research independently reviewable.

| Evidence | Official source | Retrieved at UTC |
| --- | --- | --- |
| anthropic-E001 | [Models overview](https://platform.claude.com/docs/en/models/overview) | 2026-10-02T05:13:01.006Z |
| anthropic-E002 | [Model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations) | 2026-10-02T05:15:05.567Z |
| anthropic-E003 | [Model IDs and versioning](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions) | 2026-10-02T05:15:05.567Z |
| anthropic-E004 | [List Models](https://platform.claude.com/docs/en/api/models/list) | 2026-10-02T05:17:10.887Z |
| anthropic-E005 | [fable-5-1 model overview](https://platform.claude.com/docs/en/models/fable-5-1/overview) | 2026-10-02T05:17:10.887Z |
| anthropic-E006 | [opus-5-5 model overview](https://platform.claude.com/docs/en/models/opus-5-5/overview) | 2026-10-02T05:17:10.887Z |
| anthropic-E007 | [sonnet-5-5 model overview](https://platform.claude.com/docs/en/models/sonnet-5-5/overview) | 2026-10-02T05:17:10.887Z |
| anthropic-E008 | [haiku-4-5 model overview](https://platform.claude.com/docs/en/models/haiku-4-5/overview) | 2026-10-02T05:17:10.887Z |
| anthropic-E009 | [Claude API errors](https://platform.claude.com/docs/en/api/errors) | 2026-10-02T05:18:56.626Z |
| anthropic-E010 | [Claude Platform release notes](https://platform.claude.com/docs/en/release-notes/overview) | 2026-10-02T05:18:56.626Z |
| anthropic-E011 | [API usage primer](https://platform.claude.com/docs/en/claude_api_primer) | 2026-10-02T05:18:56.626Z |
| anthropic-E012 | [Effort](https://platform.claude.com/docs/en/build-with-claude/effort) | 2026-10-02T05:20:25.718Z |
| anthropic-E013 | [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) | 2026-10-02T05:20:25.718Z |
| anthropic-E014 | [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows) | 2026-10-02T05:21:02.353Z |
| anthropic-E015 | [Claude Opus 4.5](https://platform.claude.com/docs/en/models/opus-4-5/overview) | 2026-10-02T05:21:02.353Z |
| anthropic-E016 | [Claude Mythos5.1](https://platform.claude.com/docs/en/models/mythos-5-1/overview) | 2026-10-02T05:21:02.353Z |
| anthropic-E017 | [Thinking](https://platform.claude.com/docs/en/about-claude/models/extended-thinking-models) | 2026-10-02T05:22:40.724Z |
| anthropic-E018 | [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) | 2026-10-02T05:23:31.034Z |
| anthropic-E019 | [Code execution tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool) | 2026-10-02T05:23:31.034Z |
| anthropic-E020 | [Tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) | 2026-10-02T05:23:31.034Z |
| anthropic-E021 | [What's new in Sonnet5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5) | 2026-10-02T05:23:31.034Z |
| anthropic-E022 | [Citations](https://platform.claude.com/docs/en/build-with-claude/citations) | 2026-10-02T05:24:03.101Z |
| anthropic-E023 | [Files API](https://platform.claude.com/docs/en/build-with-claude/files) | 2026-10-02T05:24:03.101Z |
| anthropic-E024 | [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing) | 2026-10-02T05:24:38.442Z |
| anthropic-E025 | [PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support) | 2026-10-02T05:25:08.951Z |
| anthropic-E026 | [Web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) | 2026-10-02T05:26:12.522Z |
| anthropic-E027 | [Release notes additional current entries](https://platform.claude.com/docs/en/release-notes/overview) | 2026-10-02T05:30:33.602Z |
| anthropic-E028 | [Intro to Claude](https://platform.claude.com/docs/en/intro) | 2026-10-02T05:30:33.602Z |
| anthropic-E029 | [Live batch processing guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing) | 2026-10-02T05:31:29.344Z |
| anthropic-E030 | [Token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting) | 2026-10-02T05:31:29.344Z |
| anthropic-E031 | [Compaction at token threshold](https://platform.claude.com/docs/en/build-with-claude/compaction-threshold) | 2026-10-02T05:31:29.344Z |
| anthropic-E032 | [Compaction on demand](https://platform.claude.com/docs/en/build-with-claude/compaction-on-demand) | 2026-10-02T05:31:29.344Z |
| anthropic-E033 | [HTTP Messages create reference](https://platform.claude.com/docs/en/api/messages/create) | 2026-10-02T05:33:46.346Z |
| anthropic-E034 | [How tool use works](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works) | 2026-10-02T05:33:46.352Z |
| anthropic-E035 | [Current pricing and context eligibility](https://platform.claude.com/docs/en/about-claude/pricing) | 2026-10-02T05:34:46.781Z |
| anthropic-E036 | [Technical context-limit corroboration](https://platform.claude.com/docs/en/build-with-claude/context-windows) | 2026-10-02T05:34:46.782Z |
| anthropic-E037 | [Live tool reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference) | 2026-10-02T05:35:51.466Z |
| anthropic-E038 | [Claude Opus5 legacy model page](https://platform.claude.com/docs/en/models/opus-5/overview) | 2026-10-02T05:37:52.538Z |
| anthropic-E039 | [Claude Sonnet4.6 legacy model page](https://platform.claude.com/docs/en/models/sonnet-4-6/overview) | 2026-10-02T05:37:52.538Z |
| anthropic-E040 | [Migrating to Fable5/Mythos5](https://platform.claude.com/docs/en/models/fable-5/migration-guide) | 2026-10-02T05:37:52.538Z |
| anthropic-E041 | [Introducing Fable5/Mythos5](https://platform.claude.com/docs/en/models/fable-5/introducing-claude-fable-5-and-claude-mythos-5) | 2026-10-02T05:37:52.538Z |
| anthropic-E042 | [Claude Opus4.6](https://platform.claude.com/docs/en/models/opus-4-6/overview) | 2026-10-02T05:38:16.708Z |
| anthropic-E043 | [Claude Sonnet5](https://platform.claude.com/docs/en/models/sonnet-5/overview) | 2026-10-02T05:38:16.708Z |
| anthropic-E044 | [Claude Fable5](https://platform.claude.com/docs/en/models/fable-5/overview) | 2026-10-02T05:38:16.708Z |
| anthropic-E045 | [Claude Mythos5](https://platform.claude.com/docs/en/models/mythos-5/overview) | 2026-10-02T05:38:16.708Z |
| anthropic-E046 | [Live opus-4-8 model page](https://platform.claude.com/docs/en/models/opus-4-8/overview) | 2026-10-02T05:38:49.398Z |
| anthropic-E047 | [Live opus-4-7 model page](https://platform.claude.com/docs/en/models/opus-4-7/overview) | 2026-10-02T05:38:52.640Z |
| anthropic-E048 | [Live sonnet-4-5 model page](https://platform.claude.com/docs/en/models/sonnet-4-5/overview) | 2026-10-02T05:38:55.369Z |
| anthropic-E049 | [Opus4.5 retirement commitment live reread](https://platform.claude.com/docs/en/models/opus-4-5/overview) | 2026-10-02T05:43:10.335Z |
| anthropic-E050 | [Mythos5.1 retirement commitment live reread](https://platform.claude.com/docs/en/models/mythos-5-1/overview) | 2026-10-02T05:43:13.546Z |

## Validation and next step

Executed:

`node docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/anthropic-validate.cjs`

The helper transpiles and loads the actual pure Rule decoder and ontology modules; it does not load a database or mutate files. Final run at **2026-10-02T05:52:35.002Z** passed: 49 Rules, 79 facts, 50 evidence records, 36 paths, 332 exact model/path claims, all fact/evidence traces, both regex grammar probes, and zero duplicate model/path claims. No better-sqlite3 ABI repair was needed or performed.

The coordinator's exact next step is to join the 576-row coverage matrix to the observed sanitized Native payload, independently review all pending INFERRED_HIGH joins and redundancy benefits, decide conditional reasoning semantics and Sonnet 4.5 expiry treatment, and resolve the preview lifecycle conflict before assembling any final corpus.

- Do authoritative account-specific Native snapshots include all documented models and any aliases? Coordinator examines existing sanitized models.list payload without creating identities or re-fetching with unapproved credentials.
- Which mapped values are observed/current, and which Cloud fallbacks add value? Join coverageMatrix with real Provider Native snapshot; justify REDUNDANT_BUT_USEFUL before corpus inclusion.
- How should Sonnet5.5 required/toggle and effort-dependent Opus5 disable be represented? Coordinator reviews ontology semantics against E017/E021; retain crossparameter constraints.
- Is deprecated MythosPreview still callable and when does it retire? Find explicit first-party rescission/new retirement notice; defer preview until lifecycle verdict.
- Which older model IDs currently support basic hosted websearch? Resolve circular E026/E037 compatibility pointer via current official release/tool matrix; do not infer from ordinary toolcalling.
- What are current exact input maximums, topP/topK defaults and exact tool-training model scope? Native observed payload plus current per-model/API statements needed; preserve nulls otherwise.
- Do any constrained series selectors safely inherit future capabilities? Current evidence only supports known members; independent coordinator review required if regex is reproposed.
- Should Sonnet4.5 Rules enter a pack lacking expiry enforcement? Coordinator owns REQUIRES_EXPIRY_REVIEW lifecycle decision beforepublication; retirement2026-11-30.

No final selection, activation, publication, or cross-provider policy decision is made in this handoff.
