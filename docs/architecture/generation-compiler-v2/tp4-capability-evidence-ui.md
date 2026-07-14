# TP4 — Capability, evidence priority, and UI projection

Verified 2026-07-13.

## Scope

Create one revisioned runtime capability snapshot for a specific provider + endpoint/profile + protocol + model + operation. The same snapshot drives UI controls, command preflight, compiler decisions, and persisted answer provenance.

## Current evidence

- Main capability is provider-wide hardcoded data without revision/provenance/confidence: `src/next/provider/runtimeSelection.ts:32-53,228-379`.
- Main preflight reads session flags against that broad table: `runtimeSelection.ts:399-442`.
- UI renders web/sampling/image largely independent of the selected contract: `src/ui-app/components/ChatSessionConsole.vue:2106-2205`.
- HEAD generation profiles mix UI control, model regex, support policy, ranges, and `wireKey/wirePath`: `src/next/generation-params/generationParamTypes.ts:102-149`.
- HEAD UI imports profiles and carries fallback enums: `GenerationParamsSettingsEditor.vue:3-22,48-102`.
- Existing architecture already requires capability intersection and UI/Send Plan sharing: `docs/architecture/provider-architecture/STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md:82-90`; target architecture `:244-261`.
- OpenRouter Image official endpoint descriptors prove why model-level unions are insufficient; current Anthropic/Gemini/DeepSeek model/version differences prove provider-wide flags and regex are unsafe.
- Current catalog settings establish the local settings convention: allowlisted millisecond presets, a pure normalizer that restores a safe default for missing/invalid values, and provider-scoped persisted keys (`src/shared/modelCatalog/catalogSyncSettings.ts:12-56`; `providerCatalogSettings.ts:49-103`). V2 does not reuse the legacy keys or their compatibility read.

## Evidence precedence

From strongest to weakest:

1. Contract codec invariant for the selected protocol/version.
2. Exact provider-fetched endpoint descriptors and their conservative operation-specific intersection, or a signed provider capability record.
3. Current official vendor model/version documentation encoded as a reviewed rule record.
4. Successful versioned live probe for this endpoint/model/operation.
5. User endpoint override that can only narrow or choose among codec-implemented fields.

Conflicts resolve conservatively: a stronger `unsupported` wins; missing evidence means unavailable. Catalog/model-level unions may discover candidates but never override exact endpoint evidence. A protocol may bind one endpoint only when its documented selector and live routing evidence prove the pin; OpenRouter Images meets that condition through `provider.only:[provider_tag]` plus `allow_fallbacks:false`. Regex is not evidence. Provider failure never causes protocol fallback.

## OpenRouter Images endpoint descriptor freshness

The per-endpoint descriptor is the final OpenRouter Images runtime fact. The corrected 2026-07-14 smoke proved the documented selector: `provider.only:[selectedDescriptor.provider_tag]` with `allow_fallbacks:false` routed Google AI Studio and Google Vertex Global to distinct matching generation endpoints, and the authenticated OpenRouter Logs UI independently labeled both providers. Descriptor-cache identity includes `(credentialScopeId, modelId, providerTag, descriptorRevision)`; the persisted selection lookup key is exactly `(credentialScopeId, modelId, image_generate)`, using the canonical V2 domain operation rather than an alias. Model-level `supported_parameters` is discovery/display only and never authorizes a field.

Selection authority belongs to the user. Resolver/compiler/transport never select by price, descriptor/API order, latency, historical success rate, or hard-coded preference. The binding algorithm is closed:

1. Reject a complete descriptor response containing duplicate `provider_tag` values as an invalid descriptor set; do not replace a prior successful cache.
2. If a persisted binding exists and the latest complete descriptor with that tag is fresh and supports the complete explicit intent, keep it.
3. If no binding exists, filter only complete/fresh descriptors that support the complete intent: zero blocks as unsupported; one atomically persists that sole descriptor; more than one returns `OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED` with candidates and creates no generation command.
4. If the bound tag disappears, its descriptor is incomplete or hard-expired, or its capability revision is stale, stale-reject without selecting another endpoint.
5. If the bound fresh descriptor exists but changed parameters are unsupported while another descriptor could support them, return `BOUND_ENDPOINT_CAPABILITY_MISMATCH`; only a user rebind followed by a new command may continue.

Candidate UI places the current binding first. Every remaining candidate is ordered by Unicode code-point ascending `providerTag`; this order is display-only and never becomes a default. A user selection atomically persists the new tag/slug/revision/digest and revalidates provider options.

V2 follows the existing settings convention with explicit presets rather than a free-form duration:

- `openrouter.images.endpointDescriptor.refreshAfterMs`: `15m | 1h | 6h | 24h | 7d`, default `6h`;
- `openrouter.images.endpointDescriptor.hardExpireAfterMs`: `1h | 6h | 24h | 7d | 30d`, default `24h`;
- the pair must satisfy `refreshAfterMs < hardExpireAfterMs`; an absent, malformed, non-preset, or invalid pair is atomically restored to `6h/24h` and the UI shows the restored values;
- these keys live in the fresh V2 settings repository/table, not `electron-store`, legacy catalog keys, answer snapshot, or provider descriptor rows;
- successful descriptors and fetch state live in the endpoint-capability cache; diagnostic history is retained for a fixed internal 90 days and is not user-configurable.

At age `< refreshAfter`, use the selected successful descriptor. At `refreshAfter <= age < hardExpireAfter`, attempt refresh before send; failure preserves and may use stale-good. At `age >= hardExpireAfter`, refresh must succeed or compilation blocks. A failed refresh never overwrites the last successful record. Descriptor fetch `401/403` blocks; `404` immediately invalidates the selected descriptor and requires successful model/endpoint rediscovery before a new selection. A successful refresh that no longer contains the bound `provider_tag` invalidates that capability revision and stale-rejects the command. Neither refresh nor compiler/transport execution may silently choose another endpoint for the same command; only a new capability resolution under the Owner-frozen selection policy may create a different binding. A generation POST failure never switches endpoint or resends.

## Target type

```ts
type RuntimeCapabilitySnapshotV2 = {
  revision: string
  resolvedAt: string
  binding: {
    providerId: string
    endpointProfileId: string
    endpointBinding:
      | {
          kind: "pinned"
          selector:
            | {
                contractId: "openrouter-images-v1"
                providerTag: string
                providerSlug: string
                descriptorRevision: string
                descriptorDigest: string
              }
            | {
                contractId: string
                selectorId: string
                descriptorRevision: string
                descriptorDigest: string
              }
        }
      | { kind: "provider_managed_set"; endpointSetRevision: string; descriptors: ReadonlyArray<{endpointId:string; descriptorRevision:string}> }
    protocolContractId: string
    contractRevision: string
    modelId: string
    operation: "text" | "image_generate" | "image_edit" | "tool_continue"
  }
  fields: Record<SemanticPath, {
    state: "supported" | "unsupported" | "requires_confirmation"
    domain?: {kind:"enum"|"range"|"boolean"; values?:unknown[]; min?:number; max?:number}
    constraints: string[]
    evidence: CapabilityEvidenceRef[]
  }>
  tools: ToolCapability[]
  continuation: ContinuationCapability
  evidenceDigest: string
}

type OpenRouterImageProviderBindingKey = {
  credentialScopeId: string
  modelId: string
  operation: "image_generate"
}

type OpenRouterImageProviderBinding = {
  key: OpenRouterImageProviderBindingKey
  providerTag: string
  providerSlug: string
  descriptorRevision: string
  descriptorDigest: string
  selectedBy: "user" | "sole_eligible"
  selectedAt: string
}
```

Every field contains source URL/record id, verification or fetch time, protocol/model/operation scope, and evidence kind. The snapshot hash includes the pinned endpoint revision or sorted endpoint-set IDs/revisions plus the intersection digest, model/contract revisions, and exact evidence records.

## UI projection

```text
selected provider/profile/protocol/model/operation
-> CapabilityResolverV2
-> RuntimeCapabilitySnapshotV2
-> GenerationControlsProjection
   visible / disabled / allowed values / constraint help / beta badge
-> sparse GenerationConfigV2 edit
```

- UI never imports provider codecs, profiles, model regex, wire names, or fallback enums.
- An explicit persisted value that becomes unsupported is shown as incompatible and blocks send; it is not hidden or dropped.
- Switching model/operation resolves a new revision. A command submits the revision shown in UI; transaction rejects `STALE_CAPABILITY_REVISION` if resolution changed.
- Beta/preview server tools or protocols are visibly labeled and can require per-use confirmation.
- Retry displays the target snapshot's contract/capability provenance; it does not reproject current UI defaults.

## Files and deletions

Add:

- `src/next/generation-v2/capability/runtimeCapabilitySnapshotV2.ts`
- `capabilityEvidence.ts`, `resolveRuntimeCapabilityV2.ts`, provider evidence loaders;
- `src/ui-app/generation-v2/useGenerationControlsProjection.ts`.

Delete:

- provider-wide hardcoded runtime capability summary;
- profile `wireKey/wirePath`, UI metadata, model regex, and fallback enums;
- UI provider/model special cases;
- endpoint overrides that create arbitrary fields;
- silent disable/empty config fallback.

## Exact projection examples

OpenRouter Images selected endpoint without `background`:

```json
{
  "path":"image.background",
  "state":"unsupported",
  "evidence":[{"kind":"endpoint_descriptor","endpointRevision":"...","verifiedAt":"2026-07-13"}]
}
```

DeepSeek thinking:

```json
{
  "path":"generation.temperature",
  "state":"unsupported",
  "constraints":["reasoning.enabled == true"],
  "evidence":[{"kind":"official_contract","url":"https://api-docs.deepseek.com/guides/thinking_mode/","verifiedAt":"2026-07-13"}]
}
```

Anthropic's model-specific manual/adaptive/disabled legality is encoded as reviewed model rules, not inferred from name regex.

## Tests

- Evidence precedence/conflict/missing/stale/revoked cases.
- Deterministic revision/evidence digest and cache invalidation.
- Exact selected endpoint evidence beats model union; override only narrows codec capability.
- Complete-intent endpoint selection, missing-field/value rejection, non-null tag requirement, and exact selector/body fixtures.
- Existing valid binding reuse; sole-eligible atomic auto-binding; multiple eligible returns `OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED` and creates no operation/request.
- User selection persistence by `(credentialScopeId, modelId, image_generate)`; no cross-credential/model reuse.
- Candidate projection keeps current binding first and sorts only the rest by code-point `providerTag`; reorder tests prove display order never selects.
- Price/API order/latency/history/hard-coded preference mutation tests prove resolver/compiler/transport output does not change.
- Duplicate `provider_tag` in one complete descriptor response rejects the whole set and preserves prior successful cache/binding.
- Successful refresh with a missing bound tag invalidates the old revision; no same-command endpoint substitution.
- Bound descriptor capability mismatch returns `BOUND_ENDPOINT_CAPABILITY_MISMATCH`; only explicit rebind plus a new command succeeds.
- Binding change removes provider options outside the new descriptor's `providerSlug` namespace and `allowed_passthrough_parameters` before compilation.
- Provider/model/pinned-endpoint-or-endpoint-set/protocol/operation binding isolation.
- UI visibility/value domains/help/beta badge from the same snapshot used by compiler.
- Unsupported explicit config remains visible and blocks; no silent drop.
- Stale revision command rejection and UI refresh.
- Matrix fixtures for every supported model rule and every semantic control.
- Architecture guard: no provider regex/wire key/profile imports in UI.

## Acceptance

- UI and compiler consume the same immutable revision.
- Every exposed control has at least one cited evidence record and a provider codec consumer.
- Every explicit semantic path is either supported with domain/constraints or visibly unsupported; unknown/missing evidence is not treated as support.
- Provider semantics remain contract-specific; no broad provider or generic local capability is fabricated.

## Risks and unresolved items

| Severity | Risk | Control / prerequisite |
|---|---|---|
| High | Dynamic selected endpoint capability changes after UI render | Selected descriptor revision + transaction stale rejection. |
| High | Official docs conflict | Mark the affected field/binding blocked unless an Owner-frozen provider contract resolves the version policy. Gemini Developer API is resolved as provider-owned `v1beta`; field-level capability conflicts still fail closed. |
| High | Probe failure accidentally widens capability | Failure yields unavailable/stale, never support or fallback. |
| High | Descriptor refresh corrupts a good cache | Store success and failure separately; only a validated success may advance the selected descriptor revision. |
| High | Provider descriptor does not expose a compile-time endpoint ID | Bind the provider-owned selector identity (`providerTag`, `providerSlug`, descriptor revision/digest); generation endpoint IDs remain post-request diagnostic evidence. |
| Owner | Beta tools | Decide whether OpenRouter beta server tools are hidden, opt-in, or blocked in production. Gemini API version is already fixed to `v1beta` and is not an automatic beta fallback. |

## Implementation prerequisite

OpenRouter Images descriptor freshness, user-owned selection, binding key/persistence, candidate projection, failure codes, option cleanup and wire contract are frozen above; its Gate 0 blocker is closed. Before enabling beta server tools, Owner must freeze their exposure policy. Provider-specific field/model rule matrices from TP6/TP7 remain capability-fixture inputs; Gemini API version is no longer a blocker.
