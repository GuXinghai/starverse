# First Cloud Capability Rules corpus research

Status: **research and coordinator candidate audit complete; not a published or applied release.** As-of2026-10-02 on models-dev-capability-resolution, baseline f2cd20d97f14aef9504da206ee2de89c8487446b. Current implementation and eight required contracts are authoritative; hashes are saved in [contract-baseline.json](final/contract-baseline.json). Older roadmap memories were checked against current Goal4 documentation.

Start with [release-recommendation.md](final/release-recommendation.md) for the full A–M coordinator report. The reviewed candidate is [candidate-corpus.json](final/candidate-corpus.json):5Packs,290exact Rules,1017model/path claims. Current real decoder result: [validation-result.json](final/validation-result.json). Artifact integrity/ledger checks: [research-validation-result.json](final/research-validation-result.json).

## Evidence and ownership

Five independent provider streams used GPT-6.1 Sol / High; [execution record](final/research-agent-execution.json) documents the CLI allocation workaround and limitations. Providers own their provider files; root owns policy, exact scopes, inference, semantic/temporal review, normalization, final corpus and completion. A read-only mapper supplied contract seams and final audit findings.

Pipeline: first-party source -> durable ledger -> intermediate fact -> coordinator coverage/inference/temporal/conflict decision -> current Rule/Pack decoder -> reviewed corpus. Chrome, built-in web and Exa supplied complementary discovery/read paths. Findings were flushed throughout; provider chats are not the research authority.

## Artifacts

- providers/*.md: inventory, families, official surfaces, findings, limitations and provider handoff checkpoints.
- evidence/{provider}.jsonl: retrieval/source/API/temporal metadata and evidence identities. Additional public OpenRouter captures and review matrices support gateway observations.
- facts/*.json: original intermediate claims, all36-path provider review, inference/regex/lifecycle records and classifications.
- candidates/*.json: original provider proposals in actual Rule/Pack schema; these are superseded for inclusion decisions by final output.
- final/fact-decisions.json:6333coordinator disposition rows; each has exactly one primary classification. final/coverage-matrix.md renders the same claims with source values/states.
- final/manual-review.json and coordinator-evidence.jsonl: independent HIGH approvals/deferrals and critical source cross-checks.
- final/inference-audit.md, conflict-audit.md, temporal-audit.md, ontology-gaps.md and deferred.md: complete audit/defer registers.
- final/models-dev-observations.json and openrouter-native-observations.json: saved public data passed through current real adapters, not local DB or account observations.
- *.mjs and provider-prefixed helpers: research-only assembly/validation/reporting. No application import, release creation or Apply.

## Scope boundaries

Rules only match already-authoritative exact subjects; they do not create identities. Missing/unfetched source data stays unknown. Static adapter mapping is distinct from observed payload. All final selectors are KNOWN_MEMBERS_ONLY; four Gemini grammar examples passed validation but capability future inheritance was not approved. Pack/Rule priority0 does not change default cross-source order Native3 > models.dev2 > Rules1. No silent partial-set union, invented numeric bounds or unsupported-by-silence claim.

Production schema/ontology/adapters/resolver/provider identities, database active/LKG state and main were unchanged. No official Release Document, final release version/contentRevision, GitHub Release/upload, publication or Apply. pelican-bicycle.html and all native/build artifacts are excluded from this research commit.

## Revalidation and recovery

Run validate-corpus.mjs and validate-research.mjs from the repository root; they bundle current pure contracts in memory and do not open a DB. Public adapter observations were captured on2026-10-02. Large raw models.dev payload, process logs/prompts and five full-page OpenRouter discovery captures remain in the external research workdir D:/CodexResearch/Starverse-cloud-rules-20261002; durable summaries and public structured evidence remain here. External logs are unnecessary for candidate validation and should not be published wholesale.

To resume research, read this recommendation, provider report, ledger and facts before further discovery. Provider reports preserve handoff-era next questions; root final/manual-review and fact-decisions supersede pending approval language in those original proposal artifacts. Before publication perform fresh membership/source/lifecycle checks and obtain Owner decisions; do not infer release approval from this completed research.
