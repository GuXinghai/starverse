# OpenAI Responses research

> Historical provider handoff: targeted disposition changes and current counts are recorded in [the 2026-10-02 repair](../repairs/disposition-20261002/report.md). Current facts, proposals and final dispositions include that repair; original source captures remain historical.

Status: research proposal; not production authority. Date: 2026-10-02.

Scope: openai / openai-api-v1; execution openai_responses; native openai-models-v1. All eight current contract files read. Candidate shape: array of actual CapabilityRuleCorePackV1 Packs.

## Inventory

- gpt-6-astra | catalog_listed | Responses true | shutdown unknown
- gpt-6.1-sol | catalog_listed | Responses true | shutdown unknown
- gpt-6-sol | catalog_listed | Responses true | shutdown unknown
- gpt-6-luna | catalog_listed | Responses true | shutdown unknown
- gpt-5.6-sol | catalog_listed | Responses true | shutdown unknown
- gpt-5.6-terra | catalog_listed | Responses true | shutdown unknown
- gpt-5.6-luna | catalog_listed | Responses true | shutdown unknown
- gpt-5.5 | catalog_listed | Responses true | shutdown unknown
- gpt-5.5-pro | catalog_listed | Responses true | shutdown unknown
- gpt-5.4 | catalog_listed | Responses true | shutdown unknown
- gpt-5.4-pro | catalog_listed | Responses true | shutdown unknown
- gpt-5.4-mini | catalog_listed | Responses true | shutdown unknown
- gpt-5.2 | catalog_listed | Responses documented_enabled_endpoint_glyph | shutdown unknown
- gpt-5.2-pro | catalog_listed | Responses true | shutdown unknown
- gpt-5 | deprecated_alias | Responses documented_enabled_endpoint_glyph | shutdown unknown
- gpt-5-mini | deprecated_alias | Responses documented_enabled_endpoint_glyph | shutdown unknown
- gpt-5-nano | deprecated_alias | Responses documented_enabled_endpoint_glyph | shutdown unknown
- gpt-5-pro | deprecated_alias | Responses true | shutdown unknown
- o3-pro | deprecated_alias | Responses true | shutdown unknown
- o3 | deprecated_alias | Responses documented_enabled_endpoint_glyph | shutdown unknown
- gpt-4.1 | catalog_listed | Responses documented_enabled_endpoint_glyph | shutdown unknown
- gpt-4.1-mini | catalog_listed | Responses documented_enabled_endpoint_glyph | shutdown unknown
- gpt-4o-mini | catalog_listed | Responses documented_enabled_endpoint_glyph | shutdown unknown
- gpt-4o | catalog_listed | Responses documented_enabled_endpoint_glyph | shutdown unknown
- chat-latest | catalog_listed | Responses documented | shutdown unknown
- gpt-image-2.5-sunburst | catalog_listed | Responses tool_model_only | shutdown unknown
- gpt-image-2.5-flare | catalog_listed | Responses tool_model_only | shutdown unknown
- gpt-image-2 | catalog_listed | Responses unproven_from_endpoint_list | shutdown unknown
- gpt-live-1 | catalog_listed | Responses unproven_from_endpoint_list | shutdown unknown
- gpt-realtime-2.1 | catalog_listed | Responses unproven_from_endpoint_list | shutdown unknown
- gpt-realtime-2.1-mini | catalog_listed | Responses unproven_from_endpoint_list | shutdown unknown
- gpt-realtime-2 | catalog_listed | Responses null | shutdown unknown
- gpt-realtime-translate | catalog_listed | Responses null | shutdown unknown
- gpt-live-transcribe | catalog_listed | Responses null | shutdown unknown
- gpt-realtime-whisper | catalog_listed | Responses null | shutdown unknown
- gpt-realtime-1.5 | catalog_listed | Responses null | shutdown unknown
- gpt-audio-1.5 | catalog_listed | Responses unproven_from_endpoint_list | shutdown unknown
- gpt-transcribe | catalog_listed | Responses unproven_from_endpoint_list | shutdown unknown
- gpt-4o-transcribe | deprecation_documented | Responses null | shutdown 2027-02-25
- gpt-4o-mini-transcribe | deprecation_documented | Responses null | shutdown 2027-02-25
- gpt-4o-transcribe-diarize | deprecation_documented | Responses null | shutdown 2027-02-25
- whisper-1 | deprecation_documented | Responses null | shutdown 2027-02-25
- gpt-4o-mini-tts | catalog_listed | Responses null | shutdown unknown
- gpt-5.6-cyber | catalog_listed | Responses documented | shutdown unknown
- gpt-daybreak-red-latest | catalog_listed | Responses documented | shutdown unknown
- gpt-daybreak-blue-latest | catalog_listed | Responses documented | shutdown unknown
- gpt-rosalind-research | catalog_listed | Responses null | shutdown unknown
- gpt-oss-120b | catalog_listed | Responses unproven_from_endpoint_list | shutdown unknown
- gpt-oss-20b | catalog_listed | Responses null | shutdown unknown
- text-embedding-3-large | catalog_listed | Responses unproven_from_endpoint_list | shutdown unknown
- text-embedding-3-small | catalog_listed | Responses null | shutdown unknown
- text-embedding-ada-002 | catalog_listed | Responses null | shutdown unknown
- omni-moderation-latest | catalog_listed | Responses unproven_from_endpoint_list | shutdown unknown
- gpt-5.4-nano | deprecated | Responses null | shutdown unknown
- gpt-5.3-codex | deprecated | Responses null | shutdown unknown
- gpt-5.1 | deprecated | Responses null | shutdown unknown
- gpt-realtime | deprecation_documented | Responses null | shutdown 2027-01-19
- gpt-audio | deprecation_documented | Responses null | shutdown 2027-01-19
- tts-1 | deprecated | Responses null | shutdown unknown
- tts-1-hd | deprecated | Responses null | shutdown unknown
- gpt-5.3-chat-latest | retired | Responses null | shutdown 2026-08-09
- gpt-5.2-chat-latest | retired | Responses null | shutdown 2026-08-09
- gpt-5.2-codex | retired | Responses null | shutdown 2026-07-22
- gpt-image-1.5 | deprecation_documented | Responses null | shutdown 2026-11-30
- chatgpt-image-latest | deprecation_documented | Responses null | shutdown 2026-11-30
- gpt-image-1-mini | deprecation_documented | Responses null | shutdown 2026-11-30
- gpt-image-1 | deprecation_documented | Responses null | shutdown 2026-10-22
- o3-deep-research | retired | Responses unproven_from_endpoint_list | shutdown 2026-07-22
- o4-mini-deep-research | retired | Responses unproven_from_endpoint_list | shutdown 2026-07-22
- gpt-4.1-nano | deprecation_documented | Responses null | shutdown 2026-10-22
- o4-mini | deprecation_documented | Responses unproven_from_endpoint_list | shutdown 2026-10-22
- o1-pro | deprecation_documented | Responses documented | shutdown 2026-10-22
- computer-use-preview | retired | Responses null | shutdown 2026-07-22
- gpt-realtime-mini | deprecation_documented | Responses null | shutdown 2027-01-19
- gpt-audio-mini | deprecation_documented | Responses null | shutdown 2027-01-19
- gpt-4o-mini-search-preview | deprecated | Responses null | shutdown unknown
- gpt-4o-search-preview | deprecated | Responses null | shutdown unknown
- gpt-4.5-preview | retired | Responses null | shutdown 2025-07-14
- o3-mini | deprecation_documented | Responses unproven_from_endpoint_list | shutdown 2026-10-22
- o1 | deprecation_documented | Responses unproven_from_endpoint_list | shutdown 2026-10-22
- o1-mini | retired | Responses null | shutdown 2025-10-27
- o1-preview | retired | Responses null | shutdown 2025-07-28
- gpt-4o-audio-preview | retired | Responses null | shutdown 2026-05-07
- gpt-4o-mini-audio-preview | retired | Responses null | shutdown 2026-05-07
- gpt-4o-mini-realtime-preview | retired | Responses null | shutdown 2026-05-07
- gpt-4o-realtime-preview | retired | Responses null | shutdown 2026-05-07
- gpt-4-turbo | deprecation_documented | Responses null | shutdown 2026-10-22
- babbage-002 | retired | Responses null | shutdown 2026-09-28
- chatgpt-4o-latest | retired | Responses null | shutdown 2026-02-17
- gpt-5.1-codex | retired | Responses null | shutdown 2026-07-22
- gpt-5.1-codex-max | retired | Responses null | shutdown 2026-07-22
- gpt-5.1-codex-mini | retired | Responses null | shutdown 2026-07-22
- gpt-5-codex | retired | Responses null | shutdown 2026-07-22
- codex-mini-latest | retired | Responses null | shutdown 2026-02-12
- davinci-002 | retired | Responses null | shutdown 2026-09-28
- gpt-3.5-turbo | deprecation_documented | Responses null | shutdown 2026-10-22
- gpt-4 | deprecation_documented | Responses null | shutdown 2026-10-22
- gpt-4-turbo-preview | retired | Responses null | shutdown 2026-03-26
- gpt-5.1-chat-latest | retired | Responses null | shutdown 2026-07-22
- gpt-5-chat-latest | retired | Responses null | shutdown 2026-07-22
- text-moderation-latest | retired | Responses null | shutdown 2025-10-27
- text-moderation-stable | retired | Responses null | shutdown 2025-10-27
- gpt-5.4-cyber | retired | Responses null | shutdown 2026-09-30
- gpt-4o-audio | deprecation_documented | Responses null | shutdown 2027-01-19
- gpt-4o-realtime | deprecation_documented | Responses null | shutdown 2027-01-19
- gpt-4o-mini-realtime | deprecation_documented | Responses null | shutdown 2027-01-19
- gpt-4o-mini-audio | deprecation_documented | Responses null | shutdown 2027-01-19
- gpt-4o-mini-transcribe-2025-03-20 | deprecation_documented | Responses null | shutdown 2027-01-19
- gpt-5-2025-08-07 | deprecation_documented | Responses null | shutdown 2026-12-10
- gpt-5-mini-2025-08-07 | deprecation_documented | Responses null | shutdown 2026-12-10
- gpt-5-nano-2025-08-07 | deprecation_documented | Responses null | shutdown 2026-12-10
- gpt-5-pro-2025-10-06 | deprecation_documented | Responses null | shutdown 2026-12-10
- o3-2025-04-16 | deprecation_documented | Responses null | shutdown 2026-12-10
- o3-pro-2025-06-10 | deprecation_documented | Responses null | shutdown 2026-12-10
- gpt-3.5-turbo-0125 | deprecation_documented | Responses null | shutdown 2026-10-22
- gpt-4-0613 | deprecation_documented | Responses null | shutdown 2026-10-22
- gpt-4-1106-preview | deprecation_documented | Responses null | shutdown 2026-10-22
- gpt-4o-2024-05-13 | deprecation_documented | Responses null | shutdown 2026-10-22
- o1-2024-12-17 | deprecation_documented | Responses null | shutdown 2026-10-22
- o1-pro-2025-03-19 | deprecation_documented | Responses null | shutdown 2026-10-22
- o3-mini-2025-01-31 | deprecation_documented | Responses null | shutdown 2026-10-22
- o4-mini-2025-04-16 | deprecation_documented | Responses null | shutdown 2026-10-22
- sora-2 | retired | Responses null | shutdown 2026-09-24
- sora-2-pro | retired | Responses null | shutdown 2026-09-24
- sora-2-2025-10-06 | retired | Responses null | shutdown 2026-09-24
- sora-2-2025-12-08 | retired | Responses null | shutdown 2026-09-24
- sora-2-pro-2025-10-06 | retired | Responses null | shutdown 2026-09-24
- gpt-3.5-turbo-instruct | retired | Responses null | shutdown 2026-09-28
- gpt-3.5-turbo-1106 | retired | Responses null | shutdown 2026-09-28
- gpt-4o-mini-search-preview-2025-03-11 | retired | Responses null | shutdown 2026-07-22
- gpt-4o-search-preview-2025-03-11 | retired | Responses null | shutdown 2026-07-22
- gpt-audio-mini-2025-10-06 | retired | Responses null | shutdown 2026-07-22
- gpt-realtime-mini-2025-10-06 | retired | Responses null | shutdown 2026-07-22
- o3-deep-research-2025-06-26 | retired | Responses null | shutdown 2026-07-22
- o4-mini-deep-research-2025-06-26 | retired | Responses null | shutdown 2026-07-22
- dall-e-2 | retired | Responses null | shutdown 2026-05-12
- dall-e-3 | retired | Responses null | shutdown 2026-05-12
- gpt-4-0314 | retired | Responses null | shutdown 2026-03-26
- gpt-4-0125-preview | retired | Responses null | shutdown 2026-03-26
- gpt-4o-realtime-preview-2025-06-03 | retired | Responses null | shutdown 2026-05-07
- gpt-4o-realtime-preview-2024-12-17 | retired | Responses null | shutdown 2026-05-07
- gpt-4o-realtime-preview-2024-10-01 | retired | Responses null | shutdown 2025-10-10
- gpt-4o-audio-preview-2024-10-01 | retired | Responses null | shutdown 2025-10-10
- text-moderation-007 | retired | Responses null | shutdown 2025-10-27
- gpt-4-32k | retired | Responses null | shutdown 2025-06-06
- gpt-4-32k-0613 | retired | Responses null | shutdown 2025-06-06
- gpt-4-32k-0314 | retired | Responses null | shutdown 2025-06-06
- gpt-4-vision-preview | retired | Responses null | shutdown 2024-12-06
- gpt-4-1106-vision-preview | retired | Responses null | shutdown 2024-12-06
- gpt-3.5-turbo-0613 | retired | Responses null | shutdown 2024-09-13
- gpt-3.5-turbo-16k-0613 | retired | Responses null | shutdown 2024-09-13
- text-ada-001 | retired | Responses null | shutdown 2024-01-04
- text-babbage-001 | retired | Responses null | shutdown 2024-01-04
- text-curie-001 | retired | Responses null | shutdown 2024-01-04
- text-davinci-001 | retired | Responses null | shutdown 2024-01-04
- text-davinci-002 | retired | Responses null | shutdown 2024-01-04
- text-davinci-003 | retired | Responses null | shutdown 2024-01-04
- babbage | retired | Responses null | shutdown 2024-01-04
- davinci | retired | Responses null | shutdown 2024-01-04
- text-davinci-edit-001 | retired | Responses null | shutdown 2024-01-04
- text-similarity-ada-001 | retired | Responses null | shutdown 2024-01-04
- text-search-ada-doc-001 | retired | Responses null | shutdown 2024-01-04
- text-search-ada-query-001 | retired | Responses null | shutdown 2024-01-04
- text-similarity-babbage-001 | retired | Responses null | shutdown 2024-01-04
- text-search-babbage-doc-001 | retired | Responses null | shutdown 2024-01-04
- text-search-babbage-query-001 | retired | Responses null | shutdown 2024-01-04
- text-similarity-curie-001 | retired | Responses null | shutdown 2024-01-04
- text-search-curie-doc-001 | retired | Responses null | shutdown 2024-01-04
- text-search-curie-query-001 | retired | Responses null | shutdown 2024-01-04
- text-similarity-davinci-001 | retired | Responses null | shutdown 2024-01-04
- text-search-davinci-doc-001 | retired | Responses null | shutdown 2024-01-04
- text-search-davinci-query-001 | retired | Responses null | shutdown 2024-01-04
- gpt-3.5-turbo-0301 | retired | Responses null | shutdown 2024-09-13
- gpt-5.5-2026-04-23 | documented_snapshot | Responses null | shutdown unknown
- gpt-5.5-pro-2026-04-23 | documented_snapshot | Responses null | shutdown unknown
- gpt-5.4-2026-03-05 | documented_snapshot | Responses null | shutdown unknown
- gpt-5.4-pro-2026-03-05 | documented_snapshot | Responses null | shutdown unknown
- gpt-5.4-mini-2026-03-17 | documented_snapshot | Responses null | shutdown unknown
- gpt-5.2-2025-12-11 | documented_snapshot | Responses null | shutdown unknown
- gpt-5.2-pro-2025-12-11 | documented_snapshot | Responses null | shutdown unknown
- gpt-4.1-2025-04-14 | documented_snapshot | Responses null | shutdown unknown
- gpt-4.1-mini-2025-04-14 | documented_snapshot | Responses null | shutdown unknown
- gpt-4o-2024-08-06 | documented_snapshot | Responses null | shutdown unknown
- gpt-4o-2024-11-20 | documented_snapshot | Responses null | shutdown unknown
- gpt-4o-mini-2024-07-18 | documented_snapshot | Responses null | shutdown unknown
- gpt-3.5-turbo-completions | deprecation_documented | Responses null | shutdown 2026-10-22
- gpt-4-0613-completions | deprecation_documented | Responses null | shutdown 2026-10-22
- gpt-4-completions | deprecation_documented | Responses null | shutdown 2026-10-22
- gpt-4-turbo-2024-04-09 | deprecation_documented | Responses null | shutdown 2026-10-22
- gpt-4-turbo-completions | deprecation_documented | Responses null | shutdown 2026-10-22
- gpt-4.1-nano-2025-04-14 | deprecation_documented | Responses null | shutdown 2026-10-22
- ft-o4-mini-2025-04-16 | deprecation_documented | Responses null | shutdown 2026-10-22
- ft-gpt-3.5-turbo | deprecation_documented | Responses null | shutdown 2026-10-22
- ft-gpt-4 | deprecation_documented | Responses null | shutdown 2026-10-22
- ft-gpt-4.1-nano-2025-04-14 | deprecation_documented | Responses null | shutdown 2026-10-22
- ft-babbage-002 | deprecation_documented | Responses null | shutdown 2026-10-22
- ft-davinci-002 | deprecation_documented | Responses null | shutdown 2026-10-22
- computer-use-preview-2025-03-11 | retired | Responses null | shutdown 2026-07-22
- gpt-4-turbo-preview-completions | retired | Responses null | shutdown 2026-03-26
- ada | retired | Responses null | shutdown 2024-01-04
- curie | retired | Responses null | shutdown 2024-01-04
- code-davinci-002 | retired | Responses null | shutdown 2024-01-04
- code-davinci-edit-001 | retired | Responses null | shutdown 2024-01-04
- code-search-ada-code-001 | retired | Responses null | shutdown 2024-01-04
- code-search-ada-text-001 | retired | Responses null | shutdown 2024-01-04
- code-search-babbage-code-001 | retired | Responses null | shutdown 2024-01-04
- code-search-babbage-text-001 | retired | Responses null | shutdown 2024-01-04
- code-davinci-001 | retired | Responses null | shutdown 2023-03-23
- code-cushman-002 | retired | Responses null | shutdown 2023-03-23
- code-cushman-001 | retired | Responses null | shutdown 2023-03-23

## Adapter comparison

Native OpenAI is identity-only, mappings empty; models.dev static mappings cover limits/modalities/supports and reasoning toggle/effort/budget. Actual public models.dev rows were transformed by the current adapter in memory (snapshot retrieved 2026-10-02T05:12:03.622Z, SHA256 0be6fdc12df0bb20ec424d59083b97f6792f9d1abc62a0d93f064ce87604dd4a). ALREADY_MODELS_DEV is based on that published snapshot, not local database state. Rule candidates provide documented fallback plus defaults/effort/tool semantics unavailable in native listing. No runtime API call or database read.

## Canonical coverage

All 36 paths are recorded at 29 exact model IDs (see facts.coverageMatrix for per-model values and source states). Null fields are deliberate unknowns; native identity-only and generic API support remain separate. 20 high-confidence attachment applicability audits await coordinator review with no inferred Rule emitted.

## Findings and fact classifications

- openai.gpt-6-astra.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-6-astra
- openai.gpt-6-astra.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-6-astra
- openai.gpt-6-astra.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-6-astra
- openai.gpt-6-astra.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-6-astra
- openai.gpt-6-astra.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-6-astra
- openai.gpt-6-astra.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-6-astra
- openai.gpt-6-astra.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-6-astra
- openai.gpt-6-astra.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-6-astra
- openai.gpt-6-astra.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-6-astra
- openai.gpt-6-astra.search.web.support | search.web.support | RULE_CANDIDATE | gpt-6-astra
- openai.gpt-6.1-sol.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-6.1-sol
- openai.gpt-6.1-sol.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-6.1-sol
- openai.gpt-6.1-sol.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-6.1-sol
- openai.gpt-6.1-sol.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-6.1-sol
- openai.gpt-6.1-sol.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-6.1-sol
- openai.gpt-6.1-sol.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-6.1-sol
- openai.gpt-6.1-sol.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-6.1-sol
- openai.gpt-6.1-sol.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-6.1-sol
- openai.gpt-6.1-sol.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-6.1-sol
- openai.gpt-6.1-sol.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-6.1-sol
- openai.gpt-6-sol.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-6-sol
- openai.gpt-6-sol.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-6-sol
- openai.gpt-6-sol.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-6-sol
- openai.gpt-6-sol.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-6-sol
- openai.gpt-6-sol.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-6-sol
- openai.gpt-6-sol.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-6-sol
- openai.gpt-6-sol.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-6-sol
- openai.gpt-6-sol.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-6-sol
- openai.gpt-6-sol.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-6-sol
- openai.gpt-6-sol.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-6-sol
- openai.gpt-6-sol.search.web.support | search.web.support | RULE_CANDIDATE | gpt-6-sol
- openai.gpt-6-luna.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-6-luna
- openai.gpt-6-luna.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-6-luna
- openai.gpt-6-luna.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-6-luna
- openai.gpt-6-luna.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-6-luna
- openai.gpt-6-luna.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-6-luna
- openai.gpt-6-luna.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-6-luna
- openai.gpt-6-luna.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-6-luna
- openai.gpt-6-luna.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-6-luna
- openai.gpt-6-luna.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-6-luna
- openai.gpt-6-luna.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-6-luna
- openai.gpt-6-luna.search.web.support | search.web.support | RULE_CANDIDATE | gpt-6-luna
- openai.gpt-5.6-sol.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-5.6-sol
- openai.gpt-5.6-sol.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-5.6-sol
- openai.gpt-5.6-sol.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5.6-sol
- openai.gpt-5.6-sol.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-5.6-sol
- openai.gpt-5.6-sol.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-5.6-sol
- openai.gpt-5.6-sol.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-5.6-sol
- openai.gpt-5.6-sol.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-5.6-sol
- openai.gpt-5.6-sol.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-5.6-sol
- openai.gpt-5.6-sol.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-5.6-sol
- openai.gpt-5.6-sol.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-5.6-sol
- openai.gpt-5.6-sol.search.web.support | search.web.support | RULE_CANDIDATE | gpt-5.6-sol
- openai.gpt-5.6-terra.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-5.6-terra
- openai.gpt-5.6-terra.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-5.6-terra
- openai.gpt-5.6-terra.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5.6-terra
- openai.gpt-5.6-terra.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-5.6-terra
- openai.gpt-5.6-terra.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-5.6-terra
- openai.gpt-5.6-terra.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-5.6-terra
- openai.gpt-5.6-terra.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-5.6-terra
- openai.gpt-5.6-terra.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-5.6-terra
- openai.gpt-5.6-terra.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-5.6-terra
- openai.gpt-5.6-terra.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-5.6-terra
- openai.gpt-5.6-terra.search.web.support | search.web.support | RULE_CANDIDATE | gpt-5.6-terra
- openai.gpt-5.6-luna.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-5.6-luna
- openai.gpt-5.6-luna.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-5.6-luna
- openai.gpt-5.6-luna.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5.6-luna
- openai.gpt-5.6-luna.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-5.6-luna
- openai.gpt-5.6-luna.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-5.6-luna
- openai.gpt-5.6-luna.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-5.6-luna
- openai.gpt-5.6-luna.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-5.6-luna
- openai.gpt-5.6-luna.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-5.6-luna
- openai.gpt-5.6-luna.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-5.6-luna
- openai.gpt-5.6-luna.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-5.6-luna
- openai.gpt-5.6-luna.search.web.support | search.web.support | RULE_CANDIDATE | gpt-5.6-luna
- openai.gpt-6-astra.sampling.temperature.support | sampling.temperature.support | ALREADY_MODELS_DEV | gpt-6-astra
- openai.gpt-6.1-sol.sampling.temperature.support | sampling.temperature.support | ALREADY_MODELS_DEV | gpt-6.1-sol
- openai.gpt-6.1-sol.search.web.support | search.web.support | RULE_CANDIDATE | gpt-6.1-sol
- openai.gpt-5.5.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-5.5
- openai.gpt-5.5.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-5.5
- openai.gpt-5.5.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5.5
- openai.gpt-5.5.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-5.5
- openai.gpt-5.5.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-5.5
- openai.gpt-5.5.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-5.5
- openai.gpt-5.5.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-5.5
- openai.gpt-5.5.search.web.support | search.web.support | RULE_CANDIDATE | gpt-5.5
- openai.gpt-5.5.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-5.5
- openai.gpt-5.5.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-5.5
- openai.gpt-5.5.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-5.5
- openai.gpt-5.5-pro.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-5.5-pro
- openai.gpt-5.5-pro.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-5.5-pro
- openai.gpt-5.5-pro.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5.5-pro
- openai.gpt-5.5-pro.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-5.5-pro
- openai.gpt-5.5-pro.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-5.5-pro
- openai.gpt-5.5-pro.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-5.5-pro
- openai.gpt-5.5-pro.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-5.5-pro
- openai.gpt-5.5-pro.search.web.support | search.web.support | RULE_CANDIDATE | gpt-5.5-pro
- openai.gpt-5.5-pro.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-5.5-pro
- openai.gpt-5.5-pro.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-5.5-pro
- openai.gpt-5.5-pro.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-5.5-pro
- openai.gpt-5.4.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-5.4
- openai.gpt-5.4.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-5.4
- openai.gpt-5.4.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5.4
- openai.gpt-5.4.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-5.4
- openai.gpt-5.4.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-5.4
- openai.gpt-5.4.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-5.4
- openai.gpt-5.4.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-5.4
- openai.gpt-5.4.search.web.support | search.web.support | RULE_CANDIDATE | gpt-5.4
- openai.gpt-5.4.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-5.4
- openai.gpt-5.4.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-5.4
- openai.gpt-5.4.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-5.4
- openai.gpt-5.4-pro.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-5.4-pro
- openai.gpt-5.4-pro.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-5.4-pro
- openai.gpt-5.4-pro.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5.4-pro
- openai.gpt-5.4-pro.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-5.4-pro
- openai.gpt-5.4-pro.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-5.4-pro
- openai.gpt-5.4-pro.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-5.4-pro
- openai.gpt-5.4-pro.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-5.4-pro
- openai.gpt-5.4-pro.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-5.4-pro
- openai.gpt-5.4-pro.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-5.4-pro
- openai.gpt-5.4-pro.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-5.4-pro
- openai.gpt-5.4-mini.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-5.4-mini
- openai.gpt-5.4-mini.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-5.4-mini
- openai.gpt-5.4-mini.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5.4-mini
- openai.gpt-5.4-mini.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-5.4-mini
- openai.gpt-5.4-mini.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-5.4-mini
- openai.gpt-5.4-mini.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-5.4-mini
- openai.gpt-5.4-mini.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-5.4-mini
- openai.gpt-5.4-mini.search.web.support | search.web.support | RULE_CANDIDATE | gpt-5.4-mini
- openai.gpt-5.4-mini.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-5.4-mini
- openai.gpt-5.4-mini.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-5.4-mini
- openai.gpt-5.4-mini.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-5.4-mini
- openai.gpt-5.2.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-5.2
- openai.gpt-5.2.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-5.2
- openai.gpt-5.2.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5.2
- openai.gpt-5.2.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-5.2
- openai.gpt-5.2.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-5.2
- openai.gpt-5.2.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-5.2
- openai.gpt-5.2.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-5.2
- openai.gpt-5.2.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-5.2
- openai.gpt-5.2.reasoning.effort.providerDefault | reasoning.effort.providerDefault | RULE_CANDIDATE | gpt-5.2
- openai.gpt-5.2-pro.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-5.2-pro
- openai.gpt-5.2-pro.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-5.2-pro
- openai.gpt-5.2-pro.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5.2-pro
- openai.gpt-5.2-pro.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-5.2-pro
- openai.gpt-5.2-pro.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-5.2-pro
- openai.gpt-5.2-pro.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-5.2-pro
- openai.gpt-5.2-pro.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-5.2-pro
- openai.gpt-5.2-pro.reasoning.effort.nativeValues | reasoning.effort.nativeValues | ALREADY_MODELS_DEV | gpt-5.2-pro
- openai.gpt-5.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | TEMPORALLY_UNSAFE | gpt-5
- openai.gpt-5.limits.output.maxTokens | limits.output.maxTokens | TEMPORALLY_UNSAFE | gpt-5
- openai.gpt-5.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5
- openai.gpt-5.modalities.output | modalities.output | TEMPORALLY_UNSAFE | gpt-5
- openai.gpt-5.reasoning.support | reasoning.support | TEMPORALLY_UNSAFE | gpt-5
- openai.gpt-5.tools.calling.support | tools.calling.support | TEMPORALLY_UNSAFE | gpt-5
- openai.gpt-5.structuredOutput.support | structuredOutput.support | TEMPORALLY_UNSAFE | gpt-5
- openai.gpt-5.reasoning.effort.nativeValues | reasoning.effort.nativeValues | TEMPORALLY_UNSAFE | gpt-5
- openai.gpt-5-mini.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | TEMPORALLY_UNSAFE | gpt-5-mini
- openai.gpt-5-mini.limits.output.maxTokens | limits.output.maxTokens | TEMPORALLY_UNSAFE | gpt-5-mini
- openai.gpt-5-mini.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5-mini
- openai.gpt-5-mini.modalities.output | modalities.output | TEMPORALLY_UNSAFE | gpt-5-mini
- openai.gpt-5-mini.reasoning.support | reasoning.support | TEMPORALLY_UNSAFE | gpt-5-mini
- openai.gpt-5-mini.tools.calling.support | tools.calling.support | TEMPORALLY_UNSAFE | gpt-5-mini
- openai.gpt-5-mini.structuredOutput.support | structuredOutput.support | TEMPORALLY_UNSAFE | gpt-5-mini
- openai.gpt-5-nano.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | TEMPORALLY_UNSAFE | gpt-5-nano
- openai.gpt-5-nano.limits.output.maxTokens | limits.output.maxTokens | TEMPORALLY_UNSAFE | gpt-5-nano
- openai.gpt-5-nano.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5-nano
- openai.gpt-5-nano.modalities.output | modalities.output | TEMPORALLY_UNSAFE | gpt-5-nano
- openai.gpt-5-nano.reasoning.support | reasoning.support | TEMPORALLY_UNSAFE | gpt-5-nano
- openai.gpt-5-nano.tools.calling.support | tools.calling.support | TEMPORALLY_UNSAFE | gpt-5-nano
- openai.gpt-5-nano.structuredOutput.support | structuredOutput.support | TEMPORALLY_UNSAFE | gpt-5-nano
- openai.gpt-5-pro.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | TEMPORALLY_UNSAFE | gpt-5-pro
- openai.gpt-5-pro.limits.output.maxTokens | limits.output.maxTokens | TEMPORALLY_UNSAFE | gpt-5-pro
- openai.gpt-5-pro.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5-pro
- openai.gpt-5-pro.modalities.output | modalities.output | TEMPORALLY_UNSAFE | gpt-5-pro
- openai.gpt-5-pro.reasoning.support | reasoning.support | TEMPORALLY_UNSAFE | gpt-5-pro
- openai.gpt-5-pro.tools.calling.support | tools.calling.support | TEMPORALLY_UNSAFE | gpt-5-pro
- openai.gpt-5-pro.structuredOutput.support | structuredOutput.support | TEMPORALLY_UNSAFE | gpt-5-pro
- openai.gpt-5-pro.tools.codeExecution.support | tools.codeExecution.support | TEMPORALLY_UNSAFE | gpt-5-pro
- openai.gpt-5-pro.reasoning.effort.nativeValues | reasoning.effort.nativeValues | TEMPORALLY_UNSAFE | gpt-5-pro
- openai.gpt-5-pro.reasoning.effort.providerDefault | reasoning.effort.providerDefault | TEMPORALLY_UNSAFE | gpt-5-pro
- openai.o3.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | TEMPORALLY_UNSAFE | o3
- openai.o3.limits.output.maxTokens | limits.output.maxTokens | TEMPORALLY_UNSAFE | o3
- openai.o3.modalities.input | modalities.input | AMBIGUOUS_DEFER | o3
- openai.o3.modalities.output | modalities.output | TEMPORALLY_UNSAFE | o3
- openai.o3.reasoning.support | reasoning.support | TEMPORALLY_UNSAFE | o3
- openai.o3.tools.calling.support | tools.calling.support | TEMPORALLY_UNSAFE | o3
- openai.o3.structuredOutput.support | structuredOutput.support | TEMPORALLY_UNSAFE | o3
- openai.o3-pro.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | TEMPORALLY_UNSAFE | o3-pro
- openai.o3-pro.limits.output.maxTokens | limits.output.maxTokens | TEMPORALLY_UNSAFE | o3-pro
- openai.o3-pro.modalities.input | modalities.input | AMBIGUOUS_DEFER | o3-pro
- openai.o3-pro.modalities.output | modalities.output | TEMPORALLY_UNSAFE | o3-pro
- openai.o3-pro.reasoning.support | reasoning.support | TEMPORALLY_UNSAFE | o3-pro
- openai.o3-pro.tools.calling.support | tools.calling.support | TEMPORALLY_UNSAFE | o3-pro
- openai.o3-pro.structuredOutput.support | structuredOutput.support | TEMPORALLY_UNSAFE | o3-pro
- openai.gpt-4.1.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-4.1
- openai.gpt-4.1.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-4.1
- openai.gpt-4.1.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-4.1
- openai.gpt-4.1.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-4.1
- openai.gpt-4.1.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-4.1
- openai.gpt-4.1.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-4.1
- openai.gpt-4.1.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-4.1
- openai.gpt-4.1-mini.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-4.1-mini
- openai.gpt-4.1-mini.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-4.1-mini
- openai.gpt-4.1-mini.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-4.1-mini
- openai.gpt-4.1-mini.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-4.1-mini
- openai.gpt-4.1-mini.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-4.1-mini
- openai.gpt-4.1-mini.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-4.1-mini
- openai.gpt-4.1-mini.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-4.1-mini
- openai.gpt-4o.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-4o
- openai.gpt-4o.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-4o
- openai.gpt-4o.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-4o
- openai.gpt-4o.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-4o
- openai.gpt-4o.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-4o
- openai.gpt-4o.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-4o
- openai.gpt-4o-mini.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-4o-mini
- openai.gpt-4o-mini.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-4o-mini
- openai.gpt-4o-mini.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-4o-mini
- openai.gpt-4o-mini.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-4o-mini
- openai.gpt-4o-mini.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-4o-mini
- openai.gpt-4o-mini.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-4o-mini
- openai.gpt-5.6-cyber.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | RULE_CANDIDATE | gpt-5.6-cyber
- openai.gpt-5.6-cyber.limits.output.maxTokens | limits.output.maxTokens | RULE_CANDIDATE | gpt-5.6-cyber
- openai.gpt-5.6-cyber.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-5.6-cyber
- openai.gpt-5.6-cyber.modalities.output | modalities.output | RULE_CANDIDATE | gpt-5.6-cyber
- openai.gpt-5.6-cyber.reasoning.support | reasoning.support | RULE_CANDIDATE | gpt-5.6-cyber
- openai.gpt-5.6-cyber.tools.calling.support | tools.calling.support | RULE_CANDIDATE | gpt-5.6-cyber
- openai.gpt-5.6-cyber.structuredOutput.support | structuredOutput.support | RULE_CANDIDATE | gpt-5.6-cyber
- openai.gpt-5.6-cyber.search.web.support | search.web.support | RULE_CANDIDATE | gpt-5.6-cyber
- openai.gpt-5.6-cyber.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-5.6-cyber
- openai.gpt-daybreak-red-latest.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-daybreak-red-latest
- openai.gpt-daybreak-red-latest.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-daybreak-red-latest
- openai.gpt-daybreak-red-latest.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-daybreak-red-latest
- openai.gpt-daybreak-red-latest.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-daybreak-red-latest
- openai.gpt-daybreak-red-latest.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-daybreak-red-latest
- openai.gpt-daybreak-red-latest.search.web.support | search.web.support | RULE_CANDIDATE | gpt-daybreak-red-latest
- openai.gpt-daybreak-red-latest.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-daybreak-red-latest
- openai.gpt-daybreak-blue-latest.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | ALREADY_MODELS_DEV | gpt-daybreak-blue-latest
- openai.gpt-daybreak-blue-latest.limits.output.maxTokens | limits.output.maxTokens | ALREADY_MODELS_DEV | gpt-daybreak-blue-latest
- openai.gpt-daybreak-blue-latest.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-daybreak-blue-latest
- openai.gpt-daybreak-blue-latest.modalities.output | modalities.output | ALREADY_MODELS_DEV | gpt-daybreak-blue-latest
- openai.gpt-daybreak-blue-latest.reasoning.support | reasoning.support | ALREADY_MODELS_DEV | gpt-daybreak-blue-latest
- openai.gpt-daybreak-blue-latest.tools.calling.support | tools.calling.support | ALREADY_MODELS_DEV | gpt-daybreak-blue-latest
- openai.gpt-daybreak-blue-latest.structuredOutput.support | structuredOutput.support | ALREADY_MODELS_DEV | gpt-daybreak-blue-latest
- openai.gpt-daybreak-blue-latest.search.web.support | search.web.support | RULE_CANDIDATE | gpt-daybreak-blue-latest
- openai.gpt-daybreak-blue-latest.tools.codeExecution.support | tools.codeExecution.support | RULE_CANDIDATE | gpt-daybreak-blue-latest
- openai.chat-latest.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | TEMPORALLY_UNSAFE | chat-latest
- openai.chat-latest.limits.output.maxTokens | limits.output.maxTokens | TEMPORALLY_UNSAFE | chat-latest
- openai.chat-latest.modalities.input | modalities.input | AMBIGUOUS_DEFER | chat-latest
- openai.chat-latest.modalities.output | modalities.output | TEMPORALLY_UNSAFE | chat-latest
- openai.chat-latest.tools.calling.support | tools.calling.support | TEMPORALLY_UNSAFE | chat-latest
- openai.chat-latest.structuredOutput.support | structuredOutput.support | TEMPORALLY_UNSAFE | chat-latest
- openai.chat-latest.search.web.support | search.web.support | TEMPORALLY_UNSAFE | chat-latest
- openai.chat-latest.tools.codeExecution.support | tools.codeExecution.support | TEMPORALLY_UNSAFE | chat-latest
- openai.o1-pro.limits.contextWindow.maxTokens | limits.contextWindow.maxTokens | TEMPORALLY_UNSAFE | o1-pro
- openai.o1-pro.limits.output.maxTokens | limits.output.maxTokens | TEMPORALLY_UNSAFE | o1-pro
- openai.o1-pro.modalities.input | modalities.input | AMBIGUOUS_DEFER | o1-pro
- openai.o1-pro.modalities.output | modalities.output | TEMPORALLY_UNSAFE | o1-pro
- openai.o1-pro.reasoning.support | reasoning.support | TEMPORALLY_UNSAFE | o1-pro
- openai.o1-pro.tools.calling.support | tools.calling.support | TEMPORALLY_UNSAFE | o1-pro
- openai.o1-pro.structuredOutput.support | structuredOutput.support | TEMPORALLY_UNSAFE | o1-pro
- openai.gpt-6-astra.reasoning.modes.nativeValues | reasoning.modes.nativeValues | RULE_CANDIDATE | gpt-6-astra
- openai.gpt-6.1-sol.reasoning.modes.nativeValues | reasoning.modes.nativeValues | RULE_CANDIDATE | gpt-6.1-sol
- openai.gpt-6-sol.reasoning.modes.nativeValues | reasoning.modes.nativeValues | RULE_CANDIDATE | gpt-6-sol
- openai.gpt-6-luna.reasoning.modes.nativeValues | reasoning.modes.nativeValues | RULE_CANDIDATE | gpt-6-luna
- openai.gpt-5.6-sol.reasoning.modes.nativeValues | reasoning.modes.nativeValues | RULE_CANDIDATE | gpt-5.6-sol
- openai.gpt-5.6-terra.reasoning.modes.nativeValues | reasoning.modes.nativeValues | RULE_CANDIDATE | gpt-5.6-terra
- openai.gpt-5.6-luna.reasoning.modes.nativeValues | reasoning.modes.nativeValues | RULE_CANDIDATE | gpt-5.6-luna
- openai.gpt-6-astra.contextManagement.support | contextManagement.support | RULE_CANDIDATE | gpt-6-astra
- openai.gpt-6-astra.contextManagement.actions.nativeValues | contextManagement.actions.nativeValues | RULE_CANDIDATE | gpt-6-astra
- openai.gpt-6.1-sol.contextManagement.support | contextManagement.support | RULE_CANDIDATE | gpt-6.1-sol
- openai.gpt-6.1-sol.contextManagement.actions.nativeValues | contextManagement.actions.nativeValues | RULE_CANDIDATE | gpt-6.1-sol
- openai.gpt-6-sol.contextManagement.support | contextManagement.support | RULE_CANDIDATE | gpt-6-sol
- openai.gpt-6-sol.contextManagement.actions.nativeValues | contextManagement.actions.nativeValues | RULE_CANDIDATE | gpt-6-sol
- openai.gpt-6-luna.contextManagement.support | contextManagement.support | RULE_CANDIDATE | gpt-6-luna
- openai.gpt-6-luna.contextManagement.actions.nativeValues | contextManagement.actions.nativeValues | RULE_CANDIDATE | gpt-6-luna
- openai.gpt-6-astra.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-6-astra
- openai.gpt-6.1-sol.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-6.1-sol
- openai.gpt-6-sol.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-6-sol
- openai.gpt-6-luna.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-6-luna
- openai.gpt-5.6-sol.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-5.6-sol
- openai.gpt-5.6-terra.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-5.6-terra
- openai.gpt-5.6-luna.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-5.6-luna
- openai.gpt-5.5.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-5.5
- openai.gpt-5.5-pro.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-5.5-pro
- openai.gpt-5.4.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-5.4
- openai.gpt-5.4-pro.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-5.4-pro
- openai.gpt-5.4-mini.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-5.4-mini
- openai.gpt-5.2.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-5.2
- openai.gpt-5.2-pro.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-5.2-pro
- openai.gpt-4.1.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-4.1
- openai.gpt-4.1-mini.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-4.1-mini
- openai.gpt-4o.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-4o
- openai.gpt-4o-mini.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-4o-mini
- openai.gpt-5.6-cyber.input.attachments.support | input.attachments.support | AMBIGUOUS_DEFER | gpt-5.6-cyber
- openai.gpt-daybreak-blue-latest.input.attachments.support | input.attachments.support | ALREADY_MODELS_DEV | gpt-daybreak-blue-latest
- openai.unknown.limits.input.maxTokens | limits.input.maxTokens | AMBIGUOUS_DEFER | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.modalities.input | modalities.input | AMBIGUOUS_DEFER | gpt-daybreak-red-latest
- openai.unknown.modalities.output | modalities.output | AMBIGUOUS_DEFER | gpt-daybreak-red-latest
- openai.unknown.input.attachments.support | input.attachments.support | AMBIGUOUS_DEFER | gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-daybreak-red-latest, chat-latest, o1-pro
- openai.unknown.operations.supported | operations.supported | AMBIGUOUS_DEFER | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.reasoning.support | reasoning.support | AMBIGUOUS_DEFER | gpt-4o, gpt-4o-mini, chat-latest
- openai.unknown.reasoning.required | reasoning.required | AMBIGUOUS_DEFER | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.reasoning.toggle.support | reasoning.toggle.support | AMBIGUOUS_DEFER | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.reasoning.modes.nativeValues | reasoning.modes.nativeValues | AMBIGUOUS_DEFER | gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.reasoning.effort.nativeValues | reasoning.effort.nativeValues | AMBIGUOUS_DEFER | gpt-5-mini, gpt-5-nano, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.reasoning.effort.providerDefault | reasoning.effort.providerDefault | AMBIGUOUS_DEFER | gpt-6-astra, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.reasoning.budgetTokens.support | reasoning.budgetTokens.support | ONTOLOGY_GAP | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.reasoning.budgetTokens.domain | reasoning.budgetTokens.domain | ONTOLOGY_GAP | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.generation.effort.nativeValues | generation.effort.nativeValues | ONTOLOGY_GAP | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.generation.effort.providerDefault | generation.effort.providerDefault | ONTOLOGY_GAP | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.sampling.temperature.support | sampling.temperature.support | AMBIGUOUS_DEFER | gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.sampling.temperature.providerDefault | sampling.temperature.providerDefault | AMBIGUOUS_DEFER | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.sampling.temperature.modelMaximum | sampling.temperature.modelMaximum | AMBIGUOUS_DEFER | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.sampling.topP.providerDefault | sampling.topP.providerDefault | AMBIGUOUS_DEFER | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.sampling.topK.support | sampling.topK.support | AMBIGUOUS_DEFER | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.sampling.topK.providerDefault | sampling.topK.providerDefault | AMBIGUOUS_DEFER | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.tools.trainingForToolUse | tools.trainingForToolUse | AMBIGUOUS_DEFER | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.tools.codeExecution.support | tools.codeExecution.support | AMBIGUOUS_DEFER | gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, o1-pro
- openai.unknown.image.generation.support | image.generation.support | ONTOLOGY_GAP | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.image.generation.aspectRatios | image.generation.aspectRatios | ONTOLOGY_GAP | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.image.generation.resolutionPresets.nativeValues | image.generation.resolutionPresets.nativeValues | ONTOLOGY_GAP | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.image.generation.resolutionPreset.providerDefault | image.generation.resolutionPreset.providerDefault | ONTOLOGY_GAP | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.search.web.support | search.web.support | AMBIGUOUS_DEFER | gpt-5.4-pro, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, o1-pro
- openai.unknown.search.image.support | search.image.support | ONTOLOGY_GAP | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.documents.citations.support | documents.citations.support | ONTOLOGY_GAP | gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.contextManagement.support | contextManagement.support | AMBIGUOUS_DEFER | gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro
- openai.unknown.contextManagement.actions.nativeValues | contextManagement.actions.nativeValues | AMBIGUOUS_DEFER | gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.5-pro, gpt-5.4, gpt-5.4-pro, gpt-5.4-mini, gpt-5.2, gpt-5.2-pro, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5.6-cyber, gpt-daybreak-red-latest, gpt-daybreak-blue-latest, chat-latest, o1-pro

## Conflicts

[
  {
    "conflictId": "openai-catalog-cache-freshness",
    "sources": [
      "openai-full-catalog-002"
    ],
    "models": [
      "gpt-6.1-sol",
      "gpt-6-sol"
    ],
    "path": null,
    "detail": "Exa catalog cached text still recommends GPT-6 Sol; live Chrome catalog recommends GPT-6.1 Sol. No capability assertion inferred from cached omission.",
    "disposition": "live per-model documentation required"
  },
  {
    "conflictId": "openai-sol61-websearch-cache-omission",
    "path": "search.web.support",
    "models": [
      "gpt-6.1-sol"
    ],
    "sources": [
      "openai-model-gpt-6.1-sol"
    ],
    "detail": "Exa exact page omits Web search/Tool search rows while Chrome live exact page marks both supported.",
    "disposition": "use live Chrome matrix; guide corroboration pending"
  },
  {
    "conflictId": "openai.gpt-6-astra.modalities.input.models-dev",
    "path": "modalities.input",
    "models": [
      "gpt-6-astra"
    ],
    "sources": [
      "public-models-dev-20261002",
      "openai-model-gpt-6-astra"
    ],
    "detail": "Actual models.dev adapter observation differs from official exact model claim.",
    "disposition": "Rule remains lower-priority fallback; coordinator must assess contradiction."
  },
  {
    "conflictId": "openai.gpt-6.1-sol.modalities.input.models-dev",
    "path": "modalities.input",
    "models": [
      "gpt-6.1-sol"
    ],
    "sources": [
      "public-models-dev-20261002",
      "openai-model-gpt-6.1-sol"
    ],
    "detail": "Actual models.dev adapter observation differs from official exact model claim.",
    "disposition": "Rule remains lower-priority fallback; coordinator must assess contradiction."
  },
  {
    "conflictId": "openai.gpt-6-sol.modalities.input.models-dev",
    "path": "modalities.input",
    "models": [
      "gpt-6-sol"
    ],
    "sources": [
      "public-models-dev-20261002",
      "openai-model-gpt-6-sol"
    ],
    "detail": "Actual models.dev adapter observation differs from official exact model claim.",
    "disposition": "Rule remains lower-priority fallback; coordinator must assess contradiction."
  },
  {
    "conflictId": "openai.gpt-6-luna.modalities.input.models-dev",
    "path": "modalities.input",
    "models": [
      "gpt-6-luna"
    ],
    "sources": [
      "public-models-dev-20261002",
      "openai-model-gpt-6-luna"
    ],
    "detail": "Actual models.dev adapter observation differs from official exact model claim.",
    "disposition": "Rule remains lower-priority fallback; coordinator must assess contradiction."
  },
  {
    "conflictId": "openai.gpt-5.6-sol.modalities.input.models-dev",
    "path": "modalities.input",
    "models": [
      "gpt-5.6-sol"
    ],
    "sources": [
      "public-models-dev-20261002",
      "openai-model-gpt-5.6-sol"
    ],
    "detail": "Actual models.dev adapter observation differs from official exact model claim.",
    "disposition": "Rule remains lower-priority fallback; coordinator must assess contradiction."
  },
  {
    "conflictId": "openai.gpt-5.6-terra.modalities.input.models-dev",
    "path": "modalities.input",
    "models": [
      "gpt-5.6-terra"
    ],
    "sources": [
      "public-models-dev-20261002",
      "openai-model-gpt-5.6-terra"
    ],
    "detail": "Actual models.dev adapter observation differs from official exact model claim.",
    "disposition": "Rule remains lower-priority fallback; coordinator must assess contradiction."
  },
  {
    "conflictId": "openai.gpt-5.6-luna.modalities.input.models-dev",
    "path": "modalities.input",
    "models": [
      "gpt-5.6-luna"
    ],
    "sources": [
      "public-models-dev-20261002",
      "openai-model-gpt-5.6-luna"
    ],
    "detail": "Actual models.dev adapter observation differs from official exact model claim.",
    "disposition": "Rule remains lower-priority fallback; coordinator must assess contradiction."
  },
  {
    "factId": "openai.gpt-6-astra.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-6-astra"
    ]
  },
  {
    "factId": "openai.gpt-6.1-sol.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-6.1-sol"
    ]
  },
  {
    "factId": "openai.gpt-6-sol.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-6-sol"
    ]
  },
  {
    "factId": "openai.gpt-6-luna.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-6-luna"
    ]
  },
  {
    "factId": "openai.gpt-5.6-sol.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-5.6-sol"
    ]
  },
  {
    "factId": "openai.gpt-5.6-terra.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-5.6-terra"
    ]
  },
  {
    "factId": "openai.gpt-5.6-luna.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-5.6-luna"
    ]
  },
  {
    "factId": "openai.gpt-5.5.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-5.5"
    ]
  },
  {
    "factId": "openai.gpt-5.5-pro.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-5.5-pro"
    ]
  },
  {
    "factId": "openai.gpt-5.4.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-5.4"
    ]
  },
  {
    "factId": "openai.o3.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-o3",
      "openai-legacy-endpoints-chrome"
    ]
  },
  {
    "factId": "openai.gpt-4.1.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-4.1",
      "openai-legacy-endpoints-chrome"
    ]
  },
  {
    "factId": "openai.gpt-4.1-mini.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-4.1-mini",
      "openai-legacy-endpoints-chrome"
    ]
  },
  {
    "factId": "openai.gpt-4o.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-4o",
      "openai-legacy-endpoints-chrome"
    ]
  },
  {
    "factId": "openai.gpt-4o-mini.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-4o-mini",
      "openai-legacy-endpoints-chrome"
    ]
  },
  {
    "factId": "openai.gpt-daybreak-blue-latest.modalities.input",
    "officialValue": {
      "kind": "media_kind_set",
      "values": [
        "text",
        "image"
      ],
      "completeness": "complete"
    },
    "modelsDevValue": {
      "kind": "media_kind_set",
      "values": [
        "image",
        "pdf",
        "text"
      ],
      "completeness": "complete"
    },
    "disposition": "deferred_from_first_corpus; current-rule priority cannot repair higher-priority conflicting row",
    "evidenceRefs": [
      "openai-model-gpt-daybreak-blue-latest"
    ]
  }
]

## Ontology gaps

[
  {
    "gapId": "openai-sampling-conditional",
    "models": [
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna"
    ],
    "officialConcept": "temperature/top_p supported only with reasoning effort none",
    "sourceRefs": [
      "openai-guide-latest-model"
    ],
    "reason": "Current support fact cannot express effort-dependent conditional availability. Unconditional unsupported would erase valid none-effort behavior."
  },
  {
    "gapId": "openai-output-vs-hosted-image-tool",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol"
    ],
    "officialConcept": "Responses image_generation calls orchestrate a separate GPT Image tool model",
    "sourceRefs": [
      "openai-guide-image-generation"
    ],
    "reason": "Native modalities.output is text. Image output/support mapping must distinguish tool orchestration from native model generation; defer image.generation assertion pending canonical interpretation."
  },
  {
    "gapId": "openai-reasoning-context-and-midturn-updates",
    "canonicalPathCandidate": null,
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna"
    ],
    "classification": "ONTOLOGY_GAP",
    "evidenceRefs": [
      "openai-reasoning-live-20261002"
    ],
    "rationale": "reasoning.context default/all_turns and configuration_update capabilities are not registered canonical paths; contextManagement actions must not be repurposed for reasoning-state controls."
  },
  {
    "gapId": "openai-citations-tool-vs-native-documents",
    "classification": "ONTOLOGY_GAP",
    "canonicalPathCandidate": "documents.citations.support",
    "canonicalValueCandidate": null,
    "evidenceRefs": [
      "openai-guide2-tools-file-search",
      "openai-guide2-citation-formatting",
      "openai-guide-tools-web-search"
    ],
    "rationale": "URL/file_search/container-file annotations and prompt-generated citations do not establish native document citations for direct document input."
  },
  {
    "gapId": "openai-native-card-vs-canonical-input-set",
    "classification": "ONTOLOGY_GAP",
    "canonicalPathCandidate": "modalities.input",
    "canonicalValueCandidate": null,
    "evidenceRefs": [
      "openai-guide3-pdf-files",
      "openai-responses-reference-live"
    ],
    "rationale": "Native text/image model-card table excludes provider file preprocessing; canonical enum includes pdf/generic_file. Input sets retained partial and held from candidate Pack."
  }
]

## Inference and regex

{
  "inferenceAudit": [
    {
      "factId": "openai.gpt-6-astra.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-6-astra",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-6-astra"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-6-astra",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-6.1-sol.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-6.1-sol",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-6.1-sol"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-6.1-sol",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-6-sol.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-6-sol",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-6-sol"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-6-sol",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-6-luna.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-6-luna",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-6-luna"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-6-luna",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-5.6-sol.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-5.6-sol",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-5.6-sol"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-5.6-sol",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-5.6-terra.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-5.6-terra",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-5.6-terra"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-5.6-terra",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-5.6-luna.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-5.6-luna",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-5.6-luna"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-5.6-luna",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-5.5.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-5.5",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-5.5"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-5.5",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-5.5-pro.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-5.5-pro",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-5.5-pro"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-5.5-pro",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-5.4.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-5.4",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-5.4"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-5.4",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-5.4-pro.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-5.4-pro",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-5.4-pro"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-5.4-pro",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-5.4-mini.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-5.4-mini",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-5.4-mini"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-5.4-mini",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-5.2.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-5.2",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-5.2"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-5.2",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-5.2-pro.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-5.2-pro",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-5.2-pro"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-5.2-pro",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-4.1.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-4.1",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-4.1"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-4.1",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-4.1-mini.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-4.1-mini",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-4.1-mini"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-4.1-mini",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-4o.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-4o",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-4o"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-4o",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-4o-mini.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-4o-mini",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-4o-mini"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-4o-mini",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-5.6-cyber.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-5.6-cyber",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-5.6-cyber"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-5.6-cyber",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    },
    {
      "factId": "openai.gpt-daybreak-blue-latest.input.attachments.support",
      "providerAuthorityId": "openai",
      "endpointProfileId": "openai-api-v1",
      "inferredExactModel": "gpt-daybreak-blue-latest",
      "explicitSiblings": [
        "gpt-4o",
        "gpt-4.1"
      ],
      "primaryEvidence": "openai-guide3-pdf-files",
      "corroboratingFirstPartyEvidence": [
        "openai-model-gpt-daybreak-blue-latest"
      ],
      "sharedSemanticSeries": "Responses vision-capable text/image model predicate, not naming prefix",
      "modelNewerThanDocument": null,
      "newerThanDocumentRationale": "Guide explicitly discusses GPT-5.6 and later PDF detail defaults; publication timestamp unavailable. Exact current model vision table independently corroborates predicate.",
      "variantDifferences": [
        "Pro models differ in effort/tool/structured support; only explicit vision predicate inherited.",
        "Cyber400k context differs from Sol1.05M; context limit not inherited.",
        "Hosted image/audio models excluded."
      ],
      "contradictionSearch": {
        "sources": [
          "openai-guide3-pdf-files",
          "openai-model-gpt-daybreak-blue-latest",
          "openai-legacy-endpoints-chrome"
        ],
        "found": "No PDFvision exclusion observed; endpoint glyph/prose confirmed for scoped exact aliases."
      },
      "documentedExceptions": [
        "Non-PDF embedded image/charts are not extracted.",
        "Spreadsheet augmentation first1000rows, not complete workbook.",
        "PDF byte cap50MB is not token cap."
      ],
      "whyInheritanceHolds": "Guide specifies a capability predicate met by exact model matrix; narrow attachment support only.",
      "coordinatorReview": "pending",
      "proposalDisposition": "fact retained; no Rule until coordinator approval"
    }
  ],
  "regexAudit": [
    {
      "canonicalPath": "limits.contextWindow.maxTokens",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "limits.input.maxTokens",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "limits.output.maxTokens",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "modalities.input",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "modalities.output",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "input.attachments.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "operations.supported",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "reasoning.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "reasoning.required",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "reasoning.toggle.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "reasoning.modes.nativeValues",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "reasoning.effort.nativeValues",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "reasoning.effort.providerDefault",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "reasoning.budgetTokens.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "reasoning.budgetTokens.domain",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "generation.effort.nativeValues",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "generation.effort.providerDefault",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "sampling.temperature.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "sampling.temperature.providerDefault",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "sampling.temperature.modelMaximum",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "sampling.topP.providerDefault",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "sampling.topK.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "sampling.topK.providerDefault",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "tools.calling.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "tools.trainingForToolUse",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "tools.codeExecution.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "structuredOutput.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "image.generation.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "image.generation.aspectRatios",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "image.generation.resolutionPresets.nativeValues",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "image.generation.resolutionPreset.providerDefault",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "search.web.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "search.image.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "documents.citations.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "contextManagement.support",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    },
    {
      "canonicalPath": "contextManagement.actions.nativeValues",
      "pattern": null,
      "classification": "KNOWN_MEMBERS_ONLY",
      "selectorDecision": "exact nativeModelIds",
      "rationale": "Snapshot context lengths differ; variants differ in effort/defaults/tools/context and aliases mutate. No source licenses future matching model inheritance.",
      "positiveExamples": [
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna"
      ],
      "negativeExamples": [
        "gpt-5.6-cyber-extra",
        "gpt-6.1-sol-chat",
        "gpt-6.1-sol-2099-01-01",
        "gpt-realtime-2.1",
        "gpt-image-2.5-sunburst"
      ],
      "coordinatorReview": "pending; no regex Rule emitted"
    }
  ]
}

## Sources

- [openai-full-catalog-002](https://developers.openai.com/api/docs/models/all): Chrome full catalog displays 101 exact model IDs including specialized/deprecated. Exa cached extraction omits new GPT-6.1 Sol; live Chrome preferred for discovery, per-model pages required.
- [openai-deprecations-003](https://developers.openai.com/api/docs/deprecations): Retirement table; catalog listing alone does not establish currently usable status.
- [openai-model-gpt-6-astra](https://developers.openai.com/api/docs/models/gpt-6-astra): Exact model page: context/output limits; text/image input, text output; reasoning efforts; function calling/structured outputs; Responses tool compatibility.
- [openai-model-gpt-6.1-sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol): Exact model page: context/output limits; text/image input, text output; reasoning efforts; function calling/structured outputs; Responses tool compatibility.
- [openai-model-gpt-6-sol](https://developers.openai.com/api/docs/models/gpt-6-sol): Exact model page: context/output limits; text/image input, text output; reasoning efforts; function calling/structured outputs; Responses tool compatibility.
- [openai-model-gpt-6-luna](https://developers.openai.com/api/docs/models/gpt-6-luna): Exact model page: context/output limits; text/image input, text output; reasoning efforts; function calling/structured outputs; Responses tool compatibility.
- [openai-model-gpt-5.6-sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol): Exact model page: context/output limits; text/image input, text output; reasoning efforts; function calling/structured outputs; Responses tool compatibility.
- [openai-model-gpt-5.6-terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra): Exact model page: context/output limits; text/image input, text output; reasoning efforts; function calling/structured outputs; Responses tool compatibility.
- [openai-model-gpt-5.6-luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna): Exact model page: context/output limits; text/image input, text output; reasoning efforts; function calling/structured outputs; Responses tool compatibility.
- [openai-guide-latest-model](https://developers.openai.com/api/docs/guides/latest-model): Capability guide reviewed for API surface, model compatibility, defaults, parameters and restrictions.
- [openai-guide-reasoning](https://developers.openai.com/api/docs/guides/reasoning): Capability guide reviewed for API surface, model compatibility, defaults, parameters and restrictions.
- [openai-guide-tools-web-search](https://developers.openai.com/api/docs/guides/tools-web-search): Capability guide reviewed for API surface, model compatibility, defaults, parameters and restrictions.
- [openai-guide-tools-code-interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter): Capability guide reviewed for API surface, model compatibility, defaults, parameters and restrictions.
- [openai-guide-pdf-files](https://developers.openai.com/api/docs/guides/pdf-files): Capability guide reviewed for API surface, model compatibility, defaults, parameters and restrictions.
- [openai-guide-compaction](https://developers.openai.com/api/docs/guides/compaction): Capability guide reviewed for API surface, model compatibility, defaults, parameters and restrictions.
- [openai-guide-image-generation](https://developers.openai.com/api/docs/guides/image-generation): Capability guide reviewed for API surface, model compatibility, defaults, parameters and restrictions.
- [public-models-dev-20261002](https://models.dev/api.json): Coordinator transformed public snapshot using current adapter: 53 OpenAI records. Comparison only, not official Rule authority.
- [openai-model-gpt-5.5](https://developers.openai.com/api/docs/models/gpt-5.5): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-5.5-pro](https://developers.openai.com/api/docs/models/gpt-5.5-pro): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-5.4](https://developers.openai.com/api/docs/models/gpt-5.4): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-5.4-pro](https://developers.openai.com/api/docs/models/gpt-5.4-pro): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-5.4-mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-5.2](https://developers.openai.com/api/docs/models/gpt-5.2): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-5.2-pro](https://developers.openai.com/api/docs/models/gpt-5.2-pro): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-5](https://developers.openai.com/api/docs/models/gpt-5): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-5-mini](https://developers.openai.com/api/docs/models/gpt-5-mini): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-5-nano](https://developers.openai.com/api/docs/models/gpt-5-nano): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-5-pro](https://developers.openai.com/api/docs/models/gpt-5-pro): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-o3](https://developers.openai.com/api/docs/models/o3): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-o3-pro](https://developers.openai.com/api/docs/models/o3-pro): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-4.1](https://developers.openai.com/api/docs/models/gpt-4.1): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-4.1-mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-4o](https://developers.openai.com/api/docs/models/gpt-4o): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-4o-mini](https://developers.openai.com/api/docs/models/gpt-4o-mini): Exact model page reviewed for limits, modality/features, reasoning options/defaults, snapshots and Responses-specific restrictions.
- [openai-model-gpt-image-2.5-sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-gpt-image-2.5-flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-gpt-image-2](https://developers.openai.com/api/docs/models/gpt-image-2): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-gpt-live-1](https://developers.openai.com/api/docs/models/gpt-live-1): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-gpt-realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-gpt-realtime-2.1-mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-gpt-audio-1.5](https://developers.openai.com/api/docs/models/gpt-audio-1.5): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-gpt-transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-gpt-5.6-cyber](https://developers.openai.com/api/docs/models/gpt-5.6-cyber): Exact model page contains explicit Responses tools matrix and limits/modalities/features.
- [openai-model-gpt-daybreak-red-latest](https://developers.openai.com/api/docs/models/gpt-daybreak-red-latest): Exact model page contains explicit Responses tools matrix and limits/modalities/features.
- [openai-model-gpt-daybreak-blue-latest](https://developers.openai.com/api/docs/models/gpt-daybreak-blue-latest): Exact model page contains explicit Responses tools matrix and limits/modalities/features.
- [openai-model-chat-latest](https://developers.openai.com/api/docs/models/chat-latest): Exact model page contains explicit Responses tools matrix and limits/modalities/features.
- [openai-model-text-embedding-3-large](https://developers.openai.com/api/docs/models/text-embedding-3-large): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-omni-moderation-latest](https://developers.openai.com/api/docs/models/omni-moderation-latest): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-gpt-oss-120b](https://developers.openai.com/api/docs/models/gpt-oss-120b): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-o4-mini](https://developers.openai.com/api/docs/models/o4-mini): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-o3-mini](https://developers.openai.com/api/docs/models/o3-mini): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-o1](https://developers.openai.com/api/docs/models/o1): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-o1-pro](https://developers.openai.com/api/docs/models/o1-pro): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-o3-deep-research](https://developers.openai.com/api/docs/models/o3-deep-research): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-model-o4-mini-deep-research](https://developers.openai.com/api/docs/models/o4-mini-deep-research): Exact specialized/legacy model page inspected; endpoint-name list alone is not a support guarantee.
- [openai-reasoning-live-20261002](https://developers.openai.com/api/docs/guides/reasoning?api-mode=responses): undefined
- [openai-guide2-pricing](https://developers.openai.com/api/docs/pricing): Pricing independently corroborates model IDs, hosted-tool billing and separate backend model usage. Price entries do not prove runtime capability support. Rosalind research billing starts 2026-10-05, access restricted; no capability extrapolation.
- [openai-guide2-changelog](https://developers.openai.com/api/docs/changelog): 2026-09-08 GPT-6 Astra release: Responses tool calling required; custom temperature/top_p/logprobs unsupported. Image 2.5 Sunburst/Flare are Image API and Responses image-generation tool models. 2026-08-20 Daybreak aliases require separate approval; chat-latest regularly updates. No GPT-6.1 release date observed in cached extract.
- [openai-guide2-audio](https://developers.openai.com/api/docs/guides/audio): Workflow table distinguishes Live, Realtime, audio-file transcription, translation, speech generation, and audio Chat Completions; transport sharing does not prove API interchangeability.
- [openai-guide2-tools-file-search](https://developers.openai.com/api/docs/guides/tools-file-search): Responses hosted file_search retrieves uploaded knowledge using vector stores. Output annotations reference files; examples use GPT-6 Astra. Tool output citations are not direct input_file native document citations.
- [openai-guide2-citation-formatting](https://developers.openai.com/api/docs/guides/citation-formatting): General citation prompting/parsing guide concerns application-defined citable units; no exact model support guarantee. Must not convert guidance into documents.citations.support for every model.
- [openai-guide2-function-calling](https://developers.openai.com/api/docs/guides/function-calling): Responses function/custom tools are application execution workflow, distinct from hosted code execution. Fine-grained strict/parallel/schema restrictions are not registered canonical paths.
- [openai-structured-web](https://developers.openai.com/api/docs/guides/structured-outputs): Web page opened; huge navigation-heavy view needs targeted model-scope extraction.
- [openai-deepresearch-web](https://developers.openai.com/api/docs/guides/deep-research): Web page opened; exact current retirement boundary needs targeted extraction.
- [openai-responses-ref-error](https://developers.openai.com/api/docs/api-reference/responses/create): Web fetch exceeded 4MiB limit; use Chrome rendered reference and official Markdown.
- [openai-guide3-create.md](https://developers.openai.com/api/docs/api-reference/responses/create.md): Requested legacy create.md redirects to API Overview; not an endpoint parameter/default source.
- [openai-guide3-deep-research](https://developers.openai.com/api/docs/guides/deep-research): Exact guide names o3-deep-research/o4-mini-deep-research for Responses; requires web/MCP/file data source, permits code interpreter. Guide does not mention current shutdown, while deprecations provides retirement boundary.
- [openai-guide3-gpt-5.4-pro](https://developers.openai.com/api/docs/models/gpt-5.4-pro): Exact Responses-only model page: function calling supported, structured outputs unsupported, code interpreter unsupported, effort medium(default)/high/xhigh. Distinct from GPT-5.4 and GPT-5.5 Pro.
- [openai-guide3-structured-outputs](https://developers.openai.com/api/docs/guides/structured-outputs): Schema-constrained output distinction from JSON mode; names GPT-4o-mini July18 and GPT-4o August06 and later. Responses text.format syntax; later date alone cannot override explicit unsupported Pro/deep-research model pages.
- [openai-guide3-pdf-files](https://developers.openai.com/api/docs/guides/pdf-files): Responses input_file supports uploaded/base64/file URL input; PDFvision needs text+image capable model. Non-PDF document text extraction and spreadsheet handling distinct. 50MB file/request byte limits do not map to token limits.
- [openai-responses-reference-live](https://developers.openai.com/api/reference/resources/responses/methods/create): Live reference reviewed; generic ranges and schema examples do not establish exact-model defaults.
- [openai-legacy-endpoints-chrome](https://developers.openai.com/api/docs/models/gpt-5.2): undefined

## Unknowns / deferred

[
  {
    "canonicalPath": "limits.input.maxTokens",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "Context capacity/max_output_tokens do not establish an independent input-token ceiling.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "modalities.input",
    "models": [
      "gpt-daybreak-red-latest"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "No exact-model evidence established; source absence remains unknown.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "modalities.output",
    "models": [
      "gpt-daybreak-red-latest"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "No exact-model evidence established; source absence remains unknown.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "input.attachments.support",
    "models": [
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-daybreak-red-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "No exact-model evidence established; source absence remains unknown.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "operations.supported",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "Observed endpoint support does not establish exhaustive canonical operation sets.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "reasoning.support",
    "models": [
      "gpt-4o",
      "gpt-4o-mini",
      "chat-latest"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "No exact-model evidence established; source absence remains unknown.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "reasoning.required",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "Unavailable none/reasoning support alone does not establish required boolean semantics.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "reasoning.toggle.support",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "Effort none is not a separately documented toggle.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "reasoning.modes.nativeValues",
    "models": [
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "No exact-model evidence established; source absence remains unknown.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "reasoning.effort.nativeValues",
    "models": [
      "gpt-5-mini",
      "gpt-5-nano",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "No exact-model evidence established; source absence remains unknown.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "reasoning.effort.providerDefault",
    "models": [
      "gpt-6-astra",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "No exact-model evidence established; source absence remains unknown.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "reasoning.budgetTokens.support",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "ONTOLOGY_GAP",
    "reason": "max_output_tokens caps reasoning plus visible/formatting output; independent reasoning-only budget unknown.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "reasoning.budgetTokens.domain",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "ONTOLOGY_GAP",
    "reason": "Independent reasoning-only budget domain unknown.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "generation.effort.nativeValues",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "ONTOLOGY_GAP",
    "reason": "text.verbosity/image.quality are not generation effort.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "generation.effort.providerDefault",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "ONTOLOGY_GAP",
    "reason": "No general-generation effort default declaration.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "sampling.temperature.support",
    "models": [
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "Support depends on exact model/reasoning effort; generic schema cannot prove it.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "sampling.temperature.providerDefault",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "Examples are not exact-model provider defaults.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "sampling.temperature.modelMaximum",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "Generic0..2 range does not prove exact model supports parameter or maximum.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "sampling.topP.providerDefault",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "Schema/example top_p1 is not a default declaration.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "sampling.topK.support",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "Parameter absence remains unknown rather than unsupported.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "sampling.topK.providerDefault",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "No exact top_k default documented.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "tools.trainingForToolUse",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "Tool support is not evidence of model training.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "tools.codeExecution.support",
    "models": [
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "No exact-model evidence established; source absence remains unknown.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "image.generation.support",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "ONTOLOGY_GAP",
    "reason": "Hosted image-generation tool and native output modality require ontology decision.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "image.generation.aspectRatios",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "ONTOLOGY_GAP",
    "reason": "Specialized tool aspect ratios not mainline model capability.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "image.generation.resolutionPresets.nativeValues",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "ONTOLOGY_GAP",
    "reason": "Specialized image tool size/quality not mainline model resolution presets.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "image.generation.resolutionPreset.providerDefault",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "ONTOLOGY_GAP",
    "reason": "Tool auto default is not mainline resolution default.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "search.web.support",
    "models": [
      "gpt-5.4-pro",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "No exact-model evidence established; source absence remains unknown.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "search.image.support",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "ONTOLOGY_GAP",
    "reason": "No independent exact-model native image-search guarantee.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "documents.citations.support",
    "models": [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "ONTOLOGY_GAP",
    "reason": "File/web/container annotations and citation prompting differ from native direct-document citations.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "contextManagement.support",
    "models": [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "General API availability cannot establish all exact-model applicability.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  },
  {
    "canonicalPath": "contextManagement.actions.nativeValues",
    "models": [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-pro",
      "o3",
      "o3-pro",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-5.6-cyber",
      "gpt-daybreak-red-latest",
      "gpt-daybreak-blue-latest",
      "chat-latest",
      "o1-pro"
    ],
    "canonicalValue": null,
    "classification": "AMBIGUOUS_DEFER",
    "reason": "Exact legacy-model action domain not established.",
    "evidenceRefs": [
      "openai-responses-reference-live",
      "openai-guide-latest-model",
      "openai-guide3-pdf-files",
      "openai-guide2-function-calling",
      "openai-guide2-citation-formatting"
    ]
  }
]

## Validation

Actual current Starverse Rule and Pack decoders: PASS (1 Pack, 62 Rules, zero decode failures). Rule/fact/evidence uniqueness and backlinks pass. No DB reads or runtime model calls; no ABI rebuild; no production modifications or commits.

## Next question

Coordinator audit is the next step: review stable exact candidates, 20 inferred-high attachment audits, partial native-input sets, source conflicts and lifecycle exclusions. No further provider searching, Apply or publication is authorized by this checkpoint.
