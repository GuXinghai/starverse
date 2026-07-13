# Generation Compiler V2 — Goal 2 Progress

> Goal 2 implements the Goal 1 plan on `main`. This ledger is updated immediately after each completed implementation or verification step.

## Baseline

- Repository: `D:\Starverse`
- Branch: `main`
- Goal 2 baseline SHA: `5b873c5384dad4ac512788ed8223ee5e6ac2885e`
- `origin/main` at start: `fd65a8023849e0079569b5f8320d8748b55fff6e`
- Worktree/index/untracked state at start: clean (`git status --porcelain=v1 -uall` count = 0)
- Started: 2026-07-13 (Asia/Shanghai)
- Sole implementation baseline: this directory's final plan, TP1–TP8, traceability matrix, and AC-01…AC-42.
- Production constraints: no compatibility layer, dual read/write, fallback, unknown wire patch, silent parameter drop/downgrade, or temporary provider bridge.

## Phase status

| Phase | State | Evidence / output |
|---|---|---|
| G2-0 Baseline and implementation map | Complete — awaiting Gate 0 Owner decisions before production edits | Goal 1 artifacts read in full; command, epoch/reset/credential, provider/request, deletion and test maps captured |
| G2-1 Epoch-2 workspace and destructive reset | Pending | TP2, AC-01…AC-06 |
| G2-2 Semantic intent, capability, persistence, UI projection | Pending | TP3/TP4 |
| G2-3 Compiler, ledger, snapshot, prepared request | Pending | TP5 |
| G2-4 Provider typed codecs and native transports | Pending | TP6/TP7 |
| G2-5 Native streaming decode and continuation | Pending | TP3/TP6/TP7 |
| G2-6 Unified commands and legacy deletion | Pending | TP1/TP5/TP8 |
| G2-7 Full AC-01…AC-42 acceptance and smoke | Pending | TP8 and traceability matrix |

## Changed files

- `docs/architecture/generation-compiler-v2/goal2-progress.md` — Goal 2 durable progress ledger (created).
- `docs/architecture/generation-compiler-v2/goal2-gate0-contract-audit.md` — current official contract audit and post-Goal-1 blocking conflicts.

## Verification log

| Date | Command / check | Result | Notes |
|---|---|---|---|
| 2026-07-13 | Baseline Git inspection | Pass | `main=5b873c53`, clean worktree, `origin/main=fd65a802` |
| 2026-07-13 | Goal 1 implementation baseline read | Pass | Final plan, TP1–TP8, traceability matrix, and AC-01…AC-42 read in full |
| 2026-07-13 | Provider/request-path read-only map | Pass | Current builders, profiles, wire mapper, transports, decoders, continuation and tests mapped for every TP6/TP7 contract |
| 2026-07-13 | Generation command/continuation Gate 0 map | Pass | Existing three-command transaction and orphan-recovery skeleton identified; initial send/edit and V2 compiler/ledger remain outside it |
| 2026-07-13 | Epoch/reset/credential startup map | Pass | Pre-`whenReady` config mutation, legacy DB/assets/debug/temp/reset paths, exact five secure leaves, fresh-schema seam and conflicting tests mapped |
| 2026-07-13 | Gate 0 current official contract audit | Blocked as designed | OpenAI/Anthropic/Gemini/Ollama evidence refined; LM Studio native `store:false` and OpenRouter Images endpoint pin conflict with the frozen plan |

## Smoke log

- No smoke run yet. Provider smoke requires the corresponding implementation phase, current credentials, and exact-body evidence.

## Risks and blockers

- Gate 0 blocks production edits until the remaining Owner choices are frozen and recorded: canonical packaged `appId`; OpenAI continuation mode; LM Studio native continuation/storage mode; OpenRouter beta server-tool exposure; automatic transport retry policy; image continuation first-release scope; Anthropic `thinking.display` exposure. Recommended defaults in the plan are not treated as implicit Owner decisions.
- `package.json` proves `productName: "Starverse"`; `electron-builder.json5` still contains `appId: "YourAppID"` and `productName: "YourAppName"`. No canonical appId was found in repository architecture/ADR sources, so the epoch root marker cannot safely be implemented by guessing one.
- Anthropic's exact current model × thinking × effort × sampling × web-tool matrix and Gemini Interactions continuation fields require fresh official-evidence fixtures before those contracts can be enabled; this is evidence work, not a reason to widen or fall back.
- Current official evidence closes most of the Anthropic matrix and proves `thinking.display` is a formal capability-gated field. Older basic web-search combinations without exact evidence remain unavailable.
- Hard contract blocker: LM Studio native `/api/v1/chat` cannot provide client-managed multi-turn continuation with `store:false` because it returns no response id and does not accept assistant history. The Goal 1 recommendation requires an Owner correction.
- Hard contract blocker: OpenRouter endpoint records expose `provider_tag`, but the dedicated Images request OpenAPI has no request-side selector field beyond `provider.options`. The Goal 1 `provider.only` pin shape is not currently official. Contract enablement requires updated official schema or authenticated exact-body smoke.
- Current facts support but do not replace Owner choices: provider generation POSTs perform no automatic retry; OpenAI Responses has no native continuation artifact and replays only generic role/text history; Gemini Interactions image requests explicitly reject history; image regenerate is only question-level sibling generation; LM Studio currently sends `store:false`.
- Current startup constructs and migrates `Store(config.json)` before `app.whenReady`, then opens `<userData>/chat.db`, runs legacy schema/ensure helpers, opens `<userData>/debug/generation-raw.sqlite`, registers IPC/window/jobs, and never owns an epoch marker/lock/journal. Epoch V2 must move config/service construction after a successful coordinator and must never call legacy credential read/migration APIs while filtering.
- The exact preservable records are `providerCredentials.v1.{openrouter,openai_responses,google_ai_studio,anthropic,deepseek}` with valid provider key, version 1, `electron_safe_storage`, non-empty ciphertext, valid timestamp, and successful decrypt. Plaintext fallback, legacy plaintext keys, catalog HMAC, compatible credentials, custom endpoints/secrets, and backups are deletion-only.
- Any official-contract conflict, reset path outside the managed epoch root, credential outside the closed preservation whitelist, or explicit semantic intent that a provider codec cannot express is a stop condition.
- `better-sqlite3` ABI must be switched deliberately: Node before DB/Vitest acceptance; Electron only for the final Electron smoke.

## Remaining work

1. Obtain and record the remaining Gate 0 Owner decisions listed below; no production edit is allowed before they are frozen.
2. Resolve the LM Studio continuation and OpenRouter Images pinning contract conflicts; add the Owner decision ADR only after exact choices/evidence are available.
3. Implement G2-1 through G2-7 without compatibility or fallback paths.
4. Close every AC with direct code/test/smoke evidence and run the complete gate sequence.

## Gate 0 Owner decision packet

| Decision | Plan-recommended value awaiting explicit approval |
|---|---|
| Canonical packaged identity | `productName = Starverse` is repository-proven; Owner must provide the exact stable `appId` (no inferred `com.*` value) |
| OpenAI Responses continuation | Client-managed complete native response/reasoning/encrypted/tool/image items; no `previous_response_id` or conversation fallback |
| LM Studio native continuation | Client-managed `store:false`; endpoint profile explicitly pins one protocol/codec revision |
| Ollama/local protocol binding | Every endpoint profile requires one explicit protocol choice; no probing/fallback to another codec |
| OpenRouter beta server web tool | Disabled by default; explicit experimental opt-in and capability/evidence gate |
| Automatic transport retry | Disabled for every provider; attempt remains 1 until a separately approved provider/error idempotency matrix exists |
| Image continuation first release | Enable only official native edit/continuation contracts with complete artifacts; otherwise visibly unavailable; sibling regenerate remains separate |
| Anthropic `thinking.display` | Owner must choose whether the capability-gated field is user-facing or compiler-unavailable; native continuation blocks are preserved either way |

## Update log

- 2026-07-13: Started Goal 2 on clean `main` at `5b873c5384dad4ac512788ed8223ee5e6ac2885e`; created this ledger before production changes.
- 2026-07-13: Read the complete Goal 1 implementation baseline. Confirmed its explicit Gate 0 rule forbids production edits before the remaining Owner choices are frozen; began read-only source mapping instead of guessing defaults.
- 2026-07-13: Completed the first provider-path map. Confirmed generic `wirePath`/request patch ownership, multiple body construction paths, missing OpenRouter Images contract, asymmetric native continuation, and extensive fallback/unknown-patch deletion work. No production file was changed.
- 2026-07-13: Mapped generation commands and continuation. Existing branch transactions already prove operation idempotency, strict chosen validation, immediate chosen/head switching, replace-hide, non-rollback terminal finalization, and orphan recovery, but remain V1 and omit initial send/edit, capability/config revision, request/attempt ledger, prepared bytes, and full projection return. Confirmed OpenAI/Gemini image continuation gaps and absence of automatic generation POST retry.
- 2026-07-13: Completed the epoch/reset/credential map. Confirmed the current module-load config migration and legacy DB startup occur before any safe epoch boundary; froze the exact five-leaf strict-copy contract, V2 startup seam, legacy reset deletion inventory, and required crash/path/credential tests. Canonical `appId` remains unprovable from the repository and is a hard Owner blocker.
- 2026-07-13: Re-verified current official provider contracts. OpenAI client-managed native-item continuation is supported; Anthropic `thinking.display` and exact modern model constraints are formal; Gemini v1beta Interactions exposes native id continuation; Ollama protocols remain distinct. Found two hard plan conflicts: LM Studio native cannot do multi-turn with `store:false`, and OpenRouter Images documents `provider_tag` but exposes no request-side pin field in its official request schema. Recorded the full audit and stopped before production edits.
