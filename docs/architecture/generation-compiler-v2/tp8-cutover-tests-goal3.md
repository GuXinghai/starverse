# TP8 — Atomic cutover, deletion, test acceptance, and Goal 3 input

Verified 2026-07-13. Goal 2 is one production cutover, not incremental compatibility.

## Scope

Sequence the destructive epoch and Generation Compiler V2 implementation, enumerate zero-residual legacy deletion, define automated/live acceptance, and produce the mandatory Goal 3 risk-review input.

## Current evidence

- Main branch operations already prove chosen/head transaction semantics: `infra/db/worker.branchOps.test.ts:79,142,206,251`.
- HEAD-only operation/idempotency/replace/as-new/orphan recovery tests are useful material: `infra/db/worker.answerGenerationCommands.test.ts:35-313`.
- Existing tests that lock provider fallback, provider-wide capability, generic wire mapping, and warning-and-send must be deleted/replaced (TP1/TP5 lists).
- DB/reset/config/credential/path/raw tests listed in TP2 provide primitives but do not prove an epoch reset.
- Current provider builder tests inject native patches directly, so they cannot prove semantic→capability→codec composition.

## Goal 2 implementation order

Prerequisite gate (a closed contract slice may enter production; each unresolved item blocks only its own package/epoch surface):

1. Reconcile current HEAD's two ahead commits onto a branch based on local main; re-run evidence map if main changes.
2. Apply the Owner-fixed `io.github.guxinghai.starverse` / `Starverse` packaged identity from one authority and implement the frozen `%APPDATA%\Starverse\workspace\epoch-2\starverse.db` root; `.dev`/`.e2e` change only dev/E2E runtime AppUserModelID, and ordinary launches explicitly share the production data root. A non-empty smoke/diagnostic `--user-data-dir` override creates no managed-root identity.
3. Bind every Gemini Developer API codec to the provider-owned `v1beta` version and add guards against scattered version literals or fallback.
4. Freeze OpenAI continuation, OpenRouter beta-tool exposure and transport retry policy; carry forward the already-fixed LM Studio `lmstudio-openresponses` qualification result, reset and endpoint-descriptor policies.
5. Freeze current Anthropic model rule matrix.

Implementation batches:

1. Fresh V2 schema, epoch root/marker/lock/journal/reset safety, and credential filter.
2. Semantic config, sparse persistence, immutable snapshot, continuation artifact, and operation/request/attempt ledger.
3. Capability evidence resolver/revision and UI-neutral projection type.
4. Compiler, exhaustive ledger, deterministic serializer, prepared bytes, pure transport, Raw Debug hook.
5. Provider contract packages with exact fixtures; do not enable a package until contract tests pass.
6. Unified commands/runner/terminal finalizer/orphan recovery; migrate all send/regenerate/retry/edit/continuation actions.
7. UI capability projection and immediate committed-answer switching.
8. Delete all old paths, schemas, settings, fixtures, IPC, builders, fallback, and compatibility code.
9. Architecture guards, full validation, live provider smokes, packaged fresh-profile epoch smoke.

## Fourteen-step atomic production cutover

The baseline's 14 actions are retained but made executable in one release:

1. Ship only fresh V2 schema at `%APPDATA%\Starverse\workspace\epoch-2\starverse.db`.
2. Run data epoch coordinator before any DB/IPC/window.
3. Enable only `generation_config_v2` persistence/resolver.
4. Enable revisioned capability resolver/evidence cache.
5. Route every generation command to `compileGenerationV2`.
6. Enable only completed provider contract packages.
7. Project UI solely from the same capability revision.
8. Make every transport accept only immutable prepared bytes.
9. Remove V1 snapshot schema/type/IPC and legacy records with the epoch.
10. Remove legacy settings/meta registration/read/write.
11. Remove legacy builders, adapters as entrypoints, bridge body reconstruction, protocol fallback, and raw IPC bypass.
12. Remove/update fixtures that assert old wire shapes, fallback, or warning-and-send.
13. Require epoch reset on first V2 start and block the app until committed.
14. Run packaged fresh-profile + second-start idempotency + representative live smoke before release acceptance.

No feature flag may restore the old request path. Application rollback must not open the V2 epoch root.

## Zero-residual deletion inventory

The deletion gate uses symbol/path/key/table searches and must report zero runtime hits:

- generic `wireKey`, `wirePath`, request mapping, automatic unknown patch, automatic `extraBody`, fallback mode; the separately versioned `openai_chat_compatible` extension contract is retained and must be covered by exact-body/ownership tests;
- old generation param mapper/resolver/profile wire metadata and warning/no-effect tests;
- split reasoning/web/sampling/image/Gemini config owners and legacy settings/meta keys;
- answer→chosen→question/provider-only/OpenRouter legacy resolvers;
- OpenRouter plugin/`:online`, chat image output, bridge fallback, renderer transport alternative, legacy credential facades;
- V1 snapshot and legacy generation commands/IPC after caller migration;
- compatible targeted reset/legacy capture and unknown semantic promotion;
- provider body reconstruction or mutation in transport;
- synthetic OpenAI normalization as native artifact truth;
- DB schema ensure/migrations and old reset scripts/functions;
- UI provider/model regex, fallback enums, provider-native imports;
- old tests/fixtures whose accepted behavior violates V2.

Some filenames may remain only if fully repurposed with no old symbol/contract; deletion audit is semantic as well as path-based.

## Test layers and commands

1. Semantic schema/inheritance/sensitive-field tests.
2. Capability evidence/revision/UI projection matrix, including OpenRouter user-owned binding, sole-eligible auto-bind, multiple-eligible selection-required, stable display-only ordering, duplicate-tag rejection, provider tag/slug binding, missing-bound-tag invalidation, mismatch and descriptor revision fixtures.
3. Snapshot/continuation/attachment artifact integrity.
4. Exact provider-native serialized request fixtures, including OpenRouter Images `provider.only:[provider_tag]` plus `allow_fallbacks:false` and no top-level tag.
5. LM Studio 0.4.19+ conformance fixtures reproduce the local exact bodies and complete Responses items: `store:false`, no `previous_response_id`, multi-turn, branch, persisted-artifact process restart, reasoning, function call/output and SSE events. Separate Starverse coordinator fixtures cover completed/failed/incomplete/cancelled/connection-close with exactly one terminal. Qualification taxonomy proves transient/inconclusive failures leave the endpoint unbound and never start Chat; the endpoint profile is fixed before sending and no runtime error changes it.
6. End-to-end semantic→capability→codec→bytes composition, including selected-descriptor parameter rejection.
7. Exhaustive disposition/no-silent-drop tests.
8. Commands/branch transaction/idempotency/concurrency/orphan terminal invariants.
9. Transport/request/attempt/Raw Debug exact-byte tests.
10. Data epoch path safety/crash recovery/credential preservation/downgrade isolation.
11. UI selector/generating/failed/cancelled/error projection tests.
12. Architecture guards and zero-residual search, including no LM Studio `/api/v1/chat` ordinary route and no Responses→Chat mapper reuse.
13. Representative live provider/protocol smoke plus packaged fresh-profile smoke; retain both 2026-07-14 OpenRouter Images fixtures and the local LM Studio Responses compliance evidence.

Validation order:

```text
npm run rebuild:node
focused repository/IPC/UI/compiler/provider/epoch tests
npx tsc --noEmit --pretty false
npx vue-tsc --noEmit
npm run gate:network-egress
full automated suite
git diff --check
npm run rebuild:electron
packaged/dev Electron fresh-profile epoch smoke and representative live smoke
```

Native rebuild output, `node_modules`, rebuild-only lock changes, `public/build-id.json`, and unrelated dirty files are never committed.

## Corrected acceptance matrix

Baseline IDs remain stable; AC-18 and AC-19 are corrected by current official evidence, and AC-24 is corrected by the Owner-authorized 2026-07-14 OpenRouter Images routing smoke.

| ID | Acceptance |
|---|---|
| AC-01 | Exactly one generation config schema. |
| AC-02 | Exactly one compiler entry. |
| AC-03 | Every generation action enters it. |
| AC-04 | Core has no `wireKey/wirePath`. |
| AC-05 | Native request contracts have no provider unknown patch. `openai_chat_compatible` alone permits explicit, versioned, bounded extensions with ownership, snapshot, ledger and exact-body evidence. |
| AC-06 | UI imports no native request type. |
| AC-07 | Codecs read no DB/localStorage/Vue state. |
| AC-08 | Transport neither constructs nor modifies body. |
| AC-09 | Every explicit semantic path has disposition. |
| AC-10 | Unsupported/unverified config fails before fetch. |
| AC-11 | UI/compiler use the same capability revision. |
| AC-12 | Catalog does not directly choose wire fields. |
| AC-13 | Anthropic never emits `thinking.type:true`; `thinking.display` is provider-specific three-state intent with product default `summarized`: `provider_default` omits native `display`, and `summarized`/`omitted` encode exactly only with enabled thinking. Disabled thinking sends no display while its persisted setting remains an explicit accepted-no-wire disposition. |
| AC-14 | Anthropic modes are exact-model constrained; `omitted` preserves complete returned native thinking blocks, signatures and order for continuation and never means thinking is disabled or unbilled. |
| AC-15 | Anthropic image output cannot enable. |
| AC-16 | OpenAI emits native `web_search`. |
| AC-17 | OpenAI image tool supports verified current native fields. |
| AC-18 | OpenAI V2 emits only supported `reasoning.effort` and `reasoning.summary`; any explicit unsupported reasoning field is compiler-rejected. `context_management`, if later approved, is a separate top-level capability. |
| AC-19 | Gemini Developer API version is owned once by the provider contract and fixed to `v1beta`; GenerateContent, Interactions, and future Agents use separate codecs with no version fallback or scattered endpoint literal. |
| AC-20 | Gemini Interactions search is `type + search_types`. |
| AC-21 | Gemini image response format emits only verified MIME values. |
| AC-22 | OpenRouter web uses server tool without plugin fallback. |
| AC-23 | OpenRouter image generation uses only `/api/v1/images`. |
| AC-24 | OpenRouter Images binding key is credential scope + model + image-generation. The persisted record includes providerTag/providerSlug, descriptorRevision/digest and `selectedBy:user|sole_eligible`. A valid bound tag remains selected; exactly one eligible unbound descriptor atomically auto-binds; multiple eligible return `OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED`; duplicate tags invalidate the set. UI places the binding first and code-point sorts only remaining tags without selecting. Missing/incomplete/hard-expired binding stale-rejects; changed intent unsupported by the binding returns `BOUND_ENDPOINT_CAPABILITY_MISMATCH`. User rebind is required before a new command. Exact `provider.only:[providerTag]` plus `allow_fallbacks:false` is mandatory; endpoint options use `providerSlug`, are allowlisted, and are revalidated/cleaned on binding change. No automatic selection, downgrade, same-command switch or resend exists. |
| AC-25 | DeepSeek stable owns origin `https://api.deepseek.com`, Chat `/chat/completions`, and Models `/models`, with no `/v1` append/probe/fallback and no automatic `/beta` switch. Stable function tools reject the Beta-only `strict` field before compilation and never use it to select Beta. Thinking sends no explicit no-effect sampling; omitted `tool_choice` stays absent, while every explicit thinking-mode `tool_choice` fails before compilation with `DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED`. Thinking-disabled `tool_choice` follows the formal Chat schema. |
| AC-26 | DeepSeek persists and exactly replays ordered native assistant `content`, `reasoning_content`, and `tool_calls` plus corresponding tool messages across multi-turn, tool continuation, restart, branch, retry, regenerate, and edit-resend. Missing required `reasoning_content` rejects before fetch; streaming reasoning/tool deltas assemble without visible-text reconstruction, with exact-body/native-round-trip/provider-400 regression coverage. |
| AC-27 | Generic/local advanced capability defaults off and protocol is fixed. LM Studio 0.4.19+ qualifies Responses first; the selected binding persists as `lmstudio-openresponses` only after full native-item/branch/restart/tool/SSE compliance and separate Starverse terminal tests. Transient/inconclusive qualification failure leaves the endpoint unbound; only a repeatable contract failure on a healthy runtime permits a separately invoked and proven `lmstudio-openai-chat-completions` qualification. Runtime requests never switch, and `/api/v1/chat` is unavailable for ordinary conversations. |
| AC-28 | Legacy project/conversation/message/branch rows are zero. |
| AC-29 | V1 snapshots are zero. |
| AC-30 | Legacy managed attachments/images/derived/cache are removed. |
| AC-31 | Legacy generation settings/meta keys are unregistered. |
| AC-32 | The production identity is exactly `io.github.guxinghai.starverse` / `Starverse` / `starverse-client`; its verified manifest owns `%APPDATA%\Starverse\workspace\epoch-2\starverse.db`, which contains only V2 schema and never opens legacy `chat.db`. Ordinary `.dev`/`.e2e` launches explicitly share that data root; a non-empty explicit `--user-data-dir` is a bounded smoke/diagnostic override, not another managed-root identity. |
| AC-33 | Only the five named, schema-valid `providerCredentials.v1.*` records using `electron_safe_storage` survive. |
| AC-34 | Custom endpoints/secrets are removed. |
| AC-35 | Reset is crash-resumable and idempotent under the canonical production ownership identity used by its manifest and coordinator lease. |
| AC-36 | Reset never deletes outside roots proven for the canonical production ownership identity; `.dev`/`.e2e`, `com.starverse.desktop` and arbitrary IDs grant no independent ownership of the shared root. |
| AC-37 | All static checks pass. |
| AC-38 | Full automated suite passes. |
| AC-39 | Every enabled representative provider/protocol live smoke passes. |
| AC-40 | Prepared/request ledger body hash equals transport and Raw Debug bytes. |
| AC-41 | Snapshot contains no credential/secret header. |
| AC-42 | Goal 3 Critical/High accepted-unresolved findings are zero. |

## Goal 3 review input

Goal 3 must independently inspect at minimum:

1. Epoch root/marker/lock/journal and symlink/junction/reparse safety.
2. Credential filtering, backup deletion, secret exclusion, Raw Debug boundary.
3. Schema/transaction FK/uniqueness/idempotency and orphan recovery.
4. Snapshot immutability/version/hash/attachment revision.
5. Capability evidence authenticity/freshness/revision race.
6. Exhaustive compiler ledger and absence of unknown injection.
7. Exact byte identity across serializer, ledger, Raw Debug, transport.
8. Provider request/response/continuation conformance.
9. Tool side-effect reconfirmation and multi-request sequencing.
10. UI stale state/concurrent click/renderer reload/multi-window behavior.
11. Downgrade and whole-app rollback isolation.
12. Zero-residual legacy/compatibility/fallback audit and test gaps.

Each finding records severity, trigger, affected contracts/data, proof, required fix, owner, and verification test. Release is blocked by any Critical/High item.

## Risks and unresolved prerequisites

All remaining Owner/blocker items from TP1–TP7 are release prerequisites, not deferred technical debt. The highest risks are branch-base reconciliation, packaged app identity and epoch deletion safety, Anthropic model rules, continuation-mode choices, exact OpenRouter endpoint selection/freshness, and removal of every body fallback/unknown patch. Gemini version is a frozen `v1beta` implementation constraint, not a blocker.
