import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ModelFactsInspectorPanel from './ModelFactsInspectorPanel.vue'

describe('ModelFactsInspectorPanel', () => {
  it('binds inspection to the authoritative subject revision and lazy-loads evidence payloads', async () => {
    const readInspector = vi.fn(async () => ({
      subjectSetRevision: 'subject-set:1',
      subject: { providerAuthorityId: 'openai', endpointProfileId: 'openai-default', nativeModelId: 'gpt-test' },
      resolved: { resolvedSnapshotRevision: 'resolved-model-facts-snapshot-v1:' + 'a'.repeat(64),
        sourceScopeSelection: { providerNative: 'scope:native', modelsDev: 'scope:models', capabilityRules: 'scope:rules' },
        resolvedFacts: { capabilityRevision: 'capability-revision-v1:' + 'b'.repeat(64), fields: [{ path: 'reasoning.support', state: 'resolved',
          completenessDisposition: 'complete', selectionReason: 'single_claim', selectedValue: { kind: 'support', value: 'supported' },
          supportingProvenance: [{}], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] }] } },
      sources: [{ state: { sourceKind: 'provider_native', sourceScopeId: 'scope:1',
        currentSourceRevision: 'source:1', staleReason: null }, subjectFact: { payload: {
        recordOutcome: 'present', outcomes: [{ observationId: 'obs:1', path: 'reasoning.support', disposition: 'current',
          currentObservation: { kind: 'present_valid', assertion: { value: { kind: 'support', value: 'supported' },
            provenance: { sourceFieldRefs: [{ rawPayloadRef: { storeId: 'canonical-raw-v1:' + 'a'.repeat(64),
              persistedPayloadSha256: 'a'.repeat(64), recordKey: 'model:gpt-test', sanitizerRevision: 'sanitizer:1' }, sourceFieldPath: 'reasoning' }] } } } }],
        unmappedSourceFields: [],
      } } }],
    }))
    const readEvidenceSlice = vi.fn(async () => ({ path: 'reasoning.support', disposition: 'current',
      currentObservation: { kind: 'present_valid', assertion: { value: { kind: 'support', value: 'supported' }, provenance: { sourceFieldRefs: [] } } } }))
    const readSanitizedRawPayload = vi.fn(async () => ({ id: 'gpt-test', reasoning: true }))
    ;(window as any).generationV2 = { modelFactsInspector: {
      searchSubjects: vi.fn(async () => ({ subjectSetRevision: 'subject-set:1', nextCursor: null,
        records: [{ subject: { providerAuthorityId: 'openai', endpointProfileId: 'openai-default', nativeModelId: 'gpt-test' }, proofs: [] }] })),
      readInspector, readEvidenceSlice, readSanitizedRawPayload,
    } }

    const user = userEvent.setup()
    render(ModelFactsInspectorPanel)
    await user.click(await screen.findByRole('button', { name: /gpt-test/ }))
    expect(await screen.findByText(/resolved-model-facts-snapshot-v1/)).toBeInTheDocument()
    expect(await screen.findByText(/reasoning\.support · resolved/)).toBeInTheDocument()
    await waitFor(() => expect(readInspector).toHaveBeenCalledWith({
      subject: { providerAuthorityId: 'openai', endpointProfileId: 'openai-default', nativeModelId: 'gpt-test' },
      expectedSubjectSetRevision: 'subject-set:1',
    }))
    await user.click(await screen.findByRole('tab', { name: '字段' }))
    await user.click(await screen.findByRole('button', { name: /reasoning\.support/ }))
    await waitFor(() => expect(readEvidenceSlice).toHaveBeenCalledWith(expect.objectContaining({
      expectedSubjectSetRevision: 'subject-set:1', sourceKind: 'provider_native', path: 'reasoning.support',
    })))
    await user.click(await screen.findByRole('button', { name: '查看完整脱敏 payload' }))
    await waitFor(() => expect(readSanitizedRawPayload).toHaveBeenCalledWith({ rawPayloadRef: expect.objectContaining({
      recordKey: 'model:gpt-test',
    }) }))
    expect(await screen.findByText(/"gpt-test"/)).toBeInTheDocument()
  })
})
