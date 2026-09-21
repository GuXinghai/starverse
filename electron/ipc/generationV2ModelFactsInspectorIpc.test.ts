import { describe, expect, it, vi } from 'vitest'
import type { ModelFactsInspectorReadAuthorityV1 } from '../services/modelFactsInspectorV1Service'
import {
  GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_CHANNELS,
  registerGenerationV2ModelFactsInspectorIpc,
} from './generationV2ModelFactsInspectorIpc'

type Handler = (event: unknown, payload?: unknown) => unknown | Promise<unknown>
const subject = Object.freeze({ providerAuthorityId: 'authority:test', endpointProfileId: 'profile:test', nativeModelId: 'model:test' })
const rawPayloadRef = Object.freeze({ storeId: 'canonical-raw-v1:' + 'a'.repeat(64),
  persistedPayloadSha256: 'b'.repeat(64), recordKey: 'model:test', sanitizerRevision: 'sanitizer:v1' })

describe('generationV2ModelFactsInspectorIpc', () => {
  it('registers only UI-safe read operations and preserves exact identities', async () => {
    const handlers = new Map<string, Handler>()
    const service: ModelFactsInspectorReadAuthorityV1 = {
      searchSubjects: vi.fn(async () => ({ subjectSetRevision: 'set:v1', records: [], nextCursor: null })),
      readInspectorSnapshot: vi.fn(async () => ({ subjectSetRevision: 'set:v1', subject, sources: [] })),
      readEvidenceSlice: vi.fn(async () => null),
      readSanitizedRawPayload: vi.fn(() => ({ safe: true })),
    }
    expect(registerGenerationV2ModelFactsInspectorIpc({ registerInvoke: (channel, handler) =>
      handlers.set(channel, handler as Handler), service })).toEqual(GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_CHANNELS)
    expect([...handlers.keys()].sort()).toEqual([...GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_CHANNELS].sort())

    await expect(handlers.get('generation-v2:model-facts:search-subjects')!({}, { limit: 20, query: 'model' }))
      .resolves.toMatchObject({ subjectSetRevision: 'set:v1' })
    expect(service.searchSubjects).toHaveBeenCalledWith({ limit: 20, query: 'model' })
    await handlers.get('generation-v2:model-facts:read-inspector')!({}, { subject, expectedSubjectSetRevision: 'set:v1' })
    expect(service.readInspectorSnapshot).toHaveBeenCalledWith({ subject, expectedSubjectSetRevision: 'set:v1' })
    await handlers.get('generation-v2:model-facts:read-evidence-slice')!({}, { subject, sourceKind: 'models_dev',
      sourceScopeId: 'scope:test', path: 'reasoning.support' })
    expect(service.readEvidenceSlice).toHaveBeenCalledWith(expect.objectContaining({ subject,
      sourceKind: 'models_dev', sourceScopeId: 'scope:test', path: 'reasoning.support' }))
    expect(handlers.get('generation-v2:model-facts:read-sanitized-raw-payload')!({}, { rawPayloadRef })).toEqual({ safe: true })
    expect(service.readSanitizedRawPayload).toHaveBeenCalledWith(rawPayloadRef)
  })

  it('rejects raw DB-like access and invalid source/path payloads', () => {
    const handlers = new Map<string, Handler>()
    const service = {} as ModelFactsInspectorReadAuthorityV1
    registerGenerationV2ModelFactsInspectorIpc({ registerInvoke: (channel, handler) => handlers.set(channel, handler as Handler), service })
    expect(() => handlers.get('generation-v2:model-facts:search-subjects')!({}, { limit: 0 }))
      .toThrow('GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_INVALID')
    expect(() => handlers.get('generation-v2:model-facts:read-evidence-slice')!({}, { subject, sourceKind: 'models_dev',
      sourceScopeId: 'scope:test', path: 'not.a.path' })).toThrow('GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_INVALID')
    expect(() => handlers.get('generation-v2:model-facts:read-sanitized-raw-payload')!({}, { storeId: 'not-allowed' }))
      .toThrow('GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_INVALID')
  })
})
