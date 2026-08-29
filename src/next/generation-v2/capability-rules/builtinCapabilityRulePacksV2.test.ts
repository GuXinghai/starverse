import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_CAPABILITY_RULE_PACKS_V2 } from './builtinCapabilityRulePacksV2'

describe('built-in Capability Rule packs V2', () => {
  it('remain sparse, independently evidenced, and limited to verified exact identities', () => {
    expect(BUILTIN_CAPABILITY_RULE_PACKS_V2.map((pack) => pack.packId)).toEqual([
      'starverse.builtin.gemini-generate-content-model-facts',
      'starverse.builtin.gemini-image-model-facts',
      'starverse.builtin.openai-responses-model-facts',
      'starverse.builtin.anthropic-model-facts',
      'starverse.builtin.deepseek-model-facts',
    ])
    const rules = BUILTIN_CAPABILITY_RULE_PACKS_V2.flatMap((pack) => pack.rules)
    expect(rules).toHaveLength(90)
    expect(rules.every((rule) => rule.selector.kind === 'exact' &&
      (rule.evidenceKind === 'explicit_provider' || rule.evidenceKind === 'explicit_provider_series') &&
      (rule.identityEvidenceKind === 'provider_archive' || rule.identityEvidenceKind === 'official_exact_model_doc') &&
      rule.evidenceNote.length > 20)).toBe(true)
    expect(rules.filter((rule) => rule.identityEvidenceKind === 'official_exact_model_doc')
      .flatMap((rule) => rule.selector.kind === 'exact' ? rule.selector.values : [])).toEqual(['o3-pro'])
    expect(rules.some((rule) => rule.selector.kind === 'exact' &&
      rule.selector.values.includes('gemini-3.1-flash-image-preview'))).toBe(false)
    for (const unverifiedIdentity of ['claude-mythos-5', 'claude-mythos-preview', 'claude-opus-4-5',
      'claude-sonnet-4-5', 'claude-haiku-4-5']) {
      expect(rules.some((rule) => rule.selector.kind === 'exact' &&
        rule.selector.values.includes(unverifiedIdentity))).toBe(false)
    }
    expect(rules.some((rule) => rule.state === 'unsupported')).toBe(false)
    expect(rules.some((rule) => rule.semanticPath.startsWith('providerExtension.'))).toBe(false)
    const openAIReasoningModes = rules.filter((rule) => rule.providerId === 'openai_responses' &&
      rule.semanticPath === 'reasoning.mode')
    expect(openAIReasoningModes).toHaveLength(22)
    expect(openAIReasoningModes.every((rule) => rule.domain?.kind === 'enum' &&
      rule.domain.values.length === 1 && rule.domain.values[0] === 'enabled')).toBe(true)
    const selectorIds = rules.flatMap((rule) => rule.selector.kind === 'exact' ? rule.selector.values : [])
    expect(selectorIds).toHaveLength(117)
    expect(rules.every((rule) => rule.selector.kind !== 'exact' ||
      rule.selector.values.every((value, index, values) => index === 0 || values[index - 1]!.localeCompare(value, 'en') < 0)))
      .toBe(true)
    const naturalKeys = rules.flatMap((rule) => rule.selector.kind === 'exact'
      ? rule.selector.values.map((nativeModelId) => [rule.providerId, rule.endpointProfileId,
        nativeModelId, rule.semanticPath].join('\0'))
      : [[rule.providerId, rule.endpointProfileId, rule.selector.value, rule.semanticPath].join('\0')])
    expect(new Set(rules.map((rule) => rule.ruleId)).size).toBe(rules.length)
    expect(new Set(naturalKeys).size).toBe(naturalKeys.length)
  })

  it('binds archived identities to Provider Native evidence and permits explicit exact-model documentation', () => {
    const packagePath = path.resolve(process.cwd(),
      'docs/analysis/models-dev-capability-resolution/final-package-20260826/raw-model-fields.json')
    const rawPackage = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      archivedProviderApiSnapshots: Array<{ providerId: string; rawPayload: Record<string, unknown> }>
    }
    const inventories = new Map<string, Set<string>>()
    for (const snapshot of rawPackage.archivedProviderApiSnapshots) {
      const records = snapshot.providerId === 'google_ai_studio'
        ? (snapshot.rawPayload.models as Array<{ name: string }>).map((entry) => entry.name.replace(/^models\//u, ''))
        : (snapshot.rawPayload.data as Array<{ id: string }>).map((entry) => entry.id)
      inventories.set(snapshot.providerId === 'openai' ? 'openai_responses' : snapshot.providerId, new Set(records))
    }
    const anthropicPath = path.resolve(process.cwd(),
      'docs/analysis/models-dev-capability-resolution/evidence/provider-native-anthropic-models-20260804.json')
    const anthropicBytes = readFileSync(anthropicPath)
    expect(createHash('sha256').update(anthropicBytes).digest('hex'))
      .toBe('81795cd1669710d8aae8e1a5d5715c2210f0a5cf74693802ae4aad7f60940596')
    const anthropic = JSON.parse(anthropicBytes.toString('utf8')) as { data: Array<{ id: string }> }
    inventories.set('anthropic', new Set(anthropic.data.map((entry) => entry.id)))

    for (const rule of BUILTIN_CAPABILITY_RULE_PACKS_V2.flatMap((pack) => pack.rules)) {
      expect(rule.selector.kind).toBe('exact')
      if (rule.selector.kind !== 'exact') continue
      for (const nativeModelId of rule.selector.values) {
        if (rule.identityEvidenceKind === 'provider_archive') {
          expect(inventories.get(rule.providerId)?.has(nativeModelId),
            `${rule.providerId}/${nativeModelId} is absent from preserved Provider Native evidence`).toBe(true)
        } else {
          expect(rule.provenanceUrl).toBe(`https://developers.openai.com/api/docs/models/${nativeModelId}`)
        }
      }
    }
  })
})
