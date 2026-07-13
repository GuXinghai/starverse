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

The per-endpoint descriptor is the final OpenRouter Images runtime fact. The corrected 2026-07-14 smoke proved the documented selector: `provider.only:[selectedDescriptor.provider_tag]` with `allow_fallbacks:false` routed Google AI Studio and Google Vertex Global to distinct matching generation endpoints, and the authenticated OpenRouter Logs UI independently labeled those requests `Google AI Studio` and `Google Vertex`. Cache identity is `(credentialScopeId, modelId, providerTag, descriptorRevision)`; model-level `supported_parameters` is discovery/display only and never authorizes a field. Selection may choose only a fresh descriptor that supports the complete explicit intent; it may not drop parameters to make an endpoint eligible. If multiple fresh descriptors satisfy the complete intent, compilation remains blocked until the Owner freezes one deterministic selection authority and tie-break policy; API response order, lowest observed price, and implicit provider preference are not selection rules.

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
- Multiple-eligible-descriptor cases use only the Owner-frozen authority/tie-break policy; absent policy blocks.
- Successful refresh with a missing bound tag invalidates the old revision; no same-command endpoint substitution.
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
| Owner | Multiple OpenRouter Images descriptors satisfy the complete intent | Freeze the selection authority and deterministic tie-break policy before endpoint-specific capability is implemented; do not infer API order, price, or provider preference. |
| Owner | Beta tools | Decide whether OpenRouter beta server tools are hidden, opt-in, or blocked in production. Gemini API version is already fixed to `v1beta` and is not an automatic beta fallback. |

## Implementation prerequisite

Endpoint descriptor freshness, presets, persistence, failure behavior, and the corrected 2026-07-14 OpenRouter Images wire contract are frozen above. Before implementing endpoint-specific selection, Owner must freeze the multiple-eligible-descriptor authority/tie-break policy; before enabling beta server tools, Owner must freeze their exposure policy. Provider-specific field/model rule matrices from TP6/TP7 remain capability-fixture inputs; Gemini API version is no longer a blocker.
