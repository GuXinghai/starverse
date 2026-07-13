# Generation Compiler V2 — Goal 1 Progress

> Goal 1 is investigation, verification, and implementation planning only. Production code must not be changed.

## Baseline

- Repository: `D:\Starverse`
- Baseline commit: `067171a4c4d55f147340677c7e7f046e95311bd0`
- Branch at start: `codex/rewrite-readme`
- Local `main` at start: `6fb6ad59a9cbe7710a0ec6a65c70ae860afbb66b` (`2026-07-05T07:01:51+08:00`, `fix(reasoning): preserve image reasoning display blocks`)
- Branch divergence from `main`: 54 commits behind, 2 commits ahead; merge base `de955f96c3fc842db3783f36a1bf0e0e2a823a46`
- Worktree at start: clean (`git status --short` count = 0)
- Baseline proposal: `C:\Users\m1389\OneDrive\Desktop\新建 文本文档.txt`
- Baseline proposal length: 1,932 lines
- Goal started: 2026-07-13 (Asia/Shanghai)
- Official-contract verification date: 2026-07-13 unless a task package states otherwise

## Owner-decision continuation — 2026-07-13

- Continuation branch: `codex/rewrite-readme` at `067171a4c4d55f147340677c7e7f046e95311bd0`.
- Local `main`: `6fb6ad59a9cbe7710a0ec6a65c70ae860afbb66b`.
- Pre-fetch divergence remains `main...HEAD = 54 behind / 2 ahead`.
- Worktree contains only the untracked Goal 1 directory `docs/architecture/generation-compiler-v2/`; no production or unrelated dirty file is present.
- The two pre-existing ahead commits are `8174aa10` (`feat: complete compatible provider rebuild and chat lifecycle (#3)`, broad production/docs change) and `067171a4` (`docs: rewrite README from current architecture`). They were not created by this continuation. Their safe reconciliation depends on fetched `origin/main` ancestry and the merge result; any production-code conflict or newly discovered unexpected commit triggers the mandated stop instead of speculative resolution.
- Owner decisions being absorbed: Gemini `v1beta`-only provider-owned API version; OpenAI V2 scope limited to existing `reasoning.effort/summary` unless exact official schema plus real smoke proves more; fixed epoch root `%APPDATA%\Starverse\workspace\epoch-2\starverse.db`; exact first-party credential whitelist; OpenRouter Images full-parameter endpoint selection with `provider_tag` pinning and configurable 6h/24h freshness.
- Git execution boundary: after evidence correction and document validation, commit only this Goal 1 directory, fetch, merge latest `origin/main` into this branch, stop on production-code conflict or unexpected dirty/commit, then fast-forward local `main` and remain on clean `main`. No push or PR.
- Validated Goal 1 artifacts were committed as `2da943b9` (`docs: finalize generation compiler v2 goal 1`): 11 documentation files, 1,788 inserted lines, no production file.
- First `git fetch origin` attempt failed with `Recv failure: Connection was reset`; the immediate retry succeeded. Refreshed `origin/main` is `fd65a8023849e0079569b5f8320d8748b55fff6e`. The branch is 1 commit behind / 3 ahead; `git log --cherry-pick origin/main...HEAD` shows only the two Goal 1 documentation commits as non-equivalent because branch commit `067171a4` and `origin/main` commit `fd65a802` carry the same README patch.

## Status

| Item | State | Output |
|---|---|---|
| Baseline and repository boundary | Complete | This ledger |
| TP1 Request chain, sources of truth, legacy paths | Complete | `tp1-request-chain-and-legacy.md` |
| TP2 Data epoch, destructive reset, credentials | Complete | `tp2-data-epoch-reset-credentials.md` |
| TP3 Semantic config, persistence, snapshot, continuation | Complete | `tp3-semantic-config-snapshot-continuation.md` |
| TP4 Capability, evidence priority, UI projection | Complete | `tp4-capability-evidence-ui.md` |
| TP5 Compiler, ledger, request, transport, retry | Complete | `tp5-compiler-ledger-transport-retry.md` |
| TP6 OpenRouter and OpenAI native contracts | Complete | `tp6-openrouter-openai-contracts.md` |
| TP7 Anthropic, Gemini, DeepSeek, Generic/local contracts | Complete | `tp7-provider-contracts.md` |
| TP8 Atomic cutover, deletion, tests, Goal 3 input | Complete | `tp8-cutover-tests-goal3.md` |
| Baseline traceability | Complete — 100%, zero uncovered | `traceability-matrix.md` |
| Owner-decision revision | Complete | Existing eight packages, final plan, traceability, and acceptance matrix |
| Git reconciliation | In progress | Commit docs only, fetch/merge latest `origin/main`, fast-forward local `main` |
| Final implementation plan | Owner-decision revision complete; Git reconciliation pending | `generation-compiler-v2-final-plan.md` |

## Files inspected

- `C:\Users\m1389\OneDrive\Desktop\新建 文本文档.txt` — baseline proposal; all 1,932 lines read in bounded sections.
- `AGENTS.md` — repository delegation, test, ABI, and Git hygiene rules.
- Architecture-document file inventory under `docs/` — candidate evidence list captured; relevant files will be routed per task package.
- `main:src/ui-app/app/appChatApp.logic.ts`, branch command/snapshot counterpart, branch/message repositories, runtime coordinator, provider architecture contracts, and related tests — TP1 request/data/config/continuation map.
- Main SQLite/config/credential/asset/runtime/temp/session reset paths plus HEAD-only raw-debug and operation stores — TP2 complete storage and credential boundary.
- Main/HEAD config owners, V1 snapshot and provider-native accumulators — TP3 semantic config/snapshot/continuation boundary.
- Main hardcoded runtime selection, HEAD profiles/UI editors, provider target/contract architecture, and live vendor capability examples — TP4 evidence and UI projection boundary.
- Main/HEAD generation resolver/mappers/builders/transports, Raw Debug, compatible provider, command/orphan recovery, and streaming tests — TP5 compiler/ledger/request boundary.
- OpenRouter/OpenAI provider builders, transports, continuation paths, official Chat/Images/Responses/Web/Image contracts — TP6.
- Anthropic/Gemini/DeepSeek/Generic/LM Studio/Ollama code paths and official protocol/model documentation — TP7.
- Existing branch/command/provider/reset/raw/path tests, baseline 14-step cutover and AC-01…AC-42 — TP8 corrected cutover and acceptance plan.

## Evidence captured

- Current baseline commit and branch are recorded above.
- Worktree was clean at Goal 1 start.
- Baseline explicitly requires a destructive data epoch, one semantic configuration model, one compiler entry, provider-native typed codecs, no generic wire paths or unknown patches, no compatibility/fallback path, exact serialized request bytes, and 100% proposal traceability.
- Candidate architecture evidence includes provider target architecture, generation-params investigation/plan, generation facade ADRs, snapshot architecture, credential boundary documents, branch architecture, and provider-specific model-source documents.
- Baseline contains 20 top-level sections, 42 numbered final acceptance conditions, 14 atomic-cutover actions, 12 Goal 3 review areas, and explicit test matrices for semantic schema, capability, exact native bodies, end-to-end composition, no-silent-drop, UI/codec coverage, architecture guards, reset, streaming/continuation, and live smoke.
- Baseline provider scope covers OpenRouter Chat/Images, OpenAI Responses, Anthropic Messages, Gemini Interactions/GenerateContent, DeepSeek official, and Generic/OpenAI-compatible/local endpoints.
- The checked-out branch is not current `main`. Goal 1 therefore treats local `main` as the primary implementation baseline and separately records the two branch-only changes where relevant. No branch switch or merge is performed.
- A continuous line-range partition assigns every normative baseline line 14–1917 to one or more task packages/final artifacts. Evidence-complete coverage is 23/23, acceptance dispositions are 42/42, and no normative baseline line is unassigned.
- OpenAI Responses Create was re-verified from the official current Create schema on 2026-07-13. The request-level `reasoning` object is exactly `{ effort, generate_summary, summary }`; `generate_summary` is deprecated. The schema does **not** contain `reasoning.context` or `reasoning.mode`. `context_management` is a separate top-level request array whose currently documented entry type is `compaction` with optional `compact_threshold` (minimum 1000). Starverse V2 reasoning scope therefore remains `effort + summary`; top-level context management is a separate future advanced capability.
- Gemini Developer API implementation version is Owner-frozen to `v1beta`. The Gemini provider contract centrally owns this version for GenerateContent, Interactions, and future Agents; their typed codecs remain separate. No UI/builder/transport endpoint literal, model/operation version table, automatic version fallback, or `/v1` production binding is allowed.
- OpenRouter server-side web search was re-verified from the official Beta documentation on 2026-07-13. The native tool is `tools:[{type:'openrouter:web_search', parameters:{...}}]`; documented parameters include `engine`, `max_results`, `max_total_results`, `search_context_size`, `max_characters`, `user_location`, `allowed_domains`, and `excluded_domains`. The page still documents the older `plugins:[{id:'web'}]` form for comparison, so Goal 2 must delete it rather than model both forms.
- OpenRouter's dedicated Image API was re-verified from the official documentation on 2026-07-13. Generation is `POST /api/v1/images`; capability discovery is `/api/v1/images/models` plus per-model `/endpoints`. The definitive endpoint record exposes typed `supported_parameters`, `allowed_passthrough_parameters`, and `supports_streaming`. Native request fields include `model`, `prompt`, `n`, `resolution`, `aspect_ratio`, `size`, `quality`, `output_format`, `background`, `output_compression`, `seed`, `stream`, `input_references`, and provider-scoped `provider.options`. An absent endpoint capability key means unsupported.

## Decisions

- Use exactly eight task packages matching the user-specified boundaries.
- Each task package must contain: scope, code evidence, official evidence, normative decisions, files, deletions, types/data flow, exact request examples, tests, acceptance criteria, risks, and unresolved items.
- Provider wire semantics remain provider/protocol-specific; no generic wire-path, unknown patch, compatibility layer, dual read/write, fallback, or temporary bridge may appear in the Goal 2 target state.
- Progress is updated immediately after each completed investigation unit.
- The baseline is evidence, not authority over current vendor contracts. A confirmed documentation drift must update the final plan and traceability disposition instead of preserving a stale baseline statement.
- The earlier Goal 1 claim that the current Responses Create schema includes `reasoning.context/mode` was incorrect. The exact official schema path is `POST /responses` → body `reasoning` → `{effort, generate_summary, summary}`. V2 migrates the existing Starverse `effort + summary` implementation only; any explicit unsupported reasoning field is rejected by the compiler.
- Gemini image MIME values come only from the selected `v1beta` codec revision plus exact model/operation capability evidence. No V1 schema or broad cross-codec semantic MIME enum may widen/narrow the V1Beta contract.
- OpenRouter web search has one target wire form: the Beta server tool. The legacy plugin form is migration/deletion evidence only and must not survive as a compatibility path.
- OpenRouter image capability must be endpoint-specific. Model-level `supported_parameters` is only a union; compilation must bind to the selected endpoint record or reject fields whose support is not proven for that endpoint.
- Gemini version is resolved by Owner policy: all Gemini Developer API contracts use provider-owned `v1beta`. Baseline section 9.4 and AC-19 are corrected to assert centralized `v1beta` ownership, separate codecs, and zero automatic fallback.
- V2 data root is fixed to `%APPDATA%\Starverse\workspace\epoch-2\`; the SQLite family is `starverse.db`, `starverse.db-wal`, and `starverse.db-shm`. Legacy `chat.db` and old asset roots are deletion-only and are never opened by V2.
- OpenRouter Images selects one endpoint whose per-endpoint descriptor satisfies the complete explicit image intent, pins it with `provider_tag`, and never drops/downgrades parameters or switches endpoint after POST failure. User settings own `refreshAfter` (default 6h) and `hardExpireAfter` (default 24h), with `refreshAfter < hardExpireAfter`; exact range/persistence evidence is recorded in TP4/TP6.
- Current settings code uses explicit millisecond presets and default-restoring normalizers (`src/shared/modelCatalog/catalogSyncSettings.ts:12-56`) plus provider-scoped key construction (`providerCatalogSettings.ts:49-103`). TP4 applies that convention to V2-only OpenRouter Images keys, rejects invalid pairs atomically, and keeps the fixed 90-day diagnostic history out of user settings.
- Document validation after Owner revision: exactly 8 task packages, 11 Markdown artifacts, 23/23 trace rows, 42/42 unique acceptance IDs, 100% assigned baseline coverage, zero broken local links, and balanced code fences. Twenty-eight official Markdown URLs were checked: 21 returned HTTP 2xx directly; three Google and four OpenAI URLs were opened/read through the browser evidence path because the local curl path returned TLS/403 failures; two stale OpenRouter URLs were corrected or removed.

## Blockers

- Goal 1 investigation is not blocked. Goal 2 implementation is blocked until the prerequisite table in the final plan is Owner-approved.
- Remaining execution gate: reconcile this Goal 1 branch with latest `origin/main` using the Owner-specified stop-on-conflict fast-forward workflow.
- Gemini version, V2 epoch root, OpenAI reasoning scope, and OpenRouter Images endpoint freshness/selection are no longer Owner blockers; they are frozen implementation constraints.
- Provider-specific implementation evidence still required by Goal 2 (for example Anthropic exact model rules) remains a package acceptance input, not a reason to reopen these Owner decisions.
- Any new official field or protocol not confirmed from a primary vendor source remains unavailable rather than guessed.

## Remaining work

1. Commit the validated Goal 1 documentation only.
2. Complete the Owner-specified Git reconciliation and remain on clean `main`.
3. Goal 2 executes the frozen plan; Goal 3 performs the independent Critical/High review defined by TP8.

## Product links

- [Progress ledger](./goal1-progress.md)
- [Baseline traceability matrix](./traceability-matrix.md)
- [Final implementation plan](./generation-compiler-v2-final-plan.md)
- [TP1](./tp1-request-chain-and-legacy.md)
- [TP2](./tp2-data-epoch-reset-credentials.md)
- [TP3](./tp3-semantic-config-snapshot-continuation.md)
- [TP4](./tp4-capability-evidence-ui.md)
- [TP5](./tp5-compiler-ledger-transport-retry.md)
- [TP6](./tp6-openrouter-openai-contracts.md)
- [TP7](./tp7-provider-contracts.md)
- [TP8](./tp8-cutover-tests-goal3.md)

## Update log

- 2026-07-13: Reopened Goal 1 for Owner-decision continuation. Recorded the exact pre-fetch branch state (`54 behind / 2 ahead`), confirmed the only worktree change is the Goal 1 documentation directory, and froze the stop-on-conflict Git boundary before any fetch/merge.
- 2026-07-13: Goal created; baseline commit, branch, clean worktree, proposal path/length, candidate architecture docs, package structure, and hard constraints recorded.
- 2026-07-13: Completed the full 1,932-line baseline read. Recorded the complete architecture, provider, reset, persistence, deletion, test, cutover, and acceptance scope. Marked vendor-contract statements for fresh primary-source verification rather than automatic adoption.
- 2026-07-13: Detected branch divergence: checked-out HEAD is 54 commits behind and 2 ahead of local `main`. Instructed all code-mapping investigations to compare `main` and branch-only changes without switching or mutating Git state.
- 2026-07-13: Created the baseline traceability matrix. Assigned the full normative interval (lines 14–1917) to 23 contiguous coverage units and reserved explicit `AC-01…AC-42` expansion for final acceptance verification. Unassigned normative lines: zero.
- 2026-07-13: Initial OpenAI schema reading incorrectly attributed `context/mode` to the request-level `reasoning` object. Owner-requested re-verification of the current official Create schema found only `effort`, deprecated `generate_summary`, and `summary`; `context_management` is top-level. Downstream plan, request example, AC-18, and traceability claims were corrected.
- 2026-07-13: Owner resolved Gemini API version policy as provider-owned `v1beta` only. The earlier official-source conflict is retained only as investigation history, not an implementation blocker; no `/v1` binding or automatic version fallback remains in the target plan.
- 2026-07-13: Absorbed all four technical Owner decisions into TP2/3/4/6/7/8, the final plan, traceability matrix, and AC-18/19/24/32/33. Revalidated 8/8 packages, 23/23 trace rows, 42/42 AC IDs, local links, code fences, and current official URLs; stale OpenRouter URLs were corrected.
- 2026-07-13: Staged only `docs/architecture/generation-compiler-v2/`, passed `git diff --cached --check`, confirmed all 11 staged paths are Goal 1 Markdown, and created docs-only commit `2da943b9`.
- 2026-07-13: Retried a transiently failed fetch successfully. Latest `origin/main` is `fd65a802`; refreshed divergence is 1 behind / 3 ahead, with the README commits patch-equivalent and only the two Goal 1 docs commits remaining in `--cherry-pick` output.
- 2026-07-13: Re-verified OpenRouter Web Search and the dedicated Image API. Frozen the server-tool form as the sole web-search target, recorded the plugin form as deletion-only legacy evidence, and made per-endpoint image capability records authoritative over model-level unions.
- 2026-07-13: Completed TP1. Confirmed main's mixed historical-route/current-config behavior, split provider entrypoints, implicit message-group fallback, and missing tool/image continuation. Defined the single command/transaction/runner boundary and recorded the branch-reconciliation prerequisite.
- 2026-07-13: Completed TP2. Enumerated every SQLite/config/asset/debug/runtime/session/temp boundary, froze the exact epoch-2 workspace and crash-safe journal design, and restricted credential preservation to five validated `electron_safe_storage` leaves. Packaged app identity correction remains a Goal 2 implementation prerequisite; the root itself is Owner-frozen.
- 2026-07-13: Completed TP3 and TP4. Defined the sole sparse semantic config owner, immutable semantic answer snapshot, provider-native continuation artifacts, revisioned evidence precedence, and a UI projection that shares the compiler's exact capability revision. Wire patches, regex capability, and silent drops are deletion-only.
- 2026-07-13: Completed TP5. Defined one exhaustive compiler and immutable prepared-byte boundary, separate operation/request/attempt ledgers, exact Raw Debug byte reuse, pure transports, committed branch-switch semantics, and zero transport/protocol fallback.
- 2026-07-13: Completed TP6 and TP7. Split every provider/protocol into a closed contract, added exact target requests and deletion/tests, corrected OpenAI and OpenRouter drift, and initially recorded Gemini's conflicting official version evidence. Owner later closed that blocker with a provider-owned `v1beta`-only contract; the task packages and acceptance matrix now reflect the frozen decision.
- 2026-07-13: Completed TP8. Converted the atomic cutover into implementation batches and one release switch, produced a zero-residual deletion audit, expanded all 42 acceptance IDs with evidence corrections, and defined the twelve-area Goal 3 risk review.
- 2026-07-13: Initial Goal 1 artifacts reached 23/23 evidence-complete, 42/42 acceptance dispositions, 100% normative coverage, and zero uncovered items. Owner-decision continuation then reopened final closure for evidence corrections and Git reconciliation.
