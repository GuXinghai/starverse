# Provider Model Source R2: DeepSeek Hardening Closeout

Date: 2026-06-25
Status: Passed
Scope: DeepSeek official model source and `ProviderModelAvailability` foundation

Related:

- `STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md`
- `STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md`
- `STARVERSE_PROVIDER_EVOLUTION_PATH.md`
- `PROVIDER_FORMALIZATION_R1_DECISION.md`
- `PROVIDER_MODEL_SOURCE_R2_DEEPSEEK.md`

## Review Conclusion

R2 hardening conclusion: passed.

Blockers: none.

R2 is clear to hand off into R3 Gemini / Google AI Studio model source work, with the non-goals below still preserved.

## Verified Scope

- DeepSeek `/models` parser is conservative:
  - missing `data[]` is handled as a safe parse error;
  - invalid model entries are dropped or warned instead of crashing;
  - unknown provider fields are not exposed as raw renderer payload.
- Provider-reported availability and curated metadata are separated:
  - `/models` is treated as provider-reported availability seed;
  - pricing/model details are marked as curated metadata, not live provider API facts.
- Deprecated alias warnings exist for:
  - `deepseek-chat`;
  - `deepseek-reasoner`.
- Renderer does not pass DeepSeek API keys, bearer tokens, authorization headers, or raw header maps.
- Main process reads `deepSeekApiKey` for DeepSeek model availability IPC.
- Provider errors are redacted before returning to renderer.
- DeepSeek models are not written into the OpenRouter catalog namespace.
- DeepSeek models are not published into the main `ModelPickerDialog`.
- OpenRouter catalog, Send Plan, and send path remain unchanged by R2.
- Generic OpenAI-compatible live remains deferred and fixture-only.
- LocalEndpoint remains loopback-only.
- No `EndpointRegistry`, `ProviderRegistry`, `RuntimeProviderRegistry`, `RuntimeManager`, or `EndpointManager` placeholder was introduced.

## Validation

Full TypeScript:

```text
npx tsc --noEmit --pretty false
```

Result: passed with no output.

R2 targeted tests:

```text
npx vitest --run src/next/provider/deepseek/deepSeekModelSource.test.ts electron/ipc/deepSeekModelAvailabilityIpc.test.ts src/ui-app/components/ChatSessionConsole.deepSeek.test.ts electron/preload.test.ts src/next/provider/providerEndpointRegistryBaseline.test.ts src/ui-app/app/appChatApp.credentialExposure.test.ts --reporter=dot
```

Result: passed, 6 files and 46 tests.

Covered areas:

- DeepSeek model source parser tests.
- DeepSeek model availability IPC tests.
- Console DeepSeek diagnostics tests.
- Preload bridge tests.
- Provider boundary / credential exposure / registry baseline tests.

## Dirty File Note

The R2 provider-source hardening checks did not require source changes.

`public/build-id.json` is a non-R2 provider-source dirty file. It should be reverted or handled separately and must not be mixed into R3.

At closeout writing, the worktree may also contain unrelated file-pipeline documentation changes. Those are outside the R2 provider-source scope and should not be mixed into R3 either.

## R3 Admission

R3 Gemini / Google AI Studio model source work is allowed to start.

R3 should continue to preserve:

- no default provider semantics;
- OpenRouter as an explicit first-class provider;
- DeepSeek official as provider-level availability, not OpenRouter catalog data;
- Generic OpenAI-compatible live deferred;
- LocalEndpoint loopback-only until its production split is explicitly scoped.

## Follow-Up Recommendations

- Implement R3 as Gemini / Google AI Studio model source first.
- Do not introduce `RuntimeProviderRegistry`.
- Do not implement a reasoning artifact service in R3.
- Do not enable Generic OpenAI-compatible live runtime.
- Do not implement the LocalEndpoint production native/compat split in R3.
