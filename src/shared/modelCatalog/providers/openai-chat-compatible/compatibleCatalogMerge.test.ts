import { describe, expect, it } from 'vitest'
import type { CompatibleModelRecord } from '../../../provider/openai-chat-compatible'
import { mergeCompatibleModelRecords } from './compatibleCatalogMerge'

const metadata = (input: Partial<CompatibleModelRecord['metadata']> = {}): CompatibleModelRecord['metadata'] => ({
  schemaVersion: 1,
  displayName: null,
  contextLength: null,
  maxOutputTokens: null,
  capabilities: { text: null, vision: null, tools: null, structuredOutputs: null, reasoning: null },
  pricing: { prompt: null, completion: null, request: null, image: null },
  fieldProvenance: {},
  ...input,
})

const record = (
  source: 'remote_sync' | 'manual',
  value: CompatibleModelRecord['metadata'],
  state: 'active' | 'stale' = 'active',
): CompatibleModelRecord => ({
  providerInstanceId: 'ocp_provider_12345678' as CompatibleModelRecord['providerInstanceId'],
  modelId: 'model-a',
  source,
  state,
  snapshotId: source === 'remote_sync' ? 'ocp_catalog_snapshot_12345678' as CompatibleModelRecord['snapshotId'] : null,
  metadata: value,
  createdAtMs: 1,
  updatedAtMs: 1,
})

describe('compatibleCatalogMerge', () => {
  it('uses explicit manual fields before remote fields and preserves unknown', () => {
    const [merged] = mergeCompatibleModelRecords([
      record('remote_sync', metadata({ displayName: 'Remote', contextLength: 8_192, capabilities: { text: true, vision: null, tools: true, structuredOutputs: null, reasoning: null } })),
      record('manual', metadata({ displayName: 'Manual', capabilities: { text: null, vision: true, tools: null, structuredOutputs: null, reasoning: null } })),
    ])
    expect(merged).toMatchObject({
      protocolKey: 'openai_chat_compatible',
      providerInstanceId: 'ocp_provider_12345678',
      modelId: 'model-a',
      availability: 'active',
      sourcePresence: { remote: 'active', manual: true },
      conflictFields: ['displayName'],
      metadata: {
        displayName: 'Manual',
        contextLength: 8_192,
        capabilities: { text: true, vision: true, tools: true, reasoning: null },
        fieldProvenance: {
          displayName: 'manual',
          contextLength: 'remote_sync',
          'capabilities.vision': 'manual',
          'capabilities.reasoning': 'unknown',
        },
      },
    })
  })

  it('keeps stale remote-only models diagnosable and makes manual presence active', () => {
    expect(mergeCompatibleModelRecords([record('remote_sync', metadata(), 'stale')])[0]).toMatchObject({
      availability: 'stale', sourcePresence: { remote: 'stale', manual: false },
    })
    expect(mergeCompatibleModelRecords([
      record('remote_sync', metadata(), 'stale'),
      record('manual', metadata({ displayName: 'Manual' })),
    ])[0]).toMatchObject({ availability: 'active', sourcePresence: { remote: 'stale', manual: true } })
  })

  it('rejects mixed provider scopes instead of merging ambiguous identities', () => {
    const other = { ...record('manual', metadata()), providerInstanceId: 'ocp_provider_abcdefgh' as CompatibleModelRecord['providerInstanceId'] }
    expect(() => mergeCompatibleModelRecords([record('remote_sync', metadata()), other])).toThrow('compatible_catalog_scope_mismatch')
  })
})
