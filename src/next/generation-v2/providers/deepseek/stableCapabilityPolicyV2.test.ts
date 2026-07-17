import { describe, expect, it } from 'vitest'
import { RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../capability/runtimeCapabilitySnapshotV2'
import {
  isVerifiedDeepSeekStableCapabilityPolicyV2,
  readVerifiedDeepSeekStableCapabilityPolicyV2,
} from './stableCapabilityPolicyV2'

describe('DeepSeek stable family capability policy V2', () => {
  it('closes every semantic path exactly once without issuing execution authority', () => {
    const policy = readVerifiedDeepSeekStableCapabilityPolicyV2()
    expect(policy).toMatchObject({
      classification: 'verified_deepseek_stable_family_capability_policy_non_executable',
      trust: 'verified_deepseek_stable_capability_policy',
      usage: 'runtime_capability_resolution_input_only',
      executionAuthority: 'none',
      providerId: { value: 'deepseek' },
      contractFamilyId: 'deepseek-stable-api-v1',
      verifiedAt: '2026-07-15',
    })
    expect(policy.rules.map((entry) => entry.path)).toEqual(RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2)
    expect(new Set(policy.rules.map((entry) => entry.path)).size).toBe(policy.rules.length)
    expect(policy.policyDigest.value).toMatch(/^[0-9a-f]{64}$/u)
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.rules)).toBe(true)
    expect(isVerifiedDeepSeekStableCapabilityPolicyV2(policy)).toBe(true)
    expect(isVerifiedDeepSeekStableCapabilityPolicyV2({ ...policy })).toBe(false)
  })

  it('does not infer model-specific limits or attachment and tool registries', () => {
    const rules = new Map(readVerifiedDeepSeekStableCapabilityPolicyV2().rules
      .map((entry) => [entry.path, entry]))
    for (const path of [
      'generation.maxOutputTokens',
      'generation.stop',
      'attachments[].conversion',
      'attachments[].include',
      'attachments[].sendAs',
      'tools.allowedToolIds',
    ] as const) {
      expect(rules.get(path)).toEqual({ path, kind: 'unavailable_pending_authority' })
    }
    for (const path of [
      'attachments[].assetId',
      'attachments[].assetRevisionId',
      'attachments[].assetSha256',
    ] as const) {
      expect(rules.get(path)).toMatchObject({ kind: 'accepted_no_wire' })
    }
    expect(JSON.stringify(readVerifiedDeepSeekStableCapabilityPolicyV2())).not.toMatch(
      /modelId|modelCatalog|capabilitySeed|manual_user_model_id/iu,
    )
  })

  it('publishes only the provider-family facts proven by the reviewed stable contract', () => {
    const rules = new Map(readVerifiedDeepSeekStableCapabilityPolicyV2().rules
      .map((entry) => [entry.path, entry]))
    expect(rules.get('generation.temperature')).toMatchObject({
      kind: 'supported_when_reasoning_disabled',
      wireKey: 'temperature',
      domain: { kind: 'range', min: 0, max: 2, integer: false },
    })
    expect(rules.get('generation.topP')).toMatchObject({
      kind: 'supported_when_reasoning_disabled',
      wireKey: 'top_p',
      domain: { kind: 'range', min: 0, max: 1, integer: false },
    })
    expect(rules.get('reasoning.mode')).toMatchObject({
      kind: 'supported_static',
      domain: { kind: 'enum', values: ['disabled', 'enabled'] },
    })
    expect(rules.get('reasoning.effort')).toMatchObject({
      kind: 'supported_with_effort_mapping',
      domain: { kind: 'enum', values: ['low', 'medium', 'high', 'xhigh'] },
      mapping: { low: 'high', medium: 'high', high: 'high', xhigh: 'max' },
    })
    expect(rules.get('reasoning.summary')).toMatchObject({ kind: 'unsupported' })
    expect(rules.get('web.mode')).toMatchObject({
      kind: 'accepted_no_wire', domain: { kind: 'enum', values: ['disabled'] },
    })
    expect(rules.get('image.mode')).toMatchObject({
      kind: 'accepted_no_wire', domain: { kind: 'enum', values: ['disabled'] },
    })
    expect(rules.get('providerExtension.kind')).toMatchObject({
      kind: 'supported_static', domain: { kind: 'enum', values: ['none'] },
    })
  })

  it('keeps conditional tool choice and retry confirmation fail-closed', () => {
    const policy = readVerifiedDeepSeekStableCapabilityPolicyV2()
    const rules = new Map(policy.rules.map((entry) => [entry.path, entry]))
    expect(rules.get('tools.mode')).toMatchObject({
      kind: 'supported_static', domain: { kind: 'enum', values: ['disabled', 'enabled'] },
    })
    expect(rules.get('tools.toolChoice')).toMatchObject({
      kind: 'supported_conditional_tool_choice',
      domain: { kind: 'enum', values: ['omitted', 'auto', 'none', 'required', 'named'] },
      toolChoiceMatrix: {
        appliesWhenToolsMode: 'enabled',
        registryAuthority: 'required_exact_revision',
        allowedToolSet: 'nonempty_exact',
        reasoningEnabled: {
          allowedModes: ['omitted'],
          explicitRejectionCode: 'DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED',
        },
        reasoningDisabled: {
          allowedModes: ['omitted', 'auto', 'none', 'required', 'named'],
          autoRequiresVerifiedNonemptyToolSet: true,
          requiredRequiresVerifiedNonemptyToolSet: true,
          namedToolRequiresRegistryMembership: true,
        },
      },
    })
    expect(rules.get('tools.sideEffectConfirmation')).toMatchObject({
      kind: 'requires_side_effect_confirmation_policy',
      domain: { kind: 'enum', values: ['required_each_retry'] },
    })
    expect(policy.toolPolicy).toEqual({
      kind: 'function_tools_only',
      betaStrictField: 'forbidden',
      thinkingEnabledToolChoice: 'omitted_only',
      thinkingDisabledToolChoice: 'formal_chat_schema',
    })
  })

  it('binds every capability claim to the reviewed local evidence artifact digest', () => {
    const evidence = readVerifiedDeepSeekStableCapabilityPolicyV2().evidence
    expect(evidence).toHaveLength(3)
    for (const entry of evidence.slice(0, 2)) {
      expect(entry.localArtifact).toEqual({
        id: 'deepseek-stable-api-contract-20260715',
        path: 'docs/architecture/generation-compiler-v2/evidence/deepseek-stable-api-contract-20260715.json',
      })
      expect(entry.contentDigest.value)
        .toBe('0022edabf76e51ce88fc6d45310ad889b8a84fd037c72c287944449ba8a42cc7')
    }
    expect(evidence[2]).toMatchObject({
      evidenceId: 'starverse.deepseek.stable.policy.2026-07-17',
      localArtifact: {
        id: 'deepseek-stable-owner-capability-policy-20260717',
        path: 'docs/architecture/generation-compiler-v2/evidence/deepseek-stable-owner-capability-policy-20260717.json',
      },
      contentDigest: { value: '7ce7739b2235ea7b7bca06214eef2b752d254ff6a0f2035333c32c8b089bc91e' },
    })
  })

  it('requires ordered native replay across branches and restarts', () => {
    expect(readVerifiedDeepSeekStableCapabilityPolicyV2().continuation).toEqual({
      kind: 'client_managed_native_replay',
      artifactKind: 'deepseek_stable_ordered_native_messages_v1',
      supportsBranchReplay: true,
      supportsRestartReplay: true,
    })
  })
})
