# Request Rules V2 migration contract

- **Status**: implementation, targeted automated validation, and available-profile runtime preservation/readback audit complete, with live-provider limits recorded below
- **Document role**: Owner-confirmed migration contract and acceptance gates
- **Last updated**: 2026-10-17
- **Authority**: This contract records the confirmed Request Rules V2 decisions. It does not claim phase closeout, stabilization, or full project completion.
- **Related owner contract**: [Owner-frozen Model Facts architecture](../analysis/models-dev-capability-resolution/06-owner-frozen-model-facts-architecture.md)
- **Rollout reality**: The `basic-exploration` profile migration and four-pack User V2 import/save are complete. No real Cloud Rules Release has been published; Cloud publication is outside this migration's scope. No implicit Cloud publication or bundled Rule installation occurred. This status does not claim runtime acceptance for every supplier.

## 1. Request path and authority boundaries

The request path is:

```text
user intent
  → canonical facts + applicable Rules resolver
  → frozen ResolvedInvocation
  → protocol Codec
  → API body-shape contract
  → endpoint transport and operation lifecycle
```

The Model Facts resolver supplies canonical subject facts. Request Rules supply typed constraints and decisions for the selected subject, profile, category, and operation. The resolver produces one immutable invocation before a send begins. A Codec encodes that invocation for a protocol operation; a body contract checks the wire shape; endpoint transport owns endpoint selection and network behavior.

`APIContract` is limited to protocol body shape, field types, nesting, and fixed protocol-level enums. It does not describe a model's parameter availability, defaults, supported ranges, or model-specific parameter combinations. Those are Model Facts or Request Rules inputs. `EndpointTransportDefinitionV2` owns endpoint and transport choices separately from body shape.

Model-specific supported values and protocol-level enum values are different facts. For example, a protocol may define the enum members accepted by a field, while a model Rule limits which of those members may be used for one model and operation.

## 2. Rules source and precedence

The only Request Rules owners are Cloud and User Packs within the existing single Capability Rules source. Cloud content takes effect only after Apply; the applied snapshot is the Cloud Last-Known-Good (LKG). A refresh candidate does not affect requests. User content takes effect only after the User draft is saved. A User draft remains recoverable and cannot alter committed Rules or an already frozen invocation.

There is no automatic bundled Rule installation. The `basic-exploration` profile has received and saved four explicit User V2 packs; live-supplier coverage and the final preservation/readback audit are tracked in Section 9. The former bundled installation dataset and request-time selector adapter remain retired. Request Rules V2 does not restore that selector authority: the subject is bound before Send, and only the closed, typed Rule paths described below are interpreted.

The user-configured Model Facts source-priority defaults for **new profiles** are:

| Source | Default priority |
|---|---:|
| Provider Native | 3 |
| Capability Rules | 2 |
| models.dev | 1 |

These values are new-profile defaults only. Existing profiles keep their stored priority values unchanged; migration must not rewrite them. The resolver uses each profile's persisted configuration. Cloud and User ownership do not add another source-priority tier, and Pack/Rule priority remains internal to the Capability Rules source.

Within Rules, exact subject matches outrank regex matches. After match specificity, compare the sum of Pack priority and Rule priority. Conflicting effects for the same `decisionKey` at equal summed priority produce a conflict; the resolver must not pick an arbitrary winner. Distinct decision keys are independent validators and all must pass. Category and Cloud/User ownership do not add implicit priority.

## 3. Rule V2 shape and evaluation

Each Rule V2 record is typed data with these fields:

- `category`;
- `when`;
- `effect`;
- `decisionKey`;
- `dependencies`.

The closed category set is:

1. reasoning;
2. sampling;
3. context quotas;
4. input;
5. tools;
6. search and citations;
7. image generation;
8. output;
9. operations.

An interpreter evaluates only registered closed paths and typed values. Rule payloads do not contain expressions, executable scripts, arbitrary path access, or an open-ended evaluation language. Thinking policies use the typed interpreter and data Rules; they must not branch on model identity in code.

The Rule proof is captured in the frozen invocation, including the matched Rule identities/revisions and the decisions needed to explain the result. Required values that remain unknown fail through the existing validation/error channel. The system does not silently guess, raise, lower, or substitute a required value.

## 4. Confirmed protocol-specific behavior

The following confirmed differences are constraints for the migration and its acceptance cases:

- **Luna sampling and reasoning**: send reasoning effort `none` explicitly. Preserve a selected temperature of `0` or `0.4` as entered; do not drop or normalize those values. The previously observed `low` + temperature `0.4` combination returned HTTP 400 and must be blocked by the applicable temperature Rule. Do not generalize support to unverified combinations. A non-`none` effort paired with a temperature covered by the blocking Rule is rejected through the existing validation channel.
- **Anthropic thinking budget**: after resolving the generation defaults, the thinking budget must be strictly less than the actual request `max_tokens` value (`maxOutputTokens`). Compare against that resolved request value, not the model's capability maximum. An equal or larger budget is blocked; the resolver does not raise or reduce it automatically. Preserve the four value origins (`upperbound`, `providerdefault`, `appfallback`, and `uservalue`) so the decision and UI explanation retain their source. Only when an applicable Rule declares the thinking control non-closable does the UI show it on and disabled. Preserve a disabled saved preference; do not apply this UI behavior to every Anthropic model.
- **Unknown required request data**: if a required parameter or operation decision cannot be established from facts and applicable Rules, return the existing validation/error result. Do not treat unknown as supported and do not emit an inferred value.

## 5. Protocol and operation coverage

The migration scope covers these eleven protocol or operation paths. Each retains its own body nesting, codec revision, and endpoint transport definition:

1. OpenAI Responses;
2. OpenAI Chat-compatible;
3. OpenRouter Chat;
4. OpenRouter image generation;
5. Anthropic Messages;
6. DeepSeek Chat;
7. Gemini GenerateContent;
8. Gemini Interactions text, image, and other already-supported operations;
9. LM Studio OpenResponses;
10. Ollama Chat;
11. Generic Local OpenAI Chat.

The shared resolver does not erase protocol differences. Text and image-generation operations remain distinct; Responses, Chat-compatible, Messages, GenerateContent, Interactions, and OpenResponses retain their protocol-specific body shape; transport remains endpoint-specific. Tool calls, search/citation payloads, image input, and image generation are encoded only where the selected operation contract supports them.

## 6. Frozen invocation and historical compatibility

New request plans use schema version 2 and freeze the Rule resolution proof with the `ResolvedInvocation`. They bind the exact subject, operation, relevant fact and Rule revisions, resolved values and decisions, and the selected body and transport encoder revisions.

Body and transport encoder revisions are versioned per protocol and operation. There is no global aggregate encoder revision that changes unrelated request plans. A retry or replay uses the original frozen plan and its original revisions; it does not re-resolve current Rules or substitute current profile values.

Historical registries, codecs, and frozen plans remain readable. Historical retries preserve their original request semantics through their original versioned decoding and encoding path. A schema migration may add the new V2 records and SQL ontology, but must not rewrite or reinterpret historical plans.

The database schema epoch and closed schema manifest must be migrated for the new persistence contract. The migration is gated on versioned reads, atomic persistence of the Rule proof, and preservation of older snapshots and recovery paths. The precise epoch value follows the implementation's schema-digest process and is not a document-level constant.

## 7. State preservation across migration

Cloud Rules retain the existing candidate, Apply, and LKG lifecycle. Candidate acquisition or validation alone cannot change the applied Cloud snapshot. Apply publishes the candidate atomically; a refresh failure preserves the applied LKG. A failed Apply leaves the candidate available for inspection or retry.

User Rule editing retains its durable draft and batch-save boundary. Migration, import, or validation failure preserves the recoverable draft. Neither an unsaved draft nor a Cloud candidate changes the active Rule source or an invocation already frozen for retry/replay.

The migration must not auto-install a local or bundled Rules pack. The `basic-exploration` profile migration is complete, including explicit UI import and Save of four User V2 packs. Reviewed test Rule artifacts can be exported with:

```powershell
node scripts/rules/export-reviewed-request-rules-v2.mjs <absolute-output-directory> [model-scopes.json]
```

The command exports Rule Pack JSON files and a manifest marked for `user-import` and `explicit-import-and-save`. Import and Save them through the User Rules workflow; export alone does not install them or publish a Cloud Release. No real Cloud Rules Release has been published, and publishing one is outside this migration's acceptance scope.

### Legacy V1 import and draft preservation

Importing a V1 file into a V2 profile upgrades it to V2; it does not downgrade the profile. The service validates the V1 digest before conversion. When a V1 pack merges into a same-identity V2 pack, V2-only Rules and notes are preserved. If the same Rule ID has V2-only data that the V1 format cannot represent, the existing `IDENTITY_COLLISION` result rejects the merge rather than dropping that data.

When V1 and V2 owners coexist, conflicting Rule content, pack metadata, or notes block the migration so the old source is not removed. The V1 writer returns the existing `STALE` result while a V2 owner or dirty V2 draft exists. If a dirty V2 draft is the blocker, canceling it lets the user return to V1 editing. User-facing exports always use V2; legacy internal read interfaces remain V1 for historical compatibility. The existing User Rules form continues to add a single Rule through the V1-to-V2 converter, with no extra prompt.

The current User Rules UI stores requested web settings, thinking-off and budget-zero choices, and image choices as entered. It does not filter choices by model-domain first-choice values; applicable facts and Rules resolve or reject the request downstream.

### Original parameters and tool definitions

Resolver revision `request-rule-resolver-v2:20261017-4` carries the 21 accepted generation-setting keys in a closed `requestedParameters` envelope, retaining explicit values, omissions, and the available scope source. The requested web intent also retains an inherited search prompt. The applied `requested_parameters` Rule selects the target mappings or records deferred values before reasoning and parameter validation; unresolved original parameters fail locally rather than disappearing in the UI builder. Conflicting explicit controls and an unrepresentable explicit Anthropic budget fail through the existing error channel. Historical intents without the envelope retain their original projection.

UI configuration readback also understands this envelope. Conversation custom/omit entries retain their modes, project/global entries remain inherited, and absent entries do not become synthetic omissions. Raw reasoning values and active or dormant search prompts are retained. This prevents changing one setting after hydration from overwriting another original parameter. Older saved configuration without the envelope remains on its versioned compatibility projection; its missing historical source labels are not guessed or rewritten.

Control modes are resolved before image defaults and ratio mapping. Conditional facts precede those defaults, and final control validation also checks facts that arrived after the control step. An empty Rule bundle does not authorize known unsupported, missing, conflicting, or out-of-domain values. Unknown explicit native values still require an encoder path and a valid body shape; this does not establish model support.

OpenAI Responses and LM Studio tool definitions are resolved before freezing the invocation. The frozen proof binds the registry revision and digest, source and effective definitions, and any applied defaults. `tool_definition_defaults` supplies missing parameters and strictness only through an applied Rule; an explicit `strict: false` is preserved. New prepared compilers consume the frozen definitions. The previous LM Studio body/encoder revisions and strict-true codec remain readable for historical requests; the new local codec accepts a boolean strict field. LM Studio service-side behavior for `strict: false` remains unverified.

New Anthropic body revisions require `budget_tokens` when thinking is enabled. The previous body schema and its paired encoder-v3 remain registered per operation, alongside encoder-v2; historical requests retain the older optional-budget schema rather than acquiring the new constraint.

## 8. Acceptance gates and non-goals

The scoped acceptance gates are listed below. Section 9 distinguishes automated integration, actual provider observations, preservation audits, and remaining live-provider limits; passing a prepared compiler does not establish live-provider acceptance.

- schema epoch migration and versioned persistence preserve historical plans, Rules drafts, any applied Cloud LKG when present, and unapplied candidates;
- all eleven scoped protocol/operation paths build a plan with the correct per-operation body and transport revisions (automated prepared-compiler foundation coverage, with actual Electron coverage limited to the providers listed in Section 9);
- retries and replays preserve the original frozen invocation and do not consult changed Rules or profile values;
- matching follows exact-before-regex, then Pack/Rule priority; equal-priority conflicts fail explicitly and distinct validators all apply;
- model-specific parameter availability/default/range/combination rules stay outside `APIContract`;
- the new source-priority defaults affect new profiles only, while existing stored priorities remain byte-for-byte unchanged;
- Luna effort `none` is sent, selected temperatures `0`/`0.4` are preserved, and the observed rejected combination is blocked; Anthropic compares the thinking budget with resolved request `max_tokens`, and only Rule-marked models receive a non-closable thinking control;
- explicit User artifact import and Save are complete for the `basic-exploration` profile; no implicit installation or Cloud publication occurs, and real Cloud publication is outside scope;
- the explicit image-output/default/mapping Rule and the Anthropic body-shape constraint that enabled thinking requires a budget are implemented and validated;
- unknown required values use the existing validation/error channel and no bundled Rule dataset is installed automatically.

Non-goals for this migration are a new Model Facts source, a general-purpose expression language, an automatic parameter repair policy, a replacement Cloud distribution lifecycle, and rewriting historical frozen plans. Static review or implementation progress alone does not satisfy runtime, validation, stabilization, or project-completion gates.

## 9. Validation record (2026-10-17)

This is a layered status record. Automated test passes, static checks, in-app runtime observations, database preservation audits, and unverified scenarios are listed separately; they must not be combined into one overall “all paths passed” claim.

### Automated and static checks

- The final `npm run typecheck -- --pretty false` passed with exit code `0` after the original-parameter, tool-definition, image-control/default, and historical Anthropic body changes.
- The current validation partition passed: 659 files (360 unit, 90 UI, 209 integration). The final Goal 3 authority gate also passed (1,177 files scanned). These are inventory counts, not executed test totals.
- The latest pure group passed 10 files / 83 tests. A subsequent focused recheck of the final resolver and body/encoder registries passed 2 files / 27 tests; these overlapping batches are not summed.
- The latest actual prepared-compiler integration passed 8/8, including explicit `strict: false` and the source tool description. The OpenAI authority and Gemini sending group passed 2 files / 30 tests. Anthropic regeneration and Gemini image integration passed 4/4 and 13/13 respectively.
- The final native-search UI file passed 11/11 using `--testTimeout 15000`; its fixtures explicitly import and save the V2 packs. A preceding default-timeout run had 10 passes and one 5-second timeout, with no assertion failure. Persisted original settings and resolved native defaults are asserted separately.
- Final Electron validation found that the UI readback projection ignored the original-parameter envelope. The projection was repaired; its unit file passed 7/7, including source inheritance, omissions, quick reasoning state, and dormant search prompts. The semantic-invalidation UI file then passed 12/12, including a real App hydration/force-save regression that verifies a new configuration revision, changed web intent, and preserved raw values after DB readback. The requested-web projection UI file also passed 12/12. The new round-trip test's initially invalid seed was corrected to the configuration-layer contract before acceptance.
- The current User Rules panel test passed **4/4**, including the restored V2 Rule entry in the existing form through the unified V1-to-V2 single-Rule conversion.
- User V1/V2 persistence tests passed **19/19** across two files, and the pure transfer tests passed **3/3** (exit code `0`).
- `git diff --check` passed with no whitespace errors.
- An earlier OpenAI authority component run passed **24/24**, covering the fresh no-Rule profile V2 path, frozen retry, and V2 Rule parameters. The final combined authority/Gemini sending run is recorded above.
- [`electron/services/requestRuleActualPreparedCompilerV2.integration.test.ts`](../../electron/services/requestRuleActualPreparedCompilerV2.integration.test.ts) passed **8/8**: OpenRouter Chat tool and reasoning enum mapping; OpenRouter Images URL input, size, endpoint and `/api/v1/images`; Generic Local temperature; Ollama `think`; LM Studio registry tools and reasoning; OpenAI explicit `strict: false`; DeepSeek effort; and OpenAI-compatible endpoint, config, native history, and effort behavior.
- [`electron/services/anthropicPlainTextRegenerateCoordinatorV2.test.ts`](../../electron/services/anthropicPlainTextRegenerateCoordinatorV2.test.ts) passed **4/4** for V2 adaptive thinking, display behavior, and function-tool cases. This is automated integration evidence, not a live Anthropic provider session.
- [`electron/services/geminiInteractionsImageGenerationV2.test.ts`](../../electron/services/geminiInteractionsImageGenerationV2.test.ts) passed **13/13**, covering the V2 image path, required thinking level, resolution, and aspect ratio.
- [`electron/services/geminiThinkingSendV2.test.ts`](../../electron/services/geminiThinkingSendV2.test.ts) passed **6/6**, including actual functions and the web-tool array ledger path.
- Three latest pure-test groups passed **23 tests**, including Gemini unknown handling across two protocols, the 11-path matrix, and three transport cases.
- Incremental risk review identified the missing historical Anthropic body/encoder alias; the exact per-operation registry was restored and the focused registry tests passed. The follow-up static review found no remaining P0/P1 in that repair. Historical Anthropic requests were not exercised against a live provider.
- Earlier reported batches were 33 unit-test files / 262 tests, 21 integration-test files / 141 tests, and 8 UI-test files / 95 tests. These counts describe those earlier batches; later incremental checks followed, and no deduplicated cumulative total is asserted.
- All 11 paths have V2 actual prepared-compiler foundation integration. The prepared-compiler file exercises the endpoint-specific cases above; this does not claim full live-provider runtime acceptance for all 11 paths.
- The Gemini unknown-thinking fix no longer omits configuration while claiming the required state is on. Tool-registry evidence is bound to registry revision, digest, and this validation timestamp. OpenRouter Images no longer duplicates the version prefix in the complete request path.

### In-app Electron and profile observations

- The actual `basic-exploration` profile migration is complete: four User V2 packs were imported and saved through the UI, and source priority was explicitly set to Provider Native `3`, Rules `2`, models.dev `1`.
- A `better-sqlite3` ABI mismatch occurred earlier when DB-backed UI fixtures ran with the Electron binary. The Node ABI rebuild and scoped retries completed. The final raw-readback repair was checked with Node tests before another successful Electron rebuild and actual app validation; the final ABI target is Electron.
- The connected, normally networked Electron app made a TCP connection to `127.0.0.1:10808` through the in-app proxy.
- Luna sent reasoning effort `none` and preserved the selected temperature values `0` and `0.4`. The local Rule rejected `low` + `0.4` while retaining the draft; operation, request, snapshot, message, and raw-request counts each remained unchanged. A real partial-stop action passed.
- A frozen retry still started successfully after current configuration was made invalid; the retry used the original `planHash` and `wireHash`.
- Multi-turn image/text attachments and historical reasoning readback worked. Gemini 2.5 Flash cross-protocol history readback worked. OpenRouter GPT-4.1 Mini and DeepSeek Flash cross-protocol history readback retained the web-search call's official document title/link and the text-attachment sentinel.
- Gemini 3.1 Pro's required thinking control appeared on and disabled when its Rule required it. The initial post-rule request was stopped locally because the compiler ledger lacked the tools-array path. After that repair, an actual Electron request completed and read back the official Responses document, `ATTACHMENT-7319`, and `星舟731`. The latest revision `-4` verification is recorded separately below.
- The Electron process (PID `28436`) had an established TCP connection to the in-app proxy at `127.0.0.1:10808`; the connection evidence is `final-proxy-connections.json` in the external evidence directory.
- A Luna actual request completed with temperature `0` and effort `none`; regeneration and edit-resend completed with temperature `0.4` and effort `none`. The edit-resend reply was read back as `EDIT-731` and saved as `final-edit-reply.json` in the external evidence directory.

### Final revision `request-rule-resolver-v2:20261017-4`

- Four updated packs were explicitly imported and saved through the existing User Rules UI (95 Anthropic, 64 Gemini, 19 OpenAI, and 54 request-policy Rules). Exporting them did not install them; Cloud content was not published or applied by this step.
- A first Gemini request used an older saved config through its compatibility projection. The subsequent UI readback audit exposed the raw-envelope issue documented above. After repair, normal UI changes retained temperature `0.4`, original `thinkingEnabled: false`, and `thinkingLevel: high` through readback.
- Gemini operation `a9a162a8-e8f5-413f-b554-e2523e4240ab` completed. Its frozen requested envelope retained those original values and conversation source labels; the actual body sent `generationConfig.temperature: 0.4` and `thinkingConfig.thinkingLevel: high`. The required-thinking button displayed High (dynamic), enabled and disabled for interaction. The reply read back the official Responses title/link, `ATTACHMENT-7319`, and `星舟731`; the request retained image and prior web-tool history.
- Luna operation `7103ffc6-ec1d-44d7-b2ef-8d6c96f5c206` completed with exact native `reasoning.effort: none` and temperature `0`. Operation `215fc200-c36d-4cab-b645-8e9f6d512b9d` sent effort `none` and temperature `0.4`, streamed partial CSV output, and was stopped by the UI.
- With current effort `low`, thinking enabled, and temperature `0.4`, Send returned the existing `GENERATION_V2_RULE_PARAMETER_UNSUPPORTED` error. The draft remained present. Operation, request, generation-snapshot, capability-snapshot, message, and raw-request counts were identical before and after rejection.
- While that invalid current configuration remained selected, retry operation `1637aef4-ad33-44f3-b1c7-8b2023b349bd` started streaming using the stopped request's frozen plan. The plan hash, wire hash, body length (62,569 bytes), and native values matched the original; the retry was then stopped. Current settings were restored to valid effort `none`, thinking off, and temperature `0.4`.
- Electron's network service had established TCP connections to the configured in-app proxy at `127.0.0.1:10808`; `final-proxy-connections.json` records this observation. No system proxy or network settings were changed.

### Preservation audit

- Read-only comparisons found both the pre-migration baseline (147 generation snapshots / 122 capability snapshots) and this chat's baseline (162 / 136) unchanged row-by-row. Cloud Applied/LKG, history, version, policy, override, and distribution tables were separately unchanged.
- The final read-only audit retained both baselines without a changed or missing row; `cloudUnchanged` was `true`. Final totals were 167 operations, 167 requests, 167 generation snapshots, 140 capability snapshots, 299 messages, and 167 raw requests. These totals include the explicitly exercised validation requests.
- Direct raw SQLite comparison confirmed the initial stopped operation `215fc200-c36d-4cab-b645-8e9f6d512b9d` and frozen retry `1637aef4-ad33-44f3-b1c7-8b2023b349bd` had byte-identical UTF-8 bodies (62,569 bytes), matching stored/recomputed SHA-256 and matching plan hashes. Both ended `cancelled` / `user_cancelled`.
- After restarting Electron, UI readback retained custom temperature `0.4`, custom reasoning effort `none`, custom thinking preference `false`, and the rejected draft. The User Rules tab showed all four saved packs (95/64/19/54) outside edit mode, and the source-priority UI showed Native `3`, Rules `2`, models.dev `1`.
- The validation app was stopped after the audit: profile state was `stopped`, the control endpoint was empty, and the launcher lock was absent. A subsequent status-helper call returned `Invalid URL` because that endpoint had been cleared; the independent profile-state and lock checks confirmed shutdown.
- The existing V1 User dirty draft had no sample in the inspected profile. Automated tests cover that case; this is not claimed as an in-profile runtime observation.

### Remaining live coverage and evidence locations

- No real Cloud Rules Release has been published. Cloud publication is outside scope; no implicit Cloud publication or bundled Rule installation occurred.
- The explicit image-output/default/mapping Rule and Anthropic enabled-thinking budget shape are implemented and validated by the focused resolver, protocol matrix, prepared compiler, and versioned-registry tests. This does not claim a real image-generation session or a live Anthropic request.
- Live Anthropic provider requests remain unverified because credentials were unavailable. The local LM Studio/Ollama runtimes are not installed, so live requests through those runtimes remain unverified. Real image-generation and function-tool sessions have not been verified even where automated integration cases passed.
- The actual supplier/runtime observations recorded here cover Luna, Gemini 2.5 Flash, Gemini 3.1 Pro Preview, OpenRouter GPT-4.1 Mini, and DeepSeek Flash. Other supplier/runtime combinations remain unverified unless separately listed above; the automated authority and prepared-compiler passes do not imply live-provider acceptance.
- No commit or push was made for the validation record. Runtime evidence files remain outside the repository under `C:\Users\m1389\.codex\visualizations\2026\10\15\01a13f99-bf36-7843-ab9c-fc355681a461\request-repair-runtime\rules-v2-validation`, including `profile-preservation-audit.json`, `profile-runtime-evidence.json`, `frozen-retry.json`, `after-block-low.json`, `partial-before-stop.json`, `final-proxy-connections.json`, and `final-edit-reply.json`. The repository does not receive the database backup or large run data.
- This chat's latest artifacts are under `C:\Users\m1389\.codex\visualizations\2026\10\17\01a14811-242e-7793-8fc0-6596cc047c3a`: `user-packs-r4\manifest.json`, `control-events.jsonl`, `gemini-raw-complete.json`, `luna-zero-consistent.json`, `before-block.json`, `after-block.json`, `frozen-retry.json`, and `final-proxy-connections.json`.

The final preservation and restart evidence is saved as `final-runtime.json` and `final-runtime-verification.json` in this chat's external evidence directory.

### Native ABI record

- **better-sqlite3 ABI mismatch encountered**: yes, in the earlier DB-backed UI validation; no new mismatch in the final scoped runs.
- **Rebuild commands run**: `npm run rebuild:node`, then `npm run rebuild:electron`. The runtime-discovered UI regression required another Node validation cycle, followed by a successful Electron rebuild.
- **Current ABI target after task**: `electron`.
- **Tests retried after rebuild**: the original ABI repair retried semantic-invalidation and requested-web projection. Final retry commands included:

```powershell
npx vitest --run --silent --config vitest.ui.config.ts src/ui-app/AppChatApp.semanticInvalidation.test.ts --testTimeout 15000
npx vitest --run --silent --config vitest.ui.config.ts src/ui-app/AppChatApp.nativeWebSearch.test.ts --testTimeout 15000
npx vitest --run --silent --config vitest.integration.config.ts electron/services/requestRuleActualPreparedCompilerV2.integration.test.ts
```

- **Electron smoke retried after rebuild**: yes, using the isolated `basic-exploration` profile with normal networking.
- **No native artifacts committed**: confirmed. No staging, commit, or push occurred; `package-lock.json` and `public/build-id.json` had no rebuild-only changes.

## 10. Risk classification

- **P0**: a historical retry changes meaning; an unsaved User draft or applied Cloud LKG is lost; an unapplied candidate changes live Rules; or automatic bundled installation reappears.
- **P1**: an unknown required parameter is silently sent; a conflicting same-key Rule is selected arbitrarily; a model-specific constraint is encoded as `APIContract`; or an existing profile's stored source priority changes.
- **P2**: a resolved decision lacks a usable explanation, or a protocol/operation revision is difficult to inspect without affecting request correctness.

These are migration acceptance classifications, not claims that any runtime gate has passed.
